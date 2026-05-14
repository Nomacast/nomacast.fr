// functions/api/admin/events/[id]/ctas.js
// GET /api/admin/events/<id>/ctas
// POST /api/admin/events/<id>/ctas { label, url, expires_in_seconds? }
//
// POST crée un CTA actif. Désactive automatiquement tout autre CTA actif
// (1 seul CTA actif à la fois par event).

export const onRequestGet = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    const rs = await env.DB.prepare(`
      SELECT id, label, url, active, activated_at, deactivated_at, expires_in_seconds, created_at
      FROM event_ctas
      WHERE event_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).bind(params.id).all();
    return json({ ctas: rs.results || [] });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

export const onRequestPost = async ({ params, request, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    let data;
    try { data = await request.json(); } catch (e) { return json({ error: 'JSON invalide' }, 400); }

    const label = (data.label || '').toString().trim().slice(0, 60);
    if (!label) return json({ error: 'label requis' }, 400);

    const url = (data.url || '').toString().trim();
    if (!url) return json({ error: 'url requis' }, 400);
    try {
      const u = new URL(url);
      if (!['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol)) {
        return json({ error: 'protocole non autorisé' }, 400);
      }
    } catch (e) { return json({ error: 'URL invalide' }, 400); }

    let expiresIn = parseInt(data.expires_in_seconds, 10);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) expiresIn = null;
    if (expiresIn && expiresIn > 3600) expiresIn = 3600; // cap à 1h

    const ev = await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(params.id).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);

    const now = new Date().toISOString();

    // Désactive tous les CTAs actifs de cet event
    await env.DB.prepare(`
      UPDATE event_ctas SET active = 0, deactivated_at = ?
      WHERE event_id = ? AND active = 1
    `).bind(now, params.id).run();

    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO event_ctas (id, event_id, label, url, active, activated_at, expires_in_seconds, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).bind(id, params.id, label, url, now, expiresIn, now).run();

    return json({ success: true, cta_id: id });
  } catch (err) {
    console.error('[ctas POST]', err);
    return json({ error: err.message }, 500);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
