// functions/api/admin/events/[id]/messages.js
// GET /api/admin/events/:id/messages?status=pending|approved|rejected&limit=100
//   → Liste les messages de l'event, filtrés par status.
//
// Auth : middleware Basic Auth admin (hérité de /admin et /api/admin).
// Utilisé par la page de régie /admin/live.html pour modérer les questions Q&A.

export const onRequestGet = async ({ params, request, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status'); // pending | approved | rejected | null (= tous)
  const kindFilter = url.searchParams.get('kind');     // message | question | null (= tous)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);

  let query = `
    SELECT id, event_id, invitee_id, author_name, author_kind, content,
           kind, status, created_at, approved_at
      FROM chat_messages
     WHERE event_id = ?
  `;
  const bindings = [params.id];

  if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
    query += ' AND status = ?';
    bindings.push(statusFilter);
  }
  if (kindFilter && ['message', 'question'].includes(kindFilter)) {
    query += ' AND kind = ?';
    bindings.push(kindFilter);
  }

  query += ' ORDER BY created_at ASC LIMIT ?';
  bindings.push(limit);

  try {
    const result = await env.DB.prepare(query).bind(...bindings).all();
    return jsonResponse({
      messages: result.results || [],
      count: (result.results || []).length
    });
  } catch (err) {
    console.error('[admin/messages GET]', err);
    return jsonResponse({ error: err.message }, 500);
  }
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
