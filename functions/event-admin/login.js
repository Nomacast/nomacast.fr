// functions/event-admin/login.js
// GET  /event-admin/login        → page de connexion HTML (brand Nomacast)
// POST /event-admin/login        → traitement : valide login/password, set cookie session, redirige vers /event-admin/<slug>
//
// Marqueurs : nomacast-client-credentials-v1, nomacast-auth-logs-v1, nomacast-rate-limit-login-v1
//
// Sécurité Lot F (15 mai 2026) :
//   - Rate limit : 5 tentatives échouées max / minute / IP via env.RATE_LIMIT (KV)
//   - Logs : chaque tentative (succès + échec) inscrite dans auth_logs (RGPD : IP hashée HMAC)
//   - Hash IP utilise env.CHAT_IP_HASH_SECRET (déjà existant pour rate limit chat_messages)

import { verifyPassword } from '../_lib/password.js';
import {
  createSessionCookieValue,
  buildSetCookieHeader,
  getSessionFromRequest
} from '../_lib/session.js';

// Configuration rate limit
const RATE_LIMIT_MAX_FAILS = 5;       // tentatives échouées max
const RATE_LIMIT_WINDOW_SEC = 60;     // par fenêtre de 60 secondes

// ============================================================
// GET — page de connexion
// ============================================================
export const onRequestGet = async ({ request, env }) => {
  // Si déjà connecté, redirection vers son event
  try {
    const session = await getSessionFromRequest(request, env);
    if (session && session.event_id && env.DB) {
      const ev = await env.DB.prepare('SELECT slug FROM events WHERE id = ?')
        .bind(session.event_id).first();
      if (ev && ev.slug) {
        return Response.redirect(new URL('/event-admin/' + encodeURIComponent(ev.slug), request.url).toString(), 302);
      }
    }
  } catch (e) { /* silencieux */ }

  // Récupérer un éventuel message d'erreur depuis le query string
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  const errorMsg = error === 'invalid' ? 'Identifiant ou mot de passe incorrect.'
    : error === 'missing' ? 'Identifiant et mot de passe requis.'
    : error === 'server' ? 'Erreur serveur, réessayez dans un instant.'
    : error === 'too-many' ? `Trop de tentatives échouées. Patiente ${RATE_LIMIT_WINDOW_SEC} secondes avant de réessayer.`
    : error === 'csrf' ? 'Session expirée ou requête non valide. La page a été rafraîchie, réessaye.'
    : error === 'turnstile' ? 'Vérification anti-bot échouée. Rafraîchis la page et réessaye.'
    : null;

  // nomacast-csrf-login-v1 : générer un token CSRF + set cookie HttpOnly
  const csrfToken = generateCsrfToken();

  // nomacast-login-bots-v1 : sitekey publique Turnstile (env var)
  const turnstileSitekey = env.TURNSTILE_SITEKEY || '';

  return new Response(renderLoginPage(errorMsg, csrfToken, turnstileSitekey), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': buildCsrfCookieHeader(csrfToken)
    }
  });
};

