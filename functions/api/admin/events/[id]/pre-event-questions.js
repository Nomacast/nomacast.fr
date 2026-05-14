// functions/api/admin/events/[id]/pre-event-questions.js
// GET /api/admin/events/<id>/pre-event-questions?status=pending|approved|all
//
// Liste les questions pre-event de l'event. Auth Basic admin héritée.

export const onRequestGet = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    const url = new URL(request.url);
    const status = (url.searchParams.get('status') || 'all').trim();

    let where = 'WHERE event_id = ?';
    const binds = [params.id];
    if (status !== 'all') {
      where += ' AND status = ?';
      binds.push(status);
    }

    const rs = await env.DB.prepare(`
      SELECT id, invitee_id, author_name, author_email, content, status,
             created_at, approved_at, promoted_at, promoted_message_id
      FROM pre_event_questions
      ${where}
      ORDER BY created_at DESC
      LIMIT 200
    `).bind(...binds).all();

    return json({ questions: rs.results || [] });
  } catch (err) {
    console.error('[admin pre-event GET]', err);
    return json({ error: err.message }, 500);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
