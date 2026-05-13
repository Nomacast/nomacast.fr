// functions/api/event-admin/[token]/invitees/[invitee_id].js
// DELETE /api/event-admin/:token/invitees/:invitee_id

export const onRequestDelete = async ({ params, env }) => {
  const event = await resolveEvent(params.token, env);
  if (!event) return jsonResponse({ error: 'Token invalide' }, 403);

  try {
    const result = await env.DB.prepare(
      'DELETE FROM invitees WHERE id = ? AND event_id = ?'
    ).bind(params.invitee_id, event.id).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ error: 'Invité introuvable' }, 404);
    }
    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
};

async function resolveEvent(token, env) {
  if (!env.DB || !env.ADMIN_PASSWORD) return null;
  const events = await env.DB.prepare(
    'SELECT id, slug FROM events'
  ).all();
  for (const ev of (events.results || [])) {
    const expected = await computeClientToken(ev.slug, env.ADMIN_PASSWORD);
    if (token === expected) return ev;
  }
  return null;
}

async function computeClientToken(slug, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(slug + ':client'));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .slice(0, 24);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store'
    }
  });
}