// ============================================================
// POST — traitement du formulaire de connexion
// ============================================================
export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return redirectErr(request, 'server');
  if (!env.SESSION_SECRET) return redirectErr(request, 'server');

  // nomacast-rate-limit-login-v1 — préparer ip_hash pour rate limit + logging
  const ipHash = await hashIp(request, env);
  const userAgent = (request.headers.get('User-Agent') || '').slice(0, 256);

  // Récupérer login + password + csrf_token depuis form-data ou JSON
  let login = '';
  let password = '';
  let bodyCsrf = '';
  let honeypot = '';
  let turnstileToken = '';
  const contentType = request.headers.get('Content-Type') || '';
  try {
    if (contentType.includes('application/json')) {
      const data = await request.json();
      login = String(data.login || '').trim();
      password = String(data.password || '');
      bodyCsrf = String(data.csrf_token || '');
      honeypot = String(data[HONEYPOT_FIELD_NAME] || '');
      turnstileToken = String(data['cf-turnstile-response'] || '');
    } else {
      // application/x-www-form-urlencoded (form standard HTML)
      const form = await request.formData();
      login = String(form.get('login') || '').trim();
      password = String(form.get('password') || '');
      bodyCsrf = String(form.get('csrf_token') || '');
      honeypot = String(form.get(HONEYPOT_FIELD_NAME) || '');
      turnstileToken = String(form.get('cf-turnstile-response') || '');
    }
  } catch (e) {
    return redirectErr(request, 'missing');
  }

  // nomacast-csrf-login-v1 : vérifier le token CSRF AVANT toute autre logique
  // (low-cost : pas de DB hit, pas de PBKDF2). Un attaquant CSRF est bloqué ici.
  const cookieCsrf = readCsrfCookie(request);
  if (!cookieCsrf || !bodyCsrf || !constantTimeEquals(cookieCsrf, bodyCsrf)) {
    await logAuthAttempt(env, {
      event_id: null,
      login: login || null,
      ip_hash: ipHash,
      success: 0,
      reason: 'csrf_mismatch',
      user_agent: userAgent
    });
    return redirectErr(request, 'csrf');
  }

  // nomacast-login-bots-v1 : honeypot — si le champ leurre est rempli, c'est un bot.
  // On renvoie ?error=invalid (et PAS un message spécifique) pour ne pas révéler
  // la détection au bot. Pas d'incrément rate limit (sinon attaquant peut bloquer
  // le compteur d'un user légitime sur la même IP).
  if (honeypot.length > 0) {
    await logAuthAttempt(env, {
      event_id: null,
      login: login || null,
      ip_hash: ipHash,
      success: 0,
      reason: 'honeypot_filled',
      user_agent: userAgent
    });
    return redirectErr(request, 'invalid');
  }

  // nomacast-login-bots-v1 : Turnstile (siteverify)
  // Désactivé silencieusement si TURNSTILE_SECRET_KEY non configurée (mode dev/transition).
  // Sinon : 1 fetch HTTP vers Cloudflare (~100ms), résultat success/failure.
  if (env.TURNSTILE_SECRET_KEY) {
    const clientIp = request.headers.get('CF-Connecting-IP') || '';
    const turnstileResult = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, clientIp);
    if (!turnstileResult.success) {
      await logAuthAttempt(env, {
        event_id: null,
        login: login || null,
        ip_hash: ipHash,
        success: 0,
        reason: 'turnstile_failed:' + (turnstileResult.errorCodes.join(',') || 'unknown'),
        user_agent: userAgent
      });
      return redirectErr(request, 'turnstile');
    }
  }

  if (!login || !password) {
    return redirectErr(request, 'missing');
  }

  // nomacast-rate-limit-login-v1 — check rate limit AVANT verifyPassword
  // (sinon un attaquant peut faire X tentatives avec coût CPU sur PBKDF2)
  if (ipHash && env.RATE_LIMIT) {
    const blocked = await isRateLimited(env, ipHash);
    if (blocked) {
      // Log la tentative bloquée mais ne consomme PAS le compteur
      // (sinon l'attaquant peut allonger artificiellement le blocage)
      await logAuthAttempt(env, {
        event_id: null,
        login,
        ip_hash: ipHash,
        success: 0,
        reason: 'rate_limited',
        user_agent: userAgent
      });
      return redirectErr(request, 'too-many');
    }
  }

  // Recherche de l'event par client_login
  let event;
  try {
    event = await env.DB.prepare(
      'SELECT id, slug, client_login, client_password_hash FROM events WHERE client_login = ?'
    ).bind(login).first();
  } catch (e) {
    console.error('[event-admin/login] DB error', e);
    return redirectErr(request, 'server');
  }

  // Délai cosmétique pour éviter timing attack obvious (uniformiser temps de réponse)
  if (!event || !event.client_password_hash) {
    // Faire une vérification factice pour normaliser le temps de réponse
    await verifyPassword(password, 'pbkdf2:AAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    // nomacast-auth-logs-v1 — log + increment rate counter
    await logAuthAttempt(env, {
      event_id: null,
      login,
      ip_hash: ipHash,
      success: 0,
      reason: 'unknown_login',
      user_agent: userAgent
    });
    await incrementFailCounter(env, ipHash);
    return redirectErr(request, 'invalid');
  }

  const ok = await verifyPassword(password, event.client_password_hash);
  if (!ok) {
    // nomacast-auth-logs-v1 — log + increment rate counter
    await logAuthAttempt(env, {
      event_id: event.id,
      login,
      ip_hash: ipHash,
      success: 0,
      reason: 'wrong_password',
      user_agent: userAgent
    });
    await incrementFailCounter(env, ipHash);
    return redirectErr(request, 'invalid');
  }

  // nomacast-auth-logs-v1 — log succès (ne reset PAS le compteur fail :
  // un attaquant pourrait avoir trouvé un mot de passe valide après brute force,
  // les ops doivent voir la corrélation)
  await logAuthAttempt(env, {
    event_id: event.id,
    login,
    ip_hash: ipHash,
    success: 1,
    reason: null,
    user_agent: userAgent
  });

  // Succès : créer le cookie session et rediriger vers /event-admin/<slug>
  const cookieValue = await createSessionCookieValue(env, {
    event_id: event.id,
    login: event.client_login
  });

  const redirectTo = new URL('/event-admin/' + encodeURIComponent(event.slug), request.url).toString();
  return new Response(null, {
    status: 302,
    headers: {
      'Location': redirectTo,
      'Set-Cookie': buildSetCookieHeader(cookieValue),
      'Cache-Control': 'no-store'
    }
  });
};

