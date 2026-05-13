// functions/chat/[slug]/status.js
// GET /chat/:slug/status  →  Status léger pour polling client-side.
//
// Renvoie { status, scheduled_at } sans cache.
// Si event privé : exige ?preview=<hmac> valide (sinon 403, comme la page /chat/:slug elle-même).
// Utilisé par la page draft (et preview admin draft) pour détecter draft → live et reload.

export const onRequestGet = async ({ params, env, request }) => {
  if (!env.DB) {
    return jsonResponse({ error: 'service_unavailable' }, 503);
  }

  const row = await env.DB.prepare(`
    SELECT slug, status, scheduled_at, access_mode
    FROM events WHERE slug = ?
  `).bind(params.slug).first();

  if (!row) {
    return jsonResponse({ error: 'not_found' }, 404);
  }

  // Garde 403 si event privé sans preview token valide
  if (row.access_mode === 'private') {
    const url = new URL(request.url);
    const previewToken = url.searchParams.get('preview');
    if (!previewToken || !env.ADMIN_PASSWORD) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }
    const expected = await computePreviewToken(row.slug, env.ADMIN_PASSWORD);
    if (previewToken !== expected) {
      return jsonResponse({ error: 'forbidden' }, 403);
    }
  }

  return jsonResponse({
    status: row.status,
    scheduled_at: row.scheduled_at
  });
};

// Duplication assumée avec functions/chat/[slug].js (pas d'import croisé avec brackets)
async function computePreviewToken(slug, secret) {
  if (!secret) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(slug));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .slice(0, 24);
}

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
