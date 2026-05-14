// functions/api/chat/[slug]/ideas/[ideaId]/vote.js
// POST /api/chat/<slug>/ideas/<ideaId>/vote
//
// Vote pour une idée. voter_key = invitee_id (privé) ou ip_hash (public).
// UNIQUE(idea_id, voter_key) → un participant ne peut voter qu'une fois.

export const onRequestPost = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);

    let data;
    try { data = await request.json(); }
    catch (e) { return json({ error: 'JSON invalide' }, 400); }

    const inviteeId = (data.invitee_id || '').toString().trim() || null;

    let voterKey = inviteeId;
    if (!voterKey) {
      if (!env.CHAT_IP_HASH_SECRET) return json({ error: 'CHAT_IP_HASH_SECRET manquant' }, 503);
      const ip = request.headers.get('CF-Connecting-IP') || '';
      voterKey = await hashIp(ip, env.CHAT_IP_HASH_SECRET);
    }

    // Vérifier que l'idée existe et appartient à l'event du slug
    const ev = await env.DB.prepare('SELECT id FROM events WHERE slug = ?').bind(params.slug).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);

    const idea = await env.DB.prepare(`
      SELECT id, status FROM ideas WHERE id = ? AND event_id = ?
    `).bind(params.ideaId, ev.id).first();
    if (!idea) return json({ error: 'Idée introuvable' }, 404);
    if (!['approved', 'pinned'].includes(idea.status)) {
      return json({ error: 'Idée non publiée' }, 403);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await env.DB.prepare(`
        INSERT INTO idea_votes (id, idea_id, voter_key, voted_at) VALUES (?, ?, ?, ?)
      `).bind(id, idea.id, voterKey, now).run();
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE')) {
        return json({ error: 'Vous avez déjà voté pour cette idée' }, 409);
      }
      throw e;
    }

    // Retourner le nouveau compteur
    const c = await env.DB.prepare(`SELECT COUNT(*) as n FROM idea_votes WHERE idea_id = ?`).bind(idea.id).first();
    return json({ success: true, vote_count: c ? c.n : 0 });
  } catch (err) {
    console.error('[idea vote]', err);
    return json({ error: err.message }, 500);
  }
};

async function hashIp(ip, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
