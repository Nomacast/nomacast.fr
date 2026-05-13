// functions/api/admin/version.js
// GET /api/admin/version
// Renvoie les informations de build/déploiement courant.
//
// Cloudflare Pages injecte automatiquement :
//  - CF_PAGES_COMMIT_SHA : SHA complet du commit déployé
//  - CF_PAGES_BRANCH     : nom de la branche
//  - CF_PAGES_URL        : URL du déploiement courant
//
// On enrichit avec la date du commit récupérée via l'API GitHub publique
// (repo public : pas besoin de token). Cache 1h pour limiter les appels GitHub.

const GITHUB_REPO = 'Nomacast/nomacast.fr';

export const onRequestGet = async ({ env }) => {
  const sha = env.CF_PAGES_COMMIT_SHA || 'local';
  let commitDate = null;
  let commitMessage = null;

  if (sha !== 'local') {
    try {
      const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits/${sha}`, {
        headers: {
          'User-Agent': 'nomacast-admin/1.0',
          'Accept': 'application/vnd.github.v3+json'
        },
        cf: { cacheTtl: 3600, cacheEverything: true }
      });
      if (r.ok) {
        const data = await r.json();
        commitDate = data.commit && data.commit.author && data.commit.author.date
          ? data.commit.author.date
          : (data.commit && data.commit.committer ? data.commit.committer.date : null);
        commitMessage = data.commit && data.commit.message
          ? data.commit.message.split('\n')[0]
          : null;
      }
    } catch (e) {
      console.error('[version] github fetch failed', e);
    }
  }

  return new Response(JSON.stringify({
    commit: sha,
    commit_short: sha.substring(0, 7),
    commit_date: commitDate,
    commit_message: commitMessage,
    branch: env.CF_PAGES_BRANCH || 'local',
    deployment_url: env.CF_PAGES_URL || null,
    server_time: new Date().toISOString()
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Cache 5 min côté browser pour éviter de re-fetch GitHub à chaque navigation
      'Cache-Control': 'private, max-age=300'
    }
  });
};
