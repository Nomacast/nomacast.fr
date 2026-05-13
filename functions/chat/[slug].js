// functions/chat/[slug].js
// GET /chat/:slug  →  Page participant via URL publique partageable.
//
// - Charge event par slug
// - Si event privé → page "Lien d'invitation requis"
// - Si event public → page comme /i/[token] mais sans tracking (pas d'invitee)
// - No-index header

export const onRequestGet = async ({ params, env, request }) => {
  if (!env.DB) {
    return htmlResponse(renderErrorPage(
      'Service indisponible',
      'La base de données n\'est pas accessible. Réessayez plus tard.'
    ), 500);
  }

  const row = await env.DB.prepare(`
    SELECT
      id, slug, title, client_name, scheduled_at, duration_minutes,
      status, primary_color, logo_url, white_label, access_mode
    FROM events WHERE slug = ?
  `).bind(params.slug).first();

  if (!row) {
    return htmlResponse(renderErrorPage(
      'Événement introuvable',
      'Cet événement n\'existe pas ou n\'est plus disponible.'
    ), 404);
  }

  const event = {
    id: row.id, slug: row.slug, title: row.title, client_name: row.client_name,
    scheduled_at: row.scheduled_at, duration_minutes: row.duration_minutes,
    status: row.status, primary_color: row.primary_color || '#5A98D6',
    logo_url: row.logo_url, white_label: row.white_label === 1,
    access_mode: row.access_mode
  };

  // Vérifier si c'est une preview admin (HMAC valide du slug)
  const url = new URL(request.url);
  const previewToken = url.searchParams.get('preview');
  let isAdminPreview = false;
  if (previewToken && env.ADMIN_PASSWORD) {
    const expected = await computePreviewToken(event.slug, env.ADMIN_PASSWORD);
    isAdminPreview = (previewToken === expected);
  }

  let html;
  if (event.access_mode === 'private' && !isAdminPreview) {
    html = renderPrivatePage(event);
  } else if (event.status === 'draft') {
    html = renderWaitingPage(event);
  } else if (event.status === 'live') {
    html = renderLivePage(event);
  } else if (event.status === 'ended') {
    html = renderEndedPage(event);
  } else {
    html = renderErrorPage('État inconnu', 'L\'état de cet événement n\'est pas reconnu.');
  }
  return htmlResponse(html, 200);
};

async function computePreviewToken(slug, secret) {
  if (!secret) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(slug));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    .slice(0, 24);
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    }
  });
}

// ============================================================
// Pages
// ============================================================
function renderPrivatePage(event) {
  const heroBody = `
    <span class="state-badge state-private">
      <span class="state-dot"></span>
      Événement privé
    </span>
    <h1 class="event-title">${escapeHtml(event.title)}</h1>
    ${event.client_name ? `<div class="event-client">organisé par ${escapeHtml(event.client_name)}</div>` : ''}
  `;
  const mainBody = `
    <section class="message">
      <p>Cet événement est <strong>privé</strong>. L'accès au chat live se fait uniquement via le lien personnel envoyé par email à chaque invité.</p>
    </section>
    <section class="tip">
      <p><strong>Si vous êtes invité(e)</strong>, vérifiez votre boîte mail (et vos spams) pour retrouver votre lien d'invitation personnel.</p>
      <p class="muted">Vous n'avez pas reçu d'invitation ? Contactez l'organisateur de l'événement.</p>
    </section>
  `;
  return htmlShell({
    title: event.title + ' — Événement privé',
    color: event.primary_color,
    logoUrl: event.logo_url,
    whiteLabel: event.white_label,
    heroBody, mainBody
  });
}

