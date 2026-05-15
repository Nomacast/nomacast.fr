// functions/api/admin/events/[id]/send-invitations.js
// POST /api/admin/events/:id/send-invitations
// Envoie l'email d'invitation à tous les invités sans invited_at (jamais envoyé).
// Utilise Resend Batch API (100 emails max par appel, on chunk si nécessaire).
//
// Template d'email : centralisé dans functions/_lib/invitation-email.js
// (marqueur `nomacast-invitation-email-helper-v1`).

import { buildInvitationEmail } from '../../../../_lib/invitation-email.js';

const BATCH_SIZE = 100;

export const onRequestPost = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB manquant' }, 500);
  if (!env.RESEND_API_KEY) return jsonResponse({ error: 'RESEND_API_KEY non configurée' }, 500);

  const event = await env.DB.prepare(`
    SELECT id, slug, title, client_name, description, scheduled_at, duration_minutes,
           primary_color, logo_url, white_label, access_mode
      FROM events WHERE id = ?
  `).bind(params.id).first();

  if (!event) return jsonResponse({ error: 'Event introuvable' }, 404);
  event.white_label = event.white_label === 1;

  const { results: invitees } = await env.DB.prepare(`
    SELECT id, email, full_name, company, magic_token
      FROM invitees
     WHERE event_id = ? AND invited_at IS NULL
  `).bind(params.id).all();

  if (!invitees || invitees.length === 0) {
    return jsonResponse({
      success: true,
      sent_count: 0,
      message: 'Aucun invité en attente d\'envoi.'
    });
  }

  const payloads = invitees.map(inv => ({
    invitee: inv,
    email: buildInvitationEmail(event, inv)
  }));

  let totalSent = 0;
  let totalFailed = 0;
  const failed = [];

  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const chunk = payloads.slice(i, i + BATCH_SIZE);
    const emails = chunk.map(p => p.email);

    try {
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emails)
      });
      const result = await r.json();

      if (!r.ok) {
        console.error('[send-invitations] Resend batch error', r.status, result);
        chunk.forEach(p => {
          failed.push({ email: p.invitee.email, reason: result.message || `HTTP ${r.status}` });
        });
        totalFailed += chunk.length;
        continue;
      }

      const now = new Date().toISOString();
      for (const p of chunk) {
        try {
          await env.DB.prepare(
            'UPDATE invitees SET invited_at = ? WHERE id = ?'
          ).bind(now, p.invitee.id).run();
          totalSent++;
        } catch (dbErr) {
          console.error('[send-invitations] DB update', dbErr);
          failed.push({ email: p.invitee.email, reason: 'Email envoyé mais BDD pas mise à jour' });
        }
      }
    } catch (err) {
      console.error('[send-invitations] fetch error', err);
      chunk.forEach(p => {
        failed.push({ email: p.invitee.email, reason: err.message });
      });
      totalFailed += chunk.length;
    }
  }

  return jsonResponse({
    success: totalSent > 0,
    sent_count: totalSent,
    failed_count: totalFailed,
    total: invitees.length,
    failed
  });
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