// ============================================================
// nomacast-rate-limit-login-v1 — Rate limit helpers (KV)
// ============================================================
async function isRateLimited(env, ipHash) {
  if (!env.RATE_LIMIT || !ipHash) return false;
  try {
    const key = `auth-fail:${ipHash}`;
    const raw = await env.RATE_LIMIT.get(key);
    const count = parseInt(raw || '0', 10) || 0;
    return count >= RATE_LIMIT_MAX_FAILS;
  } catch (err) {
    console.error('[login rate-limit check]', err);
    return false; // fail-open : ne pas bloquer un user légitime si KV indispo
  }
}

async function incrementFailCounter(env, ipHash) {
  if (!env.RATE_LIMIT || !ipHash) return;
  try {
    const key = `auth-fail:${ipHash}`;
    const raw = await env.RATE_LIMIT.get(key);
    const count = (parseInt(raw || '0', 10) || 0) + 1;
    // TTL fixe à 60s pour fenêtre glissante simple
    // (chaque échec étend le bannissement d'1 minute si le compteur reste actif)
    await env.RATE_LIMIT.put(key, String(count), { expirationTtl: RATE_LIMIT_WINDOW_SEC });
  } catch (err) {
    console.error('[login rate-limit incr]', err);
    // fail-silent : ne pas remonter l'erreur côté user
  }
}