function renderWaitingPage(event) {
  const dateLabel = formatFrenchDateTime(event.scheduled_at);
  const agendaUrls = buildAgendaUrls(event);

  const heroBody = `
    <span class="state-badge state-draft">
      <span class="state-dot"></span>
      L'événement n'a pas encore commencé
    </span>
    <h1 class="event-title">${escapeHtml(event.title)}</h1>
    ${event.client_name ? `<div class="event-client">organisé par ${escapeHtml(event.client_name)}</div>` : ''}
  `;

  const mainBody = `
    ${buildCountdownHtml(event.scheduled_at)}

    <section class="card">
      <div class="card-grid">
        <div class="card-cell">
          <div class="card-label">Date prévue</div>
          <div class="card-value">${escapeHtml(dateLabel)}</div>
        </div>
        ${event.duration_minutes ? `<div class="card-cell">
          <div class="card-label">Durée prévue</div>
          <div class="card-value">${escapeHtml(formatDuration(event.duration_minutes))}</div>
        </div>` : ''}
      </div>
    </section>

    <section class="message">
      <p>Bonjour,</p>
      <p>Cet événement n'a pas encore commencé. Le chat live sera accessible automatiquement à la date prévue. Pensez à <strong>sauvegarder ce lien</strong> et à <strong>ajouter l'événement à votre agenda</strong>.</p>
    </section>

    <section class="agenda-block">
      <div class="agenda-label">Ajouter à mon agenda</div>
      <div class="agenda-buttons">
        <a href="${escapeHtml(agendaUrls.google)}" target="_blank" rel="noopener" class="agenda-btn">Google Agenda</a>
        <a href="${escapeHtml(agendaUrls.outlook)}" target="_blank" rel="noopener" class="agenda-btn">Outlook</a>
        <a href="${escapeHtml(agendaUrls.ics)}" class="agenda-btn">Apple / iCal</a>
      </div>
    </section>

    <section class="tip">
      <p>Vous pouvez fermer cette page. <strong>Revenez sur ce même lien</strong> à la date prévue pour rejoindre le chat live.</p>
    </section>
  `;

  return htmlShell({
    title: event.title + ' — En attente',
    color: event.primary_color,
    logoUrl: event.logo_url,
    whiteLabel: event.white_label,
    heroBody, mainBody,
    bodyScript: buildDraftScript({
      scheduledAt: event.scheduled_at,
      statusUrl: `/chat/${encodeURIComponent(event.slug)}/status`
    })
  });
}

function renderLivePage(event) {
  const heroBody = `
    <span class="state-badge state-live">
      <span class="state-dot state-dot-pulse"></span>
      En direct
    </span>
    <h1 class="event-title">${escapeHtml(event.title)}</h1>
    ${event.client_name ? `<div class="event-client">organisé par ${escapeHtml(event.client_name)}</div>` : ''}
  `;
  const mainBody = `
    <section class="placeholder-viewer">
      <div class="placeholder-icon">▶</div>
      <h2 class="placeholder-title">Le chat live est en cours</h2>
      <p class="placeholder-text">
        Le lecteur vidéo et le chat interactif seront disponibles ici.<br>
        <span class="muted">(Implémentation du viewer en cours — Cloudflare Stream Live)</span>
      </p>
    </section>
    <section class="tip">
      <p>Bonjour, vous êtes bien sur la page de l'événement. Si vous rencontrez un problème technique, contactez l'organisateur.</p>
    </section>
  `;
  return htmlShell({
    title: event.title + ' — En direct',
    color: event.primary_color,
    logoUrl: event.logo_url,
    whiteLabel: event.white_label,
    heroBody, mainBody
  });
}

function renderEndedPage(event) {
  const heroBody = `
    <span class="state-badge state-ended">
      <span class="state-dot"></span>
      Événement terminé
    </span>
    <h1 class="event-title">${escapeHtml(event.title)}</h1>
    ${event.client_name ? `<div class="event-client">organisé par ${escapeHtml(event.client_name)}</div>` : ''}
  `;
  const mainBody = `
    <section class="message">
      <p>Cet événement est terminé. Merci d'y avoir participé !</p>
      <p class="muted">Un replay sera peut-être mis à disposition prochainement. Contactez l'organisateur pour plus d'informations.</p>
    </section>
  `;
  return htmlShell({
    title: event.title + ' — Terminé',
    color: event.primary_color,
    logoUrl: event.logo_url,
    whiteLabel: event.white_label,
    heroBody, mainBody
  });
}

