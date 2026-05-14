// functions/api/admin/events/[id]/ctas/[ctaId].js
// PATCH /api/admin/events/<id>/ctas/<ctaId> { active: false }
// DELETE /api/admin/events/<id>/ctas/<ctaId>

export const onRequestPatch = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    let data;
    try { data = await request.json(); } catch (e) { return json({ error: 'JSON invalide' }, 400); }

    if (data.active === false || data.active === 0 || data.active === '0') {
      await env.DB.prepare(`
        UPDATE event_ctas SET active = 0, deactivated_at = ?
        WHERE id = ? AND event_id = ?
      `).bind(new Date().toISOString(), params.ctaId, params.id).run();
      return json({ success: true });
    }

    return json({ error: 'Action non supportée (utilise POST /ctas pour activer un nouveau)' }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

export const onRequestDelete = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    await env.DB.prepare(`
      DELETE FROM event_ctas WHERE id = ? AND event_id = ?
    `).bind(params.ctaId, params.id).run();
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
