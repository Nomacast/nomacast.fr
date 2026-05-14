// functions/api/event-admin/[token]/ctas.js
// POST /api/event-admin/:token/ctas  → créer un CTA pour l'event du token
// GET  /api/event-admin/:token/ctas  → lister tous les CTAs de l'event du token
//
// Auth : HMAC du client_admin_token (slug + ':client' signé par ADMIN_PASSWORD).
// Pattern identique à functions/event-admin/[token].js (résolution token → event
// par boucle sur tous les events + comparaison HMAC). Coût O(n) accepté pour MVP.
//
// Comportement métier : strictement identique à /api/admin/events/[id]/ctas.
// Le client (régie côté client) peut gérer ses propres CTAs pendant le live.
//
// Marqueur : nomacast-lot-2a-bis-l3-v1

// ============================================================
// POST — Créer un CTA
// ============================================================
export const onRequestPost = async ({ request, params, env }) => {
  if (!env.DB || !env.ADMIN_PASSWORD) {
    return json({ error: 'Service indisponible' }, 500);
  }

  const event = await resolveClientToken(params.token, env);
  if (!event) return json({ error: 'Token invalide' }, 401);

  let data;
  try {
    data = await request.json();
  } catch (e) {
    return json({ error: 'JSON invalide' }, 400);
  }

  const labelRes = validateLabel(data.label);
  if (!labelRes.ok) return json({ error: labelRes.error }, 400);

  const urlRes = validateUrl(data.url);
  if (!urlRes.ok) return json({ error: urlRes.error }, 400);

  const expiresRes = validateExpiresInSeconds(data.expires_in_seconds);
  if (!expiresRes.ok) return json({ error: expiresRes.error }, 400);

  const wantActive = data.active === undefined ? true : !!data.active;

  const ctaId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    if (wantActive) {
      await env.DB.batch([
        env.DB.prepare(
          'UPDATE event_ctas SET active = 0, deactivated_at = ? WHERE event_id = ? AND active = 1'
        ).bind(now, event.id),
        env.DB.prepare(
          `INSERT INTO event_ctas (id, event_id, label, url, active, activated_at, deactivated_at, expires_in_seconds, created_at)
           VALUES (?, ?, ?, ?, 1, ?, NULL, ?, ?)`
        ).bind(ctaId, event.id, labelRes.value, urlRes.value, now, expiresRes.value, now)
      ]);
    } else {
      await env.DB.prepare(
        `INSERT INTO event_ctas (id, event_id, label, url, active, activated_at, deactivated_at, expires_in_seconds, created_at)
         VALUES (?, ?, ?, ?, 0, NULL, NULL, ?, ?)`
      ).bind(ctaId, event.id, labelRes.value, urlRes.value, expiresRes.value, now).run();
    }

    const cta = await env.DB.prepare(
      'SELECT id, event_id, label, url, active, activated_at, deactivated_at, expires_in_seconds, created_at FROM event_ctas WHERE id = ?'
    ).bind(ctaId).first();

    return json({ cta: deserializeCta(cta) }, 201);
  } catch (err) {
    console.error('[event-admin/:token/ctas POST]', err);
    return json({ error: err.message }, 500);
  }
};

// ============================================================
// GET — Lister les CTAs de l'event du token
// ============================================================
export const onRequestGet = async ({ params, env }) => {
  if (!env.DB || !env.ADMIN_PASSWORD) {
    return json({ error: 'Service indisponible' }, 500);
  }

  const event = await resolveClientToken(params.token, env);
  if (!event) return json({ error: 'Token invalide' }, 401);

  try {
    const rows = await env.DB.prepare(
      `SELECT id, event_id, label, url, active, activated_at, deactivated_at, expires_in_seconds, created_at
         FROM event_ctas
        WHERE event_id = ?
        ORDER BY active DESC, created_at DESC`
    ).bind(event.id).all();

    const ctas = (rows.results || []).map(deserializeCta);
    return json({ ctas });
  } catch (err) {
    console.error('[event-admin/:token/ctas GET]', err);
    return json({ error: err.message }, 500);
  }
};

// ============================================================
// Helpers (dupliqués dans les 4 fichiers ctas + auth event-admin spécifique)
// ============================================================
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

// Résout un client_admin_token en event. Pattern identique à functions/event-admin/[token].js.
// O(n) sur le nombre total d'events de la DB (acceptable jusqu'à quelques centaines).
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

// Duplication assumée avec functions/event-admin/[token].js et functions/api/admin/events/[id].js
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
