// functions/api/event-admin/[token]/invitees/[invitee_id]/resend.js
// POST /api/event-admin/:token/invitees/:invitee_id/resend
// Renvoie l'email d'invitation — version CLIENT (auth par HMAC token).
//
// Template d'email : centralisé dans functions/_lib/invitation-email.js
// (marqueur `nomacast-invitation-email-helper-v1`).


import { buildInvitationEmail } from '../../../../../_lib/invitation-email.js';

export const onRequestPost = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB manquant' }, 500);
  if (!env.RESEND_API_KEY) return jsonResponse({ error: 'RESEND_API_KEY non configurée' }, 500);
  if (!env.ADMIN_PASSWORD) return jsonResponse({ error: 'ADMIN_PASSWORD non configuré' }, 500);

  // Résolution token → event_id via HMAC
  const event_id = await resolveEventIdByToken(params.token, env);
  if (!event_id) return jsonResponse({ error: 'Token invalide' }, 403);

  const row = await env.DB.prepare(`
    SELECT
      e.id AS e_id, e.slug, e.title, e.client_name, e.description, e.scheduled_at, e.duration_minutes,
      e.primary_color, e.logo_url, e.white_label, e.access_mode,
      i.id AS i_id, i.email, i.full_name, i.company, i.magic_token, i.invited_at
    FROM invitees i
    JOIN events e ON i.event_id = e.id
    WHERE i.id = ? AND e.id = ?
  `).bind(params.invitee_id, event_id).first();

  if (!row) return jsonResponse({ error: 'Invité introuvable pour cet event' }, 404);

  const event = {
    id: row.e_id, slug: row.slug, title: row.title, client_name: row.client_name,
    description: row.description || null, scheduled_at: row.scheduled_at, duration_minutes: row.duration_minutes,
    primary_color: row.primary_color, logo_url: row.logo_url,
    white_label: row.white_label === 1, access_mode: row.access_mode
  };
  const invitee = {
    id: row.i_id, email: row.email, full_name: row.full_name,
    company: row.company, magic_token: row.magic_token
  };

  const payload = buildInvitationEmail(event, invitee);

  let sendResult;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    sendResult = await r.json();
    if (!r.ok) {
      console.error('[resend] Resend API error', r.status, sendResult);
      return jsonResponse({
        error: 'Resend a rejeté l\'envoi : ' + (sendResult.message || r.status)
      }, 502);
    }
  } catch (err) {
    console.error('[resend] fetch error', err);
    return jsonResponse({ error: 'Erreur réseau Resend : ' + err.message }, 502);
  }

  try {
    await env.DB.prepare(
      'UPDATE invitees SET invited_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), params.invitee_id).run();
  } catch (err) {
    console.error('[resend] DB update', err);
  }

  return jsonResponse({
    success: true,
    invitee_id: params.invitee_id,
    resend_id: sendResult.id
  });
};

// ============================================================
// Auth : résolution event_id via HMAC token
// ============================================================
async function resolveEventIdByToken(token, env) {
  if (!env.DB || !env.ADMIN_PASSWORD) return null;
  const events = await env.DB.prepare('SELECT id, slug FROM events').all();
  for (const ev of (events.results || [])) {
    const expected = await computeClientToken(ev.slug, env.ADMIN_PASSWORD);
    if (token === expected) return ev.id;
  }
  return null;
}

async function computeClientToken(slug, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(slug + ':client'));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .slice(0, 24);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

