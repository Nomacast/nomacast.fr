// functions/api/chat/[slug]/reactions/config.js
// GET /api/chat/<slug>/reactions/config
//
// Renvoie la liste des emojis de réaction configurés pour cet event.
// Si reaction_emojis_json est NULL → renvoie le set par défaut des 8 originaux
// (rétro-compat parfaite avec le frontend hardcodé Lot 2.A).
// Si configuré → renvoie l'array 1-5 emojis stockés en DB.
//
// Utilisé par le frontend participant :
//  - Au SSR pour rendre la barre de reactions
//  - En polling 15s pour rafraîchir la barre si l'admin a modifié la sélection
//    pendant le live (changement reflété côté participant dans les 15 secondes).
//
// Marqueur : nomacast-reactions-config-v1

const DEFAULT_EMOJIS = ['👏', '❤️', '🔥', '🎉', '🙏', '👍', '😂', '🤔'];

export const onRequestGet = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);

    const ev = await env.DB.prepare(
      'SELECT reaction_emojis_json FROM events WHERE slug = ?'
    ).bind(params.slug).first();

    if (!ev) return json({ error: 'Event introuvable' }, 404);

    let emojis = DEFAULT_EMOJIS;
    if (ev.reaction_emojis_json) {
      try {
        const parsed = JSON.parse(ev.reaction_emojis_json);
        if (Array.isArray(parsed) && parsed.length > 0) {
          emojis = parsed;
        }
      } catch (e) {
        // JSON corrompu → fallback sur défaut, on ne fait pas échouer la requête
      }
    }

    return json({ emojis });
  } catch (err) {
    console.error('[reactions/config GET]', err);
    return json({ error: err.message }, 500);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
