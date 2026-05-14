// functions/api/chat/[slug]/presence/heartbeat.js
// POST /api/chat/<slug>/presence/heartbeat { invitee_id?, anon_key? }
//
// Le participant ping toutes les 30 sec pour signaler sa présence.
// UPSERT sur (event_id, invitee_id) ou (event_id, anon_key) dans event_presence (snapshot temps réel).
// + INSERT dans event_presence_history pour reconstituer la courbe de présence post-event.
//
// Marqueur : nomacast-analytics-presence-history-v1

export const onRequestPost = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    let data;
    try { data = await request.json(); } catch (e) { return json({ error: 'JSON invalide' }, 400); }

    const inviteeId = (data.invitee_id || '').toString().trim() || null;
    let anonKey = (data.anon_key || '').toString().trim().slice(0, 64) || null;

    if (!inviteeId && !anonKey) {
      // Génère un anon_key dérivé de l'IP si rien fourni (rare)
      if (env.CHAT_IP_HASH_SECRET) {
        const ip = request.headers.get('CF-Connecting-IP') || '';
        anonKey = (await hashIp(ip, env.CHAT_IP_HASH_SECRET)).slice(0, 32);
      } else {
        return json({ error: 'invitee_id ou anon_key requis' }, 400);
      }
    }

    const ev = await env.DB.prepare('SELECT id FROM events WHERE slug = ?').bind(params.slug).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);

    const now = new Date().toISOString();

    // 1. Snapshot temps réel : UPSERT dans event_presence (comportement historique inchangé)
    if (inviteeId) {
      await env.DB.prepare(`
        INSERT INTO event_presence (id, event_id, invitee_id, anon_key, last_seen)
        VALUES (?, ?, ?, NULL, ?)
        ON CONFLICT(event_id, invitee_id) DO UPDATE SET last_seen = excluded.last_seen
      `).bind(crypto.randomUUID(), ev.id, inviteeId, now).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO event_presence (id, event_id, invitee_id, anon_key, last_seen)
        VALUES (?, ?, NULL, ?, ?)
        ON CONFLICT(event_id, anon_key) DO UPDATE SET last_seen = excluded.last_seen
      `).bind(crypto.randomUUID(), ev.id, anonKey, now).run();
    }

    // 2. Historique analytics : INSERT-only dans event_presence_history (drop-off, durée connexion)
    // Wrappé en try/catch indépendant : si la table n'existe pas encore (migration 0015 pas appliquée)
    // ou si autre erreur, on ne fait pas échouer le heartbeat principal.
    try {
      await env.DB.prepare(`
        INSERT INTO event_presence_history (id, event_id, invitee_id, anon_key, pinged_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), ev.id, inviteeId, anonKey, now).run();
    } catch (histErr) {
      console.error('[presence_history insert]', histErr);
      // Non-bloquant volontairement
    }

    return json({ success: true, anon_key: anonKey });
  } catch (err) {
    console.error('[presence heartbeat]', err);
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
