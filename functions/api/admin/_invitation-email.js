// functions/api/admin/_invitation-email.js
// Helper pour construire un email d'invitation (HTML + texte) Resend-ready.
// Le préfixe _ exclut ce fichier des routes Cloudflare Pages.

const DOMAIN = 'nomacast.fr';
const SITE_URL = 'https://nomacast.fr';
const FROM = `Nomacast <noreply@${DOMAIN}>`;
const REPLY_TO = `evenement@${DOMAIN}`;

/**
 * Construit le payload Resend pour un invité d'un event.
 *
 * @param {object} event   Row event hydratée (deserializeEvent)
 * @param {object} invitee Row invitee {email, full_name, company, magic_token, ...}
 * @returns {object}       Payload {from, to, reply_to, subject, html, text}
 */
export function buildInvitationEmail(event, invitee) {
  const firstName = extractFirstName(invitee.full_name);
  const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';

  // Si event public : lien partageable sans token. Sinon magic link avec token.
  const chatPath = `/chat/${event.slug}`;
  const link = event.access_mode === 'private'
    ? `${SITE_URL}${chatPath}?t=${invitee.magic_token}`
    : `${SITE_URL}${chatPath}`;

  const dateLabel = formatFrenchDateTime(event.scheduled_at);
  const orgLine = event.client_name
    ? `organisé par ${event.client_name}`
    : '';

  const subject = `Invitation : ${event.title}`;

  const text = buildText({ greeting, event, link, dateLabel, orgLine, whiteLabel: event.white_label });
  const html = buildHtml({ greeting, event, link, dateLabel, orgLine, color: event.primary_color || '#5A98D6', whiteLabel: event.white_label });

  return {
    from: FROM,
    to: [invitee.email],
    reply_to: REPLY_TO,
    subject,
    html,
    text
  };
}

// ============================================================
// Helpers
// ============================================================

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
  const dayName = days[d.getUTCDay()];
  const day = d.getUTCDate();
  const month = months[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hour = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dayName} ${day} ${month} ${year} à ${hour}h${min} (UTC)`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildText({ greeting, event, link, dateLabel, orgLine, whiteLabel }) {
  return [
    greeting,
    '',
    `Vous êtes invité(e) au chat live de l'événement : « ${event.title} »` + (orgLine ? `, ${orgLine}` : '') + '.',
    '',
    dateLabel ? `Date : ${dateLabel}` : '',
    '',
    'Pour rejoindre le chat live le jour J :',
    link,
    '',
    'Vous pouvez sauvegarder ce lien dans votre agenda dès maintenant.',
    '',
    whiteLabel
      ? '—'
      : '—\nPropulsé par Nomacast · live streaming corporate\nhttps://nomacast.fr'
  ].filter(line => line !== null).join('\n');
}

function buildHtml({ greeting, event, link, dateLabel, orgLine, color, whiteLabel }) {
  // Email HTML simple, table-based pour compat clients (Outlook, Apple Mail, Gmail).
  // Pas d'images externes pour éviter les blocages anti-images.
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
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9;padding:32px 0;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">

      <tr>
        <td style="background:${color};padding:24px 32px;color:#ffffff;font-family:Arial,sans-serif;">
          <div style="font-size:13px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;opacity:0.85;">Invitation chat live</div>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;line-height:1.3;">${safeTitle}</h1>
        </td>
      </tr>

      <tr>
        <td style="padding:28px 32px 8px;font-family:Arial,sans-serif;color:#0f172a;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 14px;">${safeGreeting}</p>
          <p style="margin:0 0 14px;">Vous êtes invité(e) à participer au chat live de l'événement <strong>${safeTitle}</strong>${safeOrg ? ', ' + safeOrg : ''}.</p>
          ${safeDate ? `<p style="margin:0 0 14px;color:#475569;font-size:14px;"><strong>Date</strong> : ${safeDate}</p>` : ''}
        </td>
      </tr>

      <tr>
        <td align="center" style="padding:16px 32px 28px;">
          <a href="${safeLink}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-family:Arial,sans-serif;font-size:15px;font-weight:600;">
            Rejoindre le chat live →
          </a>
        </td>
      </tr>

      <tr>
        <td style="padding:0 32px 24px;font-family:Arial,sans-serif;color:#475569;font-size:13px;line-height:1.6;">
          <p style="margin:0 0 8px;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :</p>
          <p style="margin:0;word-break:break-all;"><a href="${safeLink}" style="color:${color};text-decoration:underline;">${safeLink}</a></p>
        </td>
      </tr>

      <tr>
        <td style="padding:0 32px 24px;font-family:Arial,sans-serif;color:#94a3b8;font-size:12px;line-height:1.5;">
          Vous pouvez sauvegarder ce lien dans votre agenda dès maintenant. Le chat ouvrira automatiquement le jour J.
        </td>
      </tr>

      ${footerHtml}

    </table>
  </td></tr>
</table>
</body>
</html>`;
}