// ============================================================
// nomacast-auth-logs-v1 — Persistence des tentatives
// ============================================================
async function logAuthAttempt(env, { event_id, login, ip_hash, success, reason, user_agent }) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(`
      INSERT INTO auth_logs (id, event_id, login, ip_hash, success, reason, user_agent, attempted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      event_id,
      login ? login.slice(0, 80) : null,
      ip_hash || null,
      success ? 1 : 0,
      reason || null,
      user_agent || null,
      new Date().toISOString()
    ).run();
  } catch (err) {
    // Le log auth ne doit JAMAIS faire échouer un login.
    // Si la table n'existe pas (migration pas encore appliquée), on log et on continue.
    console.error('[login auth-log]', err);
  }
}

/**
 * Hash HMAC-SHA-256 de l'IP du client avec env.CHAT_IP_HASH_SECRET comme clé.
 * RGPD compliance : on ne stocke jamais l'IP en clair.
 * Si secret non configuré, retourne null → rate limit + log ip_hash désactivés.
 */
async function hashIp(request, env) {
  if (!env.CHAT_IP_HASH_SECRET) return null;
  const ip = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || 'unknown';
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(env.CHAT_IP_HASH_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(ip));
    return btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
      .slice(0, 32);
  } catch (err) {
    console.error('[login hashIp]', err);
    return null;
  }
}

function redirectErr(request, code) {
  const url = new URL('/event-admin/login', request.url);
  url.searchParams.set('error', code);
  return new Response(null, {
    status: 302,
    headers: { 'Location': url.toString(), 'Cache-Control': 'no-store' }
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================================
// nomacast-csrf-login-v1 — Protection CSRF (Double Submit Cookie, OWASP)
// ============================================================
// Pattern : à chaque GET sur la page login, on génère un token aléatoire
// qu'on (1) injecte dans un hidden input du form, et (2) set en cookie
// HttpOnly. Au POST, on vérifie que les 2 valeurs matchent.
//
// Un attaquant qui voudrait soumettre le form depuis un autre domaine
// (CSRF) n'a pas accès au cookie HttpOnly du domaine nomacast.fr donc
// ne peut pas faire matcher les 2 valeurs.

const CSRF_COOKIE_NAME = 'nomacast_csrf';
const CSRF_COOKIE_MAX_AGE = 3600;  // 1h (largement suffisant pour saisir un login)

/**
 * Génère un token CSRF aléatoire (32 chars URL-safe).
 */
function generateCsrfToken() {
  const arr = new Uint8Array(24);  // 24 bytes → 32 chars base64url
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Comparaison constant-time pour éviter timing attacks sur le token.
 */
function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length || a.length === 0) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Cookie CSRF : HttpOnly (le JS ne peut pas le lire), Secure (HTTPS only),
 * SameSite=Lax (suffit pour la protection CSRF tout en autorisant les liens depuis email),
 * Path scoped sur /event-admin/ pour ne pas leak ailleurs.
 */
function buildCsrfCookieHeader(token) {
  const parts = [
    `${CSRF_COOKIE_NAME}=${token}`,
    'Path=/event-admin/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${CSRF_COOKIE_MAX_AGE}`
  ];
  return parts.join('; ');
}

/**
 * Lit le cookie CSRF depuis les headers de la request.
 */
function readCsrfCookie(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  // Match nomacast_csrf= jusqu'au prochain ; ou fin
  const re = new RegExp('(?:^|;\\s*)' + CSRF_COOKIE_NAME + '=([^;]+)');
  const m = cookieHeader.match(re);
  return m ? m[1] : null;
}

// ============================================================
// nomacast-login-bots-v1 — Anti-bot (Honeypot + Turnstile)
// ============================================================

/**
 * Nom du champ honeypot. Doit ressembler à un champ légitime que les bots
 * form-fillers vont remplir automatiquement. "website" est un classique.
 */
const HONEYPOT_FIELD_NAME = 'website';

/**
 * Vérifie le token Turnstile auprès de Cloudflare.
 * @returns {Promise<{success: boolean, errorCodes: string[]}>}
 */
async function verifyTurnstile(token, secret, clientIp) {
  if (!secret) return { success: false, errorCodes: ['not_configured'] };
  if (!token) return { success: false, errorCodes: ['missing_token'] };

  try {
    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);
    if (clientIp) params.append('remoteip', clientIp);

    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const data = await resp.json();
    return {
      success: !!data.success,
      errorCodes: data['error-codes'] || []
    };
  } catch (err) {
    console.error('[turnstile siteverify]', err);
    return { success: false, errorCodes: ['network_error'] };
  }
}

