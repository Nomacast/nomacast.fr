// functions/api/admin/events/[id]/presence/list.js
// GET /api/admin/events/<id>/presence/list
//
// Liste détaillée des participants en ligne, avec nom des invités si privés.
// Auth Basic admin héritée.

export const onRequestGet = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);

    const cutoff = new Date(Date.now() - 60000).toISOString();

    // Invités identifiés (privés)
    const named = await env.DB.prepare(`
      SELECT p.invitee_id, p.last_seen,
             i.full_name, i.email
      FROM event_presence p
      LEFT JOIN invitees i ON i.id = p.invitee_id
      WHERE p.event_id = ? AND p.invitee_id IS NOT NULL AND p.last_seen > ?
      ORDER BY p.last_seen DESC
      LIMIT 500
    `).bind(params.id, cutoff).all();

    // Anonymes (chat public)
    const anon = await env.DB.prepare(`
      SELECT COUNT(*) AS n FROM event_presence
      WHERE event_id = ? AND anon_key IS NOT NULL AND last_seen > ?
    `).bind(params.id, cutoff).first();

    return json({
      named: named.results || [],
      anon_count: anon ? anon.n : 0,
      online_total: (named.results || []).length + (anon ? anon.n : 0)
    });
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
