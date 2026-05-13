// functions/api/admin/events/[id]/invitees.js
// GET  /api/admin/events/:id/invitees  → liste des invités d'un event
// POST /api/admin/events/:id/invitees  → ajoute 1 invité OU batch d'invités
//   Body single : { email, full_name, company }
//   Body batch  : { invitees: [{email, full_name, company}, ...] }

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================
// GET
// ============================================================
export const onRequestGet = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB manquant' }, 500);

  const event = await env.DB.prepare('SELECT id FROM events WHERE id = ?')
    .bind(params.id).first();
  if (!event) return jsonResponse({ error: 'Event introuvable' }, 404);

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, email, full_name, company, magic_token,
              invited_at, last_seen_at, created_at
         FROM invitees
        WHERE event_id = ?
        ORDER BY created_at DESC`
    ).bind(params.id).all();

    return jsonResponse({ invitees: results || [] });
  } catch (err) {
    console.error('[invitees GET]', err);
    return jsonResponse({ error: err.message }, 500);
  }
};

// ============================================================
// POST
// ============================================================
export const onRequestPost = async ({ request, params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB manquant' }, 500);

  const event = await env.DB.prepare('SELECT id FROM events WHERE id = ?')
    .bind(params.id).first();
  if (!event) return jsonResponse({ error: 'Event introuvable' }, 404);

  let data;
  try { data = await request.json(); }
  catch (e) { return jsonResponse({ error: 'JSON invalide' }, 400); }

  // Détection mode single vs batch
  const raw = Array.isArray(data.invitees)
    ? data.invitees
    : [{ email: data.email, full_name: data.full_name, company: data.company }];

  if (raw.length === 0) return jsonResponse({ error: 'Aucun invité à ajouter' }, 400);
  if (raw.length > 500) {
    return jsonResponse({ error: 'Maximum 500 invités par lot. Sépare ton CSV en plusieurs imports.' }, 400);
  }

  // Récupération des emails déjà présents pour éviter doublons (UNIQUE event_id+email)
  const existingResult = await env.DB.prepare(
    'SELECT email FROM invitees WHERE event_id = ?'
  ).bind(params.id).all();
  const existingEmails = new Set((existingResult.results || []).map(r => r.email.toLowerCase()));

  const created = [];
  const skipped = [];
  const errors = [];

  for (const entry of raw) {
    const email = (entry.email || '').trim().toLowerCase();
    const fullName = entry.full_name ? entry.full_name.trim() : null;
    const company = entry.company ? entry.company.trim() : null;

    if (!email) {
      errors.push({ email: entry.email || '(vide)', reason: 'Email manquant' });
      continue;
    }
    if (!EMAIL_REGEX.test(email)) {
      errors.push({ email, reason: 'Email invalide' });
      continue;
    }
    if (existingEmails.has(email)) {
      skipped.push({ email, reason: 'Déjà invité' });
      continue;
    }

    const id = generateId();
    const token = generateToken();

    try {
      await env.DB.prepare(`
        INSERT INTO invitees (id, event_id, email, full_name, company, magic_token, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(id, params.id, email, fullName, company, token, new Date().toISOString()).run();

      existingEmails.add(email); // dans la même requête : éviter doublons internes du batch
      created.push({ id, email, full_name: fullName, company, magic_token: token });
    } catch (err) {
      console.error('[invitees POST insert]', err);
      errors.push({ email, reason: err.message });
    }
  }

  return jsonResponse({
    created_count: created.length,
    skipped_count: skipped.length,
    errors_count: errors.length,
    created,
    skipped,
    errors
  }, 201);
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

function generateId() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  let id = '';
  for (let i = 0; i < 12; i++) id += alphabet[arr[i] % alphabet.length];
  return id;
}

// Token plus long (24 chars) pour les magic links
function generateToken() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  let t = '';
  for (let i = 0; i < 24; i++) t += alphabet[arr[i] % alphabet.length];
  return t;
}
