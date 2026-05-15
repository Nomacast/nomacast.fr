// functions/admin/_middleware.js
// Protège les routes /admin/* avec auth en cascade :
//
//   1. Assets statiques /admin/*.{css,js,svg,png,jpg,jpeg,webp,woff,woff2,ico}
//      → publics (déjà dans le repo GitHub Nomacast/nomacast.fr public)
//   2. /admin/live.html?id=<event_id>
//      → accessible avec cookie session client valide pour CET event (iframe régie côté client)
//   3. Toutes les autres routes /admin/*
//      → Basic Auth admin Nomacast (mot de passe partagé via env.ADMIN_PASSWORD)
//
// Le username Basic Auth est ignoré (mettre n'importe quoi).
//
// nomacast-live-client-mode-v1 + nomacast-client-credentials-v1

import { getSessionFromRequest } from '../_lib/session.js';

const STATIC_ASSET_RE = /^\/admin\/[^\/]+\.(css|js|svg|png|jpg|jpeg|webp|woff2?|ico)$/i;

export const onRequest = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // ============================================================
  // 1. Assets statiques publics (CSS/JS/icônes nécessaires aux iframes embarquées)
  // ============================================================
  if (STATIC_ASSET_RE.test(url.pathname)) {
    return next();
  }

  // ============================================================
  // 2. /admin/live.html : accès client via cookie session (iframe régie)
  //    Le cookie session contient event_id ; on vérifie qu'il correspond au ?id= demandé.
  // ============================================================
  if (url.pathname === '/admin/live.html') {
    const eventId = url.searchParams.get('id');
    if (eventId) {
      try {
        const session = await getSessionFromRequest(request, env);
        if (session && session.event_id === eventId) {
          return next();
        }
      } catch (e) { /* on retombe sur le Basic Auth ci-dessous */ }
    }
  }

  // ============================================================
  // 3. Basic Auth admin Nomacast (toutes les autres routes /admin/*)
  // ============================================================
  if (!env.ADMIN_PASSWORD) {
    return new Response(
      'Configuration manquante : la variable d\'environnement ADMIN_PASSWORD '
      + 'doit être définie dans Cloudflare Pages → Settings → Environment variables.',
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }

  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Basic ')) {
    return unauthorized();
  }

  let decoded;
  try {
    decoded = atob(authHeader.substring(6));
  } catch (e) {
    return unauthorized();
  }

  const sep = decoded.indexOf(':');
  if (sep === -1) return unauthorized();
  const password = decoded.substring(sep + 1);

  if (password !== env.ADMIN_PASSWORD) {
    return unauthorized();
  }

  return next();
};

function unauthorized() {
  return new Response('Authentification requise.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Nomacast Admin", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}
