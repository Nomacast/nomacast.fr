// functions/api/admin/events/[id]/pre-event-questions/[qId].js
// PATCH /api/admin/events/<id>/pre-event-questions/<qId> { status }
// DELETE /api/admin/events/<id>/pre-event-questions/<qId>

export const onRequestPatch = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    let data;
    try { data = await request.json(); } catch (e) { return json({ error: 'JSON invalide' }, 400); }
    const status = (data.status || '').toString();
    if (!['approved', 'rejected'].includes(status)) {
      return json({ error: 'status doit être approved ou rejected' }, 400);
    }

    const now = new Date().toISOString();
    if (status === 'approved') {
      await env.DB.prepare(`
        UPDATE pre_event_questions
        SET status = 'approved', approved_at = COALESCE(approved_at, ?)
        WHERE id = ? AND event_id = ?
      `).bind(now, params.qId, params.id).run();
    } else {
      await env.DB.prepare(`
        UPDATE pre_event_questions
        SET status = 'rejected'
        WHERE id = ? AND event_id = ?
      `).bind(params.qId, params.id).run();
    }

    return json({ success: true });
  } catch (err) {
    console.error('[admin pre-event PATCH]', err);
    return json({ error: err.message }, 500);
  }
};

export const onRequestDelete = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    await env.DB.prepare(`
      DELETE FROM pre_event_questions WHERE id = ? AND event_id = ?
    `).bind(params.qId, params.id).run();
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
