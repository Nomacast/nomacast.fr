// functions/api/admin/events/[id]/resources.js
// GET /api/admin/events/<id>/resources
// POST /api/admin/events/<id>/resources { title, url, kind?, sort_order? }
//
// Auth Basic admin héritée.

const ALLOWED_KINDS = ['link', 'pdf', 'slides', 'image', 'video', 'file'];

export const onRequestGet = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    const rs = await env.DB.prepare(`
      SELECT id, title, url, kind, sort_order, created_at
      FROM event_resources
      WHERE event_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `).bind(params.id).all();
    return json({ resources: rs.results || [] });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

export const onRequestPost = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    let data;
    try { data = await request.json(); } catch (e) { return json({ error: 'JSON invalide' }, 400); }

    const title = (data.title || '').toString().trim().slice(0, 120);
    if (!title) return json({ error: 'title requis' }, 400);

    const url = (data.url || '').toString().trim();
    if (!url) return json({ error: 'url requis' }, 400);
    try {
      const u = new URL(url);
      if (!['http:', 'https:'].includes(u.protocol)) {
        return json({ error: 'URL doit être http(s)' }, 400);
      }
    } catch (e) {
      return json({ error: 'URL invalide' }, 400);
    }

    let kind = (data.kind || 'link').toString().toLowerCase();
    if (!ALLOWED_KINDS.includes(kind)) kind = 'link';

    let sortOrder = parseInt(data.sort_order, 10);
    if (!Number.isFinite(sortOrder)) {
      const max = await env.DB.prepare(`
        SELECT MAX(sort_order) AS m FROM event_resources WHERE event_id = ?
      `).bind(params.id).first();
      sortOrder = ((max && max.m) || 0) + 10;
    }

    // Vérifier que l'event existe
    const ev = await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(params.id).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO event_resources (id, event_id, title, url, kind, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, params.id, title, url, kind, sortOrder, now).run();

    return json({ success: true, resource_id: id });
  } catch (err) {
    console.error('[resources POST]', err);
    return json({ error: err.message }, 500);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
