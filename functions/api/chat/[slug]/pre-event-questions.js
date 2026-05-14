// functions/api/chat/[slug]/pre-event-questions.js
// POST /api/chat/<slug>/pre-event-questions
// GET  /api/chat/<slug>/pre-event-questions (lecture publique : approuvées uniquement, optionnel)
//
// Participant soumet une question avant le live. Stockée en pending.
// Modération admin requise pour passer à 'approved' ou 'promoted'.

export const onRequestPost = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1 binding manquant' }, 500);

    let data;
    try { data = await request.json(); }
    catch (e) { return json({ error: 'JSON invalide' }, 400); }

    const content = (data.content || '').toString().trim();
    if (!content) return json({ error: 'content requis' }, 400);
    if (content.length > 500) return json({ error: 'content > 500 chars' }, 400);

    const authorName = (data.author_name || '').toString().trim().slice(0, 60);
    if (!authorName) return json({ error: 'author_name requis' }, 400);

    const authorEmail = (data.author_email || '').toString().trim().slice(0, 200) || null;
    const inviteeId = (data.invitee_id || '').toString().trim() || null;

    const ev = await env.DB.prepare('SELECT id FROM events WHERE slug = ?').bind(params.slug).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);

    // Anti-flood : 1 question par IP / 30 sec
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ipHash = env.CHAT_IP_HASH_SECRET ? await hashIp(ip, env.CHAT_IP_HASH_SECRET) : null;
    if (ipHash) {
      const recent = await env.DB.prepare(`
        SELECT COUNT(*) as n FROM pre_event_questions
        WHERE event_id = ? AND ip_hash = ? AND created_at > ?
      `).bind(ev.id, ipHash, new Date(Date.now() - 30000).toISOString()).first();
      if (recent && recent.n > 0) {
        return json({ error: 'Veuillez patienter avant de poser une autre question' }, 429);
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO pre_event_questions
        (id, event_id, invitee_id, author_name, author_email, content, status, ip_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).bind(id, ev.id, inviteeId, authorName, authorEmail, content, ipHash, now).run();

    return json({ success: true, question_id: id });
  } catch (err) {
    console.error('[pre-event POST]', err);
    return json({ error: 'Exception: ' + (err.message || 'unknown') }, 500);
  }
};

export const onRequestGet = async ({ params, env }) => {
  // GET retourne les questions approuvées uniquement (pour permettre aux participants de voir les questions des autres si l'admin le souhaite)
  // Optionnel : pas activé par défaut côté UI participant
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    const ev = await env.DB.prepare('SELECT id FROM events WHERE slug = ?').bind(params.slug).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);
    const rs = await env.DB.prepare(`
      SELECT id, author_name, content, created_at
      FROM pre_event_questions
      WHERE event_id = ? AND status = 'approved'
      ORDER BY created_at DESC LIMIT 50
    `).bind(ev.id).all();
    return json({ questions: rs.results || [] });
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
