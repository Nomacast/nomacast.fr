/**
 * Cloudflare Pages Function · /functions/chat-interactif.js
 *
 * Endpoint POST pour le configurateur Chat interactif Nomacast
 * URL appelée : POST https://nomacast.fr/chat-interactif
 *   (le GET sur la même URL sert la page HTML statique sans conflit, Cloudflare
 *   route les POST vers cette function via onRequestPost)
 *
 * Pipeline :
 *   1. Parse du body JSON
 *   2. Validation des données serveur (durée, audience, email)
 *   3. Vérification du token Turnstile via TURNSTILE_SECRET_KEY
 *   4. Génération d'un identifiant unique NMC-CHAT-YYYY-XXXXXX
 *   5. Envoi email récap interne à evenement@nomacast.fr (bloquant)
 *   6. Envoi email confirmation au prospect (non-bloquant)
 *   7. Réponse JSON { success: true, id }
 *
 * Variables d'env Cloudflare Pages attendues :
 *   - RESEND_API_KEY        (clé API Resend, déjà configurée)
 *   - TURNSTILE_SECRET_KEY  (secret Turnstile, déjà configurée)
 *
 * Email FROM obligatoirement noreply@nomacast.fr (testé 11/05/2026,
 * tout autre sous-domaine casse Resend → erreur ?error=send).
 */

const DOMAINE = 'nomacast.fr';
const FROM_EMAIL = `Formulaire Chat Nomacast <noreply@${DOMAINE}>`;
const TO_INTERNE = `evenement@${DOMAINE}`;
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RESEND_URL = 'https://api.resend.com/emails';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mapping des valeurs internes vers libellés humains pour les emails
const ACCESS_MODE_LABELS = {
  'liens-nominatifs': "Liens d'accès nominatifs",
  'login': 'Accès par login utilisateur'
};

const MODE_LABELS = {
  'qa': 'Q&A modéré',
  'chat-libre': 'Chat libre modéré',
  'sondages': 'Sondages live',
  'reactions': 'Réactions rapides',
  'nuage-mots': 'Nuage de mots-clés',
  'quiz': 'Quiz interactif',
  'lecture-seule': 'Lecture seule',
  'subtitles': 'Sous-titrage en direct (+200 €)'
};

// ============================================================
// UTILS
// ============================================================
function generateId() {
  const year = new Date().getFullYear();
  // 6 chars alphanumériques uppercase, ~2 milliards de combinaisons
  const part = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X');
  return `NMC-CHAT-${year}-${part}`;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  try { return new Intl.NumberFormat('fr-FR').format(n); }
  catch (e) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
}

// ============================================================
// VALIDATION
// ============================================================
function validateData(data) {
  if (!data || typeof data !== 'object') return 'Données invalides.';

  const duration = parseFloat(data.duration);
  if (!duration || isNaN(duration) || duration <= 0) return 'Durée invalide.';

  const audience = parseInt(data.audience, 10);
  if (!audience || isNaN(audience) || audience <= 0) return 'Audience invalide.';

  if (!data.email || typeof data.email !== 'string' || !EMAIL_REGEX.test(data.email)) {
    return "Adresse email invalide.";
  }

  return null;
}

// ============================================================
// TURNSTILE
// ============================================================
async function verifyTurnstile(token, secret, remoteIp) {
  if (!token || !secret) return false;
  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);
  if (remoteIp) formData.append('remoteip', remoteIp);

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: formData
    });
    const result = await response.json();
    return result.success === true;
  } catch (e) {
    console.error('[Nomacast Chat] Turnstile verification error:', e);
    return false;
  }
}

// ============================================================
// RESEND
// ============================================================
async function sendEmail(apiKey, payload) {
  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error('[Nomacast Chat] Resend send failed:', response.status, errText);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[Nomacast Chat] Resend error:', e);
    return false;
  }
}