function renderErrorPage(title, message) {
  const heroBody = `
    <span class="state-badge state-error">
      <span class="state-dot"></span>
      ${escapeHtml(title)}
    </span>
    <h1 class="event-title">${escapeHtml(title)}</h1>
  `;
  const mainBody = `
    <section class="message">
      <p>${escapeHtml(message)}</p>
    </section>
  `;
  return htmlShell({
    title, color: '#475569', logoUrl: null, whiteLabel: false, heroBody, mainBody
  });
}

// ============================================================
// HTML shell (identique à /i/[token].js — duplication assumée)
// ============================================================
function htmlShell({ title, color, logoUrl, whiteLabel, heroBody, mainBody, bodyScript }) {
  const hasEventLogo = !!logoUrl;
  let headerHtml;
  if (hasEventLogo) {
    headerHtml = `<a href="https://www.nomacast.fr/" target="_blank" rel="noopener" class="header-logo">
      <img src="${escapeHtml(logoUrl)}" alt="Logo" class="header-logo-img">
    </a>`;
  } else if (!whiteLabel) {
    headerHtml = `<a href="https://www.nomacast.fr/" target="_blank" rel="noopener" class="header-logo header-logo-text">
      <span class="logo-dot">&bull;</span><span class="logo-text">&nbsp;Nomacast</span>
    </a>`;
  } else {
    headerHtml = '';
  }

  const footerHtml = whiteLabel ? '' : `
    <footer class="page-footer">
      <a href="https://www.nomacast.fr/" target="_blank" rel="noopener" class="footer-logo">
        <span class="logo-dot">&bull;</span><span class="logo-text">&nbsp;Nomacast</span>
      </a>
      <div class="footer-baseline">La qualité agence. Un seul interlocuteur.</div>
      <div class="footer-separator"><span></span><span></span><span></span></div>
      <div class="footer-blurb">Live streaming corporate à Paris,<br>en France et en Europe.</div>
      <div class="footer-links">
        <a href="https://www.nomacast.fr" target="_blank" rel="noopener">www.nomacast.fr</a>
        <span class="footer-dot">·</span>
        <a href="mailto:evenement@nomacast.fr">evenement@nomacast.fr</a>
      </div>
    </footer>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${escapeHtml(title)}</title>
<style>
  *,*::before,*::after { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: #f4f6fa; color: #0f172a;
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    min-height: 100vh; display: flex; flex-direction: column;
  }
  a { color: ${color}; }
  .page-header {
    background: #ffffff; border-bottom: 1px solid #eef2f6;
    padding: 18px 24px; display: flex; align-items: center; justify-content: center;
  }
  .header-logo { text-decoration: none; display: inline-flex; align-items: center; }
  .header-logo-img { display: block; max-height: 40px; width: auto; }
  .header-logo-text { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; line-height: 1; }
  .logo-dot { color: #5D9CEC; }
  .logo-text { color: #0f172a; }
  .hero { background: ${color}; padding: 42px 24px; text-align: center; color: #ffffff; }
  .hero-inner { max-width: 680px; margin: 0 auto; }
  .state-badge {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 14px; background: rgba(255,255,255,0.18);
    border-radius: 999px; font-size: 11px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
    margin-bottom: 18px; color: #ffffff;
  }
  .state-dot { width: 8px; height: 8px; border-radius: 50%; background: #ffffff; flex-shrink: 0; }
  .state-live .state-dot { background: #4ade80; box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.25); }
  .state-dot-pulse { animation: pulse 1.5s ease-in-out infinite; }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.4); }
  }
  .state-ended, .state-private { background: rgba(0,0,0,0.2); }
  .state-error { background: rgba(255,255,255,0.95); color: #991b1b; }
  .state-error .state-dot { background: #ef4444; }
  .event-title {
    font-size: clamp(22px, 4vw, 32px); font-weight: 800;
    letter-spacing: -0.02em; line-height: 1.2; margin: 0; color: #ffffff;
  }
  .event-client { margin-top: 8px; font-size: 14px; color: rgba(255,255,255,0.85); }
  .page-main { flex: 1; }
  .container { max-width: 680px; margin: 0 auto; padding: 32px 24px; }
  .card {
    background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px;
    margin: 0 0 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); overflow: hidden;
  }
  .card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  @media (max-width: 480px) { .card-grid { grid-template-columns: 1fr; } }
  .card-cell { padding: 18px 22px; }
  .card-cell + .card-cell { border-left: 1px solid #e6ecf3; }
  @media (max-width: 480px) {
    .card-cell + .card-cell { border-left: none; border-top: 1px solid #e6ecf3; }
  }
  .card-label {
    font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: #94a3b8; margin-bottom: 6px;
  }
  .card-value { font-size: 15px; color: #0f172a; font-weight: 600; line-height: 1.4; }
  .message {
    padding: 0 4px; margin: 0 0 28px;
    color: #334155; font-size: 15px; line-height: 1.65;
  }
  .message p { margin: 0 0 12px; }
  .message p:last-child { margin-bottom: 0; }
  .agenda-block {
    background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px;
    padding: 22px; margin: 0 0 24px; text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .agenda-label {
    font-size: 10px; font-weight: 700; letter-spacing: 0.14em;
    text-transform: uppercase; color: #94a3b8; margin-bottom: 14px;
  }
  .agenda-buttons { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
  .agenda-btn {
    display: inline-block; padding: 10px 16px; font-size: 13px; font-weight: 600;
    color: #0f172a; background: #f1f5f9; border: 1px solid #e2e8f0;
    border-radius: 8px; text-decoration: none;
    transition: background 0.15s, border-color 0.15s;
  }
  .agenda-btn:hover { background: #e2e8f0; border-color: #cbd5e1; }
  .tip {
    padding: 18px 22px; background: #f7f9fc; border: 1px dashed #e6ecf3;
    border-radius: 10px; font-size: 13px; color: #64748b; line-height: 1.6;
  }
  .tip p { margin: 0 0 6px; }
  .tip p:last-child { margin-bottom: 0; }
  .muted { color: #94a3b8; }
  .placeholder-viewer {
    background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px;
    padding: 60px 32px; margin: 0 0 24px; text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .placeholder-icon {
    width: 72px; height: 72px; margin: 0 auto 18px;
    background: ${color}; color: #ffffff;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 28px; padding-left: 4px;
  }
  .placeholder-title { font-size: 22px; font-weight: 700; margin: 0 0 8px; color: #0f172a; }
  .placeholder-text { color: #475569; font-size: 14px; line-height: 1.6; margin: 0; }

  /* Countdown (page draft) */
  .countdown {
    background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px;
    padding: 24px 18px; margin: 0 0 24px; text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .countdown-label {
    font-size: 10px; font-weight: 700; letter-spacing: 0.14em;
    text-transform: uppercase; color: #94a3b8; margin-bottom: 14px;
  }
  .countdown-grid {
    display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
  }
  .countdown-unit {
    display: flex; flex-direction: column; align-items: center;
    min-width: 62px;
  }
  .countdown-value {
    font-size: 32px; font-weight: 800; color: ${color};
    letter-spacing: -0.02em; line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .countdown-unit-label {
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: #94a3b8; margin-top: 6px;
  }
  .countdown-overdue {
    font-size: 14px; color: #475569; line-height: 1.5; padding: 4px 8px;
  }
  @media (max-width: 480px) {
    .countdown-value { font-size: 26px; }
    .countdown-unit { min-width: 52px; }
  }

  .page-footer {
    padding: 38px 24px 40px; background: #fafbfc; border-top: 1px solid #e2e8f0;
    text-align: center;
  }
  .footer-logo {
    text-decoration: none; display: inline-block;
    font-size: 22px; font-weight: 800; letter-spacing: -0.5px; line-height: 1;
  }
  .footer-baseline { margin-top: 10px; color: #475569; font-size: 13px; font-style: italic; }
  .footer-separator { display: flex; gap: 8px; justify-content: center; margin: 22px 0; }
  .footer-separator span { width: 6px; height: 2px; background: #cbd5e1; display: inline-block; }
  .footer-blurb { color: #64748b; font-size: 13px; line-height: 1.6; margin-bottom: 18px; }
  .footer-links { color: #94a3b8; font-size: 12px; }
  .footer-links a { color: #334155; text-decoration: none; font-weight: 600; }
  .footer-links a:hover { text-decoration: underline; }
  .footer-dot { color: #cbd5e1; margin: 0 6px; }
</style>
</head>
<body>
  <header class="page-header">${headerHtml}</header>
  <section class="hero"><div class="hero-inner">${heroBody}</div></section>
  <main class="page-main"><div class="container">${mainBody}</div></main>
  ${footerHtml}
  ${bodyScript || ''}
</body>
</html>`;
}

