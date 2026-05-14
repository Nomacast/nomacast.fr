// functions/api/chat/[slug]/reactions/recent.js
// GET /api/chat/<slug>/reactions/recent?since=<isoDate>
//
// Retourne les reactions des 60 dernières secondes (ou depuis `since`).
// Format : agrégé par seconde pour permettre un "stream" côté client.

export const onRequestGet = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    const url = new URL(request.url);
    const sinceParam = url.searchParams.get('since');

    let since;
    if (sinceParam) {
      const t = new Date(sinceParam).getTime();
      if (!Number.isFinite(t)) return json({ error: 'since invalide' }, 400);
      // Cap : max 60s en arrière pour éviter qu'un client poll loin dans le passé
      since = new Date(Math.max(t, Date.now() - 60000)).toISOString();
    } else {
      since = new Date(Date.now() - 5000).toISOString(); // défaut = 5s
    }

    const ev = await env.DB.prepare('SELECT id FROM events WHERE slug = ?').bind(params.slug).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);

    const rs = await env.DB.prepare(`
      SELECT emoji, created_at
      FROM event_reactions
      WHERE event_id = ? AND created_at > ?
      ORDER BY created_at ASC
      LIMIT 500
    `).bind(ev.id, since).all();

    const reactions = rs.results || [];
    const now = new Date().toISOString();

    // Aussi : totaux des 5 dernières minutes par emoji (pour afficher des compteurs)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const totals = await env.DB.prepare(`
      SELECT emoji, COUNT(*) as n
      FROM event_reactions
      WHERE event_id = ? AND created_at > ?
      GROUP BY emoji
    `).bind(ev.id, fiveMinAgo).all();

    const totalsMap = {};
    (totals.results || []).forEach(row => { totalsMap[row.emoji] = row.n; });

    return json({ reactions, totals: totalsMap, server_time: now });
  } catch (err) {
    console.error('[reactions/recent]', err);
    return json({ error: err.message }, 500);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
