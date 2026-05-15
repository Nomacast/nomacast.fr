// functions/api/admin/events/[id].js
// GET    /api/admin/events/:id  → détail d'un event
// PATCH  /api/admin/events/:id  → update partiel d'un event
// DELETE /api/admin/events/:id  → suppression d'un event (cascade vers invitees)

// ============================================================
// GET — Détail
// ============================================================
export const onRequestGet = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB manquant' }, 500);

  try {
    const row = await env.DB.prepare(
      `SELECT e.*,
              (SELECT COUNT(*) FROM invitees i WHERE i.event_id = e.id) AS invitees_count,
              (SELECT COUNT(*) FROM invitees i WHERE i.event_id = e.id AND i.invited_at IS NOT NULL) AS invitees_sent
         FROM events e
         WHERE e.id = ?`
    ).bind(params.id).first();

    if (!row) return jsonResponse({ error: 'Event introuvable' }, 404);
    const event = deserializeEvent(row);
    event.admin_preview_token = await computePreviewToken(event.slug, env.ADMIN_PASSWORD);
    event.client_admin_token = await computeClientToken(event.slug, env.ADMIN_PASSWORD);
    return jsonResponse({ event });
  } catch (err) {
    console.error('[admin/events/:id GET]', err);
    return jsonResponse({ error: err.message }, 500);
  }
};

