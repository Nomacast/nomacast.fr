// functions/api/admin/events/[id]/credentials.js
// Gestion des credentials client (login + password) d'un event, côté admin Nomacast.
// Protégé par le middleware admin (Basic Auth).
//
// GET    /api/admin/events/:id/credentials
//        → { login, has_password, login_taken: false }  (jamais le hash, jamais le password en clair)
//
// PUT    /api/admin/events/:id/credentials  { login }
//        → set/update le login client. Valide format + unicité.
//        → { login, has_password }
//
// POST   /api/admin/events/:id/credentials  → génère un nouveau password aléatoire.
//        → { login, password }  (password en clair UNE SEULE FOIS, à copier maintenant)
//        → si pas de login défini, le pré-rempli avec le slug de l'event
//
// DELETE /api/admin/events/:id/credentials
//        → reset login + password (révoque l'accès client)
//
// nomacast-client-credentials-v1

import { generatePassword, hashPassword } from '../../../../_lib/password.js';

const LOGIN_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$/;

// ============================================================
// GET — État actuel des credentials
// ============================================================
export const onRequestGet = async ({ params, env }) => {
  if (!env.DB) return jsonError('D1 binding manquant', 500);
  const event = await env.DB.prepare(
    'SELECT id, slug, client_login, client_password_hash FROM events WHERE id = ?'
  ).bind(params.id).first();
  if (!event) return jsonError('Event introuvable', 404);
  return jsonOk({
    login: event.client_login || null,
    has_password: !!event.client_password_hash,
    slug: event.slug
  });
};

// ============================================================
// PUT — Set/update le login (sans toucher au password)
// ============================================================
export const onRequestPut = async ({ params, request, env }) => {
  if (!env.DB) return jsonError('D1 binding manquant', 500);
  let data;
  try { data = await request.json(); } catch (e) { return jsonError('JSON invalide', 400); }

  const newLogin = String(data.login || '').trim().toLowerCase();
  if (!newLogin) return jsonError('Le login est requis.', 400);
  if (!LOGIN_PATTERN.test(newLogin)) {
    return jsonError('Login invalide. Utilisez 3 à 64 caractères : lettres minuscules, chiffres, tirets ou underscores. Doit commencer et finir par un caractère alphanumérique.', 400);
  }

  // Vérifier unicité (en excluant l'event courant)
  const collision = await env.DB.prepare(
    'SELECT id FROM events WHERE client_login = ? AND id != ?'
  ).bind(newLogin, params.id).first();
  if (collision) return jsonError('Ce login est déjà utilisé par un autre événement.', 409);

  // Charger l'event pour s'assurer qu'il existe
  const event = await env.DB.prepare(
    'SELECT id, slug, client_password_hash FROM events WHERE id = ?'
  ).bind(params.id).first();
  if (!event) return jsonError('Event introuvable', 404);

  await env.DB.prepare(
    'UPDATE events SET client_login = ?, updated_at = ? WHERE id = ?'
  ).bind(newLogin, new Date().toISOString(), params.id).run();

  return jsonOk({
    login: newLogin,
    has_password: !!event.client_password_hash,
    slug: event.slug
  });
};

// ============================================================
// POST — Génère un nouveau password aléatoire
//        Si pas de login défini, le pré-rempli avec le slug de l'event
// ============================================================
export const onRequestPost = async ({ params, env }) => {
  if (!env.DB) return jsonError('D1 binding manquant', 500);

  const event = await env.DB.prepare(
    'SELECT id, slug, client_login FROM events WHERE id = ?'
  ).bind(params.id).first();
  if (!event) return jsonError('Event introuvable', 404);

  // Si pas de login encore défini, on prend le slug par défaut
  let login = event.client_login;
  if (!login) {
    login = (event.slug || '').toLowerCase();
    if (!LOGIN_PATTERN.test(login)) {
      return jsonError('Impossible de générer un login automatiquement. Définissez-le manuellement d\'abord (PUT).', 400);
    }
    // Vérifier unicité (peu probable car slug est unique, mais sécurité)
    const collision = await env.DB.prepare(
      'SELECT id FROM events WHERE client_login = ? AND id != ?'
    ).bind(login, params.id).first();
    if (collision) {
      return jsonError('Le slug est déjà utilisé comme login par un autre event. Définissez le login manuellement.', 409);
    }
  }

  // Générer + hasher
  const password = generatePassword(12);
  const hash = await hashPassword(password);

  await env.DB.prepare(
    'UPDATE events SET client_login = ?, client_password_hash = ?, updated_at = ? WHERE id = ?'
  ).bind(login, hash, new Date().toISOString(), params.id).run();

  return jsonOk({
    login,
    password, // en clair UNE SEULE FOIS, à copier maintenant
    has_password: true
  });
};

// ============================================================
// DELETE — Reset complet : révoque l'accès client
// ============================================================
export const onRequestDelete = async ({ params, env }) => {
  if (!env.DB) return jsonError('D1 binding manquant', 500);
  const event = await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(params.id).first();
  if (!event) return jsonError('Event introuvable', 404);
  await env.DB.prepare(
    'UPDATE events SET client_login = NULL, client_password_hash = NULL, updated_at = ? WHERE id = ?'
  ).bind(new Date().toISOString(), params.id).run();
  return jsonOk({ login: null, has_password: false });
};

// --- Helpers ---
function jsonOk(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
