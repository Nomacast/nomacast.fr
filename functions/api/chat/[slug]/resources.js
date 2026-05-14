// functions/api/chat/[slug]/resources.js
// GET /api/chat/<slug>/resources
//
// Liste des ressources partagées (liens, PDF, slides) pour cet event.

export const onRequestGet = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    const ev = await env.DB.prepare('SELECT id FROM events WHERE slug = ?').bind(params.slug).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);

    const rs = await env.DB.prepare(`
      SELECT id, title, url, kind, sort_order, created_at
      FROM event_resources
      WHERE event_id = ?
      ORDER BY sort_order ASC, created_at ASC
      LIMIT 100
    `).bind(ev.id).all();

    return json({ resources: rs.results || [] });
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
