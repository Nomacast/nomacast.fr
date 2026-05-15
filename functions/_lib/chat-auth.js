// functions/_lib/chat-auth.js
//
// Helpers communs d'authentification pour les endpoints chat participant.
// Évite la duplication entre messages.js, cta-clicks.js, et tout futur endpoint
// participant qui gère l'auth privé (X-Magic-Token / preview admin) + hash IP.
//
// Consommateurs actuels (paths relatifs depuis ce fichier) :
//   - functions/api/chat/[slug]/messages.js     → import '../../../_lib/chat-auth.js'
//   - functions/api/chat/[slug]/cta-clicks.js   → import '../../../_lib/chat-auth.js'
//   - (futurs endpoints : presence/heartbeat, reactions, polls/vote, etc.)
//
// Marqueur : nomacast-chat-auth-helper-v1

/**
 * Authentifie une requête pour un event privé.
 *
 * Accepte 2 mécanismes :
 *   1. Header X-Magic-Token  → identité = invitee (récupéré en BDD)
 *   2. Query ?preview=<hmac> → identité = admin preview (HMAC slug + ADMIN_PASSWORD)
 *
 * @param {Request} request
 * @param {Object} env - bindings { DB, ADMIN_PASSWORD }
 * @param {Object} event - row events { id, slug, ... }
 * @returns {Promise<{ok: boolean, kind?: 'invitee'|'admin_preview', invitee?: {id, email, full_name}, reason?: string}>}
 */
export async function authenticatePrivateRequest(request, env, event) {
  const url = new URL(request.url);

  // Tentative 1 : X-Magic-Token (invitee)
  const magicToken = request.headers.get('X-Magic-Token');
  if (magicToken) {
    const inv = await env.DB.prepare(
      'SELECT id, email, full_name FROM invitees WHERE magic_token = ? AND event_id = ?'
    ).bind(magicToken, event.id).first();
    if (inv) return { ok: true, kind: 'invitee', invitee: inv };
    return { ok: false, reason: 'Token invitee invalide' };
  }

  // Tentative 2 : ?preview=<hmac> (admin preview)
  const previewToken = url.searchParams.get('preview');
  if (previewToken && env.ADMIN_PASSWORD) {
    const expected = await computePreviewToken(event.slug, env.ADMIN_PASSWORD);
    if (previewToken === expected) {
      return { ok: true, kind: 'admin_preview' };
    }
  }

  return { ok: false, reason: 'Authentification requise pour cet event privé' };
}

/**
 * HMAC-SHA-256 du slug avec ADMIN_PASSWORD, encodé URL-safe (24 chars).
 * Sert à générer le token preview admin pour un slug donné.
 *
 * @param {string} slug
 * @param {string} secret - typiquement env.ADMIN_PASSWORD
 * @returns {Promise<string|null>}
 */
export async function computePreviewToken(slug, secret) {
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

/**
 * Hash HMAC-SHA-256 d'une IP avec un secret, encodé URL-safe (32 chars).
 * Utilisé pour rate limit + auth_logs + anon_key sans stocker d'IP en clair (RGPD).
 *
 * Signature pure : prend l'IP et le secret directement (pas de Request).
 * Pour ergonomie : utiliser hashIpFromRequest() qui extrait l'IP du Request automatiquement.
 *
 * @param {string} ip - "1.2.3.4" ou "unknown"
 * @param {string} secret - typiquement env.CHAT_IP_HASH_SECRET
 * @returns {Promise<string>}
 */
export async function hashIp(ip, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(ip || 'unknown'));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .slice(0, 32);
}

/**
 * Extrait l'IP du client depuis les headers Cloudflare standards.
 * Préfère CF-Connecting-IP (canonique Cloudflare), fallback X-Forwarded-For,
 * sinon "unknown".
 *
 * @param {Request} request
 * @returns {string}
 */
export function extractIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || 'unknown';
}

/**
 * Combo : extrait l'IP du Request + hash avec secret.
 * Retourne null si secret manquant (rate limit désactivé en dev / setup).
 *
 * @param {Request} request
 * @param {string} secret - typiquement env.CHAT_IP_HASH_SECRET
 * @returns {Promise<string|null>}
 */
export async function hashIpFromRequest(request, secret) {
  if (!secret) return null;
  return await hashIp(extractIp(request), secret);
}
