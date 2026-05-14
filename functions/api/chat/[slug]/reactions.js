// functions/api/chat/[slug]/reactions.js
// POST /api/chat/<slug>/reactions { emoji }
// GET  /api/chat/<slug>/reactions/recent?since=<iso>  → reactions des 60 derniers sec
//
// Note : GET est dans un autre fichier pour respecter le routing Pages Functions.
//
// nomacast-reactions-config-v1 : la validation des emojis utilise désormais la liste
// configurée pour CET event (colonne events.reaction_emojis_json). Si NULL, fallback
// sur le set par défaut des 8 originaux (rétro-compat).

const DEFAULT_EMOJIS = ['👏', '❤️', '🔥', '🎉', '🙏', '👍', '😂', '🤔'];

export const onRequestPost = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    let data;
    try { data = await request.json(); } catch (e) { return json({ error: 'JSON invalide' }, 400); }
    const emoji = (data.emoji || '').toString();
    if (!emoji) return json({ error: 'Emoji requis' }, 400);

    const inviteeId = (data.invitee_id || '').toString().trim() || null;

    // nomacast-reactions-config-v1 : récupérer l'event ET sa liste d'emojis configurée
    const ev = await env.DB.prepare(
      'SELECT id, reaction_emojis_json FROM events WHERE slug = ?'
    ).bind(params.slug).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);

    // Liste autorisée pour cet event : config DB si présente, sinon set par défaut
    let allowed = DEFAULT_EMOJIS;
    if (ev.reaction_emojis_json) {
      try {
        const parsed = JSON.parse(ev.reaction_emojis_json);
        if (Array.isArray(parsed) && parsed.length > 0) allowed = parsed;
      } catch (e) {
        // JSON corrompu → fallback sur défaut, on n'échoue pas la requête
      }
    }
    if (!allowed.includes(emoji)) {
      return json({ error: 'Emoji non autorisé pour cet event' }, 400);
    }

    // Anti-spam : 10 reactions par IP / 10 sec max
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ipHash = env.CHAT_IP_HASH_SECRET ? await hashIp(ip, env.CHAT_IP_HASH_SECRET) : null;
    if (ipHash) {
      const recent = await env.DB.prepare(`
        SELECT COUNT(*) as n FROM event_reactions
        WHERE event_id = ? AND ip_hash = ? AND created_at > ?
      `).bind(ev.id, ipHash, new Date(Date.now() - 10000).toISOString()).first();
      if (recent && recent.n >= 10) {
        return json({ error: 'Trop de réactions, ralentis' }, 429);
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO event_reactions (id, event_id, emoji, invitee_id, ip_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, ev.id, emoji, inviteeId, ipHash, now).run();

    return json({ success: true });
  } catch (err) {
    console.error('[reaction POST]', err);
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
