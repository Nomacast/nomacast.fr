// functions/api/admin/events/[id]/resources/[resId].js
// PATCH /api/admin/events/<id>/resources/<resId> { title?, url?, kind?, sort_order? }
// DELETE /api/admin/events/<id>/resources/<resId>

const ALLOWED_KINDS = ['link', 'pdf', 'slides', 'image', 'video', 'file'];

export const onRequestPatch = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    let data;
    try { data = await request.json(); } catch (e) { return json({ error: 'JSON invalide' }, 400); }

    const updates = [];
    const binds = [];

    if (typeof data.title === 'string') {
      const t = data.title.trim().slice(0, 120);
      if (!t) return json({ error: 'title vide' }, 400);
      updates.push('title = ?'); binds.push(t);
    }
    if (typeof data.url === 'string') {
      const u = data.url.trim();
      try {
        const url = new URL(u);
        if (!['http:', 'https:'].includes(url.protocol)) return json({ error: 'URL invalide' }, 400);
      } catch (e) { return json({ error: 'URL invalide' }, 400); }
      updates.push('url = ?'); binds.push(u);
    }
    if (typeof data.kind === 'string' && ALLOWED_KINDS.includes(data.kind.toLowerCase())) {
      updates.push('kind = ?'); binds.push(data.kind.toLowerCase());
    }
    if (Number.isFinite(parseInt(data.sort_order, 10))) {
      updates.push('sort_order = ?'); binds.push(parseInt(data.sort_order, 10));
    }

    if (updates.length === 0) return json({ error: 'Aucune mise à jour' }, 400);

    binds.push(params.resId, params.id);
    await env.DB.prepare(`
      UPDATE event_resources SET ${updates.join(', ')}
      WHERE id = ? AND event_id = ?
    `).bind(...binds).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

export const onRequestDelete = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    await env.DB.prepare(`
      DELETE FROM event_resources WHERE id = ? AND event_id = ?
    `).bind(params.resId, params.id).run();
    return json({ success: true });
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
