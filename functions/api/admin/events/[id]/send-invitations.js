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
  const lines = [
    greeting,
    '',
    `Vous êtes invité(e) à participer au chat live de l'événement « ${event.title} »` + (orgLine ? `, ${orgLine}` : '') + '.',
    '',
    '— DÉTAILS DE L\'ÉVÉNEMENT —',
    dateLabel ? `Date    : ${dateLabel}` : '',
    event.access_mode === 'private'
      ? 'Accès   : Lien personnel (ne pas partager)'
      : 'Accès   : Lien public',
    '',
    'Pour rejoindre le chat live :',
    link,
    '',
    'Vous pouvez sauvegarder ce lien dans votre agenda dès maintenant.',
    'Le chat ouvrira automatiquement le jour J.',
    '',
    whiteLabel
      ? ''
      : '---',
    whiteLabel
      ? ''
      : 'Propulsé par Nomacast — live streaming corporate',
    whiteLabel
      ? ''
      : 'https://nomacast.fr'
  ];
  return lines.filter(line => line !== null && line !== undefined).join('\n');
}

function buildHtml({ greeting, event, link, dateLabel, orgLine, color, whiteLabel }) {
  const safeTitle = escapeHtml(event.title);
  const safeOrg = orgLine ? escapeHtml(orgLine) : '';
  const safeGreeting = escapeHtml(greeting);
  const safeDate = escapeHtml(dateLabel);
  const safeLink = escapeHtml(link);
  const accessLabel = event.access_mode === 'private'
    ? 'Lien personnel'
    : 'Lien public';

  const footerHtml = whiteLabel
    ? ''
    : `<tr><td style="padding:24px 32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#94a3b8;border-top:1px solid #eef2f6;background:#fafbfc;">
         <div style="margin-bottom:4px;color:#475569;font-size:13px;">
           <strong style="color:#0f172a;font-size:14px;letter-spacing:0.02em;">Nomacast</strong>
           &middot; live streaming corporate
         </div>
         <a href="${SITE_URL}" style="color:#94a3b8;text-decoration:none;">nomacast.fr</a>
         &nbsp;&middot;&nbsp;
         <a href="mailto:${REPLY_TO}" style="color:#94a3b8;text-decoration:none;">${REPLY_TO}</a>
       </td></tr>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;">
<!-- Préheader (texte d'aperçu masqué) -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
  Vous êtes invité(e) au chat live ${safeTitle}.${safeDate ? ' ' + safeDate : ''}
</div>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f6fa;padding:40px 0;">
  <tr><td align="center">

    <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(15,23,42,0.08);">

      <!-- HERO -->
      <tr>
        <td style="background:${color};padding:34px 36px 28px;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#ffffff;opacity:0.85;margin-bottom:10px;">
            Invitation chat live
          </div>
          <h1 style="margin:0;font-size:24px;font-weight:700;line-height:1.3;color:#ffffff;">
            ${safeTitle}
          </h1>
          ${safeOrg ? `<div style="margin-top:8px;font-size:14px;color:#ffffff;opacity:0.9;">${safeOrg}</div>` : ''}
        </td>
      </tr>

      <!-- GREETING + INTRO -->
      <tr>
        <td style="padding:32px 36px 8px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:15px;line-height:1.65;">
          <p style="margin:0 0 14px;font-size:16px;">${safeGreeting}</p>
          <p style="margin:0 0 8px;color:#334155;">
            Vous êtes invité(e) à participer au chat live de l'événement.
            Posez vos questions à l'oral, votez en temps réel, et interagissez avec les intervenants depuis votre navigateur — aucune installation nécessaire.
          </p>
        </td>
      </tr>

      <!-- DETAILS BOX -->
      <tr>
        <td style="padding:18px 36px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f7f9fc;border:1px solid #e6ecf3;border-radius:10px;">
            <tr>
              ${safeDate ? `<td style="padding:18px 22px;font-family:Arial,Helvetica,sans-serif;border-right:1px solid #e6ecf3;width:60%;">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">Date</div>
                <div style="font-size:14px;color:#0f172a;font-weight:600;line-height:1.4;">${safeDate}</div>
              </td>` : ''}
              <td style="padding:18px 22px;font-family:Arial,Helvetica,sans-serif;${safeDate ? '' : 'width:100%;'}">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">Accès</div>
                <div style="font-size:14px;color:#0f172a;font-weight:600;line-height:1.4;">${accessLabel}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- CTA -->
      <tr>
        <td align="center" style="padding:24px 36px 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td style="border-radius:10px;background:${color};box-shadow:0 4px 12px ${color}33;">
              <a href="${safeLink}" style="display:inline-block;padding:15px 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:0.01em;">
                Rejoindre le chat live →
              </a>
            </td></tr>
          </table>
        </td>
      </tr>

      <!-- FALLBACK LINK -->
      <tr>
        <td style="padding:14px 36px 22px;font-family:Arial,Helvetica,sans-serif;color:#64748b;font-size:12px;line-height:1.6;text-align:center;">
          Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
          <a href="${safeLink}" style="color:${color};text-decoration:underline;word-break:break-all;">${safeLink}</a>
        </td>
      </tr>

      <!-- AGENDA TIP -->
      <tr>
        <td style="padding:0 36px 28px;">
          <div style="border-top:1px dashed #e6ecf3;padding-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;line-height:1.6;">
            <strong style="color:#0f172a;">Astuce&nbsp;:</strong>
            sauvegardez ce lien dans votre agenda dès maintenant. Le chat ouvrira automatiquement le jour J.
            ${event.access_mode === 'private' ? '<br><span style="color:#94a3b8;">Ce lien est personnel — merci de ne pas le partager.</span>' : ''}
          </div>
        </td>
      </tr>

      ${footerHtml}

    </table>

  </td></tr>
</table>
</body></html>`;
}