// ============================================================
// Helpers Countdown + polling (page draft)
// Duplication assumée avec functions/i/[token].js — pas d'import croisé.
// ============================================================
function buildCountdownHtml(scheduledAt) {
  if (!scheduledAt) return '';
  return `
    <section class="countdown" data-scheduled-at="${escapeHtml(scheduledAt)}">
      <div class="countdown-label" id="nomacast-cd-label">Démarrage prévu dans</div>
      <div class="countdown-grid" id="nomacast-cd-grid">
        <div class="countdown-unit"><span class="countdown-value" data-cd-unit="days">--</span><span class="countdown-unit-label">jours</span></div>
        <div class="countdown-unit"><span class="countdown-value" data-cd-unit="hours">--</span><span class="countdown-unit-label">heures</span></div>
        <div class="countdown-unit"><span class="countdown-value" data-cd-unit="minutes">--</span><span class="countdown-unit-label">min</span></div>
        <div class="countdown-unit"><span class="countdown-value" data-cd-unit="seconds">--</span><span class="countdown-unit-label">sec</span></div>
      </div>
      <div class="countdown-overdue" id="nomacast-cd-overdue" style="display:none">
        L'événement devrait avoir commencé. En attente du démarrage par l'organisateur…
      </div>
    </section>
  `;
}

