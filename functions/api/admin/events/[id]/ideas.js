// functions/api/admin/events/[id]/ideas.js
// GET /api/admin/events/<id>/ideas?status=pending|approved|pinned|all

export const onRequestGet = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    const url = new URL(request.url);
    const status = (url.searchParams.get('status') || 'all').trim();

    let where = 'WHERE i.event_id = ?';
    const binds = [params.id];
    if (status !== 'all') {
      where += ' AND i.status = ?';
      binds.push(status);
    }

    const rs = await env.DB.prepare(`
      SELECT
        i.id, i.invitee_id, i.author_name, i.content, i.status, i.created_at, i.approved_at,
        COUNT(v.id) AS vote_count
      FROM ideas i
      LEFT JOIN idea_votes v ON v.idea_id = i.id
      ${where}
      GROUP BY i.id
      ORDER BY i.created_at DESC
      LIMIT 200
    `).bind(...binds).all();

    return json({ ideas: rs.results || [] });
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