// ============================================================
// Template HTML — page de login, brand Nomacast
// ============================================================
function renderLoginPage(errorMsg, csrfToken, turnstileSitekey) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>Connexion — Nomacast</title>
${turnstileSitekey ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ''}
<style>
*,*::before,*::after { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, #f4f6fa 0%, #e2eaf5 100%);
  color: #0f172a;
  display: flex;
  flex-direction: column;
}
.header {
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  padding: 18px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.header-logo {
  text-decoration: none; font-size: 20px; font-weight: 800;
  letter-spacing: -0.5px; line-height: 1;
}
.logo-dot { color: #5D9CEC; }
.logo-text { color: #0f172a; }
.header-baseline {
  font-size: 12px; color: #94a3b8; font-style: italic;
}
@media (max-width: 600px) { .header-baseline { display: none; } }

.container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}
.card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
  padding: 32px 32px 28px;
  width: 100%;
  max-width: 380px;
}
.card h1 {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.card-sub {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 22px;
}
.error {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #b91c1c;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 16px;
}
.field { margin-bottom: 14px; }
.field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 6px;
  letter-spacing: 0.02em;
}
.field input {
  width: 100%;
  font: inherit;
  font-size: 15px;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  color: #0f172a;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.field input:focus {
  border-color: #5A98D6;
  box-shadow: 0 0 0 3px rgba(90, 152, 214, 0.15);
}
.btn-submit {
  width: 100%;
  background: linear-gradient(135deg, #5D9CEC 0%, #4A87D6 100%);
  color: #ffffff;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  padding: 11px 16px;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 8px;
  transition: opacity 0.15s ease;
}
.btn-submit:hover { opacity: 0.92; }
.btn-submit:active { opacity: 0.85; }
.card-help {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 16px;
  text-align: center;
  line-height: 1.5;
}
.footer {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
}
.footer a { color: #64748b; text-decoration: none; }
.footer a:hover { text-decoration: underline; }

/* nomacast-login-bots-v1 — honeypot off-screen (caché aux humains, pas aux bots) */
.hp-field {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

/* nomacast-login-bots-v1 — widget Turnstile (espace réservé + centré) */
.turnstile-wrap {
  margin: 14px 0 4px;
  min-height: 65px;
  display: flex;
  justify-content: center;
}
</style>
</head>
<body>

<header class="header">
  <a href="https://www.nomacast.fr/" target="_blank" rel="noopener" class="header-logo">
    <span class="logo-dot">&bull;</span><span class="logo-text">&nbsp;Nomacast</span>
  </a>
  <span class="header-baseline">Espace organisateur</span>
</header>

<main class="container">
  <div class="card">
    <h1>Connexion</h1>
    <p class="card-sub">Accédez à la régie et aux données de votre événement.</p>
    ${errorMsg ? `<div class="error">${escapeHtml(errorMsg)}</div>` : ''}
    <form method="POST" action="/event-admin/login" autocomplete="on">
      <input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken || '')}">
      <!-- nomacast-login-bots-v1 : honeypot — champ leurre invisible aux humains, rempli par les bots form-fillers -->
      <div class="hp-field" aria-hidden="true">
        <label for="${HONEYPOT_FIELD_NAME}">Laissez ce champ vide</label>
        <input type="text" id="${HONEYPOT_FIELD_NAME}" name="${HONEYPOT_FIELD_NAME}"
               tabindex="-1" autocomplete="off" value="">
      </div>
      <div class="field">
        <label for="login">Identifiant</label>
        <input
          type="text" id="login" name="login"
          autocomplete="username" autocapitalize="off" autocorrect="off"
          spellcheck="false" required>
      </div>
      <div class="field">
        <label for="password">Mot de passe</label>
        <input
          type="password" id="password" name="password"
          autocomplete="current-password" required>
      </div>
      ${turnstileSitekey ? `<div class="turnstile-wrap">
        <div class="cf-turnstile" data-sitekey="${escapeHtml(turnstileSitekey)}" data-theme="light" data-size="normal"></div>
      </div>` : ''}
      <button type="submit" class="btn-submit">Se connecter</button>
    </form>
    <p class="card-help">
      Vos identifiants vous ont été transmis par Nomacast.<br>
      En cas de perte, contactez-nous à <a href="mailto:evenement@nomacast.fr" style="color:#5A98D6">evenement@nomacast.fr</a>.
    </p>
  </div>
</main>

<div class="footer">
  Propulsé par <a href="https://www.nomacast.fr/" target="_blank" rel="noopener">Nomacast</a> · Live streaming corporate
</div>

</body>
</html>`;
}