// ============================================================
// PATCH — Update partiel
// ============================================================
export const onRequestPatch = async ({ request, params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB manquant' }, 500);

  let data;
  try {
    data = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'JSON invalide' }, 400);
  }

  // nomacast-logo-reset-v1 : effet de bord — quand l'admin Nomacast désactive
  // explicitement white_label, on force le reset des customs client (logo + couleur).
  // Évite que d'anciennes customs persistent en DB et soient ré-appliquées si le
  // mode marque blanche est ré-activé plus tard. Le caller peut quand même renvoyer
  // ses propres logo_url/primary_color dans le même PATCH, mais ces overrides client
  // sont écrasés par le default ici (sécurité positive).
  if (data.white_label !== undefined && !data.white_label) {
    data.logo_url = null;
    data.primary_color = '#5A98D6';
  }

  // On accepte seulement un sous-ensemble de champs modifiables.
  // Le slug est traité séparément (cf. plus bas) car sa modification est
  // soumise à condition (aucun invité ne doit déjà avoir reçu le lien).
  // id, created_at sont immuables ; updated_at est régénéré ici.
  const allowed = [
    'title', 'client_name', 'scheduled_at', 'duration_minutes',
    'audience_estimate', 'status', 'primary_color', 'logo_url',
    'white_label', 'subtitles', 'modes_json', 'access_mode'
  ];

  const sets = [];
  const binds = [];

  // Slug modifiable UNIQUEMENT si aucun invité n'a encore été ajouté (Fix 8 v2)
  if (data.slug !== undefined) {
    const newSlug = String(data.slug || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire accents
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (newSlug.length < 3 || newSlug.length > 80) {
      return jsonResponse({ error: 'Le slug doit faire entre 3 et 80 caractères (lettres, chiffres, tirets uniquement).' }, 400);
    }

    // Charger l'event actuel pour comparer + vérifier les invités
    const current = await env.DB.prepare(
      `SELECT slug,
              (SELECT COUNT(*) FROM invitees WHERE event_id = ?) AS invitees_count
         FROM events WHERE id = ?`
    ).bind(params.id, params.id).first();

    if (!current) return jsonResponse({ error: 'Event introuvable' }, 404);

    // No-op si identique à l'actuel
    if (current.slug !== newSlug) {
      // Refus si invités déjà présents
      if (current.invitees_count > 0) {
        return jsonResponse({
          error: 'L\'URL ne peut plus être modifiée : ' + current.invitees_count + ' invité(s) ont déjà reçu le lien actuel. Pour changer le slug, il faudrait d\'abord supprimer ces invités (et leur renvoyer un nouveau lien après).'
        }, 409);
      }
      // Vérifier unicité
      const collision = await env.DB.prepare(
        'SELECT id FROM events WHERE slug = ? AND id != ?'
      ).bind(newSlug, params.id).first();
      if (collision) {
        return jsonResponse({ error: 'Ce slug est déjà utilisé par un autre event.' }, 409);
      }
      sets.push('slug = ?'); binds.push(newSlug);
    }
  }

  if (data.title !== undefined) {
    if (!data.title.trim()) return jsonResponse({ error: 'Titre requis' }, 400);
    sets.push('title = ?'); binds.push(data.title.trim());
  }
  if (data.client_name !== undefined) {
    sets.push('client_name = ?'); binds.push(data.client_name ? data.client_name.trim() : null);
  }
  // nomacast-event-description-v1 / FR-3 : description optionnelle, max 500 caractères
  if (data.description !== undefined) {
    if (data.description === null || data.description === '') {
      sets.push('description = ?'); binds.push(null);
    } else {
      const desc = String(data.description).trim();
      if (desc.length > 500) {
        return jsonResponse({ error: 'La description ne doit pas dépasser 500 caractères (actuel : ' + desc.length + ').' }, 400);
      }
      sets.push('description = ?'); binds.push(desc || null);
    }
  }
  if (data.scheduled_at !== undefined) {
    if (isNaN(Date.parse(data.scheduled_at))) return jsonResponse({ error: 'Date invalide' }, 400);
    sets.push('scheduled_at = ?'); binds.push(data.scheduled_at);
  }
  if (data.duration_minutes !== undefined) {
    const d = parseInt(data.duration_minutes, 10);
    if (isNaN(d) || d <= 0) return jsonResponse({ error: 'Durée invalide' }, 400);
    sets.push('duration_minutes = ?'); binds.push(d);
  }
  if (data.audience_estimate !== undefined) {
    if (data.audience_estimate === null || data.audience_estimate === '') {
      sets.push('audience_estimate = ?'); binds.push(null);
    } else {
      const a = parseInt(data.audience_estimate, 10);
      if (isNaN(a)) return jsonResponse({ error: 'Audience invalide' }, 400);
      sets.push('audience_estimate = ?'); binds.push(a);
    }
  }
  if (data.status !== undefined) {
    if (!['draft', 'live', 'ended'].includes(data.status)) {
      return jsonResponse({ error: 'Statut invalide (draft/live/ended)' }, 400);
    }
    sets.push('status = ?'); binds.push(data.status);
  }
  if (data.primary_color !== undefined) {
    if (data.primary_color && !/^#[0-9a-fA-F]{6}$/.test(data.primary_color)) {
      return jsonResponse({ error: 'Couleur invalide' }, 400);
    }
    sets.push('primary_color = ?'); binds.push(data.primary_color || '#5A98D6');
  }
  if (data.logo_url !== undefined) {
    sets.push('logo_url = ?'); binds.push(data.logo_url || null);
  }
  if (data.white_label !== undefined) {
    sets.push('white_label = ?'); binds.push(data.white_label ? 1 : 0);
  }
  if (data.subtitles !== undefined) {
    sets.push('subtitles = ?'); binds.push(data.subtitles ? 1 : 0);
  }
  if (data.modes !== undefined) {
    // nomacast-modes-compat-v1 / Lot D — validation de la matrice de compatibilité
    const modesArr = Array.isArray(data.modes) ? data.modes : [];
    const compatError = validateModesCompatibility(modesArr);
    if (compatError) return jsonResponse({ error: compatError }, 400);
    sets.push('modes_json = ?'); binds.push(JSON.stringify(modesArr));
  }
  // nomacast-reactions-config-v1 : sélection des emojis de réactions par event
  // Pool de 15 autorisés, 1 à 5 par event. null = restaure le défaut (8 originaux).
  if (data.reaction_emojis !== undefined) {
    if (data.reaction_emojis === null) {
      sets.push('reaction_emojis_json = ?'); binds.push(null);
    } else if (!Array.isArray(data.reaction_emojis)) {
      return jsonResponse({ error: 'reaction_emojis doit être un tableau' }, 400);
    } else if (data.reaction_emojis.length < 1 || data.reaction_emojis.length > 5) {
      return jsonResponse({ error: 'reaction_emojis doit contenir entre 1 et 5 emojis' }, 400);
    } else {
      const POOL = ['👏','❤️','🔥','🎉','🙏','👍','😂','🤔','💡','🚀','✨','🤯','🥳','🤝','⭐'];
      const seen = new Set();
      for (const e of data.reaction_emojis) {
        if (!POOL.includes(e)) {
          return jsonResponse({ error: 'Emoji non autorisé : ' + e }, 400);
        }
        if (seen.has(e)) {
          return jsonResponse({ error: 'Emoji en double : ' + e }, 400);
        }
        seen.add(e);
      }
      sets.push('reaction_emojis_json = ?'); binds.push(JSON.stringify(data.reaction_emojis));
    }
  }
  if (data.access_mode !== undefined) {
    if (!['public', 'private'].includes(data.access_mode)) {
      return jsonResponse({ error: 'access_mode invalide (public/private)' }, 400);
    }
    sets.push('access_mode = ?'); binds.push(data.access_mode);
  }

  if (sets.length === 0) return jsonResponse({ error: 'Aucun champ à modifier' }, 400);

  // updated_at toujours mis à jour
  sets.push('updated_at = ?');
  binds.push(new Date().toISOString());

  binds.push(params.id);

  try {
    const result = await env.DB.prepare(
      `UPDATE events SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...binds).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ error: 'Event introuvable' }, 404);
    }

    const updated = await env.DB.prepare(
      'SELECT * FROM events WHERE id = ?'
    ).bind(params.id).first();

    const event = deserializeEvent(updated);
    event.admin_preview_token = await computePreviewToken(event.slug, env.ADMIN_PASSWORD);
    event.client_admin_token = await computeClientToken(event.slug, env.ADMIN_PASSWORD);
    return jsonResponse({ event });
  } catch (err) {
    console.error('[admin/events/:id PATCH]', err);
    return jsonResponse({ error: err.message }, 500);
  }
};

// ============================================================
// DELETE — Suppression (refusée si invités présents · Q4 option B)
// ============================================================
export const onRequestDelete = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB manquant' }, 500);

  try {
    // Protection : on refuse le hard-delete si l'event a au moins 1 invité.
    // L'admin doit d'abord vider la liste d'invités, OU archiver l'event (status='ended').
    const countRow = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM invitees WHERE event_id = ?'
    ).bind(params.id).first();

    if (countRow && countRow.n > 0) {
      return jsonResponse({
        error: 'Cet event a ' + countRow.n + ' invité(s). Supprime-les d\'abord, ou archive l\'event (statut « Terminé ») pour conserver l\'historique.',
        invitees_count: countRow.n
      }, 409); // 409 Conflict
    }

    const result = await env.DB.prepare(
      'DELETE FROM events WHERE id = ?'
    ).bind(params.id).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ error: 'Event introuvable' }, 404);
    }
    return jsonResponse({ success: true, deleted_id: params.id });
  } catch (err) {
    console.error('[admin/events/:id DELETE]', err);
    return jsonResponse({ error: err.message }, 500);
  }
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

// ============================================================
// nomacast-modes-compat-v1 / Lot D — Matrice de compatibilité des modes
// ============================================================
// Règles validées 15 mai 2026 :
//   - "lecture" (lecture seule) exclut tous les modes interactifs sauf "reactions"
//   - "qa" et "libre" sont mutuellement exclusifs (un seul mode chat à la fois)
//   - Tous les autres modes (sondages, quiz, nuage, reactions) sont combinables librement
//     (sauf avec "lecture")
//
// MODES_EXPORTÉS_PARTAGÉS — garder synchronisé avec admin/edit.html et admin/new.html.
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

/**
 * Calcule un token HMAC-SHA-256 du slug avec ADMIN_PASSWORD comme clé.
 * Permet à l'admin de générer un lien preview pour les events privés
 * sans stocker de token en BDD. Si ADMIN_PASSWORD change, tous les
 * anciens liens admin preview sont invalidés (sécurité positive).
 */
async function computePreviewToken(slug, secret) {
  if (!secret) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(slug));
  // base64url encoded, ~24 chars
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .slice(0, 24);
}

/**
 * Calcule un token HMAC-SHA-256 du (slug + ':client') avec ADMIN_PASSWORD.
 * Différent du computePreviewToken pour avoir 2 secrets distincts par event :
 *  - admin_preview_token : pour que l'admin Nomacast voie l'event privé
 *  - client_admin_token  : pour que le client gère ses propres invités
 * Si ADMIN_PASSWORD change, tous les liens client sont invalidés.
 */
async function computeClientToken(slug, secret) {
  if (!secret) return null;
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

function deserializeEvent(row) {
  if (!row) return null;
  let modes = [];
  if (row.modes_json) {
    try { modes = JSON.parse(row.modes_json); } catch (e) {}
  }
  // nomacast-reactions-config-v1 : reaction_emojis = null si jamais configuré
  // (consommateur applique le défaut des 8 originaux), sinon array 1-5 emojis.
  let reactionEmojis = null;
  if (row.reaction_emojis_json) {
    try {
      const parsed = JSON.parse(row.reaction_emojis_json);
      if (Array.isArray(parsed) && parsed.length > 0) reactionEmojis = parsed;
    } catch (e) {}
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
    reaction_emojis: reactionEmojis,
    access_mode: row.access_mode,
    stream_uid: row.stream_uid,
    stream_rtmps_url: row.stream_rtmps_url,
    stream_rtmps_key: row.stream_rtmps_key,
    stream_playback_url: row.stream_playback_url,
    stream_created_at: row.stream_created_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // nomacast-client-credentials-v1 : login client exposé, hash JAMAIS exposé
    client_login: row.client_login || null,
    has_client_password: !!row.client_password_hash,
    invitees_count: typeof row.invitees_count === 'number' ? row.invitees_count : 0,
    invitees_sent: typeof row.invitees_sent === 'number' ? row.invitees_sent : 0
  };
}
