// functions/api/chat/[slug]/cta-clicks.js
// POST /api/chat/:slug/cta-clicks  body: { cta_id }
//
// Trace un clic CTA. Réponse rapide (non-bloquante) car le navigateur ouvre
// le lien en parallèle.
//
// Auth identique à messages.js POST :
//   - Event privé : header X-Magic-Token (mapping vers invitee_id)
//   - Event public : tracking anonyme via ip_hash + anon_key
//   - Admin preview ignoré (préfixe ne pollue pas les stats clients)
//
// Marqueur : nomacast-cta-clicks-v1

export const onRequestPost = async ({ params, request, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  const event = await env.DB.prepare(
    'SELECT id, slug, access_mode FROM events WHERE slug = ?'
  ).bind(params.slug).first();
  if (!event) return jsonResponse({ error: 'Event introuvable' }, 404);

  // Parse body
  let body;
  try { body = await request.json(); }
  catch (e) { return jsonResponse({ error: 'JSON invalide' }, 400); }

  const ctaId = String(body.cta_id || '').trim();
  if (!ctaId) return jsonResponse({ error: 'cta_id requis' }, 400);

  // Vérifier que le CTA existe bien pour cet event
  const cta = await env.DB.prepare(
    'SELECT id FROM event_ctas WHERE id = ? AND event_id = ?'
  ).bind(ctaId, event.id).first();
  if (!cta) return jsonResponse({ error: 'CTA introuvable pour cet event' }, 404);

  // Auth + identification du clicker
  let inviteeId = null;
  let isAdminPreview = false;

  if (event.access_mode === 'private') {
    const authResult = await authenticatePrivateRequest(request, env, event);
    if (!authResult.ok) return jsonResponse({ error: authResult.reason }, 403);
    if (authResult.kind === 'invitee') inviteeId = authResult.invitee.id;
    if (authResult.kind === 'admin_preview') isAdminPreview = true;
  } else {
    // Event public : pas d'auth requise, mais on accepte aussi un X-Magic-Token
    // au cas où un magic_token serait valable (auto-inscrits)
    const magicToken = request.headers.get('X-Magic-Token');
    if (magicToken) {
      const inv = await env.DB.prepare(
        'SELECT id FROM invitees WHERE magic_token = ? AND event_id = ?'
      ).bind(magicToken, event.id).first();
      if (inv) inviteeId = inv.id;
    }
  }

  // Admin preview → on ignore le tracking pour pas polluer les stats clients
  if (isAdminPreview) {
    return jsonResponse({ success: true, tracked: false, reason: 'admin_preview' });
  }

  // Hash IP + anon_key (cohérent avec visits, presence_history, reactions)
  let ipHash = null;
  let anonKey = null;
  if (env.CHAT_IP_HASH_SECRET) {
    try {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      ipHash = await hashIp(ip, env.CHAT_IP_HASH_SECRET);
      anonKey = ipHash ? ipHash.slice(0, 32) : null;
    } catch (err) {
      console.error('[cta-clicks hashIp]', err);
    }
  }

  // INSERT (jamais bloquant — si la table n'existe pas, log + 200 quand même
  // pour ne pas casser l'UX de l'utilisateur qui veut cliquer son CTA)
  try {
    await env.DB.prepare(`
      INSERT INTO event_cta_clicks (id, cta_id, event_id, invitee_id, anon_key, ip_hash, clicked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      ctaId,
      event.id,
      inviteeId,
      anonKey,
      ipHash,
      new Date().toISOString()
    ).run();
    return jsonResponse({ success: true, tracked: true });
  } catch (err) {
    console.error('[cta-clicks INSERT]', err);
    // 200 OK quand même pour pas casser le clic utilisateur
    return jsonResponse({ success: true, tracked: false, error: err.message });
  }
};

// ============================================================
// Helpers (copiés depuis messages.js pour cohérence et éviter
// les imports relatifs traversant les brackets — voir §11 du rapport infra)
// ============================================================
async function authenticatePrivateRequest(request, env, event) {
  const url = new URL(request.url);
  const magicToken = request.headers.get('X-Magic-Token');
  if (magicToken) {
    const inv = await env.DB.prepare(
      'SELECT id, email, full_name FROM invitees WHERE magic_token = ? AND event_id = ?'
    ).bind(magicToken, event.id).first();
    if (inv) return { ok: true, kind: 'invitee', invitee: inv };
    return { ok: false, reason: 'Token invitee invalide' };
  }
  const previewToken = url.searchParams.get('preview');
  if (previewToken && env.ADMIN_PASSWORD) {
    const expected = await computePreviewToken(event.slug, env.ADMIN_PASSWORD);
    if (previewToken === expected) return { ok: true, kind: 'admin_preview' };
  }
  return { ok: false, reason: 'Authentification requise pour cet event privé' };
}

async function computePreviewToken(slug, secret) {
  if (!secret) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(slug));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .slice(0, 24);
}

async function hashIp(ip, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(ip));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .slice(0, 32);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
