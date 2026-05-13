// functions/api/event-admin/[token]/upload-logo.js
// POST /api/event-admin/:token/upload-logo  (multipart/form-data avec champ "file")
// Upload R2 — version CLIENT (auth par HMAC token + garde white_label === true).

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 Mo

export const onRequestPost = async ({ params, request, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);
  if (!env.ADMIN_PASSWORD) return jsonResponse({ error: 'ADMIN_PASSWORD non configuré' }, 500);
  if (!env.LOGOS_BUCKET) return jsonResponse({ error: 'Binding R2 « LOGOS_BUCKET » manquant.' }, 500);
  if (!env.R2_PUBLIC_BASE_URL) return jsonResponse({ error: 'R2_PUBLIC_BASE_URL non configurée.' }, 500);

  // Auth + garde white_label
  const event = await resolveEventByToken(params.token, env);
  if (!event) return jsonResponse({ error: 'Token invalide' }, 403);
  const isWhiteLabel = event.white_label === 1 || event.white_label === true;
  if (!isWhiteLabel) {
    return jsonResponse({
      error: 'Upload non autorisé. Cet événement n\'est pas en mode « marque blanche ».'
    }, 403);
  }

  let formData;
  try { formData = await request.formData(); }
  catch (e) { return jsonResponse({ error: 'FormData invalide ou Content-Type manquant.' }, 400); }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return jsonResponse({ error: 'Aucun fichier reçu (champ « file » manquant).' }, 400);
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return jsonResponse({
      error: 'Format non supporté. Types acceptés : PNG, JPG, WEBP, SVG. Reçu : ' + (file.type || 'inconnu')
    }, 400);
  }
  if (file.size > MAX_SIZE_BYTES) {
    return jsonResponse({
      error: 'Fichier trop volumineux (max 2 Mo). Taille reçue : ' + Math.round(file.size / 1024) + ' Ko.'
    }, 400);
  }

  const ext = getExtension(file.type);
  const id = generateId();
  const key = `logos/${id}.${ext}`;

  try {
    const buffer = await file.arrayBuffer();
    await env.LOGOS_BUCKET.put(key, buffer, {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        original_name: sanitizeName(file.name || 'logo'),
        uploaded_at: new Date().toISOString(),
        source: 'event-admin-client',
        event_id: event.id
      }
    });
  } catch (err) {
    console.error('[event-admin/upload-logo] R2 put error', err);
    return jsonResponse({ error: 'Échec de l\'upload R2 : ' + err.message }, 502);
  }

  const baseUrl = env.R2_PUBLIC_BASE_URL.replace(/\/$/, '');
  const url = `${baseUrl}/${key}`;

  return jsonResponse({
    url, key, size: file.size, type: file.type,
    original_name: file.name || null
  });
};

// ============================================================
// Helpers
// ============================================================
async function resolveEventByToken(token, env) {
  const events = await env.DB.prepare(
    'SELECT id, slug, white_label FROM events'
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
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function getExtension(mimeType) {
  switch (mimeType) {
    case 'image/png': return 'png';
    case 'image/jpeg': case 'image/jpg': return 'jpg';
    case 'image/webp': return 'webp';
    case 'image/svg+xml': return 'svg';
    default: return 'bin';
  }
}

function sanitizeName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

function generateId() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  let id = '';
  for (let i = 0; i < 16; i++) id += alphabet[arr[i] % alphabet.length];
  return id;
}
