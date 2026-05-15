// functions/_lib/session.js
// Cookie session HMAC signé pour authentification client /event-admin.
// Préfixe `_` exclut du routing Cloudflare Pages Functions.
//
// Format du cookie : "<payload_b64url>.<signature_b64url>"
// payload = JSON { event_id, login, exp } (epoch ms)
// signature = HMAC-SHA256(payload, SESSION_SECRET)
//
// Validité : 7 jours glissants. À chaque page authentifiée, le middleware peut
// re-signer avec un nouvel exp pour prolonger.
//
// nomacast-client-credentials-v1

const COOKIE_NAME = 'nomacast_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

/**
 * Signe un payload et retourne le cookie value (à mettre dans Set-Cookie).
 */
export async function signSession(payload, secret) {
  const enc = new TextEncoder();
  const dataStr = JSON.stringify(payload);
  const dataBytes = enc.encode(dataStr);
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, dataBytes);
  return b64urlEncode(dataBytes) + '.' + b64urlEncode(new Uint8Array(sig));
}

/**
 * Vérifie un cookie value. Retourne le payload si valide et non expiré, null sinon.
 */
export async function verifySession(cookieValue, secret) {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const dotIdx = cookieValue.lastIndexOf('.');
  if (dotIdx < 1) return null;
  let dataBytes, sigBytes;
  try {
    dataBytes = b64urlDecode(cookieValue.slice(0, dotIdx));
    sigBytes = b64urlDecode(cookieValue.slice(dotIdx + 1));
  } catch (e) {
    return null;
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['verify']
  );
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, dataBytes);
  if (!valid) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(dataBytes));
  } catch (e) {
    return null;
  }
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  if (!payload.event_id) return null;
  return payload;
}

/**
 * Crée une nouvelle session pour cet event et retourne la valeur du cookie.
 * @param {object} env - environnement Pages Functions (doit contenir SESSION_SECRET)
 * @param {object} sess - { event_id, login }
 */
export async function createSessionCookieValue(env, sess) {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET non configuré');
  const payload = {
    event_id: sess.event_id,
    login: sess.login,
    exp: Date.now() + SESSION_DURATION_MS
  };
  return await signSession(payload, env.SESSION_SECRET);
}

/**
 * Construit l'entête Set-Cookie pour la session.
 * Flags : HttpOnly (anti-XSS), Secure (HTTPS only), SameSite=Lax, Path=/.
 */
export function buildSetCookieHeader(cookieValue) {
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  return `${COOKIE_NAME}=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/**
 * Entête Set-Cookie pour supprimer la session (logout).
 */
export function buildClearCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * Extrait la valeur du cookie de session depuis un header Cookie.
 * Retourne null si absent.
 */
export function readSessionCookie(request) {
  const header = request.headers.get('Cookie') || '';
  // Parser tolérant : on cherche notre cookie spécifiquement
  const parts = header.split(/;\s*/);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const name = p.slice(0, eq).trim();
    if (name === COOKIE_NAME) {
      return p.slice(eq + 1).trim();
    }
  }
  return null;
}

/**
 * Vérifie la session présente dans les cookies de la requête.
 * Retourne le payload si valide et non expiré, sinon null.
 */
export async function getSessionFromRequest(request, env) {
  if (!env.SESSION_SECRET) return null;
  const cookieValue = readSessionCookie(request);
  if (!cookieValue) return null;
  return await verifySession(cookieValue, env.SESSION_SECRET);
}

// --- Internes ---

function b64urlEncode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4;
  const padded = pad ? str + '='.repeat(4 - pad) : str;
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
