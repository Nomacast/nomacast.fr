// functions/api/chat/[slug]/presence/stats.js
// GET /api/chat/<slug>/presence/stats
//
// Compteur public : nombre de personnes "en ligne" (last_seen < 60s).

export const onRequestGet = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    const ev = await env.DB.prepare('SELECT id FROM events WHERE slug = ?').bind(params.slug).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);

    const cutoff = new Date(Date.now() - 60000).toISOString();
    const r = await env.DB.prepare(`
      SELECT COUNT(*) AS online FROM event_presence
      WHERE event_id = ? AND last_seen > ?
    `).bind(ev.id, cutoff).first();

    return json({ online: r ? r.online : 0 });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
