// functions/i/[token]/status.js
// GET /i/:token/status  →  Status léger pour polling client-side.
//
// Renvoie { status, scheduled_at } sans tracking ni cache.
// Utilisé par la page draft pour détecter la transition draft → live et reload.

export const onRequestGet = async ({ params, env }) => {
  if (!env.DB) {
    return jsonResponse({ error: 'service_unavailable' }, 503);
  }

  const row = await env.DB.prepare(`
    SELECT e.status, e.scheduled_at
    FROM invitees i
    JOIN events e ON i.event_id = e.id
    WHERE i.magic_token = ?
  `).bind(params.token).first();

  if (!row) {
    return jsonResponse({ error: 'not_found' }, 404);
  }

  return jsonResponse({
    status: row.status,
    scheduled_at: row.scheduled_at
  });
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    }
  });
}
