// functions/api/event-admin/[token]/invitees.js
// GET    /api/event-admin/:token/invitees    →  Liste invités
// POST   /api/event-admin/:token/invitees    →  Ajoute 1 invité OU batch (CSV)
// DELETE /api/event-admin/:token/invitees    →  Vide tous les invités

export const onRequestGet = async ({ params, env }) => {
  const event = await resolveEvent(params.token, env);
  if (!event) return jsonResponse({ error: 'Token invalide' }, 403);

  const result = await env.DB.prepare(
    `SELECT id, email, full_name, invited_at, last_seen_at, created_at
       FROM invitees WHERE event_id = ? ORDER BY created_at ASC`
  ).bind(event.id).all();

  return jsonResponse({ invitees: result.results || [] });
};

export const onRequestPost = async ({ request, params, env }) => {
  const event = await resolveEvent(params.token, env);
  if (!event) return jsonResponse({ error: 'Token invalide' }, 403);

  let data;
  try { data = await request.json(); }
  catch (e) { return jsonResponse({ error: 'JSON invalide' }, 400); }

  // Single ou batch
  const items = Array.isArray(data.invitees) ? data.invitees
                : (data.email ? [{ email: data.email, full_name: data.full_name }] : null);
  if (!items || items.length === 0) {
    return jsonResponse({ error: 'Aucun invité à ajouter' }, 400);
  }

  const results = { added: 0, duplicates: 0, errors: [] };
  for (const it of items) {
    const email = (it.email || '').trim().toLowerCase();
    const fullName = (it.full_name || '').trim() || null;
    if (!email || !email.includes('@')) {
      results.errors.push({ email: it.email, error: 'email invalide' });
      continue;
    }
    try {
      const id = crypto.randomUUID();
      const magicToken = generateToken();
      await env.DB.prepare(
        `INSERT INTO invitees (id, event_id, email, full_name, magic_token, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(id, event.id, email, fullName, magicToken, new Date().toISOString()).run();
      results.added++;
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        results.duplicates++;
      } else {
        results.errors.push({ email, error: err.message });
      }
    }
  }

  return jsonResponse(results);
};

export const onRequestDelete = async ({ params, env }) => {
  const event = await resolveEvent(params.token, env);
  if (!event) return jsonResponse({ error: 'Token invalide' }, 403);

  try {
    const result = await env.DB.prepare(
      'DELETE FROM invitees WHERE event_id = ?'
    ).bind(event.id).run();
    return jsonResponse({
      success: true,
      deleted_count: result.meta.changes || 0
    });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
};

// ============================================================
// Helpers
// ============================================================
async function resolveEvent(token, env) {
  if (!env.DB || !env.ADMIN_PASSWORD) return null;
  const events = await env.DB.prepare(
    'SELECT id, slug, title FROM events'
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

function generateToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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