// ============================================================
// TEMPLATES EMAIL
// ============================================================
function buildInternalEmail(id, data) {
  const dt = new Date().toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Paris'
  });

  const modes = (data.modes || []).map(m => MODE_LABELS[m] || m).join(', ') || 'Aucun mode sélectionné';
  const accessMode = ACCESS_MODE_LABELS[data.access_mode] || data.access_mode || '—';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #0b1929; max-width: 640px; margin: 0 auto; padding: 24px; line-height: 1.5; background: #f3f6fa;">
  <div style="background: #5A98D6; color: #fff; padding: 22px 26px; border-radius: 10px 10px 0 0;">
    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; opacity: 0.9; font-weight: 600;">Nomacast · Demande Chat interactif</div>
    <div style="font-size: 22px; font-weight: 700; margin-top: 8px; letter-spacing: 0.02em;">${id}</div>
    <div style="font-size: 12px; opacity: 0.82; margin-top: 4px;">${dt}</div>
  </div>

  <div style="background: #fff; border: 1px solid #e1e4e8; border-top: none; padding: 26px; border-radius: 0 0 10px 10px;">

    <div style="background: #EAF2FA; padding: 16px 20px; border-radius: 8px; margin-bottom: 22px; text-align: center;">
      <div style="font-size: 10px; color: #5A98D6; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700;">Sous-total estimé</div>
      <div style="font-size: 26px; font-weight: 700; color: #0b1929; margin-top: 4px; letter-spacing: -0.01em;">${formatPrice(data.estimated_price)} € HT</div>
    </div>

    <h2 style="font-size: 14px; color: #5A98D6; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700;">Prospect</h2>
    <table style="width: 100%; font-size: 14px; border-collapse: collapse; margin-bottom: 22px;">
      <tr><td style="padding: 6px 0; color: #5a6b7a; width: 140px;">Email</td><td style="padding: 6px 0;"><a href="mailto:${escapeHtml(data.email)}" style="color: #5A98D6;">${escapeHtml(data.email)}</a></td></tr>
      ${data.phone ? `<tr><td style="padding: 6px 0; color: #5a6b7a;">Téléphone</td><td style="padding: 6px 0;"><a href="tel:${escapeHtml(data.phone)}" style="color: #5A98D6;">${escapeHtml(data.phone)}</a></td></tr>` : ''}
      ${data.company ? `<tr><td style="padding: 6px 0; color: #5a6b7a;">Société</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(data.company)}</td></tr>` : ''}
      ${data.event_date ? `<tr><td style="padding: 6px 0; color: #5a6b7a;">Date événement</td><td style="padding: 6px 0;">${escapeHtml(data.event_date)}</td></tr>` : ''}
    </table>

    <h2 style="font-size: 14px; color: #5A98D6; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700;">Configuration</h2>
    <table style="width: 100%; font-size: 14px; border-collapse: collapse; margin-bottom: 22px;">
      <tr><td style="padding: 6px 0; color: #5a6b7a; width: 160px;">Durée</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(String(data.duration))} h</td></tr>
      <tr><td style="padding: 6px 0; color: #5a6b7a;">Audience</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(String(data.audience))} participants</td></tr>
      <tr><td style="padding: 6px 0; color: #5a6b7a; vertical-align: top;">Modes d'interaction</td><td style="padding: 6px 0;">${escapeHtml(modes)}</td></tr>
      <tr><td style="padding: 6px 0; color: #5a6b7a;">Mode d'accès</td><td style="padding: 6px 0;">${escapeHtml(accessMode)}</td></tr>
      <tr><td style="padding: 6px 0; color: #5a6b7a;">Couleur principale</td><td style="padding: 6px 0;"><span style="display: inline-block; width: 14px; height: 14px; background: ${escapeHtml(data.color || '#5A98D6')}; border-radius: 3px; vertical-align: middle; margin-right: 6px; border: 1px solid #e1e4e8;"></span>${escapeHtml(data.color || '—')}</td></tr>
      <tr><td style="padding: 6px 0; color: #5a6b7a;">Marque blanche</td><td style="padding: 6px 0;">${data.white_label ? '✓ Activée <span style="color: #95a3b3;">(+150 €)</span>' : 'Non'}</td></tr>
      <tr><td style="padding: 6px 0; color: #5a6b7a;">Sous-titrage live</td><td style="padding: 6px 0;">${data.subtitles ? '✓ Activé <span style="color: #95a3b3;">(+200 €)</span>' : 'Non'}</td></tr>
      <tr><td style="padding: 6px 0; color: #5a6b7a; vertical-align: top;">Logo</td><td style="padding: 6px 0;">${data.logo_filename
        ? `Joint : <strong>${escapeHtml(data.logo_filename)}</strong><br><span style="font-size: 12px; color: #95a3b3;">⚠️ À demander au prospect par retour de mail (pas encore stocké sur le serveur)</span>`
        : 'Aucun logo téléversé'}</td></tr>
    </table>

    <div style="text-align: center; margin-top: 20px;">
      <a href="mailto:${escapeHtml(data.email)}?subject=Re%3A%20Votre%20demande%20Chat%20interactif%20${id}" style="display: inline-block; background: #5A98D6; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Répondre au prospect</a>
    </div>

    <p style="font-size: 12px; color: #95a3b3; text-align: center; margin: 20px 0 0;">
      ID interne : <strong>${id}</strong>
    </p>
  </div>
