// functions/api/event-admin/[token]/invitees/[invitee_id]/timeline.js
// GET /api/event-admin/:token/invitees/:invitee_id/timeline
//
// Retourne la timeline détaillée d'un invité : UNION de 7 sources triée par horodatage.
// Sources :
//   - visits (filtré hors page_kind='event-admin')
//   - event_presence_history (agrégé en sessions côté JS)
//   - chat_messages
//   - event_reactions
//   - poll_votes (JOIN polls pour la question)
//   - idea_votes (JOIN ideas pour le titre)
//   - event_cta_clicks (JOIN event_ctas pour le label)
//
// Auth : HMAC du slug + ':client' (réutilise le pattern de stats.js).
//
// Marqueur : nomacast-timeline-detail-v1

export const onRequestGet = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1 binding manquant' }, 500);
    if (!env.ADMIN_PASSWORD) return json({ error: 'ADMIN_PASSWORD non configuré' }, 500);

    // 1. Auth : résoudre event via token
    const event = await resolveEventByToken(params.token, env);
    if (!event) return json({ error: 'Token invalide' }, 403);
    const eventId = event.id;

    // 2. Charger l'invité et vérifier l'appartenance à l'event
    const invitee = await env.DB.prepare(`
      SELECT id, event_id, full_name, email, company, job_title, source,
             invited_at, last_seen_at, anonymized_at
      FROM invitees WHERE id = ? AND event_id = ?
    `).bind(params.invitee_id, eventId).first();
    if (!invitee) return json({ error: 'Invité introuvable' }, 404);
    if (invitee.anonymized_at) return json({ error: 'Invité anonymisé' }, 410);

    const inviteeId = invitee.id;

    // 3. 7 queries parallèles (chacune protégée par try/catch — résilience colonnes différentes)
    const [
      visitsRows,
      presenceRows,
      messagesRows,
      reactionsRows,
      pollVotesRows,
      ideaVotesRows,
      ctaClicksRows
    ] = await Promise.all([
      safeQuery(env.DB, `
        SELECT id, visited_at, page_kind, country_code, referrer
        FROM visits
        WHERE invitee_id = ? AND page_kind != 'event-admin'
        ORDER BY visited_at
      `, [inviteeId]),

      safeQuery(env.DB, `
        SELECT pinged_at
        FROM event_presence_history
        WHERE invitee_id = ?
        ORDER BY pinged_at
      `, [inviteeId]),

      safeQuery(env.DB, `
        SELECT *
        FROM chat_messages
        WHERE invitee_id = ?
        ORDER BY COALESCE(created_at, submitted_at)
      `, [inviteeId]),

      safeQuery(env.DB, `
        SELECT *
        FROM event_reactions
        WHERE invitee_id = ?
        ORDER BY COALESCE(created_at, reacted_at)
      `, [inviteeId]),

      safeQuery(env.DB, `
        SELECT pv.*, p.question AS poll_question
        FROM poll_votes pv
        LEFT JOIN polls p ON pv.poll_id = p.id
        WHERE pv.voter_key = ? AND p.event_id = ?
        ORDER BY COALESCE(pv.created_at, pv.voted_at)
      `, [inviteeId, eventId]),

      safeQuery(env.DB, `
        SELECT iv.*,
               COALESCE(i.title, i.content, i.text) AS idea_title
        FROM idea_votes iv
        LEFT JOIN ideas i ON iv.idea_id = i.id
        WHERE iv.voter_key = ? AND i.event_id = ?
        ORDER BY COALESCE(iv.created_at, iv.voted_at)
      `, [inviteeId, eventId]),

      safeQuery(env.DB, `
        SELECT cc.id, cc.clicked_at, cc.cta_id, c.label AS cta_label, c.url AS cta_url
        FROM event_cta_clicks cc
        LEFT JOIN event_ctas c ON cc.cta_id = c.id
        WHERE cc.invitee_id = ? AND cc.event_id = ?
        ORDER BY cc.clicked_at
      `, [inviteeId, eventId])
    ]);

    // 4. Construire la timeline unifiée
    const events = [];

    // — Visites
    for (const r of visitsRows) {
      events.push({
        ts: r.visited_at,
        kind: 'visit',
        label: pageKindLabel(r.page_kind),
        detail: r.country_code ? 'Depuis ' + r.country_code : null,
        meta: { page_kind: r.page_kind, referrer: r.referrer }
      });
    }

    // — Sessions de présence (agrégation des pinged_at en sessions)
    //   Une session = cluster de pings où chaque ping est <= 90s du suivant.
    //   Plus court qu'un ping interval normal (~30s) × 3 pour tolérer micro-coupures.
    const presenceTimestamps = presenceRows
      .map(r => Date.parse(r.pinged_at))
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);
    const sessions = aggregatePresenceSessions(presenceTimestamps, 90 * 1000);
    for (const s of sessions) {
      events.push({
        ts: new Date(s.start).toISOString(),
        kind: 'session_start',
        label: 'Connecté au live',
        detail: null,
        meta: { duration_sec: s.duration_sec }
      });
      events.push({
        ts: new Date(s.end).toISOString(),
        kind: 'session_end',
        label: 'Déconnecté',
        detail: formatDurationShort(s.duration_sec),
        meta: { duration_sec: s.duration_sec }
      });
    }

    // — Messages chat (colonnes contenu défensives)
    for (const r of messagesRows) {
      const ts = r.created_at || r.submitted_at;
      const content = pickFirst(r, ['body', 'content', 'message', 'text']) || '';
      events.push({
        ts,
        kind: 'message',
        label: 'Message envoyé',
        detail: truncate(content, 80),
        status: r.status || null,
        meta: { id: r.id }
      });
    }

    // — Réactions
    for (const r of reactionsRows) {
      const ts = r.created_at || r.reacted_at;
      const emoji = pickFirst(r, ['emoji_key', 'emoji', 'kind', 'type']) || '?';
      events.push({
        ts,
        kind: 'reaction',
        label: 'Réaction',
        detail: emojiLabel(emoji),
        meta: { emoji_key: emoji }
      });
    }

    // — Poll votes
    for (const r of pollVotesRows) {
      const ts = r.created_at || r.voted_at;
      events.push({
        ts,
        kind: 'poll_vote',
        label: 'Vote sondage',
        detail: r.poll_question ? truncate(r.poll_question, 70) : null,
        meta: { poll_id: r.poll_id, option_id: r.option_id || r.option_key }
      });
    }

    // — Idea votes
    for (const r of ideaVotesRows) {
      const ts = r.created_at || r.voted_at;
      events.push({
        ts,
        kind: 'idea_vote',
        label: '+1 sur idée',
        detail: r.idea_title ? truncate(r.idea_title, 70) : null,
        meta: { idea_id: r.idea_id }
      });
    }

    // — Clics CTA
    for (const r of ctaClicksRows) {
      events.push({
        ts: r.clicked_at,
        kind: 'cta_click',
        label: 'Clic CTA',
        detail: r.cta_label || null,
        meta: { cta_id: r.cta_id, url: r.cta_url }
      });
    }

    // 5. Tri chronologique
    events.sort((a, b) => {
      const ta = a.ts ? Date.parse(a.ts) : 0;
      const tb = b.ts ? Date.parse(b.ts) : 0;
      return ta - tb;
    });

    // 6. Summary
    const totalSessionSec = sessions.reduce((acc, s) => acc + s.duration_sec, 0);
    const firstEventAt = events.length > 0 ? events[0].ts : null;
    const lastEventAt = events.length > 0 ? events[events.length - 1].ts : null;

    return json({
      invitee: {
        id: invitee.id,
        full_name: invitee.full_name,
        email: invitee.email,
        company: invitee.company,
        job_title: invitee.job_title,
        source: invitee.source,
        invited_at: invitee.invited_at,
        last_seen_at: invitee.last_seen_at
      },
      events,
      summary: {
        total_events: events.length,
        total_visits: visitsRows.length,
        total_messages: messagesRows.length,
        total_reactions: reactionsRows.length,
        total_poll_votes: pollVotesRows.length,
        total_idea_votes: ideaVotesRows.length,
        total_cta_clicks: ctaClicksRows.length,
        total_sessions: sessions.length,
        total_session_seconds: totalSessionSec,
        first_event_at: firstEventAt,
        last_event_at: lastEventAt
      }
    });
  } catch (err) {
    console.error('[event-admin timeline]', err);
    return json({ error: err.message }, 500);
  }
};

