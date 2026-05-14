// functions/api/chat/[slug]/cta/active.js
// GET /api/chat/<slug>/cta/active
//
// Retourne le CTA actuellement actif pour cet event (ou null si aucun).
// Vérifie aussi l'expiration (si expires_in_seconds défini).

export const onRequestGet = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);
    const ev = await env.DB.prepare('SELECT id FROM events WHERE slug = ?').bind(params.slug).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);

    const cta = await env.DB.prepare(`
      SELECT id, label, url, activated_at, expires_in_seconds
      FROM event_ctas
      WHERE event_id = ? AND active = 1
      ORDER BY activated_at DESC
      LIMIT 1
    `).bind(ev.id).first();

    if (!cta) return json({ cta: null });

    // Vérifier l'expiration
    if (cta.expires_in_seconds && cta.activated_at) {
      const activatedMs = new Date(cta.activated_at).getTime();
      const expiresAt = activatedMs + cta.expires_in_seconds * 1000;
      if (Date.now() > expiresAt) {
        // Auto-désactiver (lazy expiration)
        await env.DB.prepare(`
          UPDATE event_ctas SET active = 0, deactivated_at = ?
          WHERE id = ?
        `).bind(new Date().toISOString(), cta.id).run();
        return json({ cta: null });
      }
    }

    return json({
      cta: {
        id: cta.id,
        label: cta.label,
        url: cta.url,
        activated_at: cta.activated_at,
        expires_in_seconds: cta.expires_in_seconds
      }
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
