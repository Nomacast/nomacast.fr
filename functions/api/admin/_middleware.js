// functions/api/admin/_middleware.js
// Protège les routes /api/admin/* avec auth en cascade :
//
//   1. Basic Auth admin Nomacast (env.ADMIN_PASSWORD)
//      → accès complet à toutes les routes /api/admin/*
//   2. Cookie session client (event-admin)
//      → accès limité aux routes /api/admin/events/<event_id>/* où event_id correspond à la session
//      → permet à l'iframe régie (live.html) côté client de modérer, lancer sondages, etc.
//   3. Sinon 401
//
// nomacast-client-credentials-v1

import { getSessionFromRequest } from '../../_lib/session.js';

// Pattern pour extraire event_id de /api/admin/events/<event_id>/...
const API_EVENT_RE = /^\/api\/admin\/events\/([^\/]+)(\/|$)/;

export const onRequest = async (context) => {
  const { request, env, next } = context;

  if (!env.ADMIN_PASSWORD) {
    return jsonError('Configuration manquante : ADMIN_PASSWORD non défini.', 500);
  }

  // ============================================================
  // 1. Basic Auth admin Nomacast (priorité, vérification rapide)
  // ============================================================
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Basic ')) {
    let password = null;
    try {
      const decoded = atob(authHeader.substring(6));
      const sep = decoded.indexOf(':');
      if (sep !== -1) password = decoded.substring(sep + 1);
    } catch (e) { /* invalid base64 */ }
    if (password === env.ADMIN_PASSWORD) return next();
  }

  // ============================================================
  // 2. Cookie session client (uniquement pour les routes /api/admin/events/<id>/*)
  //    Permet à la régie côté client (iframe live.html) de fonctionner sans Basic Auth.
  //    L'accès est strictement limité à l'event_id de la session.
  // ============================================================
  const url = new URL(request.url);
  const m = url.pathname.match(API_EVENT_RE);
  if (m) {
    const requestedEventId = m[1];
    try {
      const session = await getSessionFromRequest(request, env);
      if (session && session.event_id === requestedEventId) {
        return next();
      }
    } catch (e) { /* on retombe sur 401 */ }
  }

  // ============================================================
  // 3. Sinon : 401 — déclenche Basic Auth popup côté browser pour usage admin direct
  // ============================================================
  return jsonUnauthorized();
};

function jsonUnauthorized() {
  return new Response(JSON.stringify({ error: 'Authentication required' }), {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Nomacast Admin", charset="UTF-8"',
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
