// functions/api/admin/upload-logo.js
// POST /api/admin/upload-logo  (multipart/form-data avec champ "file")
// Uploade un fichier image vers le bucket R2 lié au binding `LOGOS_BUCKET`,
// et renvoie l'URL publique servie depuis env.R2_PUBLIC_BASE_URL.
//
// Requirements (Cloudflare Pages settings) :
//  - R2 bucket bindings → variable name: LOGOS_BUCKET, bucket: nomacast-assets
//    (⚠️ ne PAS nommer le binding "ASSETS" — c'est un nom réservé par Pages)
//  - Environment variables → R2_PUBLIC_BASE_URL = https://pub-xxxx.r2.dev (sans / final)
//  - Protégé par le _middleware.js Basic Auth de /api/admin/

const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml'
];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 Mo

export const onRequestPost = async ({ request, env }) => {
  if (!env.LOGOS_BUCKET) {
    return jsonResponse({ error: 'Binding R2 « LOGOS_BUCKET » manquant côté Cloudflare Pages.' }, 500);
  }
  if (!env.R2_PUBLIC_BASE_URL) {
    return jsonResponse({ error: 'Variable d\'environnement R2_PUBLIC_BASE_URL non configurée.' }, 500);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch (e) {
    return jsonResponse({ error: 'FormData invalide ou Content-Type manquant.' }, 400);
  }

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

  // Génération du chemin de stockage : logos/<id>.<ext>
  const ext = getExtension(file.type);
  const id = generateId();
  const key = `logos/${id}.${ext}`;

  // Upload R2
  try {
    const buffer = await file.arrayBuffer();
    await env.LOGOS_BUCKET.put(key, buffer, {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        original_name: sanitizeName(file.name || 'logo'),
        uploaded_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[upload-logo] R2 put error', err);
    return jsonResponse({ error: 'Échec de l\'upload R2 : ' + err.message }, 502);
  }

  // URL publique (R2.dev URL)
  const baseUrl = env.R2_PUBLIC_BASE_URL.replace(/\/$/, '');
  const url = `${baseUrl}/${key}`;

  return jsonResponse({
    url,
    key,
    size: file.size,
    type: file.type,
    original_name: file.name || null
  });
};

// ============================================================
// Helpers
// ============================================================
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function getExtension(mimeType) {
  switch (mimeType) {
    case 'image/png': return 'png';
    case 'image/jpeg':
    case 'image/jpg': return 'jpg';
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
