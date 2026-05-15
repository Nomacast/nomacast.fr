// functions/api/chat/[slug]/messages.js
// GET  /api/chat/:slug/messages?since=<iso>&limit=50  →  Liste les messages approved
// POST /api/chat/:slug/messages                       →  Ajoute un nouveau message
//
// Auth :
//   - Event public  : lecture libre, écriture anonyme avec author_name dans body
//   - Event privé   : lecture/écriture exige soit :
//       * Header X-Magic-Token : token invitee valide → identité = invitee.full_name
//       * Query ?preview=<hmac> : token admin valide → identité = "Admin (preview)"
//
// Modes d'interaction (event.modes_json) :
//   - 'lecture'  : POST refusé (403)
//   - 'qa'       : message créé en status='pending' (à modérer)
//   - sinon      : status='approved' direct (chat libre)

// nomacast-chat-auth-helper-v1 : helpers d'auth communs (factorisés depuis ce fichier)
import { authenticatePrivateRequest, hashIpFromRequest } from '../../../_lib/chat-auth.js';

// ============================================================
// GET — lecture des messages
// ============================================================
export const onRequestGet = async ({ params, request, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  const event = await loadEventBySlug(env, params.slug);
  if (!event) return jsonResponse({ error: 'Event introuvable' }, 404);

  // Garde : event privé sans auth valide → 403
  if (event.access_mode === 'private') {
    const authResult = await authenticatePrivateRequest(request, env, event);
    if (!authResult.ok) {
      return jsonResponse({ error: authResult.reason }, 403);
    }
  }

  // Paramètres
  const url = new URL(request.url);
  const since = url.searchParams.get('since');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 100);

  // On utilise COALESCE(approved_at, created_at) comme timestamp d'affichage :
  // - Pour un message chat libre, approved_at = created_at (mis à la création)
  // - Pour une question Q&A modérée, approved_at = moment où l'admin a approuvé,
  //   ce qui place la question dans le flux chronologique du chat à l'instant
  //   où elle est diffusée, et non au moment où elle a été posée (UX correcte :
  //   pas de question qui apparaît "dans le passé" après modération).
  let query = `
    SELECT id, author_name, author_kind, content, kind, status,
           COALESCE(approved_at, created_at) AS display_at
      FROM chat_messages
     WHERE event_id = ? AND status = 'approved'
  `;
  const bindings = [event.id];

  if (since) {
    query += ' AND COALESCE(approved_at, created_at) > ?';
    bindings.push(since);
  }

  query += ' ORDER BY COALESCE(approved_at, created_at) ASC LIMIT ?';
  bindings.push(limit);

  try {
    const result = await env.DB.prepare(query).bind(...bindings).all();
    const messages = (result.results || []).map(row => ({
      id: row.id,
      author_name: row.author_name,
      author_kind: row.author_kind,
      content: row.content,
      kind: row.kind,
      // On retourne display_at sous le nom `created_at` côté API publique
      // pour ne pas casser le polling client qui re-envoie ce timestamp en `since`.
      created_at: row.display_at
    }));
    return jsonResponse({ messages, count: messages.length });
  } catch (err) {
    console.error('[chat/messages GET]', err);
    return jsonResponse({ error: err.message }, 500);
  }
};

