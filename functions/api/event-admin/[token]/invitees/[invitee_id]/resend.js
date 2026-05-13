// functions/api/event-admin/[token]/invitees/[invitee_id]/resend.js
// POST /api/event-admin/:token/invitees/:invitee_id/resend
// Renvoie l'email d'invitation — version CLIENT (auth par HMAC token).
//
// NOTE : helper buildInvitationEmail() dupliqué (pas d'import croisé) car
// Cloudflare Pages Functions résout mal les imports traversant des brackets.

export const onRequestPost = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB manquant' }, 500);
  if (!env.RESEND_API_KEY) return jsonResponse({ error: 'RESEND_API_KEY non configurée' }, 500);
  if (!env.ADMIN_PASSWORD) return jsonResponse({ error: 'ADMIN_PASSWORD non configuré' }, 500);

  // Résolution token → event_id via HMAC
  const event_id = await resolveEventIdByToken(params.token, env);
  if (!event_id) return jsonResponse({ error: 'Token invalide' }, 403);

  const row = await env.DB.prepare(`
    SELECT
      e.id AS e_id, e.slug, e.title, e.client_name, e.scheduled_at, e.duration_minutes,
      e.primary_color, e.logo_url, e.white_label, e.access_mode,
      i.id AS i_id, i.email, i.full_name, i.company, i.magic_token, i.invited_at
    FROM invitees i
    JOIN events e ON i.event_id = e.id
    WHERE i.id = ? AND e.id = ?
  `).bind(params.invitee_id, event_id).first();

  if (!row) return jsonResponse({ error: 'Invité introuvable pour cet event' }, 404);

  const event = {
    id: row.e_id, slug: row.slug, title: row.title, client_name: row.client_name,
    scheduled_at: row.scheduled_at, duration_minutes: row.duration_minutes,
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
  // URL opaque basée sur token : valable pour tous les invités (public OU privé).
  // Pas de leak du slug, tracking last_seen_at, URL personnelle par invité.
  const link = `${SITE_URL}/i/${invitee.magic_token}`;
  const dateLabel = formatFrenchDateTime(event.scheduled_at);
  const orgLine = event.client_name ? `organisé par ${event.client_name}` : '';
  const subject = `Invitation : ${event.title}`;
  const agendaUrls = buildAgendaUrls(event, link, invitee.magic_token);
  const text = buildText({ greeting, event, link, dateLabel, orgLine, whiteLabel: event.white_label, agendaUrls });
  const html = buildHtml({ greeting, event, link, dateLabel, orgLine, color: event.primary_color || '#5A98D6', whiteLabel: event.white_label, agendaUrls });
  return { from: FROM, to: [invitee.email], reply_to: REPLY_TO, subject, html, text };
}

// ============================================================
// Helpers Agenda
// ============================================================
function buildAgendaUrls(event, chatLink, token) {
  const start = event.scheduled_at ? toCalDate(event.scheduled_at) : '';
  const end = event.scheduled_at ? toCalDate(addMinutes(event.scheduled_at, event.duration_minutes || 90)) : '';
  const details = `Chat live de l'événement « ${event.title} »` +
    (event.client_name ? `, organisé par ${event.client_name}.` : '.') +
    `\n\nPour rejoindre : ${chatLink}\n\nPropulsé par Nomacast — https://nomacast.fr`;

  // Google Calendar TEMPLATE
  const googleParams = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    details: details,
    location: chatLink,
    sf: 'true',
    output: 'xml'
  });
  if (start && end) googleParams.set('dates', `${start}/${end}`);
  const google = 'https://calendar.google.com/calendar/render?' + googleParams.toString();

  // Outlook Live deeplink
  const outlookParams = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    body: details,
    location: chatLink
  });
  if (event.scheduled_at) {
    outlookParams.set('startdt', event.scheduled_at);
    outlookParams.set('enddt', addMinutes(event.scheduled_at, event.duration_minutes || 90));
  }
  const outlook = 'https://outlook.live.com/calendar/0/deeplink/compose?' + outlookParams.toString();

  // .ics opaque (via token, plus de slug exposé)
  const ics = `${SITE_URL}/i/${token}/calendar.ics`;

  return { google, outlook, ics };
}

function toCalDate(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function addMinutes(iso, mins) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + (mins || 0));
  return d.toISOString();
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

function buildText({ greeting, event, link, dateLabel, orgLine, whiteLabel, agendaUrls }) {
  const lines = [
    greeting,
    '',
    `Vous êtes invité(e) à participer au chat live de l'événement « ${event.title} »` + (orgLine ? `, ${orgLine}` : '') + '.',
    '',
    'DÉTAILS DE L\'ÉVÉNEMENT',
    dateLabel ? `Date    : ${dateLabel}` : '',
    event.access_mode === 'private'
      ? 'Accès   : Lien personnel (ne pas partager)'
      : 'Accès   : Lien public',
    '',
    'Pour rejoindre le chat live :',
    link,
    '',
    'AJOUTER À MON AGENDA',
    `Google  : ${agendaUrls.google}`,
    `Outlook : ${agendaUrls.outlook}`,
    `Apple / autre : ${agendaUrls.ics}`,
    '',
    'Le chat ouvrira automatiquement le jour J.',
    ''
  ];
  if (!whiteLabel) {
    lines.push('Nomacast — La qualité agence. Un seul interlocuteur.');
    lines.push('https://www.nomacast.fr · evenement@nomacast.fr');
  }
  return lines.filter(line => line !== null && line !== undefined).join('\n');
}

