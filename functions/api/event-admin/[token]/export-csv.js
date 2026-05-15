// functions/api/event-admin/[token]/export-csv.js
// GET /api/event-admin/:token/export-csv
//
// Export CSV du détail par invité (lead capture + engagement).
// Accessible UNIQUEMENT si l'event est en status='ended' — pendant le live
// les chiffres bougent, l'export à froid évite les mauvaises interprétations.
//
// Authentification : HMAC du slug + ':client' avec ADMIN_PASSWORD.
// Encodage : UTF-8 avec BOM (compatibilité Excel français qui ouvre en cp1252 sinon).
//
// Marqueur : nomacast-analytics-csv-export-v1

export const onRequestGet = async ({ params, env }) => {
  try {
    if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);
    if (!env.ADMIN_PASSWORD) return jsonResponse({ error: 'ADMIN_PASSWORD non configuré' }, 500);

    // Résolution token → event
    const event = await resolveEventByToken(params.token, env);
    if (!event) return jsonResponse({ error: 'Token invalide' }, 403);

    if (event.status !== 'ended') {
      return jsonResponse({
        error: 'Export CSV disponible uniquement après la fin de l\'événement.',
        current_status: event.status
      }, 409);
    }

    // Récupération des invités avec engagement (même logique que stats per_invitee,
    // filtrage page_kind != 'event-admin' sur les visites)
    const rowsRes = await env.DB.prepare(`
      SELECT
        i.full_name AS name,
        i.email,
        i.company,
        i.job_title,
        i.phone,
        i.source,
        i.invited_at,
        i.consent_marketing_at,
        (SELECT MIN(visited_at) FROM visits WHERE invitee_id = i.id AND page_kind != 'event-admin') AS first_visit_at,
        (SELECT MAX(visited_at) FROM visits WHERE invitee_id = i.id AND page_kind != 'event-admin') AS last_visit_at,
        (SELECT COUNT(*) FROM visits WHERE invitee_id = i.id AND page_kind != 'event-admin') AS visits_count,
        (SELECT COUNT(*) * 30 FROM event_presence_history WHERE invitee_id = i.id) AS total_duration_sec,
        (SELECT COUNT(*) FROM chat_messages WHERE invitee_id = i.id AND status = 'approved') AS messages_count
      FROM invitees i
      WHERE i.event_id = ? AND i.anonymized_at IS NULL
      ORDER BY i.full_name COLLATE NOCASE
    `).bind(event.id).all();

    const rows = rowsRes.results || [];

    // Construction CSV
    const headers = [
      'Nom',
      'Email',
      'Entreprise',
      'Fonction',
      'Téléphone',
      'Source',
      'Invité le',
      'Consentement marketing',
      'Première visite',
      'Dernière visite',
      'Nb visites',
      'Durée connexion (s)',
      'Durée connexion (lisible)',
      'Messages chat'
    ];

    const lines = [headers.map(csvEscape).join(',')];

    for (const r of rows) {
      const dur = parseInt(r.total_duration_sec, 10) || 0;
      lines.push([
        r.name || '',
        r.email || '',
        r.company || '',
        r.job_title || '',
        r.phone || '',
        r.source === 'self_registered' ? 'inscrit publiquement' : 'invité par admin',
        formatDateFR(r.invited_at),
        r.consent_marketing_at ? 'oui' : 'non',
        formatDateFR(r.first_visit_at),
        formatDateFR(r.last_visit_at),
        String(r.visits_count || 0),
        String(dur),
        formatDuration(dur),
        String(r.messages_count || 0)
      ].map(csvEscape).join(','));
    }

    // BOM UTF-8 pour Excel
    const csv = '\uFEFF' + lines.join('\r\n') + '\r\n';

    // Nom du fichier : slug + date
    const dateStr = (event.scheduled_at || new Date().toISOString()).slice(0, 10);
    const safeSlug = (event.slug || 'event').replace(/[^a-z0-9-]/gi, '');
    const filename = `nomacast-bilan-${safeSlug}-${dateStr}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, private'
      }
    });

  } catch (err) {
    console.error('[event-admin export-csv]', err);
    return jsonResponse({ error: err.message }, 500);
  }
};

// ============================================================
// Helpers
// ============================================================

// Échappement CSV — quote si contient une virgule, guillemets, ou retour ligne
function csvEscape(value) {
  const s = String(value == null ? '' : value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function formatDateFR(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(s) {
  s = parseInt(s, 10) || 0;
  if (s === 0) return '';
  if (s < 60) return s + 's';
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return rs > 0 ? m + 'min ' + rs + 's' : m + 'min';
  }
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  return mm > 0 ? h + 'h ' + mm + 'min' : h + 'h';
}

async function resolveEventByToken(token, env) {
  const events = await env.DB.prepare(
    'SELECT id, slug, scheduled_at, status FROM events'
  ).all();
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
