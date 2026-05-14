// functions/api/chat/[slug]/quotes.js
// GET  /api/chat/<slug>/quotes  → quotes approuvés/épinglés
// POST /api/chat/<slug>/quotes  → soumettre une citation

export const onRequestGet = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    const ev = await env.DB.prepare('SELECT id FROM events WHERE slug = ?').bind(params.slug).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);

    const rs = await env.DB.prepare(`
      SELECT id, author_name, speaker_name, content, status, created_at
      FROM event_quotes
      WHERE event_id = ? AND status IN ('approved','pinned')
      ORDER BY (CASE WHEN status = 'pinned' THEN 1 ELSE 0 END) DESC, created_at DESC
      LIMIT 50
    `).bind(ev.id).all();

    return json({ quotes: rs.results || [] });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

export const onRequestPost = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);

    let data;
    try { data = await request.json(); }
    catch (e) { return json({ error: 'JSON invalide' }, 400); }

    const content = (data.content || '').toString().trim();
    if (!content) return json({ error: 'content requis' }, 400);
    if (content.length > 280) return json({ error: 'content > 280 chars' }, 400);

    const authorName = (data.author_name || '').toString().trim().slice(0, 60);
    if (!authorName) return json({ error: 'author_name requis' }, 400);

    const speakerName = (data.speaker_name || '').toString().trim().slice(0, 100) || null;
    const inviteeId = (data.invitee_id || '').toString().trim() || null;

    const ev = await env.DB.prepare('SELECT id FROM events WHERE slug = ?').bind(params.slug).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);

    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ipHash = env.CHAT_IP_HASH_SECRET ? await hashIp(ip, env.CHAT_IP_HASH_SECRET) : null;
    if (ipHash) {
      const recent = await env.DB.prepare(`
        SELECT COUNT(*) as n FROM event_quotes
        WHERE event_id = ? AND ip_hash = ? AND created_at > ?
      `).bind(ev.id, ipHash, new Date(Date.now() - 30000).toISOString()).first();
      if (recent && recent.n > 0) {
        return json({ error: 'Patientez avant de soumettre une autre citation' }, 429);
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO event_quotes
        (id, event_id, invitee_id, author_name, speaker_name, content, status, ip_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).bind(id, ev.id, inviteeId, authorName, speakerName, content, ipHash, now).run();

    return json({ success: true, quote_id: id });
  } catch (err) {
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