// Script inline : countdown 1Hz + polling adaptatif du status.
// Concaténation + (pas de template strings) pour éviter les conflits avec
// l'interpolation ${...} du template serveur.
function buildDraftScript({ scheduledAt, statusUrl }) {
  return `<script>
(function () {
  var SCHEDULED_AT_ISO = ${JSON.stringify(scheduledAt || null)};
  var STATUS_URL = ${JSON.stringify(statusUrl)};

  var scheduledAt = SCHEDULED_AT_ISO ? new Date(SCHEDULED_AT_ISO) : null;
  if (scheduledAt && isNaN(scheduledAt.getTime())) scheduledAt = null;

  var elDays    = document.querySelector('[data-cd-unit="days"]');
  var elHours   = document.querySelector('[data-cd-unit="hours"]');
  var elMinutes = document.querySelector('[data-cd-unit="minutes"]');
  var elSeconds = document.querySelector('[data-cd-unit="seconds"]');
  var elGrid    = document.getElementById('nomacast-cd-grid');
  var elLabel   = document.getElementById('nomacast-cd-label');
  var elOverdue = document.getElementById('nomacast-cd-overdue');

  function pad(n) { return String(Math.max(0, n | 0)).padStart(2, '0'); }

  function tick() {
    if (!scheduledAt) return;
    var diffMs = scheduledAt.getTime() - Date.now();
    if (diffMs <= 0) {
      if (elGrid) elGrid.style.display = 'none';
      if (elLabel) elLabel.style.display = 'none';
      if (elOverdue) elOverdue.style.display = 'block';
      return;
    }
    if (elGrid) elGrid.style.display = '';
    if (elLabel) elLabel.style.display = '';
    if (elOverdue) elOverdue.style.display = 'none';
    var s = Math.floor(diffMs / 1000);
    var d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600);  s -= h * 3600;
    var m = Math.floor(s / 60);    s -= m * 60;
    if (elDays)    elDays.textContent    = pad(d);
    if (elHours)   elHours.textContent   = pad(h);
    if (elMinutes) elMinutes.textContent = pad(m);
    if (elSeconds) elSeconds.textContent = pad(s);
  }
  tick();
  setInterval(tick, 1000);

  // ----- Polling status (draft -> live) -----
  if (!STATUS_URL) return;

  var pollTimer = null;
  var inFlight = false;

  function pollDelay() {
    if (!scheduledAt) return 30000;
    var diffSec = (scheduledAt.getTime() - Date.now()) / 1000;
    if (diffSec > 600) return 60000;  // > 10 min : 60s
    if (diffSec > 60)  return 30000;  // > 1 min  : 30s
    return 10000;                      // < 1 min ou dépassé : 10s
  }

  function schedule() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, pollDelay());
  }

  function buildUrl() {
    // Conserve un éventuel ?preview=... présent dans l'URL parente
    var qs = window.location.search || '';
    return STATUS_URL + qs;
  }

  function poll() {
    if (inFlight) { schedule(); return; }
    inFlight = true;
    fetch(buildUrl(), { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        inFlight = false;
        if (!data) { schedule(); return; }
        if (data.status && data.status !== 'draft') {
          window.location.reload();
          return;
        }
        if (data.scheduled_at) {
          var nd = new Date(data.scheduled_at);
          if (!isNaN(nd.getTime()) && (!scheduledAt || nd.getTime() !== scheduledAt.getTime())) {
            scheduledAt = nd;
            tick();
          }
        }
        schedule();
      })
      .catch(function () { inFlight = false; schedule(); });
  }

  schedule();

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      clearTimeout(pollTimer);
      poll();
    }
  });
})();
<\/script>`;
}

