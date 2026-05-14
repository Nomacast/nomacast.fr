// functions/api/admin/events/[id]/stream.js
// POST   /api/admin/events/:id/stream  →  Crée un Cloudflare Stream Live Input et stocke les credentials
// DELETE /api/admin/events/:id/stream  →  Supprime le Live Input (côté Cloudflare + DB)
//
// Variables d'env requises :
//   - CLOUDFLARE_ACCOUNT_ID         (ID du compte Cloudflare)
//   - CLOUDFLARE_STREAM_API_TOKEN   (API token avec scope "Stream:Edit")
//
// Auth : middleware Basic Auth admin (hérité de /admin et /api/admin)
//
// Une fois créé, le live input contient :
//   - stream_uid              : UID retourné par Cloudflare
//   - stream_rtmps_url        : URL RTMPS à mettre dans OBS (rtmps://live.cloudflare.com:443/live/)
//   - stream_rtmps_key        : streamKey à mettre dans OBS (SECRET — affiché uniquement dans /admin)
//   - stream_playback_url     : URL iframe à embed côté participant (iframe.videodelivery.net/<uid>)
//   - stream_created_at       : timestamp de création

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

// ============================================================
// POST — Création du live input
// ============================================================
export const onRequestPost = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);
  if (!env.CLOUDFLARE_ACCOUNT_ID) return jsonResponse({ error: 'CLOUDFLARE_ACCOUNT_ID non configuré' }, 500);
  if (!env.CLOUDFLARE_STREAM_API_TOKEN) return jsonResponse({ error: 'CLOUDFLARE_STREAM_API_TOKEN non configuré' }, 500);

  // Charge l'event
  const event = await env.DB.prepare(
    'SELECT id, slug, title, stream_uid FROM events WHERE id = ?'
  ).bind(params.id).first();
  if (!event) return jsonResponse({ error: 'Event introuvable' }, 404);

  // Idempotent : si déjà créé, on renvoie les infos existantes
  if (event.stream_uid) {
    return jsonResponse({
      message: 'Live input déjà créé pour cet event',
      already_exists: true,
      stream_uid: event.stream_uid
    });
  }

  // Création côté Cloudflare Stream
  // Doc : https://developers.cloudflare.com/stream/stream-live/start-stream-live/
  let cfData;
  try {
    const resp = await fetch(
      `${CF_API_BASE}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream/live_inputs`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CLOUDFLARE_STREAM_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          meta: {
            // Nom affiché dans le dashboard Cloudflare (utile pour Jérôme)
            name: `Nomacast · ${event.title} · ${event.slug}`
          },
          // Recording automatique → réplay VOD dispo après l'event
          recording: { mode: 'automatic' },
          // Auto-delete du replay 30 jours après la fin de l'event
          // (valeur minimale autorisée par CF, max 1096).
          // Économie de storage sur les replays peu consultés.
          deleteRecordingAfterDays: 30,
          // Latence basse : utile pour l'interactivité chat ↔ vidéo
          preferLowLatency: true
        })
      }
    );

    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || !body.success) {
      const msg = (body.errors && body.errors[0] && body.errors[0].message)
        || `Erreur Cloudflare Stream (HTTP ${resp.status})`;
      return jsonResponse({ error: msg, cf_response: body }, 502);
    }
    cfData = body.result;
  } catch (err) {
    return jsonResponse({ error: 'Appel Cloudflare échoué : ' + err.message }, 502);
  }

  // Validation minimale de la réponse Cloudflare
  if (!cfData || !cfData.uid || !cfData.rtmps || !cfData.rtmps.url || !cfData.rtmps.streamKey) {
    return jsonResponse({ error: 'Réponse Cloudflare incomplète', cf_data: cfData }, 502);
  }

  const playbackUrl = `https://iframe.videodelivery.net/${cfData.uid}`;
  const createdAt = new Date().toISOString();

  // Stockage en D1
  try {
    await env.DB.prepare(`
      UPDATE events
         SET stream_uid = ?,
             stream_rtmps_url = ?,
             stream_rtmps_key = ?,
             stream_playback_url = ?,
             stream_created_at = ?,
             updated_at = ?
       WHERE id = ?
    `).bind(
      cfData.uid,
      cfData.rtmps.url,
      cfData.rtmps.streamKey,
      playbackUrl,
      createdAt,
      createdAt,
      event.id
    ).run();
  } catch (err) {
    // Rollback : on essaie de supprimer le live input côté Cloudflare pour ne pas avoir d'orphelin
    await tryDeleteLiveInput(env, cfData.uid).catch(() => {});
    return jsonResponse({ error: 'Stockage D1 échoué : ' + err.message }, 500);
  }

  return jsonResponse({
    success: true,
    stream: {
      uid: cfData.uid,
      rtmps_url: cfData.rtmps.url,
      rtmps_key: cfData.rtmps.streamKey,
      playback_url: playbackUrl,
      created_at: createdAt,
      // Conseils OBS pour Jérôme
      obs_hints: {
        service: 'Custom...',
        server: cfData.rtmps.url,
        stream_key: cfData.rtmps.streamKey,
        latency_profile: 'ultra low',
        keyframe_interval: '2s',
        codec: 'H.264 + AAC'
      }
    }
  });
};

// ============================================================
// DELETE — Suppression du live input
// ============================================================
export const onRequestDelete = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);
  if (!env.CLOUDFLARE_ACCOUNT_ID) return jsonResponse({ error: 'CLOUDFLARE_ACCOUNT_ID non configuré' }, 500);
  if (!env.CLOUDFLARE_STREAM_API_TOKEN) return jsonResponse({ error: 'CLOUDFLARE_STREAM_API_TOKEN non configuré' }, 500);

  const event = await env.DB.prepare(
    'SELECT id, stream_uid FROM events WHERE id = ?'
  ).bind(params.id).first();
  if (!event) return jsonResponse({ error: 'Event introuvable' }, 404);

  if (!event.stream_uid) {
    return jsonResponse({ message: 'Aucun live input à supprimer', noop: true });
  }

  // Suppression côté Cloudflare (best effort — on continue même en cas d'échec côté CF
  // pour éviter de bloquer le clean DB si l'input a déjà été supprimé manuellement)
  const cfStatus = await tryDeleteLiveInput(env, event.stream_uid);

  // Clean D1
  try {
    await env.DB.prepare(`
      UPDATE events
         SET stream_uid = NULL,
             stream_rtmps_url = NULL,
             stream_rtmps_key = NULL,
             stream_playback_url = NULL,
             stream_created_at = NULL,
             updated_at = ?
       WHERE id = ?
    `).bind(new Date().toISOString(), event.id).run();
  } catch (err) {
    return jsonResponse({ error: 'Clean D1 échoué : ' + err.message }, 500);
  }

  return jsonResponse({
    success: true,
    cloudflare_status: cfStatus
  });
};

// ============================================================
// Helpers
// ============================================================
async function tryDeleteLiveInput(env, uid) {
  try {
    const resp = await fetch(
      `${CF_API_BASE}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream/live_inputs/${encodeURIComponent(uid)}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.CLOUDFLARE_STREAM_API_TOKEN}` }
      }
    );
    if (resp.ok) return 'deleted';
    if (resp.status === 404) return 'already_gone';
    return `cloudflare_error_${resp.status}`;
  } catch (err) {
    return 'network_error';
  }
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
