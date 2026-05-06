// ─────────────────────────────────────────────────────────────────────────────
// NOMACAST — Cloudflare Pages Function
// Endpoint : /envoyer.php (matche functions/envoyer.php.js)
// Port JS de envoyer.php : Turnstile + Honeypot + Origin + Anti-spam
// Anti-flood via Cloudflare KV (binding RATE_LIMIT)
// Envoi des emails via Resend API
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = ['https://www.nomacast.fr', 'https://nomacast.fr'];
const PAGE_MERCI      = 'https://nomacast.fr/merci.html';
const PAGE_ERREUR     = 'https://nomacast.fr/index.html#contact';
const DOMAINE         = 'nomacast.fr';

const COPIE_ARCHIVAGE = 'jerome.bouquillon@ik.me';
const EMAIL_GENERAL   = 'evenement@nomacast.fr';
const EMAIL_AGENCES   = 'agences@nomacast.fr';

const SPAM_WORDS = [
  'crypto', 'bitcoin', 'forex', 'casino', 'viagra', 'loan',
  'seo services', 'rank your website', 'guest post', 'backlink',
  'cheap nfl', 'replica watches', 'cialis', 'pharmacy',
  'web design services', 'increase your ranking',
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers 
// ─────────────────────────────────────────────────────────────────────────────

function redirect(url) {
  return new Response(null, {
    status: 302,
    headers: { Location: url, 'Cache-Control': 'no-store' },
  });
}

// Équivalent htmlspecialchars + strip_tags + trim
function clean(value) {
  return String(value ?? '')
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isValidEmail(email) {
  if (typeof email !== 'string' || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET → refuse, redirige vers homepage (équivalent du REQUEST_METHOD check)
// ─────────────────────────────────────────────────────────────────────────────

export async function onRequestGet() {
  return redirect('https://nomacast.fr/');
}

// ─────────────────────────────────────────────────────────────────────────────
// POST → traitement formulaire
// ─────────────────────────────────────────────────────────────────────────────

export async function onRequestPost(context) {
  const { request, env } = context;

  // Parse form-data (le browser POST en application/x-www-form-urlencoded ou multipart)
  let formData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error('[Nomacast] formData parse error:', err);
    return redirect(PAGE_ERREUR + '?error=invalid');
  }

  // ── 1. HONEYPOT ───────────────────────────────────────────────────────────
  if (formData.get('website')) {
    // Bot a rempli le champ caché : on simule un succès pour ne rien révéler
    return redirect(PAGE_MERCI);
  }

  // ── 2. ORIGIN CHECK ───────────────────────────────────────────────────────
  const origin = request.headers.get('referer') || '';
  const validOrigin = ALLOWED_ORIGINS.some((ao) => origin.startsWith(ao));
  if (!validOrigin) {
    return redirect(PAGE_ERREUR);
  }

  // ── 3. TURNSTILE — vérification côté serveur ──────────────────────────────
  const turnstileToken = formData.get('cf-turnstile-response');
  if (!turnstileToken) {
    return redirect(PAGE_ERREUR + '?error=captcha');
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';

  const verifyBody = new URLSearchParams();
  verifyBody.append('secret', env.TURNSTILE_SECRET_KEY || '');
  verifyBody.append('response', String(turnstileToken));
  verifyBody.append('remoteip', ip);

  let turnstileResult;
  try {
    const verifyResp = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body: verifyBody }
    );
    turnstileResult = await verifyResp.json();
  } catch (err) {
    console.error('[Nomacast] Turnstile fetch error:', err);
    return redirect(PAGE_ERREUR + '?error=verify');
  }

  if (!turnstileResult.success) {
    console.error(
      '[Nomacast] Turnstile rejected:',
      (turnstileResult['error-codes'] || ['unknown']).join(',')
    );
    return redirect(PAGE_ERREUR + '?error=captcha');
  }

  // ── 4. ANTI-FLOOD — 1 soumission par IP toutes les 30s via KV ─────────────
  if (env.RATE_LIMIT && ip) {
    const floodKey = `flood:${ip}`;
    const last = await env.RATE_LIMIT.get(floodKey);
    if (last) {
      return redirect(PAGE_ERREUR + '?error=flood');
    }
    // TTL minimum KV = 60s (limitation Cloudflare). On vise 30s mais 60s OK.
    await env.RATE_LIMIT.put(floodKey, '1', { expirationTtl: 60 });
  }

  // ── 5. NETTOYAGE DES DONNÉES ──────────────────────────────────────────────
  const nom       = clean(formData.get('nom'));
  const societe   = clean(formData.get('societe'));
  const emailRaw  = String(formData.get('email') ?? '').trim();
  const email     = isValidEmail(emailRaw) ? emailRaw : '';
  const telephone = clean(formData.get('telephone'));
  const type      = clean(formData.get('type'));
  const date_evt  = clean(formData.get('date_evt'));
  const lieu      = clean(formData.get('lieu'));
  const audience  = clean(formData.get('audience'));
  const message   = clean(formData.get('message'));
  const isAgence  = !!formData.get('is_agence');
  const source    = clean(formData.get('source'));

  // ── 6. VALIDATION ─────────────────────────────────────────────────────────
  if (!email || !telephone) {
    return redirect(PAGE_ERREUR + '?error=email');
  }

  if (message.length > 5000 || nom.length > 200 || societe.length > 200) {
    return redirect(PAGE_ERREUR + '?error=length');
  }

  // ── 7. FILTRAGE ANTI-SPAM ─────────────────────────────────────────────────
  const texteComplet = `${nom} ${societe} ${message} ${lieu}`;

  // 7a. Trop de liens dans le message
  const nbLiens = (message.match(/https?:\/\//gi) || []).length;
  if (nbLiens >= 3) {
    console.error(`[Nomacast] Spam (liens multiples) - ${email}`);
    return redirect(PAGE_MERCI);
  }

  // 7b. Mots-clés de spam
  const lower = texteComplet.toLowerCase();
  for (const mot of SPAM_WORDS) {
    if (lower.includes(mot)) {
      console.error(`[Nomacast] Spam (mot-clé '${mot}') - ${email}`);
      return redirect(PAGE_MERCI);
    }
  }

  // 7c. Caractères non latins majoritaires (cyrillique, chinois, arabe)
  const exotiques =
    (message.match(/[\u0400-\u04FF\u4E00-\u9FFF\u0600-\u06FF]/g) || []).length;
  if (message.length > 20 && exotiques > message.length * 0.3) {
    console.error(`[Nomacast] Spam (caractères non-latins) - ${email}`);
    return redirect(PAGE_MERCI);
  }

  // 7d. Header injection (sécurité critique)
  const injectionRegex = /[\r\n]|content-type:|bcc:|cc:|to:/i;
  for (const field of [nom, societe, email, telephone]) {
    if (injectionRegex.test(field)) {
      console.error(`[Nomacast] Tentative injection headers - ${email}`);
      return redirect(PAGE_ERREUR + '?error=invalid');
    }
  }

  // ── 8. ROUTAGE EMAIL ──────────────────────────────────────────────────────
  const destinataires = isAgence
    ? [EMAIL_AGENCES, COPIE_ARCHIVAGE]
    : [EMAIL_GENERAL, COPIE_ARCHIVAGE];

  // ── 9. CONSTRUCTION DU MAIL ───────────────────────────────────────────────
  const tagAgence = isAgence ? '[AGENCE] ' : '';
  const tagSource = source ? `[${source}] ` : '';
  const subject =
    `Demande de devis - ${tagAgence}${tagSource}` +
    (societe || nom || 'Contact') +
    ' [nomacast.fr]';

  const sep = '─'.repeat(50);
  const dateParis = new Date().toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  let body = 'Nouvelle demande de devis reçue depuis nomacast.fr\n';
  if (isAgence) body += 'ATTENTION : DEMANDE AGENCE (marque blanche)\n';
  if (source)   body += `Provenance : ${source}\n`;
  body += sep + '\n\n';
  body += `Nom & prénom  : ${nom       || '—'}\n`;
  body += `Société       : ${societe   || '—'}\n`;
  body += `Email         : ${email}\n`;
  body += `Téléphone     : ${telephone}\n`;
  body += `Type événement: ${type      || '—'}\n`;
  body += `Date estimée  : ${date_evt  || '—'}\n`;
  body += `Lieu          : ${lieu      || '—'}\n`;
  body += `Audience      : ${audience  || '—'}\n\n`;
  body += `Message :\n${message || '—'}\n\n`;
  body += sep + '\n';
  body += 'Métadonnées :\n';
  body += `  IP        : ${ip || 'N/A'}\n`;
  body += `  Provenance: ${origin || 'N/A'}\n`;
  body += `  Date      : ${dateParis}\n`;

  // ── 10. ENVOI VIA RESEND ──────────────────────────────────────────────────
  try {
    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Formulaire Nomacast <noreply@${DOMAINE}>`,
        to: destinataires,
        reply_to: email,
        subject: subject,
        text: body,
      }),
    });

    if (!resendResp.ok) {
      const errBody = await resendResp.text();
      console.error(
        `[Nomacast] Resend error: ${resendResp.status} ${errBody}`
      );
      return redirect(PAGE_ERREUR + '?error=send');
    }
  } catch (err) {
    console.error('[Nomacast] Resend fetch error:', err);
    return redirect(PAGE_ERREUR + '?error=send');
  }

  // ── 11. REDIRECTION SUCCÈS ────────────────────────────────────────────────
  const typeConv = isAgence ? 'agence' : 'devis';
  return redirect(`${PAGE_MERCI}?type=${typeConv}`);
}
