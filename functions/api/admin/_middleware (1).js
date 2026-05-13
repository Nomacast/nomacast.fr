// functions/api/admin/_middleware.js
// Protège toutes les routes /api/admin/* (Functions JSON) par Basic Auth.
// Réutilise les credentials que le navigateur a déjà cachés après
// authentification sur /admin/* (même origine → header Authorization auto-renvoyé).
//
// Si quelqu'un appelle l'API directement sans passer par /admin, le navigateur
// affichera aussi la pop-up Basic Auth.

export const onRequest = async (context) => {
  const { request, env, next } = context;

  if (!env.ADMIN_PASSWORD) {
    return jsonError('Configuration manquante : ADMIN_PASSWORD non défini.', 500);
  }

  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Basic ')) {
    return jsonUnauthorized();
  }

  let decoded;
  try {
    decoded = atob(authHeader.substring(6));
  } catch (e) {
    return jsonUnauthorized();
  }

  const sep = decoded.indexOf(':');
  if (sep === -1) return jsonUnauthorized();
  const password = decoded.substring(sep + 1);

  if (password !== env.ADMIN_PASSWORD) {
    return jsonUnauthorized();
  }

  return next();
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
