// functions/api/admin/events/[id]/invitees/[invitee_id]/resend.js
// POST /api/admin/events/:id/invitees/:invitee_id/resend
// Renvoie l'email d'invitation à un invité spécifique via Resend.
//
// NOTE : helper buildInvitationEmail() dupliqué ici (pas d'import croisé)
// car Cloudflare Pages Functions résout mal les imports relatifs traversant
// des dossiers avec brackets (`[id]`, `[invitee_id]`).
// Source de référence : /functions/api/admin/_invitation-email.js

export const onRequestPost = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB manquant' }, 500);
  if (!env.RESEND_API_KEY) return jsonResponse({ error: 'RESEND_API_KEY non configurée' }, 500);

  const row = await env.DB.prepare(`
    SELECT
      e.id AS e_id, e.slug, e.title, e.client_name, e.scheduled_at,
      e.primary_color, e.white_label, e.access_mode,
      i.id AS i_id, i.email, i.full_name, i.company, i.magic_token, i.invited_at
    FROM invitees i
    JOIN events e ON i.event_id = e.id
    WHERE i.id = ? AND e.id = ?
  `).bind(params.invitee_id, params.id).first();

  if (!row) return jsonResponse({ error: 'Invité introuvable pour cet event' }, 404);

  const event = {
    id: row.e_id, slug: row.slug, title: row.title, client_name: row.client_name,
    scheduled_at: row.scheduled_at, primary_color: row.primary_color,
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
