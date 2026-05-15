// functions/admin/_middleware.js
// Protège toutes les routes /admin/* (pages HTML) par Basic Auth.
// Le mot de passe attendu est lu depuis env.ADMIN_PASSWORD
// (à configurer dans Cloudflare Pages → Settings → Environment variables).
//
// Username : ignoré (mettre n'importe quoi).
// Password : doit correspondre à ADMIN_PASSWORD.

export const onRequest = async (context) => {
  const { request, env, next } = context;

  // nomacast-live-client-mode-v1 : exception pour /admin/live.html?client=1
  // La régie en direct est embarquée en iframe dans /event-admin/<token> (côté client).
  // L'auth se fait au niveau du parent via le token HMAC client, pas ici.
  // Le reste de /admin/* reste protégé par Basic Auth (edit, invitees, index, etc.).
  const url = new URL(request.url);
  if (url.pathname === '/admin/live.html' && url.searchParams.get('client') === '1') {
    return next();
  }

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

  // Auth OK : on laisse passer (page HTML statique servie par Pages)
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
