// functions/api/admin/events.js
// GET  /api/admin/events           → liste tous les events (triés par date desc)
// POST /api/admin/events           → crée un event, renvoie l'event créé

// ============================================================
// GET — Liste des events
// ============================================================
export const onRequestGet = async ({ env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB manquant' }, 500);

  try {
    // JOIN sur invitees pour récupérer count + count "envoyé"
    const { results } = await env.DB.prepare(
      `SELECT
         e.id, e.slug, e.title, e.client_name, e.description, e.scheduled_at, e.duration_minutes,
         e.audience_estimate, e.status, e.primary_color, e.white_label, e.subtitles,
         e.modes_json, e.access_mode, e.created_at, e.updated_at,
         (SELECT COUNT(*) FROM invitees i WHERE i.event_id = e.id) AS invitees_count,
         (SELECT COUNT(*) FROM invitees i WHERE i.event_id = e.id AND i.invited_at IS NOT NULL) AS invitees_sent
       FROM events e
       ORDER BY e.scheduled_at DESC`
    ).all();

    const events = (results || []).map(deserializeEvent);
    return jsonResponse({ events });
  } catch (err) {
    console.error('[admin/events GET]', err);
    return jsonResponse({ error: 'Erreur de lecture base : ' + err.message }, 500);
  }
};

// ============================================================
// POST — Création d'un event
// ============================================================
export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB manquant' }, 500);

  let data;
  try {
    data = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'JSON invalide' }, 400);
  }

  // Validation
  const validationError = validateEventInput(data);
  if (validationError) return jsonResponse({ error: validationError }, 400);

  // nomacast-modes-compat-v1 / Lot D — validation matrice de compatibilité des modes
  const modesArr = Array.isArray(data.modes) ? data.modes : [];
  const compatError = validateModesCompatibility(modesArr);
  if (compatError) return jsonResponse({ error: compatError }, 400);

  const id = generateId();
  const slug = await uniqueSlug(env.DB, data.title);
  const now = new Date().toISOString();

  // nomacast-event-description-v1 / FR-3 — description optionnelle (validation taille faite dans validateEventInput)
  const description = data.description ? String(data.description).trim() || null : null;

  try {
    await env.DB.prepare(`
      INSERT INTO events (
        id, slug, title, client_name, description, scheduled_at, duration_minutes,
        audience_estimate, status, primary_color, logo_url,
        white_label, subtitles, modes_json, access_mode,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      slug,
      data.title.trim(),
      data.client_name ? data.client_name.trim() : null,
      description,
      data.scheduled_at,
      parseInt(data.duration_minutes, 10),
      data.audience_estimate ? parseInt(data.audience_estimate, 10) : null,
      'draft',
      data.primary_color || '#5A98D6',
      data.logo_url || null,
      data.white_label ? 1 : 0,
      data.subtitles ? 1 : 0,
      JSON.stringify(modesArr),
      data.access_mode || 'public',
      now,
      now
    ).run();

    const created = await env.DB.prepare(
      'SELECT * FROM events WHERE id = ?'
    ).bind(id).first();

    return jsonResponse({ event: deserializeEvent(created) }, 201);
  } catch (err) {
    console.error('[admin/events POST]', err);
    return jsonResponse({ error: 'Erreur insertion : ' + err.message }, 500);
  }
};

// ============================================================
// Helpers (factorisables avec [id].js plus tard si besoin)
// ============================================================
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function deserializeEvent(row) {
  if (!row) return null;
  let modes = [];
  if (row.modes_json) {
    try { modes = JSON.parse(row.modes_json); } catch (e) {}
  }
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    client_name: row.client_name,
    // nomacast-event-description-v1 / FR-3
    description: row.description || null,
    scheduled_at: row.scheduled_at,
    duration_minutes: row.duration_minutes,
    audience_estimate: row.audience_estimate,
    status: row.status,
    primary_color: row.primary_color,
    logo_url: row.logo_url,
    white_label: row.white_label === 1,
    subtitles: row.subtitles === 1,
    modes,
    access_mode: row.access_mode,
    stream_uid: row.stream_uid,
    stream_playback_url: row.stream_playback_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    invitees_count: typeof row.invitees_count === 'number' ? row.invitees_count : 0,
    invitees_sent: typeof row.invitees_sent === 'number' ? row.invitees_sent : 0
  };
}

function validateEventInput(data) {
  if (!data || typeof data !== 'object') return 'Données manquantes';
  if (!data.title || !data.title.trim()) return 'Le titre est requis';
  if (data.title.length > 200) return 'Titre trop long (max 200 caractères)';
  if (!data.scheduled_at) return 'La date de l\'événement est requise';
  if (isNaN(Date.parse(data.scheduled_at))) return 'Date invalide';
  if (!data.duration_minutes || isNaN(parseInt(data.duration_minutes, 10)) || parseInt(data.duration_minutes, 10) <= 0) {
    return 'La durée (en minutes) est requise et doit être positive';
  }
  if (data.audience_estimate && isNaN(parseInt(data.audience_estimate, 10))) {
    return 'L\'estimation d\'audience doit être un nombre';
  }
  if (data.primary_color && !/^#[0-9a-fA-F]{6}$/.test(data.primary_color)) {
    return 'Couleur invalide (format attendu : #RRGGBB)';
  }
  if (data.access_mode && !['public', 'private'].includes(data.access_mode)) {
    return 'Mode d\'accès invalide';
  }
  // nomacast-event-description-v1 / FR-3
  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== 'string') return 'La description doit être du texte';
    if (data.description.length > 500) return 'La description ne doit pas dépasser 500 caractères (actuel : ' + data.description.length + ')';
  }
  return null;
}

// ============================================================
// nomacast-modes-compat-v1 / Lot D — Matrice de compatibilité des modes
// ============================================================
// Doit rester synchronisé avec validateModesCompatibility dans
// functions/api/admin/events/[id].js et l'UI dans admin/new.html + admin/edit.html.
const MODE_INCOMPATIBLE_PAIRS = [
  ['lecture', 'qa'],
  ['lecture', 'libre'],
  ['lecture', 'sondages'],
  ['lecture', 'quiz'],
  ['lecture', 'nuage'],
  ['qa', 'libre']
];
const MODE_LABELS = {
  qa: 'Q&A modéré',
  libre: 'Chat libre',
  sondages: 'Sondages live',
  quiz: 'Quiz interactif',
  nuage: 'Nuage de mots-clés',
  reactions: 'Réactions rapides',
  lecture: 'Lecture seule'
};
function validateModesCompatibility(modes) {
  if (!Array.isArray(modes) || modes.length === 0) return null;
  const set = new Set(modes);
  for (const [a, b] of MODE_INCOMPATIBLE_PAIRS) {
    if (set.has(a) && set.has(b)) {
      const labelA = MODE_LABELS[a] || a;
      const labelB = MODE_LABELS[b] || b;
      return 'Modes incompatibles : « ' + labelA + ' » et « ' + labelB + ' » ne peuvent pas être activés simultanément.';
    }
  }
  return null;
}

// ID alphanumérique 12 caractères, sans caractères confusants (0/O, l/1, etc.)
function generateId() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += alphabet[arr[i] % alphabet.length];
  }
  return id;
}

async function uniqueSlug(db, title) {
  const base = String(title)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) || 'event';

  let slug = base;
  for (let attempt = 0; attempt < 6; attempt++) {
    const exists = await db.prepare('SELECT 1 FROM events WHERE slug = ?').bind(slug).first();
    if (!exists) return slug;
    slug = base + '-' + Math.random().toString(36).substring(2, 7);
  }
  return base + '-' + Date.now();
}
