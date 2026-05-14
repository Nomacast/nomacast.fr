// functions/api/chat/[slug]/polls/[pollId]/vote.js
// POST /api/chat/:slug/polls/:pollId/vote
// Body : { option_id: string }
//
// Règles :
//   - Le sondage doit être status='live'
//   - L'option doit appartenir au sondage
//   - 1 vote / personne / sondage (UNIQUE constraint poll_id + voter_key)
//
// Auth :
//   - Event public  : voter_key = ip_hash (requiert env.CHAT_IP_HASH_SECRET)
//   - Event privé   : voter_key = invitee.id (X-Magic-Token requis)

export const onRequestPost = async ({ params, request, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  const event = await loadEventBySlug(env, params.slug);
  if (!event) return jsonResponse({ error: 'Event introuvable' }, 404);

  // L'event doit être live pour accepter les votes
  if (event.status !== 'live') {
    return jsonResponse({
      error: event.status === 'draft'
        ? 'L\'événement n\'a pas encore commencé.'
        : 'L\'événement est terminé.'
    }, 409);
  }

  // Auth : identifie le voter_key
  let voterKey = null;
  if (event.access_mode === 'private') {
    const auth = await authenticatePrivateRequest(request, env, event);
    if (!auth.ok) return jsonResponse({ error: auth.reason }, 403);
    if (auth.kind === 'invitee') {
      voterKey = auth.invitee.id;
    } else if (auth.kind === 'admin_preview') {
      return jsonResponse({ error: 'Mode preview admin : le vote est désactivé' }, 403);
    }
  } else {
    voterKey = await hashIp(request, env);
    if (!voterKey) {
      // Pas de CHAT_IP_HASH_SECRET configuré → impossible de dédoublonner
      return jsonResponse({
        error: 'Service de vote temporairement indisponible (configuration incomplète).'
      }, 503);
    }
  }

  // Body
  let data;
  try { data = await request.json(); }
  catch (e) { return jsonResponse({ error: 'JSON invalide' }, 400); }
  const optionId = (data.option_id || '').toString();
  if (!optionId) return jsonResponse({ error: 'option_id requis' }, 400);

  // Vérifier le sondage est bien live + sur ce slug
  const poll = await env.DB.prepare(`
    SELECT id, status FROM polls WHERE id = ? AND event_id = ?
  `).bind(params.pollId, event.id).first();
  if (!poll) return jsonResponse({ error: 'Sondage introuvable' }, 404);
  if (poll.status !== 'live') {
    return jsonResponse({ error: 'Ce sondage n\'est pas ouvert au vote.' }, 409);
  }

  // Vérifier que l'option appartient bien à ce sondage
  const option = await env.DB.prepare(`
    SELECT id FROM poll_options WHERE id = ? AND poll_id = ?
  `).bind(optionId, params.pollId).first();
  if (!option) return jsonResponse({ error: 'Option invalide pour ce sondage' }, 400);

  // INSERT vote (UNIQUE constraint poll_id + voter_key gère le 1-vote-par-personne)
  const voteId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(`
      INSERT INTO poll_votes (id, poll_id, option_id, voter_key, voted_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(voteId, params.pollId, optionId, voterKey, now).run();
  } catch (err) {
    // UNIQUE constraint = vote déjà existant
    const msg = (err && err.message) || '';
    if (msg.includes('UNIQUE') || msg.includes('constraint')) {
      return jsonResponse({ error: 'Vous avez déjà voté pour ce sondage.' }, 409);
    }
    console.error('[chat/polls/vote POST]', err);
    return jsonResponse({ error: err.message }, 500);
  }

  // Renvoyer le sondage actualisé (résultats live agrégés)
  const optionsResult = await env.DB.prepare(`
    SELECT o.id, o.poll_id, o.label, o.position,
           (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) AS votes_count
      FROM poll_options o
     WHERE o.poll_id = ?
     ORDER BY o.position ASC
  `).bind(params.pollId).all();

  const options = optionsResult.results || [];
  const totalVotes = options.reduce((sum, o) => sum + (o.votes_count || 0), 0);
  const optionsWithPct = options.map(o => ({
    id: o.id,
    label: o.label,
    position: o.position,
    votes_count: o.votes_count,
    percentage: totalVotes > 0
      ? Math.round((o.votes_count / totalVotes) * 1000) / 10
      : 0
  }));

  return jsonResponse({
    success: true,
    my_vote: optionId,
    options: optionsWithPct,
    total_votes: totalVotes
  });
};

// ============================================================
// Helpers (dupliqués — pas d'import croisé en Pages Functions)
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