// ============================================================
// POST — ajout d'un message
// ============================================================
export const onRequestPost = async ({ params, request, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  const event = await loadEventBySlug(env, params.slug);
  if (!event) return jsonResponse({ error: 'Event introuvable' }, 404);

  // L'event doit être en live (pas draft ou ended) pour accepter des messages
  if (event.status !== 'live') {
    return jsonResponse({
      error: event.status === 'draft'
        ? 'L\'événement n\'a pas encore commencé.'
        : 'L\'événement est terminé.'
    }, 409);
  }

  // Modes d'interaction
  let modes = [];
  try { modes = event.modes_json ? JSON.parse(event.modes_json) : []; } catch (e) {}

  if (modes.includes('lecture')) {
    return jsonResponse({ error: 'Mode lecture seule : les messages ne sont pas autorisés.' }, 403);
  }

  // Identification auteur
  let authorName, authorKind, inviteeId = null;

  if (event.access_mode === 'private') {
    const authResult = await authenticatePrivateRequest(request, env, event);
    if (!authResult.ok) return jsonResponse({ error: authResult.reason }, 403);

    if (authResult.kind === 'invitee') {
      authorName = authResult.invitee.full_name || authResult.invitee.email.split('@')[0];
      authorKind = 'invitee';
      inviteeId = authResult.invitee.id;
    } else if (authResult.kind === 'admin_preview') {
      authorName = 'Admin (preview)';
      authorKind = 'admin';
    }
  } else {
    // Event public : auteur fourni dans le body
    authorKind = 'guest';
  }

  // Parse body
  let data;
  try { data = await request.json(); }
  catch (e) { return jsonResponse({ error: 'JSON invalide' }, 400); }

  // Pour public, on prend author_name du body
  if (event.access_mode !== 'private') {
    const raw = (data.author_name || '').toString().trim();
    if (!raw) return jsonResponse({ error: 'Nom requis (author_name)' }, 400);
    if (raw.length > 60) return jsonResponse({ error: 'Nom trop long (60 caractères max)' }, 400);
    authorName = raw;
  }

  const content = (data.content || '').toString().trim();
  if (!content) return jsonResponse({ error: 'Message vide' }, 400);
  if (content.length > 500) return jsonResponse({ error: 'Message trop long (500 caractères max)' }, 400);

  // Type : 'message' (libre) ou 'question' (Q&A)
  const kind = data.kind === 'question' ? 'question' : 'message';

  // Status : pending si Q&A modéré, sinon approved
  // (sauf si admin preview → toujours approved pour permettre les tests)
  let status = 'approved';
  if (authorKind !== 'admin' && (modes.includes('qa') || kind === 'question')) {
    status = 'pending';
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Rate limit (Lot H) : 10 msg / min / IP, sauf admin preview
  // Hash IP avec env.CHAT_IP_HASH_SECRET pour éviter de stocker l'IP en clair (RGPD).
  // No-op silencieux si CHAT_IP_HASH_SECRET pas configuré (mode dev / setup).
  let ipHash = null;
  if (authorKind !== 'admin' && env.CHAT_IP_HASH_SECRET) {
    ipHash = await hashIpFromRequest(request, env.CHAT_IP_HASH_SECRET);
    if (ipHash) {
      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
      try {
        const recent = await env.DB.prepare(`
          SELECT COUNT(*) AS n FROM chat_messages
          WHERE ip_hash = ? AND created_at > ?
        `).bind(ipHash, oneMinuteAgo).first();
        if (recent && recent.n >= 10) {
          return new Response(
            JSON.stringify({
              error: 'Trop de messages envoyés. Patiente une minute avant de réessayer.',
              retry_after_seconds: 60
            }),
            {
              status: 429,
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                'Retry-After': '60'
              }
            }
          );
        }
      } catch (err) {
        // On loggue mais on ne bloque pas le POST si la query rate limit fail
        // (préfère un message qui passe quitte à dépasser plutôt qu'un faux 500)
        console.error('[chat/messages rate-limit]', err);
      }
    }
  }

  try {
    await env.DB.prepare(`
      INSERT INTO chat_messages
        (id, event_id, invitee_id, author_name, author_kind, content, kind, status, ip_hash, created_at, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, event.id, inviteeId, authorName, authorKind, content, kind, status, ipHash, now,
      status === 'approved' ? now : null
    ).run();
  } catch (err) {
    console.error('[chat/messages POST]', err);
    return jsonResponse({ error: err.message }, 500);
  }

  return jsonResponse({
    success: true,
    message: {
      id, author_name: authorName, author_kind: authorKind,
      content, kind, status, created_at: now
    }
  });
};

// ============================================================
// Helpers
// ============================================================
async function loadEventBySlug(env, slug) {
  return await env.DB.prepare(
    'SELECT id, slug, title, status, access_mode, modes_json FROM events WHERE slug = ?'
  ).bind(slug).first();
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
