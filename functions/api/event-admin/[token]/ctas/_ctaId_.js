// functions/api/event-admin/[token]/ctas/[ctaId].js
// PATCH  /api/event-admin/:token/ctas/:ctaId  → modifier
// DELETE /api/event-admin/:token/ctas/:ctaId  → supprimer
//
// Auth : HMAC du client_admin_token. Strictement identique en comportement à
// /api/admin/events/:id/ctas/:ctaId, avec en plus la résolution token → event_id
// et la vérification que le CTA appartient bien à cet event (pas de manip cross-event).
//
// Marqueur : nomacast-lot-2a-bis-l3-v1

// ============================================================
// PATCH — Modifier un CTA
// ============================================================
export const onRequestPatch = async ({ request, params, env }) => {
  if (!env.DB || !env.ADMIN_PASSWORD) {
    return json({ error: 'Service indisponible' }, 500);
  }

  const event = await resolveClientToken(params.token, env);
  if (!event) return json({ error: 'Token invalide' }, 401);

  // Charger le CTA + vérifier l'appartenance à l'event du token
  const cta = await env.DB.prepare(
    'SELECT id, event_id, label, url, active, activated_at, deactivated_at, expires_in_seconds, created_at FROM event_ctas WHERE id = ? AND event_id = ?'
  ).bind(params.ctaId, event.id).first();

  if (!cta) return json({ error: 'CTA introuvable' }, 404);

  let data;
  try {
    data = await request.json();
  } catch (e) {
    return json({ error: 'JSON invalide' }, 400);
  }

  const sets = [];
  const binds = [];

  if (data.label !== undefined) {
    const r = validateLabel(data.label);
    if (!r.ok) return json({ error: r.error }, 400);
    sets.push('label = ?'); binds.push(r.value);
  }

  if (data.url !== undefined) {
    const r = validateUrl(data.url);
    if (!r.ok) return json({ error: r.error }, 400);
    sets.push('url = ?'); binds.push(r.value);
  }

  if (data.expires_in_seconds !== undefined) {
    const r = validateExpiresInSeconds(data.expires_in_seconds);
    if (!r.ok) return json({ error: r.error }, 400);
    sets.push('expires_in_seconds = ?'); binds.push(r.value);
  }

  let activeChange = null;
  if (data.active !== undefined) {
    const wantActive = !!data.active;
    const isActive = cta.active === 1;
    if (wantActive && !isActive) activeChange = 'activate';
    else if (!wantActive && isActive) activeChange = 'deactivate';
  }

  if (sets.length === 0 && activeChange === null) {
    return json({ error: 'Aucun champ à modifier' }, 400);
  }

  const now = new Date().toISOString();

  try {
    if (activeChange === 'activate') {
      const ownSets = sets.slice();
      const ownBinds = binds.slice();
      ownSets.push('active = 1');
      ownSets.push('activated_at = ?'); ownBinds.push(now);
      ownSets.push('deactivated_at = ?'); ownBinds.push(null);
      ownBinds.push(params.ctaId, event.id);

      await env.DB.batch([
        env.DB.prepare(
          'UPDATE event_ctas SET active = 0, deactivated_at = ? WHERE event_id = ? AND active = 1 AND id != ?'
        ).bind(now, event.id, params.ctaId),
        env.DB.prepare(
          `UPDATE event_ctas SET ${ownSets.join(', ')} WHERE id = ? AND event_id = ?`
        ).bind(...ownBinds)
      ]);
    } else if (activeChange === 'deactivate') {
      const ownSets = sets.slice();
      const ownBinds = binds.slice();
      ownSets.push('active = 0');
      ownSets.push('deactivated_at = ?'); ownBinds.push(now);
      ownBinds.push(params.ctaId, event.id);

      await env.DB.prepare(
        `UPDATE event_ctas SET ${ownSets.join(', ')} WHERE id = ? AND event_id = ?`
      ).bind(...ownBinds).run();
    } else {
      binds.push(params.ctaId, event.id);
      await env.DB.prepare(
        `UPDATE event_ctas SET ${sets.join(', ')} WHERE id = ? AND event_id = ?`
      ).bind(...binds).run();
    }

    const updated = await env.DB.prepare(
      'SELECT id, event_id, label, url, active, activated_at, deactivated_at, expires_in_seconds, created_at FROM event_ctas WHERE id = ?'
    ).bind(params.ctaId).first();

    return json({ cta: deserializeCta(updated) });
  } catch (err) {
    console.error('[event-admin/:token/ctas/:ctaId PATCH]', err);
    return json({ error: err.message }, 500);
  }
};

// ============================================================
// DELETE — Supprimer un CTA (autorisé même si actif)
// ============================================================
export const onRequestDelete = async ({ params, env }) => {
  if (!env.DB || !env.ADMIN_PASSWORD) {
    return json({ error: 'Service indisponible' }, 500);
  }

  const event = await resolveClientToken(params.token, env);
  if (!event) return json({ error: 'Token invalide' }, 401);

  try {
    const result = await env.DB.prepare(
      'DELETE FROM event_ctas WHERE id = ? AND event_id = ?'
    ).bind(params.ctaId, event.id).run();

    if (result.meta.changes === 0) {
      return json({ error: 'CTA introuvable' }, 404);
    }
    return json({ success: true, deleted_id: params.ctaId });
  } catch (err) {
    console.error('[event-admin/:token/ctas/:ctaId DELETE]', err);
    return json({ error: err.message }, 500);
  }
};

// ============================================================
// Helpers (dupliqués)
// ============================================================
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function resolveClientToken(token, env) {
  if (!token || !env.ADMIN_PASSWORD) return null;
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

function validateLabel(v) {
  if (typeof v !== 'string') return { ok: false, error: 'label doit être une chaîne' };
  const trimmed = v.trim();
  if (trimmed.length === 0) return { ok: false, error: 'label requis' };
  if (trimmed.length > 80) return { ok: false, error: 'label trop long (max 80 caractères)' };
  return { ok: true, value: trimmed };
}

function validateUrl(v) {
  if (typeof v !== 'string') return { ok: false, error: 'url doit être une chaîne' };
  const trimmed = v.trim();
  if (trimmed.length === 0) return { ok: false, error: 'url requise' };
  if (trimmed.length > 500) return { ok: false, error: 'url trop longue (max 500 caractères)' };
  let u;
  try { u = new URL(trimmed); } catch (e) {
    return { ok: false, error: 'url invalide' };
  }
  if (u.protocol !== 'https:') return { ok: false, error: 'url doit commencer par https://' };
  return { ok: true, value: trimmed };
}

function validateExpiresInSeconds(v) {
  if (v === null || v === undefined) return { ok: true, value: null };
  const n = Number(v);
  if (!Number.isInteger(n)) return { ok: false, error: 'expires_in_seconds doit être un entier' };
  if (n < 30) return { ok: false, error: 'expires_in_seconds minimum : 30 secondes' };
  if (n > 86400) return { ok: false, error: 'expires_in_seconds maximum : 86400 secondes (24h)' };
  return { ok: true, value: n };
}

function deserializeCta(row) {
  if (!row) return null;
  return {
    id: row.id,
    event_id: row.event_id,
    label: row.label,
    url: row.url,
    active: row.active === 1,
    activated_at: row.activated_at,
    deactivated_at: row.deactivated_at,
    expires_in_seconds: row.expires_in_seconds,
    created_at: row.created_at
  };
}
