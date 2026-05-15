// functions/api/admin/auth-logs/purge.js
//
// POST /api/admin/auth-logs/purge
// Purge des auth_logs > 90 jours (RGPD + hygiène BDD).
//
// Auth : header X-Cron-Token == env.CRON_PURGE_TOKEN.
// (Pas Cloudflare Access : on veut pouvoir appeler depuis un cron externe sans navigateur.)
//
// Appelable :
//   - Quotidiennement par .github/workflows/cron-purge-auth-logs.yml (recommandé)
//   - Manuellement : curl -X POST -H "X-Cron-Token: <token>" https://nomacast.fr/api/admin/auth-logs/purge
//
// Marqueur : nomacast-auth-logs-purge-v1

const RETENTION_DAYS = 90;

export const onRequestPost = async ({ request, env }) => {
  // Auth par token partagé (cf. secret GitHub + env var Cloudflare)
  if (!env.CRON_PURGE_TOKEN) {
    return json({ error: 'CRON_PURGE_TOKEN non configuré côté Cloudflare' }, 500);
  }
  const token = request.headers.get('X-Cron-Token');
  if (!token || token !== env.CRON_PURGE_TOKEN) {
    return json({ error: 'Token invalide ou manquant' }, 403);
  }

  if (!env.DB) return json({ error: 'D1 binding manquant' }, 500);

  try {
    // Compter ce qui sera purgé (avant le DELETE) pour le log
    const cutoffSeconds = RETENTION_DAYS * 86400;
    const before = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM auth_logs WHERE attempted_at < datetime('now', '-' || ? || ' seconds')`
    ).bind(cutoffSeconds).first();
    const toDelete = before ? before.n : 0;

    if (toDelete === 0) {
      return json({
        success: true,
        retention_days: RETENTION_DAYS,
        deleted: 0,
        message: 'Aucune entrée à purger (toutes plus récentes que ' + RETENTION_DAYS + ' jours)',
        timestamp: new Date().toISOString()
      });
    }

    const result = await env.DB.prepare(
      `DELETE FROM auth_logs WHERE attempted_at < datetime('now', '-' || ? || ' seconds')`
    ).bind(cutoffSeconds).run();

    const actuallyDeleted = (result.meta && typeof result.meta.changes === 'number')
      ? result.meta.changes
      : toDelete;

    return json({
      success: true,
      retention_days: RETENTION_DAYS,
      deleted: actuallyDeleted,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[auth-logs purge]', err);
    return json({ error: err.message }, 500);
  }
};

// GET facultatif : info sans purge (utile pour vérifier que l'endpoint est joignable)
export const onRequestGet = async ({ request, env }) => {
  if (!env.CRON_PURGE_TOKEN) {
    return json({ error: 'CRON_PURGE_TOKEN non configuré' }, 500);
  }
  const token = request.headers.get('X-Cron-Token');
  if (!token || token !== env.CRON_PURGE_TOKEN) {
    return json({ error: 'Token invalide' }, 403);
  }
  if (!env.DB) return json({ error: 'D1 binding manquant' }, 500);

  try {
    const cutoffSeconds = RETENTION_DAYS * 86400;
    const stats = await env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN attempted_at < datetime('now', '-' || ? || ' seconds') THEN 1 ELSE 0 END) AS purgeable,
        MIN(attempted_at) AS oldest,
        MAX(attempted_at) AS newest
      FROM auth_logs
    `).bind(cutoffSeconds).first();

    return json({
      retention_days: RETENTION_DAYS,
      total: (stats && stats.total) || 0,
      purgeable: (stats && stats.purgeable) || 0,
      oldest: stats ? stats.oldest : null,
      newest: stats ? stats.newest : null
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private' }
  });
}
