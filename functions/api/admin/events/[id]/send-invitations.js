// functions/api/admin/events/[id]/send-invitations.js
// POST /api/admin/events/:id/send-invitations
// Envoie l'email d'invitation à tous les invités sans invited_at (jamais envoyé).
// Utilise Resend Batch API (100 emails max par appel, on chunk si nécessaire).
//
// NOTE : helper buildInvitationEmail() dupliqué ici (pas d'import croisé)
// pour contourner la résolution capricieuse des chemins traversant `[id]/`.

const BATCH_SIZE = 100;

export const onRequestPost = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB manquant' }, 500);
  if (!env.RESEND_API_KEY) return jsonResponse({ error: 'RESEND_API_KEY non configurée' }, 500);

  const event = await env.DB.prepare(`
    SELECT id, slug, title, client_name, scheduled_at,
           primary_color, white_label, access_mode
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

// ============================================================
// Helper d'email (dupliqué depuis _invitation-email.js)
// ============================================================
const DOMAIN = 'nomacast.fr';
const SITE_URL = 'https://nomacast.fr';
const FROM = `Nomacast <noreply@${DOMAIN}>`;
const REPLY_TO = `evenement@${DOMAIN}`;

function buildInvitationEmail(event, invitee) {
  const firstName = extractFirstName(invitee.full_name);
  const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
  const chatPath = `/chat/${event.slug}`;
  const link = event.access_mode === 'private'
    ? `${SITE_URL}${chatPath}?t=${invitee.magic_token}`
    : `${SITE_URL}${chatPath}`;
  const dateLabel = formatFrenchDateTime(event.scheduled_at);
  const orgLine = event.client_name ? `organisé par ${event.client_name}` : '';
  const subject = `Invitation : ${event.title}`;
  const text = buildText({ greeting, event, link, dateLabel, orgLine, whiteLabel: event.white_label });
  const html = buildHtml({ greeting, event, link, dateLabel, orgLine, color: event.primary_color || '#5A98D6', whiteLabel: event.white_label });
  return { from: FROM, to: [invitee.email], reply_to: REPLY_TO, subject, html, text };
}

function extractFirstName(fullName) {
  if (!fullName || typeof fullName !== 'string') return null;
  const first = fullName.trim().split(/\s+/)[0];
  return first || null;
}

function formatFrenchDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} à ${String(d.getUTCHours()).padStart(2, '0')}h${String(d.getUTCMinutes()).padStart(2, '0')} (UTC)`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildText({ greeting, event, link, dateLabel, orgLine, whiteLabel }) {
  return [
    greeting, '',
    `Vous êtes invité(e) au chat live de l'événement : « ${event.title} »` + (orgLine ? `, ${orgLine}` : '') + '.',
    '', dateLabel ? `Date : ${dateLabel}` : '', '',
    'Pour rejoindre le chat live le jour J :', link, '',
    'Vous pouvez sauvegarder ce lien dans votre agenda dès maintenant.', '',
    whiteLabel ? '—' : '—\nPropulsé par Nomacast · live streaming corporate\nhttps://nomacast.fr'
  ].filter(line => line !== null).join('\n');
}

function buildHtml({ greeting, event, link, dateLabel, orgLine, color, whiteLabel }) {
  const safeTitle = escapeHtml(event.title);
  const safeOrg = orgLine ? escapeHtml(orgLine) : '';
  const safeGreeting = escapeHtml(greeting);
  const safeDate = escapeHtml(dateLabel);
  const safeLink = escapeHtml(link);
  const footerHtml = whiteLabel
    ? ''
    : `<tr><td style="padding:24px 32px 32px;font-family:Arial,sans-serif;font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9;">
         Propulsé par <strong style="color:#0f172a;">Nomacast</strong> · live streaming corporate &middot;
         <a href="${SITE_URL}" style="color:#94a3b8;text-decoration:underline;">nomacast.fr</a>
       </td></tr>`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${safeTitle}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9;padding:32px 0;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr><td style="background:${color};padding:24px 32px;color:#ffffff;font-family:Arial,sans-serif;">
        <div style="font-size:13px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;opacity:0.85;">Invitation chat live</div>
        <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;line-height:1.3;">${safeTitle}</h1>
      </td></tr>
      <tr><td style="padding:28px 32px 8px;font-family:Arial,sans-serif;color:#0f172a;font-size:15px;line-height:1.6;">
        <p style="margin:0 0 14px;">${safeGreeting}</p>
        <p style="margin:0 0 14px;">Vous êtes invité(e) à participer au chat live de l'événement <strong>${safeTitle}</strong>${safeOrg ? ', ' + safeOrg : ''}.</p>
        ${safeDate ? `<p style="margin:0 0 14px;color:#475569;font-size:14px;"><strong>Date</strong> : ${safeDate}</p>` : ''}
      </td></tr>
      <tr><td align="center" style="padding:16px 32px 28px;">
        <a href="${safeLink}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-family:Arial,sans-serif;font-size:15px;font-weight:600;">
          Rejoindre le chat live →
        </a>
      </td></tr>
      <tr><td style="padding:0 32px 24px;font-family:Arial,sans-serif;color:#475569;font-size:13px;line-height:1.6;">
        <p style="margin:0 0 8px;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :</p>
        <p style="margin:0;word-break:break-all;"><a href="${safeLink}" style="color:${color};text-decoration:underline;">${safeLink}</a></p>
      </td></tr>
      <tr><td style="padding:0 32px 24px;font-family:Arial,sans-serif;color:#94a3b8;font-size:12px;line-height:1.5;">
        Vous pouvez sauvegarder ce lien dans votre agenda dès maintenant. Le chat ouvrira automatiquement le jour J.
      </td></tr>
      ${footerHtml}
    </table>
  </td></tr>
</table>
</body></html>`;
}
