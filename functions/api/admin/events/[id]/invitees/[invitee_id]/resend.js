// functions/api/admin/events/[id]/invitees/[invitee_id]/resend.js
// POST /api/admin/events/:id/invitees/:invitee_id/resend
// Renvoie l'email d'invitation à un invité spécifique via Resend.
//
// Template d'email : centralisé dans functions/_lib/invitation-email.js
// (marqueur `nomacast-invitation-email-helper-v1`).


import { buildInvitationEmail } from '../../../../../../_lib/invitation-email.js';

export const onRequestPost = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB manquant' }, 500);
  if (!env.RESEND_API_KEY) return jsonResponse({ error: 'RESEND_API_KEY non configurée' }, 500);

  const row = await env.DB.prepare(`
    SELECT
      e.id AS e_id, e.slug, e.title, e.client_name, e.description, e.scheduled_at, e.duration_minutes,
      e.primary_color, e.logo_url, e.white_label, e.access_mode,
      i.id AS i_id, i.email, i.full_name, i.company, i.magic_token, i.invited_at
    FROM invitees i
    JOIN events e ON i.event_id = e.id
    WHERE i.id = ? AND e.id = ?
  `).bind(params.invitee_id, params.id).first();

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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