</body></html>`;
}

function buildProspectEmail(id, data) {
  const modes = (data.modes || []).map(m => MODE_LABELS[m] || m).join(' · ') || 'Aucun';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #0b1929; max-width: 600px; margin: 0 auto; padding: 24px; line-height: 1.6; background: #f3f6fa;">
  <div style="background: #0b1929; color: #fff; padding: 28px 26px; border-radius: 10px 10px 0 0;">
    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: #5A98D6; font-weight: 700;">Nomacast</div>
    <h1 style="margin: 12px 0 0; font-size: 22px; font-weight: 600; letter-spacing: -0.01em;">Bien reçu, on revient vers vous sous 24 heures.</h1>
  </div>

  <div style="background: #fff; border: 1px solid #e1e4e8; border-top: none; padding: 26px; border-radius: 0 0 10px 10px;">
    <p style="margin: 0 0 14px;">Bonjour,</p>
    <p style="margin: 0 0 14px;">Nous avons bien reçu votre demande de configuration <strong>Chat interactif</strong>. Notre équipe l'étudie et reviendra vers vous sous <strong>24 heures ouvrées</strong> avec un devis détaillé adapté à votre événement.</p>

    <div style="background: #f3f6fa; padding: 14px 18px; border-radius: 8px; margin: 22px 0;">
      <div style="font-size: 10px; color: #5a6b7a; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700;">Référence à conserver</div>
      <div style="font-size: 18px; font-weight: 700; color: #0b1929; margin-top: 3px; letter-spacing: 0.02em;">${id}</div>
    </div>

    <h2 style="font-size: 13px; color: #5A98D6; margin: 22px 0 12px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700;">Récapitulatif</h2>
    <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
      <tr><td style="padding: 5px 0; color: #5a6b7a; width: 140px;">Durée</td><td style="padding: 5px 0;">${escapeHtml(String(data.duration))} h</td></tr>
      <tr><td style="padding: 5px 0; color: #5a6b7a;">Audience</td><td style="padding: 5px 0;">${escapeHtml(String(data.audience))} participants</td></tr>
      <tr><td style="padding: 5px 0; color: #5a6b7a; vertical-align: top;">Modes</td><td style="padding: 5px 0;">${escapeHtml(modes)}</td></tr>
      ${data.white_label ? '<tr><td style="padding: 5px 0; color: #5a6b7a;">Marque blanche</td><td style="padding: 5px 0;">✓ Activée</td></tr>' : ''}
      ${data.subtitles ? '<tr><td style="padding: 5px 0; color: #5a6b7a;">Sous-titrage</td><td style="padding: 5px 0;">✓ Activé</td></tr>' : ''}
    </table>

    <div style="background: rgba(90,152,214,.08); padding: 14px 18px; border-radius: 8px; margin: 22px 0; border-left: 3px solid #5A98D6;">
      <div style="font-size: 10px; color: #5A98D6; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700;">Sous-total estimé</div>
      <div style="font-size: 22px; font-weight: 700; color: #0b1929; margin-top: 3px; letter-spacing: -0.01em;">${formatPrice(data.estimated_price)} € HT</div>
      <div style="font-size: 12px; color: #5a6b7a; margin-top: 4px;">Tarif plancher en complément de votre prestation de captation. Devis final ajusté sous 24 h.</div>
    </div>

    <p style="margin: 18px 0;">Si vous souhaitez nous donner plus de précisions ou nous transmettre votre logo pour la personnalisation, n'hésitez pas à répondre directement à cet email.</p>

    <p style="margin: 26px 0 4px;">À très vite,</p>
    <p style="font-weight: 600; margin: 0;">L'équipe Nomacast</p>

    <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e1e4e8; font-size: 12px; color: #95a3b3; text-align: center;">
      <a href="https://nomacast.fr" style="color: #5A98D6; text-decoration: none;">nomacast.fr</a>
      &nbsp;·&nbsp;
      <a href="mailto:evenement@nomacast.fr" style="color: #5A98D6; text-decoration: none;">evenement@nomacast.fr</a>
    </div>
  </div>
</body></html>`;
}

// ============================================================
// HANDLER
// ============================================================
export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Parse JSON
  let data;
  try {
    data = await request.json();
  } catch (e) {
    return jsonResponse({ success: false, error: 'Format de données invalide.' }, 400);
  }

  // 2. Validation serveur
  const validationError = validateData(data);
  if (validationError) {
    return jsonResponse({ success: false, error: validationError }, 400);
  }

  // 3. Turnstile
  const turnstileToken = data.turnstile_token;
  const remoteIp = request.headers.get('CF-Connecting-IP');
  const turnstileOK = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, remoteIp);

  if (!turnstileOK) {
    return jsonResponse({ success: false, error: 'Vérification anti-bot échouée. Merci de recharger la page.' }, 403);
  }

  // 4. Génération ID
  const id = generateId();

  // 5. Email interne (bloquant : on a besoin de l'envoyer pour valider la soumission)
  const internalSent = await sendEmail(env.RESEND_API_KEY, {
    from: FROM_EMAIL,
    to: [TO_INTERNE],
    reply_to: data.email,
    subject: `[Chat interactif] ${id} · ${data.company || data.email}`,
    html: buildInternalEmail(id, data)
  });

  if (!internalSent) {
    return jsonResponse({ success: false, error: "Erreur d'envoi temporaire. Merci de réessayer dans un instant." }, 500);
  }

  // 6. Email confirmation prospect (non-bloquant : on log l'erreur mais on retourne quand même un succès)
  sendEmail(env.RESEND_API_KEY, {
    from: FROM_EMAIL,
    to: [data.email],
    reply_to: TO_INTERNE,
    subject: `Votre demande Chat interactif · ${id}`,
    html: buildProspectEmail(id, data)
  }).then(ok => {
    if (!ok) console.error('[Nomacast Chat] Prospect confirmation email failed for', id);
  }).catch(e => {
    console.error('[Nomacast Chat] Prospect confirmation email error:', e);
  });

  // 7. Réponse
  return jsonResponse({ success: true, id });
}
