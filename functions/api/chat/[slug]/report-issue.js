// functions/api/chat/[slug]/report-issue.js
// POST /api/chat/<slug>/report-issue
// Body : { type: 'audio' | 'video' | 'both', invitee_id?: string }
//
// INSERT dans technical_alerts pour affichage feed vMix.
// PLUS d'envoi email (retiré).

const TYPE_LABEL = { audio: 1, video: 1, both: 1 };

export const onRequestPost = async ({ params, request, env }) => {
  try {
    if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

    let data;
    try { data = await request.json(); }
    catch (e) { return jsonResponse({ error: 'JSON invalide' }, 400); }

    const type = (data.type || '').toString();
    if (!TYPE_LABEL[type]) return jsonResponse({ error: 'Type invalide (audio|video|both)' }, 400);

    // SELECT minimal (colonnes safe garanties)
    let ev;
    try {
      ev = await env.DB.prepare(`
        SELECT id, title, slug, status
        FROM events WHERE slug = ?
      `).bind(params.slug).first();
    } catch (sqlErr) {
      console.error('[report-issue SQL events]', sqlErr);
      return jsonResponse({ error: 'SQL events: ' + (sqlErr.message || 'unknown') }, 500);
    }
    if (!ev) return jsonResponse({ error: 'Event introuvable (slug: ' + params.slug + ')' }, 404);

    // Identité éventuelle (invité privé)
    const inviteeId = (data.invitee_id || '').toString().trim() || null;
    let invitee = null;
    if (inviteeId) {
      try {
        invitee = await env.DB.prepare(`
          SELECT id, first_name, last_name, email
          FROM invitees WHERE id = ? AND event_id = ?
        `).bind(inviteeId, ev.id).first();
      } catch (sqlErr) {
        console.error('[report-issue SQL invitees]', sqlErr);
        invitee = null;
      }
    }

    const userAgent = request.headers.get('User-Agent') || '—';
    const country = request.headers.get('CF-IPCountry') || '—';
    const now = new Date().toISOString();

    // Label auteur (pré-calculé pour le feed)
    const authorLabel = invitee
      ? (((invitee.first_name || '') + ' ' + (invitee.last_name || '')).trim() || invitee.email || 'Invité')
      : 'Anonyme';

    // INSERT alerte
    const alertId = crypto.randomUUID();
    try {
      await env.DB.prepare(`
        INSERT INTO technical_alerts
          (id, event_id, type, invitee_id, author_label, country, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(alertId, ev.id, type, inviteeId, authorLabel, country, userAgent, now).run();
    } catch (insertErr) {
      console.error('[report-issue INSERT alert]', insertErr);
      return jsonResponse({ error: 'INSERT alert: ' + (insertErr.message || 'unknown') }, 500);
    }

    return jsonResponse({ success: true, alert_id: alertId });
  } catch (err) {
    console.error('[report-issue FATAL]', err && err.stack || err);
    return jsonResponse({
      error: 'Exception serveur: ' + (err && err.message ? err.message : 'unknown')
    }, 500);
  }
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