function buildHtml({ greeting, event, link, dateLabel, orgLine, color, whiteLabel, agendaUrls }) {
  const safeTitle = escapeHtml(event.title);
  const safeOrg = orgLine ? escapeHtml(orgLine) : '';
  const safeGreeting = escapeHtml(greeting);
  const safeDate = escapeHtml(dateLabel);
  const safeLink = escapeHtml(link);
  const accessLabel = event.access_mode === 'private'
    ? 'Lien personnel'
    : 'Lien public';

  // ===== HEADER BAR (logo) =====
  const hasEventLogo = !!event.logo_url;
  let headerBarHtml;
  if (hasEventLogo) {
    headerBarHtml = `<tr><td style="padding:22px 36px;background:#ffffff;border-bottom:1px solid #eef2f6;">
      <img src="${escapeHtml(event.logo_url)}" alt="${escapeHtml(event.client_name || event.title)}" height="36" style="display:block;max-height:40px;width:auto;border:0;outline:none;">
    </td></tr>`;
  } else if (!whiteLabel) {
    headerBarHtml = `<tr><td style="padding:22px 36px;background:#ffffff;border-bottom:1px solid #eef2f6;">
      <a href="https://www.nomacast.fr/" target="_blank" style="text-decoration:none;display:inline-block;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;line-height:1;white-space:nowrap;">
          <span style="color:#5D9CEC;">&bull;</span><span style="color:#0f172a;">&nbsp;Nomacast</span>
        </div>
      </a>
    </td></tr>`;
  } else {
    headerBarHtml = '';
  }

  // ===== FOOTER =====
  const footerHtml = whiteLabel
    ? ''
    : `<tr><td style="padding:36px 36px 38px;background:#fafbfc;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;text-align:center;">
         <a href="https://www.nomacast.fr/" target="_blank" style="text-decoration:none;display:inline-block;">
           <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;line-height:1;white-space:nowrap;">
             <span style="color:#5D9CEC;">&bull;</span><span style="color:#0f172a;">&nbsp;Nomacast</span>
           </div>
         </a>
         <div style="margin:10px 0 0;color:#475569;font-size:13px;font-style:italic;">
           La qualité agence. Un seul interlocuteur.
         </div>
         <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto;">
           <tr>
             <td width="6" height="2" style="background:#cbd5e1;font-size:0;line-height:0;">&nbsp;</td>
             <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
             <td width="6" height="2" style="background:#cbd5e1;font-size:0;line-height:0;">&nbsp;</td>
             <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
             <td width="6" height="2" style="background:#cbd5e1;font-size:0;line-height:0;">&nbsp;</td>
           </tr>
         </table>
         <div style="color:#64748b;font-size:13px;line-height:1.6;margin:0 0 18px;">
           Live streaming corporate à Paris,<br>
           en France et en Europe.
         </div>
         <div style="color:#94a3b8;font-size:12px;line-height:1.6;">
           <a href="https://www.nomacast.fr" target="_blank" style="color:#334155;text-decoration:none;font-weight:600;">www.nomacast.fr</a>
           <span style="color:#cbd5e1;">&nbsp;·&nbsp;</span>
           <a href="mailto:${REPLY_TO}" style="color:#334155;text-decoration:none;font-weight:600;">${REPLY_TO}</a>
         </div>
       </td></tr>`;

  // ===== AGENDA BUTTONS =====
  const agendaBlock = `<tr>
    <td style="padding:0 36px 24px;text-align:center;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;margin-bottom:12px;">
        Ajouter à mon agenda
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
        <tr>
          <td style="padding:0 4px;">
            <a href="${escapeHtml(agendaUrls.google)}" target="_blank" style="display:inline-block;padding:9px 14px;font-size:12px;font-weight:600;color:#0f172a;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:7px;text-decoration:none;">
              Google Agenda
            </a>
          </td>
          <td style="padding:0 4px;">
            <a href="${escapeHtml(agendaUrls.outlook)}" target="_blank" style="display:inline-block;padding:9px 14px;font-size:12px;font-weight:600;color:#0f172a;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:7px;text-decoration:none;">
              Outlook
            </a>
          </td>
          <td style="padding:0 4px;">
            <a href="${escapeHtml(agendaUrls.ics)}" style="display:inline-block;padding:9px 14px;font-size:12px;font-weight:600;color:#0f172a;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:7px;text-decoration:none;">
              Apple / iCal
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

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

      ${headerBarHtml}

      <!-- HERO -->
      <tr>
        <td style="background:${color};padding:32px 36px 28px;font-family:Arial,Helvetica,sans-serif;">
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

      ${agendaBlock}

      <!-- AGENDA TIP -->
      <tr>
        <td style="padding:0 36px 30px;">
          <div style="border-top:1px dashed #e6ecf3;padding-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;line-height:1.6;">
            Le chat ouvrira automatiquement le jour J.${event.access_mode === 'private' ? '<br><span style="color:#94a3b8;">Ce lien est personnel — merci de ne pas le partager.</span>' : ''}
          </div>
        </td>
      </tr>

      ${footerHtml}

    </table>

  </td></tr>
</table>
</body></html>`;
}
