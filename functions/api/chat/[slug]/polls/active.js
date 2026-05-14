// functions/api/chat/[slug]/polls/active.js
// GET /api/chat/:slug/polls/active
//   → Renvoie le sondage actif (status='live') de l'event + options + résultats live + vote du voter actuel
//   → Renvoie { poll: null } si pas de sondage live
//
// Auth :
//   - Event public  : OK sans auth (mais on a besoin de l'IP hash pour identifier le voter)
//   - Event privé   : X-Magic-Token requis (sinon 403)

export const onRequestGet = async ({ params, request, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  const event = await loadEventBySlug(env, params.slug);
  if (!event) return jsonResponse({ error: 'Event introuvable' }, 404);

  // Auth si event privé
  let voterKey = null;
  if (event.access_mode === 'private') {
    const auth = await authenticatePrivateRequest(request, env, event);
    if (!auth.ok) return jsonResponse({ error: auth.reason }, 403);
    if (auth.kind === 'invitee') voterKey = auth.invitee.id;
    // admin_preview → voterKey reste null (admin ne vote pas, juste preview)
  } else {
    // Event public : voter_key = ip_hash
    voterKey = await hashIp(request, env);
  }

  // Sondage actif (un seul à la fois)
  const poll = await env.DB.prepare(`
    SELECT id, event_id, question, type, status, results_visibility,
           created_at, launched_at, closed_at
      FROM polls
     WHERE event_id = ? AND status = 'live'
     ORDER BY launched_at DESC
     LIMIT 1
  `).bind(event.id).first();

  if (!poll) {
    return jsonResponse({ poll: null });
  }

  // Options avec compteurs
  const optionsResult = await env.DB.prepare(`
    SELECT o.id, o.poll_id, o.label, o.position,
           (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) AS votes_count
      FROM poll_options o
     WHERE o.poll_id = ?
     ORDER BY o.position ASC
  `).bind(poll.id).all();

  const options = optionsResult.results || [];
  const totalVotes = options.reduce((sum, o) => sum + (o.votes_count || 0), 0);

  // Vérif si le voter a déjà voté + sur quelle option
  let myVote = null;
  if (voterKey) {
    const v = await env.DB.prepare(`
      SELECT option_id FROM poll_votes
       WHERE poll_id = ? AND voter_key = ?
    `).bind(poll.id, voterKey).first();
    if (v) myVote = v.option_id;
  }

  // Affichage des résultats selon visibility
  // - 'live'        : tous voient les % en temps réel
  // - 'after-vote'  : visible seulement après avoir voté
  // - 'after-close' : visible seulement quand le sondage est closed
  const showResults =
    poll.results_visibility === 'live' ||
    (poll.results_visibility === 'after-vote' && myVote) ||
    poll.results_visibility === 'after-close'; // (toujours visible une fois clos, mais ici status='live')

  const optionsResponse = options.map(o => ({
    id: o.id,
    label: o.label,
    position: o.position,
    votes_count: showResults ? o.votes_count : null,
    percentage: showResults && totalVotes > 0
      ? Math.round((o.votes_count / totalVotes) * 1000) / 10
      : null
  }));

  return jsonResponse({
    poll: {
      id: poll.id,
      question: poll.question,
      type: poll.type,
      status: poll.status,
      results_visibility: poll.results_visibility,
      launched_at: poll.launched_at,
      options: optionsResponse,
      total_votes: showResults ? totalVotes : null,
      my_vote: myVote
    }
  });
};

// ============================================================
// Helpers (dupliqués depuis messages.js — pas d'import croisé en Pages Functions)
// ============================================================
async function loadEventBySlug(env, slug) {
  return await env.DB.prepare(
    'SELECT id, slug, title, status, access_mode FROM events WHERE slug = ?'
  ).bind(slug).first();
}

async function authenticatePrivateRequest(request, env, event) {
  const url = new URL(request.url);
  const magicToken = request.headers.get('X-Magic-Token');
  if (magicToken) {
    const inv = await env.DB.prepare(
      'SELECT id, email, full_name FROM invitees WHERE magic_token = ? AND event_id = ?'
    ).bind(magicToken, event.id).first();
    if (inv) return { ok: true, kind: 'invitee', invitee: inv };
    return { ok: false, reason: 'Token invitee invalide' };
  }
  const previewToken = url.searchParams.get('preview');
  if (previewToken && env.ADMIN_PASSWORD) {
    const expected = await computePreviewToken(event.slug, env.ADMIN_PASSWORD);
    if (previewToken === expected) return { ok: true, kind: 'admin_preview' };
  }
  return { ok: false, reason: 'Authentification requise pour cet event privé' };
}

async function computePreviewToken(slug, secret) {
  if (!secret) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(slug));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .slice(0, 24);
}

async function hashIp(request, env) {
  if (!env.CHAT_IP_HASH_SECRET) return null;
  const ip = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || 'unknown';
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(env.CHAT_IP_HASH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(ip));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .slice(0, 32);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
