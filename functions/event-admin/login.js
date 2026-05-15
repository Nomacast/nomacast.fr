// functions/event-admin/login.js
// GET  /event-admin/login        → page de connexion HTML (brand Nomacast)
// POST /event-admin/login        → traitement : valide login/password, set cookie session, redirige vers /event-admin/<slug>
//
// nomacast-client-credentials-v1

import { verifyPassword } from '../_lib/password.js';
import {
  createSessionCookieValue,
  buildSetCookieHeader,
  getSessionFromRequest
} from '../_lib/session.js';

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
    : null;

  return new Response(renderLoginPage(errorMsg), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
};

// ============================================================
// POST — traitement du formulaire de connexion
// ============================================================
export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return redirectErr(request, 'server');
  if (!env.SESSION_SECRET) return redirectErr(request, 'server');

  // Récupérer login + password depuis form-data ou JSON
  let login = '';
  let password = '';
  const contentType = request.headers.get('Content-Type') || '';
  try {
    if (contentType.includes('application/json')) {
      const data = await request.json();
      login = String(data.login || '').trim();
      password = String(data.password || '');
    } else {
      // application/x-www-form-urlencoded (form standard HTML)
      const form = await request.formData();
      login = String(form.get('login') || '').trim();
      password = String(form.get('password') || '');
    }
  } catch (e) {
    return redirectErr(request, 'missing');
  }

  if (!login || !password) {
    return redirectErr(request, 'missing');
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
    return redirectErr(request, 'invalid');
  }

  const ok = await verifyPassword(password, event.client_password_hash);
  if (!ok) return redirectErr(request, 'invalid');

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
// Template HTML — page de login, brand Nomacast
// ============================================================
function renderLoginPage(errorMsg) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>Connexion — Nomacast</title>
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
