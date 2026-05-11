// ─────────────────────────────────────────────────────────────────────────────
// NOMACAST — Cloudflare Pages Function
// Endpoint : /envoyer.php (matche functions/envoyer.php.js)
// Port JS de envoyer.php : Turnstile + Honeypot + Origin + Anti-spam
// Anti-flood via Cloudflare KV (binding RATE_LIMIT)
// Envoi des emails via Resend API
// Multi-lingue FR/EN : redirige vers /merci.html ou /en/thank-you.html selon le champ caché `lang`
// Support healthcheck : header X-Healthcheck-Token + env.HEALTHCHECK_TOKEN bypass Turnstile/Origin/RateLimit
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = ['https://www.nomacast.fr', 'https://nomacast.fr'];
const DOMAINE         = 'nomacast.fr';

// Pages de redirection FR (par défaut)
const PAGE_MERCI_FR   = 'https://nomacast.fr/merci.html';
const PAGE_ERREUR_FR  = 'https://nomacast.fr/index.html#contact';

// Pages de redirection EN (visiteurs depuis /en/*.html, identifiés par hidden field lang=en)
const PAGE_MERCI_EN   = 'https://nomacast.fr/en/thank-you.html';
const PAGE_ERREUR_EN  = 'https://nomacast.fr/en/index.html#contact';

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

  // ── HEALTHCHECK DETECTION ─────────────────────────────────────────────────
  // Si la requête contient un header X-Healthcheck-Token valide,
  // on bypass Origin/Turnstile/RateLimit mais on garde tout le reste
  // (validation, anti-spam, envoi Resend). Le sujet sera préfixé [HEALTHCHECK].
  // Token stocké à 2 endroits : GitHub Secret (côté Action) + env.HEALTHCHECK_TOKEN (côté CF Pages).
  const healthcheckToken = request.headers.get('X-Healthcheck-Token');
  const isHealthcheck = !!(
    healthcheckToken &&
    env.HEALTHCHECK_TOKEN &&
    healthcheckToken === env.HEALTHCHECK_TOKEN
  );
  if (isHealthcheck) {
    console.log('[Nomacast] Healthcheck request received');
  }

  // Parse form-data (le browser POST en application/x-www-form-urlencoded ou multipart)
  // En mode healthcheck : on injecte des valeurs fixes au lieu de parser le body.
  // (Évite les problèmes de parsing request.formData() avec certains clients HTTP non-browser.)
  let formData;
  if (isHealthcheck) {
    formData = new FormData();
    formData.append('nom', 'Healthcheck Bot');
    formData.append('societe', 'Healthcheck Automatique');
    formData.append('email', '[evenement@nomacast.fr]');
    formData.append('telephone', '0000000000');
    formData.append('message', 'Test automatique GitHub Actions. Si vous lisez ce mail, le pipeline fonctionne.');
    formData.append('source', 'healthcheck-github');
    formData.append('lang', 'fr');
  } else {
    try {
      formData = await request.formData();
    } catch (err) {
      console.error('[Nomacast] formData parse error:', err);
      // Fallback FR si on ne peut pas lire le formData (donc lang inconnu)
      return redirect(PAGE_ERREUR_FR + '?error=invalid');
    }
  }

  // ── 0. DÉTECTION LANGUE ───────────────────────────────────────────────────
  // Champ caché `lang=en` injecté dans tous les formulaires des pages /en/*.
  // Absence du champ ou valeur autre que "en" → fallback FR.
  const isEn = String(formData.get('lang') ?? '').toLowerCase() === 'en';
  const PAGE_MERCI  = isEn ? PAGE_MERCI_EN  : PAGE_MERCI_FR;
  const PAGE_ERREUR = isEn ? PAGE_ERREUR_EN : PAGE_ERREUR_FR;

  // ── 1. HONEYPOT ───────────────────────────────────────────────────────────
  if (formData.get('website')) {
    // Bot a rempli le champ caché : on simule un succès pour ne rien révéler
    return redirect(PAGE_MERCI);
  }

  // ── 2. ORIGIN CHECK ───────────────────────────────────────────────────────
  // Skip si healthcheck (GitHub Actions n'envoie pas un Referer nomacast.fr)
  if (!isHealthcheck) {
    const origin = request.headers.get('referer') || '';
    const validOrigin = ALLOWED_ORIGINS.some((ao) => origin.startsWith(ao));
    if (!validOrigin) {
      return redirect(PAGE_ERREUR);
    }
  }

  // ── 3. TURNSTILE — vérification côté serveur ──────────────────────────────
  // Skip si healthcheck (GitHub Actions ne peut pas résoudre un CAPTCHA)
  const ip = request.headers.get('CF-Connecting-IP') || '';

  if (!isHealthcheck) {
    const turnstileToken = formData.get('cf-turnstile-response');
    if (!turnstileToken) {
      return redirect(PAGE_ERREUR + '?error=captcha');
    }

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
  }

  // ── 4. ANTI-FLOOD — 1 soumission par IP toutes les 30s via KV ─────────────
  // Skip si healthcheck (sinon 2 checks à 60s d'intervalle se bloqueraient mutuellement)
  if (!isHealthcheck && env.RATE_LIMIT && ip) {
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
  const tagHealth = isHealthcheck ? '[HEALTHCHECK] ' : '';
  const tagLang   = isEn ? '[EN] ' : '';
  const tagAgence = isAgence ? '[AGENCE] ' : '';
  const tagSource = source ? `[${source}] ` : '';
  const subject =
    tagHealth +
    tagLang +
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
  if (isHealthcheck) body += 'TYPE       : HEALTHCHECK AUTOMATIQUE (GitHub Action)\n';
  if (isEn)     body += 'LANGUE     : EN (visiteur depuis /en/)\n';
  if (isAgence) body += 'ATTENTION  : DEMANDE AGENCE (marque blanche)\n';
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
  body += `  Provenance: ${request.headers.get('referer') || 'N/A'}\n`;
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
  const typeConv = isHealthcheck ? 'healthcheck' : (isAgence ? 'agence' : 'devis');
  return redirect(`${PAGE_MERCI}?type=${typeConv}`);
}