// ============================================================
// Helpers
// ============================================================

// Query défensive — retourne [] et log si erreur SQL (résilience aux différences de schéma)
async function safeQuery(db, sql, binds) {
  try {
    const res = await db.prepare(sql).bind(...binds).all();
    return res.results || [];
  } catch (err) {
    console.warn('[timeline safeQuery]', err.message, '— SQL:', sql.substring(0, 80));
    return [];
  }
}

// Agrège une liste de timestamps en sessions (clusters séparés par > gapMs)
function aggregatePresenceSessions(timestamps, gapMs) {
  if (timestamps.length === 0) return [];
  const sessions = [];
  let currentStart = timestamps[0];
  let currentLast = timestamps[0];
  for (let i = 1; i < timestamps.length; i++) {
    const t = timestamps[i];
    if (t - currentLast > gapMs) {
      // Fin de session : on capture l'ancienne
      sessions.push({
        start: currentStart,
        end: currentLast + 30000, // +30s = un chunk de ping
        duration_sec: Math.round((currentLast - currentStart) / 1000) + 30
      });
      currentStart = t;
    }
    currentLast = t;
  }
  // Push la dernière session
  sessions.push({
    start: currentStart,
    end: currentLast + 30000,
    duration_sec: Math.round((currentLast - currentStart) / 1000) + 30
  });
  return sessions;
}

function pickFirst(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

function truncate(str, max) {
  if (typeof str !== 'string') return null;
  return str.length > max ? str.substring(0, max) + '…' : str;
}

function pageKindLabel(kind) {
  switch (kind) {
    case 'public': return 'Visite page publique';
    case 'i-token': return 'Accès lien personnel';
    case 'event-admin': return 'Régie client'; // ne devrait pas apparaître (filtré côté SQL)
    default: return 'Visite (' + (kind || 'inconnu') + ')';
  }
}

function emojiLabel(key) {
  const labels = {
    'applause': 'Applaudissement',
    'bravo': 'Bravo',
    'agree': "D'accord",
    'clear': 'Clair',
    'insight': 'Insight',
    'heart': 'Coeur',
    'thinking': 'Réfléchit'
  };
  return labels[key] || key;
}

function formatDurationShort(sec) {
  if (!sec || sec < 60) return Math.round(sec) + ' s';
  if (sec < 3600) return Math.round(sec / 60) + ' min';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h + ' h ' + m + ' min';
}

// Résolution du token HMAC client → event row (identique à stats.js)
async function resolveEventByToken(token, env) {
  const events = await env.DB.prepare(`SELECT id, slug FROM events`).all();
  for (const ev of (events.results || [])) {
    const expected = await computeClientToken(ev.slug, env.ADMIN_PASSWORD);
    if (token === expected) return ev;
  }
  return null;
}

async function computeClientToken(slug, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(slug + ':client'));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .slice(0, 24);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private' }
  });
}
