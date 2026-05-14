// functions/api/feed/alerts.js
// GET /api/feed/alerts?event=<event_id>&token=<hmac>[&since=<iso>]
//
// Endpoint public protégé par token HMAC signé.
// Retourne les alertes techniques non-dismissed pour un event.
// Cible : page HTML feed chargée par vMix Browser Input (pas d'auth Basic).

export const onRequestGet = async ({ request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1 binding manquant' }, 500);
    if (!env.CHAT_IP_HASH_SECRET) return json({ error: 'Secret manquant (CHAT_IP_HASH_SECRET)' }, 503);

    const url = new URL(request.url);
    const eventId = (url.searchParams.get('event') || '').trim();
    const token = (url.searchParams.get('token') || '').trim();
    const since = (url.searchParams.get('since') || '').trim();

    if (!eventId || !token) return json({ error: 'event + token requis' }, 400);

    // Vérifier le token HMAC
    const expected = await signFeedToken(eventId, env.CHAT_IP_HASH_SECRET);
    if (!constantTimeEqual(token, expected)) return json({ error: 'Token invalide' }, 403);

    // Fenêtre de pertinence : 1 heure
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const filterSince = since && since > hourAgo ? since : hourAgo;

    const rs = await env.DB.prepare(`
      SELECT id, event_id, type, invitee_id, author_label, country, created_at, dismissed_at
      FROM technical_alerts
      WHERE event_id = ?
        AND created_at > ?
        AND dismissed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 20
    `).bind(eventId, filterSince).all();

    return json({
      alerts: rs.results || [],
      unread_count: (rs.results || []).length,
      server_time: new Date().toISOString()
    });
  } catch (err) {
    console.error('[feed alerts]', err && err.stack || err);
    return json({ error: 'Exception: ' + (err && err.message || 'unknown') }, 500);
  }
};

// HMAC SHA-256 hex : signature event_id avec secret partagé
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

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'  // pour permettre éventuel embed depuis autre origine
    }
  });
}
