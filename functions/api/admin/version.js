// functions/api/admin/version.js
// GET /api/admin/version
// Renvoie les informations de build/déploiement courant.
//
// Cloudflare Pages injecte automatiquement ces variables d'environnement :
//  - CF_PAGES_COMMIT_SHA : SHA complet du commit déployé
//  - CF_PAGES_BRANCH     : nom de la branche
//  - CF_PAGES_URL        : URL du déploiement courant

export const onRequestGet = async ({ env }) => {
  const sha = env.CF_PAGES_COMMIT_SHA || 'local';
  return new Response(JSON.stringify({
    commit: sha,
    commit_short: sha.substring(0, 7),
    branch: env.CF_PAGES_BRANCH || 'local',
    deployment_url: env.CF_PAGES_URL || null,
    server_time: new Date().toISOString()
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
};
