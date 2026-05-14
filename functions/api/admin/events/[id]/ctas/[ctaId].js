// functions/api/admin/events/[id]/ctas/[ctaId].js
// PATCH  /api/admin/events/:id/ctas/:ctaId  → modifier (label, url, active, expires_in_seconds)
// DELETE /api/admin/events/:id/ctas/:ctaId  → supprimer (autorisé même si actif)
//
// Auth : Cloudflare Access.
//
// Règles métier validées :
//  - Modification du label/url permise même quand le CTA est actif (default 3 A) :
//    les viewers verront la nouvelle version au prochain polling (~10s).
//  - Suppression directe d'un CTA actif autorisée (default 2 A) :
//    le polling participant fera disparaître la bannière au prochain tick.
//  - active = true sur un CTA actuellement inactif déclenche une transaction
//    atomique (désactivation de l'éventuel actif précédent + activation du courant).
//
// Marqueur : nomacast-lot-2a-bis-l3-v1

// ============================================================
// PATCH — Modifier un CTA
// ============================================================
export const onRequestPatch = async ({ request, params, env }) => {
  if (!env.DB) return json({ error: 'D1 binding DB manquant' }, 500);

  // Charger le CTA existant + vérifier l'appartenance à l'event
  const cta = await env.DB.prepare(
    'SELECT id, event_id, label, url, active, activated_at, deactivated_at, expires_in_seconds, created_at FROM event_ctas WHERE id = ? AND event_id = ?'
  ).bind(params.ctaId, params.id).first();

  if (!cta) return json({ error: 'CTA introuvable' }, 404);

  let data;
  try {
    data = await request.json();
  } catch (e) {
    return json({ error: 'JSON invalide' }, 400);
  }

  // Détection des champs modifiés et validation
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

  // Gestion du toggle active (= cas le plus subtil : nécessite un batch atomique)
  let activeChange = null; // null | 'activate' | 'deactivate'
  if (data.active !== undefined) {
    const wantActive = !!data.active;
    const isActive = cta.active === 1;
    if (wantActive && !isActive) activeChange = 'activate';
    else if (!wantActive && isActive) activeChange = 'deactivate';
    // sinon : no-op (déjà dans l'état demandé)
  }

  if (sets.length === 0 && activeChange === null) {
    return json({ error: 'Aucun champ à modifier' }, 400);
  }

  const now = new Date().toISOString();

  try {
    if (activeChange === 'activate') {
      // Atomicité : désactiver tous les autres actifs + activer celui-ci (+ update des autres champs si présents)
      // On construit le UPDATE de ce CTA en combinant les sets éventuels (label/url/expires) + active=1/activated_at=now/deactivated_at=NULL
      const ownSets = sets.slice();
      const ownBinds = binds.slice();
      ownSets.push('active = 1');
      ownSets.push('activated_at = ?'); ownBinds.push(now);
      ownSets.push('deactivated_at = ?'); ownBinds.push(null);
      ownBinds.push(params.ctaId, params.id);

      await env.DB.batch([
        env.DB.prepare(
          'UPDATE event_ctas SET active = 0, deactivated_at = ? WHERE event_id = ? AND active = 1 AND id != ?'
        ).bind(now, params.id, params.ctaId),
        env.DB.prepare(
          `UPDATE event_ctas SET ${ownSets.join(', ')} WHERE id = ? AND event_id = ?`
        ).bind(...ownBinds)
      ]);
    } else if (activeChange === 'deactivate') {
      // Désactivation simple (+ update des autres champs si présents)
      const ownSets = sets.slice();
      const ownBinds = binds.slice();
      ownSets.push('active = 0');
      ownSets.push('deactivated_at = ?'); ownBinds.push(now);
      ownBinds.push(params.ctaId, params.id);

      await env.DB.prepare(
        `UPDATE event_ctas SET ${ownSets.join(', ')} WHERE id = ? AND event_id = ?`
      ).bind(...ownBinds).run();
    } else {
      // Pas de toggle active : juste un UPDATE des autres champs
      binds.push(params.ctaId, params.id);
      await env.DB.prepare(
        `UPDATE event_ctas SET ${sets.join(', ')} WHERE id = ? AND event_id = ?`
      ).bind(...binds).run();
    }

    const updated = await env.DB.prepare(
      'SELECT id, event_id, label, url, active, activated_at, deactivated_at, expires_in_seconds, created_at FROM event_ctas WHERE id = ?'
    ).bind(params.ctaId).first();

    return json({ cta: deserializeCta(updated) });
  } catch (err) {
    console.error('[admin/events/:id/ctas/:ctaId PATCH]', err);
    return json({ error: err.message }, 500);
  }
};

// ============================================================
// DELETE — Supprimer un CTA (autorisé même si actif)
// ============================================================
export const onRequestDelete = async ({ params, env }) => {
  if (!env.DB) return json({ error: 'D1 binding DB manquant' }, 500);

  try {
    const result = await env.DB.prepare(
      'DELETE FROM event_ctas WHERE id = ? AND event_id = ?'
    ).bind(params.ctaId, params.id).run();

    if (result.meta.changes === 0) {
      return json({ error: 'CTA introuvable' }, 404);
    }
    return json({ success: true, deleted_id: params.ctaId });
  } catch (err) {
    console.error('[admin/events/:id/ctas/:ctaId DELETE]', err);
    return json({ error: err.message }, 500);
  }
};

// ============================================================
// Helpers (dupliqués dans les 4 fichiers ctas)
// ============================================================
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
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
