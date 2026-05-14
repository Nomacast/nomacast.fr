// functions/api/admin/events/[id]/quotes.js
// GET /api/admin/events/<id>/quotes?status=pending|approved|pinned|all

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
      SELECT id, invitee_id, author_name, speaker_name, content, status, created_at, approved_at
      FROM event_quotes ${where}
      ORDER BY created_at DESC LIMIT 200
    `).bind(...binds).all();
    return json({ quotes: rs.results || [] });
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
