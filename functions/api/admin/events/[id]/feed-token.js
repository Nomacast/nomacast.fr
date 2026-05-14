// functions/api/admin/events/[id]/feed-token.js
// GET /api/admin/events/<id>/feed-token
//
// Renvoie l'URL complète (avec token HMAC signé) à coller dans vMix Browser Input.
// Auth : Basic Auth admin (héritée).

export const onRequestGet = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1 binding manquant' }, 500);
    if (!env.CHAT_IP_HASH_SECRET) return json({ error: 'CHAT_IP_HASH_SECRET manquant' }, 503);

    const ev = await env.DB.prepare('SELECT id, title FROM events WHERE id = ?').bind(params.id).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);

    const token = await signFeedToken(ev.id, env.CHAT_IP_HASH_SECRET);
    const origin = new URL(request.url).origin;
    const feedUrl = `${origin}/feed/alerts?event=${encodeURIComponent(ev.id)}&token=${encodeURIComponent(token)}`;

    return json({
      event_id: ev.id,
      event_title: ev.title,
      token,
      feed_url: feedUrl
    });
  } catch (err) {
    console.error('[feed-token]', err && err.stack || err);
    return json({ error: 'Exception: ' + (err && err.message || 'unknown') }, 500);
  }
};

async function signFeedToken(eventId, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('feed:' + eventId));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
