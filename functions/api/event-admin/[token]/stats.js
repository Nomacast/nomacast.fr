// functions/api/event-admin/[token]/stats.js
// GET /api/event-admin/:token/stats  →  Stats agrégées d'un event (vue régie client).
//
// Authentification : HMAC du slug + ':client' avec ADMIN_PASSWORD (réutilise computeClientToken).
// Filtrage server-side strict :
//   - Exclusion des rows `page_kind='event-admin'` dans toutes les agrégations depuis `visits`
//     (le client ne doit pas voir qu'on a consulté son back-office)
//   - Aucune donnée brute IP/UA/anon_key par viewer dans la réponse (déjà absent du JSON admin)
//
// Structure JSON identique à /api/admin/events/:id/stats pour permettre le partage de la
// logique de rendu côté UI (admin/edit.html et functions/event-admin/[token].js).
//
// Marqueur : nomacast-analytics-event-admin-stats-v1

export const onRequestGet = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1 binding manquant' }, 500);
    if (!env.ADMIN_PASSWORD) return json({ error: 'ADMIN_PASSWORD non configuré' }, 500);

    // 0. Auth : résoudre l'event par token HMAC client
    const event = await resolveEventByToken(params.token, env);
    if (!event) return json({ error: 'Token invalide' }, 403);

    const eventId = event.id;

    let modes = [];
    if (event.modes_json) { try { modes = JSON.parse(event.modes_json); } catch (e) {} }

    // 1. Summary KPIs — agrégations principales en queries parallèles
    //    Toutes les queries depuis `visits` filtrent page_kind != 'event-admin'
    const [
      inviteesAgg,
      visitsClickedInvitees,
      attendedInvitees,
      publicUniqueViewers,
      concurrentNow,
      peakConcurrent,
      avgDuration,
      messagesAgg,
      qaAgg,
      reactionsCount,
      pollsCount,
      ideasCount,
      quotesCount,
      firstHeartbeat
    ] = await Promise.all([
      // Total invités + breakdown par source
      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN source = 'admin_invited' THEN 1 ELSE 0 END) AS admin_invited,
          SUM(CASE WHEN source = 'self_registered' THEN 1 ELSE 0 END) AS self_registered,
          SUM(CASE WHEN invited_at IS NOT NULL THEN 1 ELSE 0 END) AS sent
        FROM invitees WHERE event_id = ? AND anonymized_at IS NULL
      `).bind(eventId).first(),

      // Invitees ayant cliqué au moins une fois (= row dans visits, hors event-admin)
      env.DB.prepare(`
        SELECT COUNT(DISTINCT invitee_id) AS n
        FROM visits
        WHERE event_id = ? AND invitee_id IS NOT NULL AND page_kind != 'event-admin'
      `).bind(eventId).first(),

      // Invitees présents au live (= row dans presence_history, pas lié à visits)
      env.DB.prepare(`
        SELECT COUNT(DISTINCT invitee_id) AS n
        FROM event_presence_history WHERE event_id = ? AND invitee_id IS NOT NULL
      `).bind(eventId).first(),

      // Public unique viewers (page publique, identifiés par anon_key)
      env.DB.prepare(`
        SELECT COUNT(DISTINCT anon_key) AS n
        FROM visits
        WHERE event_id = ? AND page_kind = 'public' AND anon_key IS NOT NULL
      `).bind(eventId).first(),

      // Spectateurs en ligne maintenant (snapshot last_seen > NOW-60s)
      env.DB.prepare(`
        SELECT COUNT(*) AS n
        FROM event_presence
        WHERE event_id = ? AND last_seen > datetime('now', '-60 seconds')
      `).bind(eventId).first(),

      // Pic de viewers concurrents (max sur fenêtres de 30s dans presence_history)
      env.DB.prepare(`
        SELECT MAX(viewers) AS peak, bucket AS peak_at
        FROM (
          SELECT
            datetime((strftime('%s', pinged_at) / 30) * 30, 'unixepoch') AS bucket,
            COUNT(DISTINCT COALESCE(invitee_id, anon_key)) AS viewers
          FROM event_presence_history
          WHERE event_id = ?
          GROUP BY bucket
        )
      `).bind(eventId).first(),

      // Durée moyenne de connexion (en secondes) par viewer
      env.DB.prepare(`
        SELECT AVG(duration_sec) AS avg_sec
        FROM (
          SELECT COUNT(*) * 30 AS duration_sec
          FROM event_presence_history
          WHERE event_id = ?
          GROUP BY COALESCE(invitee_id, anon_key)
        )
      `).bind(eventId).first(),

      // Messages chat — breakdown par status
      env.DB.prepare(`
        SELECT
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
        FROM chat_messages WHERE event_id = ?
      `).bind(eventId).first(),

      // Pre-event Q&A — breakdown
      env.DB.prepare(`
        SELECT
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
          SUM(CASE WHEN status = 'promoted' THEN 1 ELSE 0 END) AS promoted,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
        FROM pre_event_questions WHERE event_id = ?
      `).bind(eventId).first(),

      env.DB.prepare(`SELECT COUNT(*) AS n FROM event_reactions WHERE event_id = ?`).bind(eventId).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM polls WHERE event_id = ?`).bind(eventId).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM ideas WHERE event_id = ?`).bind(eventId).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM event_quotes WHERE event_id = ?`).bind(eventId).first(),

      // Moment où le 1er heartbeat est arrivé (= debut effectif du live)
      env.DB.prepare(`
        SELECT MIN(pinged_at) AS first_ping
        FROM event_presence_history WHERE event_id = ?
      `).bind(eventId).first()
    ]);

    // 2. Timeline complète — courbe de présence par tranches de 30s
    const timelineRes = await env.DB.prepare(`
      SELECT
        datetime((strftime('%s', pinged_at) / 30) * 30, 'unixepoch') AS ts,
        COUNT(DISTINCT COALESCE(invitee_id, anon_key)) AS viewers
      FROM event_presence_history
      WHERE event_id = ?
      GROUP BY ts
      ORDER BY ts
    `).bind(eventId).all();
    const timeline = (timelineRes.results || []).map(r => ({
      ts: r.ts,
      viewers: r.viewers
    }));

    // 3. Per-invitee : détail engagement par invité
    //    Les visites sont comptées HORS event-admin (le client ne voit pas qu'il a consulté lui-même)
    const perInviteeRes = await env.DB.prepare(`
      SELECT
        i.id AS invitee_id,
        i.full_name AS name,
        i.email,
        i.company,
        i.job_title,
        i.source,
        i.invited_at,
        i.last_seen_at,
        (SELECT MIN(visited_at) FROM visits WHERE invitee_id = i.id AND page_kind != 'event-admin') AS first_visit_at,
        (SELECT MAX(visited_at) FROM visits WHERE invitee_id = i.id AND page_kind != 'event-admin') AS last_visit_at,
        (SELECT COUNT(*) FROM visits WHERE invitee_id = i.id AND page_kind != 'event-admin') AS visits_count,
        (SELECT COUNT(*) * 30 FROM event_presence_history WHERE invitee_id = i.id) AS total_duration_sec,
        (SELECT COUNT(*) FROM chat_messages WHERE invitee_id = i.id AND status = 'approved') AS messages_count,
        (SELECT 1 FROM event_presence WHERE invitee_id = i.id AND last_seen > datetime('now', '-60 seconds')) AS is_present_now
      FROM invitees i
      WHERE i.event_id = ? AND i.anonymized_at IS NULL
      ORDER BY total_duration_sec DESC, i.full_name
    `).bind(eventId).all();
    const perInvitee = (perInviteeRes.results || []).map(r => ({
      invitee_id: r.invitee_id,
      name: r.name,
      email: r.email,
      company: r.company,
      job_title: r.job_title,
      source: r.source,
      invited_at: r.invited_at,
      first_visit_at: r.first_visit_at,
      last_visit_at: r.last_visit_at,
      visits_count: r.visits_count || 0,
      total_duration_sec: r.total_duration_sec || 0,
      messages_count: r.messages_count || 0,
      is_present_now: !!r.is_present_now
    }));

    // 4. Géographie (top 10 pays, agrégé) — exclut event-admin pour ne pas compter le client lui-même
    const geoRes = await env.DB.prepare(`
      SELECT country_code, COUNT(*) AS count
      FROM visits
      WHERE event_id = ? AND country_code IS NOT NULL AND page_kind != 'event-admin'
      GROUP BY country_code
      ORDER BY count DESC
      LIMIT 10
    `).bind(eventId).all();
    const geography = geoRes.results || [];

    // 5. Sources de trafic (referrer agrégé par domaine) — limité aux pages publiques
    const referrerRes = await env.DB.prepare(`
      SELECT referrer, COUNT(*) AS count
      FROM visits
      WHERE event_id = ? AND page_kind = 'public'
      GROUP BY referrer
      ORDER BY count DESC
      LIMIT 20
    `).bind(eventId).all();
    const trafficSources = aggregateReferrers(referrerRes.results || []);

    // 6. Top participants chat (qui parle le plus, sur messages approuvés)
    const topChattersRes = await env.DB.prepare(`
      SELECT author_name AS name, COUNT(*) AS messages_count
      FROM chat_messages
      WHERE event_id = ? AND status = 'approved'
      GROUP BY author_name
      ORDER BY messages_count DESC
      LIMIT 10
    `).bind(eventId).all();
    const topChatters = topChattersRes.results || [];

    // 7. Construction réponse (structure identique à l'endpoint admin pour réutilisation UI)
    const response = {
      event: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        client_name: event.client_name,
        client_organization_name: event.client_organization_name,
        scheduled_at: event.scheduled_at,
        duration_minutes: event.duration_minutes,
        audience_estimate: event.audience_estimate,
        status: event.status,
        access_mode: event.access_mode,
        requires_registration: event.requires_registration === 1,
        primary_color: event.primary_color,
        logo_url: event.logo_url,
        white_label: event.white_label === 1,
        modes,
        started_actual_at: firstHeartbeat ? firstHeartbeat.first_ping : null,
        created_at: event.created_at,
        updated_at: event.updated_at
      },
      summary: {
        invitees_total: (inviteesAgg && inviteesAgg.total) || 0,
        invitees_admin_invited: (inviteesAgg && inviteesAgg.admin_invited) || 0,
        invitees_self_registered: (inviteesAgg && inviteesAgg.self_registered) || 0,
        invitations_sent: (inviteesAgg && inviteesAgg.sent) || 0,
        invitees_clicked: (visitsClickedInvitees && visitsClickedInvitees.n) || 0,
        invitees_attended: (attendedInvitees && attendedInvitees.n) || 0,
        public_unique_viewers: (publicUniqueViewers && publicUniqueViewers.n) || 0,
        concurrent_now: (concurrentNow && concurrentNow.n) || 0,
        peak_concurrent: (peakConcurrent && peakConcurrent.peak) || 0,
        peak_concurrent_at: peakConcurrent ? peakConcurrent.peak_at : null,
        avg_duration_seconds: avgDuration && avgDuration.avg_sec ? Math.round(avgDuration.avg_sec) : 0,
        messages_approved: (messagesAgg && messagesAgg.approved) || 0,
        messages_pending: (messagesAgg && messagesAgg.pending) || 0,
        messages_rejected: (messagesAgg && messagesAgg.rejected) || 0,
        qa_approved: (qaAgg && qaAgg.approved) || 0,
        qa_promoted: (qaAgg && qaAgg.promoted) || 0,
        qa_pending: (qaAgg && qaAgg.pending) || 0,
        qa_rejected: (qaAgg && qaAgg.rejected) || 0,
        reactions_total: (reactionsCount && reactionsCount.n) || 0,
        polls_total: (pollsCount && pollsCount.n) || 0,
        ideas_total: (ideasCount && ideasCount.n) || 0,
        quotes_total: (quotesCount && quotesCount.n) || 0
      },
      timeline,
      per_invitee: perInvitee,
      geography,
      traffic_sources: trafficSources,
      top_chatters: topChatters
    };

    return json(response);
  } catch (err) {
    console.error('[event-admin stats]', err);
    return json({ error: err.message }, 500);
  }
};

// ============================================================
// Helpers
// ============================================================

// Résolution du token HMAC client → event row (réutilise le pattern de event-admin/[token].js)
async function resolveEventByToken(token, env) {
  const events = await env.DB.prepare(`
    SELECT id, slug, title, client_name, client_organization_name, scheduled_at,
           duration_minutes, audience_estimate, status, access_mode, requires_registration,
           primary_color, logo_url, white_label, modes_json, created_at, updated_at
      FROM events
  `).all();
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

// Agrège les referrers bruts par domaine (linkedin.com, google.com, "direct", etc.)
function aggregateReferrers(rows) {
  const byDomain = new Map();
  for (const r of rows) {
    const domain = extractDomain(r.referrer);
    byDomain.set(domain, (byDomain.get(domain) || 0) + r.count);
  }
  return Array.from(byDomain.entries())
    .map(([referrer_domain, count]) => ({ referrer_domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function extractDomain(referrer) {
  if (!referrer) return 'direct';
  try {
    const u = new URL(referrer);
    return u.hostname.replace(/^www\./, '');
  } catch (e) {
    return 'direct';
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, private'
    }
  });
}
