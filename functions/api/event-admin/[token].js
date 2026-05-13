// functions/api/event-admin/[token].js
// GET   /api/event-admin/:token  →  Renvoie les infos de l'event
// PATCH /api/event-admin/:token  →  Update primary_color/logo_url (white_label requis)

const ALLOWED_PATCH_FIELDS = ['primary_color', 'logo_url'];

export const onRequestGet = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);
  if (!env.ADMIN_PASSWORD) return jsonResponse({ error: 'ADMIN_PASSWORD non configuré' }, 500);

  const event = await resolveEventByToken(params.token, env);
  if (!event) return jsonResponse({ error: 'Token invalide' }, 403);

  // Normaliser white_label (D1 renvoie 0/1)
  event.white_label = event.white_label === 1 || event.white_label === true;

  return jsonResponse({ event });
};

export const onRequestPatch = async ({ params, request, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);
  if (!env.ADMIN_PASSWORD) return jsonResponse({ error: 'ADMIN_PASSWORD non configuré' }, 500);

  const event = await resolveEventByToken(params.token, env);
  if (!event) return jsonResponse({ error: 'Token invalide' }, 403);

  // CRUCIAL : seuls les events "marque blanche" autorisent la personnalisation client
  const isWhiteLabel = event.white_label === 1 || event.white_label === true;
  if (!isWhiteLabel) {
    return jsonResponse({
      error: 'Personnalisation non autorisée. Cet événement n\'est pas en mode « marque blanche ».'
    }, 403);
  }

  let data;
  try { data = await request.json(); }
  catch (e) { return jsonResponse({ error: 'JSON invalide' }, 400); }

  // Filtrer aux champs autorisés (whitelist)
  const updates = {};
  for (const f of ALLOWED_PATCH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, f)) {
      updates[f] = data[f];
    }
  }

  // Validation primary_color (hex 3 ou 6 chars, ou null/empty pour reset)
  if ('primary_color' in updates) {
    const c = updates.primary_color;
    if (c === null || c === '') {
      updates.primary_color = null;
    } else if (!/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(c)) {
      return jsonResponse({ error: 'Couleur invalide (format attendu : #RRGGBB)' }, 400);
    }
  }

  // Validation logo_url (URL HTTPS ou null/empty pour reset)
  if ('logo_url' in updates) {
    const u = updates.logo_url;
    if (u === null || u === '') {
      updates.logo_url = null;
    } else if (typeof u !== 'string' || !/^https:\/\//.test(u)) {
      return jsonResponse({ error: 'URL de logo invalide (HTTPS requis)' }, 400);
    }
  }

  if (Object.keys(updates).length === 0) {
    return jsonResponse({ error: 'Aucun champ à mettre à jour' }, 400);
  }

  // Construction UPDATE
  const setClauses = [];
  const bindings = [];
  for (const k of Object.keys(updates)) {
    setClauses.push(`${k} = ?`);
    bindings.push(updates[k]);
  }
  setClauses.push('updated_at = ?');
  bindings.push(new Date().toISOString());
  bindings.push(event.id);

  try {
    await env.DB.prepare(
      `UPDATE events SET ${setClauses.join(', ')} WHERE id = ?`
    ).bind(...bindings).run();

    // Renvoyer l'event mis à jour
    const updated = await env.DB.prepare(`
      SELECT id, slug, title, client_name, scheduled_at, duration_minutes, status, access_mode,
             primary_color, logo_url, white_label
        FROM events WHERE id = ?
    `).bind(event.id).first();
    updated.white_label = updated.white_label === 1;
    return jsonResponse({ success: true, event: updated });
  } catch (err) {
    console.error('[event-admin PATCH]', err);
    return jsonResponse({ error: err.message }, 500);
  }
};

// ============================================================
// Helpers
// ============================================================
async function resolveEventByToken(token, env) {
  const events = await env.DB.prepare(
    `SELECT id, slug, title, client_name, scheduled_at, duration_minutes, status, access_mode,
            primary_color, logo_url, white_label,
            (SELECT COUNT(*) FROM invitees i WHERE i.event_id = events.id) AS invitees_count,
            (SELECT COUNT(*) FROM invitees i WHERE i.event_id = events.id AND i.invited_at IS NOT NULL) AS invitees_sent
       FROM events`
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
