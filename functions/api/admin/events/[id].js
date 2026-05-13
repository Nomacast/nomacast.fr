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
    return jsonResponse({ event: deserializeEvent(row) });
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

  // On accepte seulement un sous-ensemble de champs modifiables.
  // (le slug, id, created_at sont immuables ; updated_at est régénéré ici)
  const allowed = [
    'title', 'client_name', 'scheduled_at', 'duration_minutes',
    'audience_estimate', 'status', 'primary_color', 'logo_url',
    'white_label', 'subtitles', 'modes_json', 'access_mode'
  ];

  const sets = [];
  const binds = [];

  if (data.title !== undefined) {
    if (!data.title.trim()) return jsonResponse({ error: 'Titre requis' }, 400);
    sets.push('title = ?'); binds.push(data.title.trim());
  }
  if (data.client_name !== undefined) {
    sets.push('client_name = ?'); binds.push(data.client_name ? data.client_name.trim() : null);
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
    sets.push('modes_json = ?'); binds.push(JSON.stringify(Array.isArray(data.modes) ? data.modes : []));
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

    return jsonResponse({ event: deserializeEvent(updated) });
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