// ============================================================
// Helpers Agenda (basé sur slug)
// ============================================================
function buildAgendaUrls(event) {
  const SITE_URL = 'https://nomacast.fr';
  const chatLink = `${SITE_URL}/chat/${event.slug}`;
  const start = event.scheduled_at ? toCalDate(event.scheduled_at) : '';
  const end = event.scheduled_at ? toCalDate(addMinutes(event.scheduled_at, event.duration_minutes || 90)) : '';
  const details = `Chat live de l'événement « ${event.title} »` +
    (event.client_name ? `, organisé par ${event.client_name}.` : '.') +
    `\n\nPour rejoindre : ${chatLink}\n\nPropulsé par Nomacast — https://nomacast.fr`;

  const googleParams = new URLSearchParams({
    action: 'TEMPLATE', text: event.title, details, location: chatLink,
    sf: 'true', output: 'xml'
  });
  if (start && end) googleParams.set('dates', `${start}/${end}`);
  const google = 'https://calendar.google.com/calendar/render?' + googleParams.toString();

  const outlookParams = new URLSearchParams({
    path: '/calendar/action/compose', rru: 'addevent',
    subject: event.title, body: details, location: chatLink
  });
  if (event.scheduled_at) {
    outlookParams.set('startdt', event.scheduled_at);
    outlookParams.set('enddt', addMinutes(event.scheduled_at, event.duration_minutes || 90));
  }
  const outlook = 'https://outlook.live.com/calendar/0/deeplink/compose?' + outlookParams.toString();

  const ics = `${SITE_URL}/chat/${event.slug}/calendar.ics`;

  return { google, outlook, ics };
}

// ============================================================
// Utilitaires
// ============================================================
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatFrenchDateTime(iso) {
  if (!iso) return 'Date non précisée';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} à ${String(d.getUTCHours()).padStart(2, '0')}h${String(d.getUTCMinutes()).padStart(2, '0')} (UTC)`;
}

function formatDuration(mins) {
  if (!mins) return '—';
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? h + 'h' : h + 'h' + String(m).padStart(2, '0');
}

function toCalDate(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function addMinutes(iso, mins) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + (mins || 0));
  return d.toISOString();
}
