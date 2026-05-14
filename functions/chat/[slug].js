// functions/chat/[slug].js
// GET /chat/:slug  →  Page participant via URL publique partageable.
//
// - Charge event par slug
// - Si event privé → page "Lien d'invitation requis"
// - Si event public → page comme /i/[token] mais sans tracking (pas d'invitee)
// - No-index header

// Marqueur : nomacast-analytics-visits-tracking-v1
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
      status, primary_color, logo_url, white_label, access_mode, modes_json,
      stream_uid, stream_playback_url,
      reaction_emojis_json
    FROM events WHERE slug = ?
  `).bind(params.slug).first();

  if (!row) {
    return htmlResponse(renderErrorPage(
      'Événement introuvable',
      'Cet événement n\'existe pas ou n\'est plus disponible.'
    ), 404);
  }

  let modes = [];
  if (row.modes_json) { try { modes = JSON.parse(row.modes_json); } catch (e) {} }

  // nomacast-lot-2a-bis-l2-v1 : reactions emojis configurables (rétro-compat NULL → défaut 8)
  let reactionEmojis = null;
  if (row.reaction_emojis_json) {
    try {
      const parsed = JSON.parse(row.reaction_emojis_json);
      if (Array.isArray(parsed) && parsed.length > 0) reactionEmojis = parsed;
    } catch (e) {}
  }

  const event = {
    id: row.id, slug: row.slug, title: row.title, client_name: row.client_name,
    scheduled_at: row.scheduled_at, duration_minutes: row.duration_minutes,
    status: row.status, primary_color: row.primary_color || '#5A98D6',
    logo_url: row.logo_url, white_label: row.white_label === 1,
    access_mode: row.access_mode,
    modes,
    stream_uid: row.stream_uid, stream_playback_url: row.stream_playback_url,
    reaction_emojis: reactionEmojis
  };

  // Vérifier si c'est une preview admin (HMAC valide du slug)
  const url = new URL(request.url);
  const previewToken = url.searchParams.get('preview');
  let isAdminPreview = false;
  if (previewToken && env.ADMIN_PASSWORD) {
    const expected = await computePreviewToken(event.slug, env.ADMIN_PASSWORD);
    isAdminPreview = (previewToken === expected);
  }

  // Lot E : Auto-passage draft → live si l'heure prévue est dépassée
  if (event.status === 'draft' && event.scheduled_at) {
    const scheduledMs = new Date(event.scheduled_at).getTime();
    if (!isNaN(scheduledMs) && scheduledMs <= Date.now()) {
      try {
        await env.DB.prepare('UPDATE events SET status = ?, updated_at = ? WHERE id = ?')
          .bind('live', new Date().toISOString(), event.id).run();
        event.status = 'live';
      } catch (err) {
        console.error('[chat/slug] auto go-live failed', err);
      }
    }
  }

  // Tracking visits détaillé (analytics - chaque ouverture du lien public)
  // Conditions : on track uniquement les VRAIES visites publiques
  //   - PAS de tracking si access_mode === 'private' (le viewer voit la page "wall" privé)
  //   - PAS de tracking si isAdminPreview (visite interne admin Nomacast, pas un vrai viewer)
  // Wrappé en try/catch indépendant : non-bloquant pour le rendu de la page.
  const trackVisit = !isAdminPreview && event.access_mode === 'public';
  if (trackVisit) {
    try {
      let anonKey = null;
      let ipHashFull = null;
      if (env.CHAT_IP_HASH_SECRET) {
        const ip = request.headers.get('CF-Connecting-IP') || '';
        ipHashFull = await hashIp(ip, env.CHAT_IP_HASH_SECRET);
        anonKey = ipHashFull.slice(0, 32);
      }
      await env.DB.prepare(`
        INSERT INTO visits (id, event_id, invitee_id, anon_key, visited_at, page_kind, user_agent, country_code, ip_hash, referrer)
        VALUES (?, ?, NULL, ?, ?, 'public', ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        event.id,
        anonKey,
        new Date().toISOString(),
        request.headers.get('User-Agent') || null,
        request.headers.get('CF-IPCountry') || null,
        ipHashFull,
        request.headers.get('Referer') || null
      ).run();
    } catch (err) {
      console.error('[chat/slug] visits track failed', err);
    }
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

async function hashIp(ip, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
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
    title: event.title + ' - Événement privé',
    color: event.primary_color,
    logoUrl: event.logo_url,
    whiteLabel: event.white_label,
    heroBody, mainBody
  });
}

function renderWaitingPage(event) {
  const dateLabel = formatFrenchDateTime(event.scheduled_at);
  const agendaUrls = buildAgendaUrls(event);
  // Lot A2 : masquer le bloc agenda si l'event démarre dans moins de 2h
  const minutesUntilStart = event.scheduled_at
    ? (new Date(event.scheduled_at).getTime() - Date.now()) / 60000
    : Infinity;
  const showAgenda = minutesUntilStart >= 120;

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
      <p>Cet événement n'a pas encore commencé. Le chat live sera accessible automatiquement à la date prévue. Pensez à <strong>sauvegarder ce lien</strong>${showAgenda ? ` et à <strong>ajouter l'événement à votre agenda</strong>` : ''}.</p>
    </section>

    ${showAgenda ? `<section class="agenda-block">
      <div class="agenda-label">Ajouter à mon agenda</div>
      <div class="agenda-buttons">
        <a href="${escapeHtml(agendaUrls.google)}" target="_blank" rel="noopener" class="agenda-btn">Google Agenda</a>
        <a href="${escapeHtml(agendaUrls.outlook)}" target="_blank" rel="noopener" class="agenda-btn">Outlook</a>
        <a href="${escapeHtml(agendaUrls.ics)}" class="agenda-btn">Apple / iCal</a>
      </div>
    </section>` : ''}

    <section class="tip">
      <p>Vous pouvez fermer cette page. <strong>Revenez sur ce même lien</strong> à la date prévue pour rejoindre le chat live.</p>
    </section>
  `;

  return htmlShell({
    title: event.title + ' - En attente',
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

// nomacast-lot-2a-bis-l2-v1 : pool global des emojis de reaction (cohérent avec admin/live.html)
// + labels FR pour aria-label + défaut 8 originaux (rétro-compat Lot 2.A si event.reaction_emojis NULL).
const DEFAULT_REACTION_EMOJIS = ['👏', '❤️', '🔥', '🎉', '🙏', '👍', '😂', '🤔'];
const REACTION_LABELS = {
  '👏': 'Applaudir', '❤️': "J'aime", '🔥': 'Top', '🎉': 'Bravo',
  '🙏': 'Merci', '👍': 'OK', '😂': 'Drôle', '🤔': 'Question',
  '💡': 'Idée', '🚀': 'Décollage', '✨': 'Magique', '🤯': 'Bluffant',
  '🥳': 'Fête', '🤝': "D'accord", '⭐': 'Excellent'
};

function buildReactionsBarHtml(emojis) {
  return emojis.map(function (e) {
    var label = REACTION_LABELS[e] || e;
    return '<button type="button" class="reaction-btn" data-emoji="' + escapeHtml(e) + '" aria-label="' + escapeHtml(label) + '">' + escapeHtml(e) + '<span class="reaction-count" data-for="' + escapeHtml(e) + '">0</span></button>';
  }).join('');
}

function renderLivePage(event) {
  const isLectureSeule = event.modes && event.modes.includes('lecture');
  const isQaMode = event.modes && event.modes.includes('qa');
  const hasStream = !!event.stream_playback_url;
  // nomacast-lot-2a-v1 : nouveaux flags Tour 2.A (présence, reactions, CTA)
  const hasPresence = !!(event.modes && event.modes.includes('presence'));
  const hasReactions = !!(event.modes && event.modes.includes('reactions'));
  const hasCta = !!(event.modes && event.modes.includes('cta'));

  // nomacast-lot-2a-bis-l2-v1 : liste effective d'emojis (config DB ou défaut 8)
  const reactionEmojis = (Array.isArray(event.reaction_emojis) && event.reaction_emojis.length > 0)
    ? event.reaction_emojis
    : DEFAULT_REACTION_EMOJIS;

  const heroBody = `
    <div class="hero-badges">
      <span class="state-badge state-live">
        <span class="state-dot state-dot-pulse"></span>
        En direct
      </span>
      ${hasPresence ? `<span class="state-badge presence-badge" id="presence-badge" style="display:none;">
        <span class="state-dot"></span>
        <span id="presence-count">—</span> en ligne
      </span>` : ''}
    </div>
    <h1 class="event-title">${escapeHtml(event.title)}</h1>
    ${event.client_name ? `<div class="event-client">organisé par ${escapeHtml(event.client_name)}</div>` : ''}
  `;

  const playerHtml = hasStream
    ? buildPlayerHtml(event.stream_playback_url, event.primary_color)
    : `
      <section class="placeholder-viewer">
        <div class="placeholder-icon">▶</div>
        <h2 class="placeholder-title">Le live va bientôt démarrer</h2>
        <p class="placeholder-text">
          Le flux vidéo apparaîtra ici dès que l'organisateur lancera la diffusion.<br>
          <span class="muted">Cette page se mettra à jour automatiquement.</span>
        </p>
      </section>
    `;

  const mainBody = `
    <div class="live-layout">
      <div class="live-poll-zone" id="live-poll-zone" style="display:none;"></div>
      <div class="live-video">
        ${playerHtml}
        ${hasReactions ? `<!-- nomacast-lot-2a-v1 : C1 reactions (Lot 2.A-bis L2 v1 : emojis dynamiques) -->
        <div class="reactions-overlay" id="reactions-overlay" aria-hidden="true"></div>
        <div class="reactions-bar" id="reactions-bar">${buildReactionsBarHtml(reactionEmojis)}</div>` : ''}
        <div class="report-issue-bar">
          <button type="button" class="report-issue-trigger" id="report-issue-trigger">
            Signaler un problème technique
          </button>
        </div>
      </div>
      <aside class="live-chat">
        ${hasCta ? `<!-- nomacast-lot-2a-v1 : C4 CTA -->
        <div class="cta-banner" id="cta-banner" style="display:none;">
          <a class="cta-banner-button" id="cta-banner-button" target="_blank" rel="noopener"></a>
          <button type="button" class="cta-banner-close" id="cta-banner-close" aria-label="Fermer">×</button>
        </div>` : ''}
        ${buildChatPanelHtml({ isLectureSeule, isQaMode })}
      </aside>
    </div>

    <div class="report-issue-overlay" id="report-issue-overlay" role="dialog" aria-modal="true" aria-labelledby="report-issue-title">
      <div class="report-issue-modal">
        <h3 class="report-issue-title" id="report-issue-title">Signaler un problème technique</h3>
        <p class="report-issue-sub">Quel type de problème rencontrez-vous ?</p>
        <div id="report-issue-content">
          <div class="report-issue-options">
            <button type="button" class="report-issue-btn" data-type="audio">
              <span class="report-issue-btn-title">Problème de son</span>
              <span class="report-issue-btn-sub">Je n'entends pas (ou mal) le son</span>
            </button>
            <button type="button" class="report-issue-btn" data-type="video">
              <span class="report-issue-btn-title">Problème d'image</span>
              <span class="report-issue-btn-sub">Je ne vois pas (ou mal) la vidéo</span>
            </button>
            <button type="button" class="report-issue-btn" data-type="both">
              <span class="report-issue-btn-title">Problème d'image ET de son</span>
              <span class="report-issue-btn-sub">Les deux à la fois</span>
            </button>
          </div>
          <div class="report-issue-foot">
            <button type="button" class="report-issue-cancel" id="report-issue-cancel">Annuler</button>
          </div>
        </div>
      </div>
    </div>
  `;

  return htmlShell({
    title: event.title + ' - En direct',
    color: event.primary_color,
    logoUrl: event.logo_url,
    whiteLabel: event.white_label,
    heroBody, mainBody,
    bodyClass: 'live-page',
    bodyScript: buildLivePageScript({
      statusUrl: `/chat/${encodeURIComponent(event.slug)}/status`,
      chatMessagesUrl: `/api/chat/${encodeURIComponent(event.slug)}/messages`,
      pollsActiveUrl: `/api/chat/${encodeURIComponent(event.slug)}/polls/active`,
      voteUrlBase: `/api/chat/${encodeURIComponent(event.slug)}/polls`,
      reportIssueUrl: `/api/chat/${encodeURIComponent(event.slug)}/report-issue`,
      // nomacast-lot-2a-v1 : URLs API pour les 3 nouvelles features
      presenceHeartbeatUrl: hasPresence ? `/api/chat/${encodeURIComponent(event.slug)}/presence/heartbeat` : null,
      presenceStatsUrl: hasPresence ? `/api/chat/${encodeURIComponent(event.slug)}/presence/stats` : null,
      reactionsUrl: hasReactions ? `/api/chat/${encodeURIComponent(event.slug)}/reactions` : null,
      reactionsRecentUrl: hasReactions ? `/api/chat/${encodeURIComponent(event.slug)}/reactions/recent` : null,
      // nomacast-lot-2a-bis-l2-v1 : URL config emojis + liste initiale pour SSR<->client cohérence
      reactionsConfigUrl: hasReactions ? `/api/chat/${encodeURIComponent(event.slug)}/reactions/config` : null,
      reactionEmojis: hasReactions ? reactionEmojis : null,
      ctaActiveUrl: hasCta ? `/api/chat/${encodeURIComponent(event.slug)}/cta/active` : null,
      accessMode: event.access_mode,
      magicToken: null, // pas de token sur la page publique
      isLectureSeule, isQaMode,
      hasPresence,
      hasReactions,
      hasCta,
      // L'auteur n'est pas connu côté serveur, le placeholder sera demandé côté client
      authorPlaceholder: null
    })
  });
}

function renderEndedPage(event) {
  const isLectureSeule = event.modes && event.modes.includes('lecture');
  const isQaMode = event.modes && event.modes.includes('qa');
  const hasStream = !!event.stream_playback_url;

  const heroBody = `
    <span class="state-badge state-ended">
      <span class="state-dot"></span>
      Événement terminé
    </span>
    <h1 class="event-title">${escapeHtml(event.title)}</h1>
    ${event.client_name ? `<div class="event-client">organisé par ${escapeHtml(event.client_name)}</div>` : ''}
  `;

  const playerHtml = hasStream
    ? buildPlayerHtml(event.stream_playback_url, event.primary_color)
    : `
      <section class="placeholder-viewer">
        <div class="placeholder-icon" style="background:#94a3b8;">✓</div>
        <h2 class="placeholder-title">Aucun replay disponible</h2>
        <p class="placeholder-text">
          Cet événement s'est tenu sans diffusion enregistrée.
        </p>
      </section>
    `;

  const mainBody = `
    <div class="live-layout">
      <div class="live-video">
        ${playerHtml}
      </div>
      <aside class="live-chat">
        ${buildChatPanelHtml({ isLectureSeule, isQaMode, isEnded: true })}
      </aside>
    </div>

    <section class="tip tip-ended">
      <p><strong>Cet événement est terminé.</strong>${hasStream ? ' Vous pouvez visionner le replay ci-dessus.' : ''}</p>
      ${hasStream ? `<p class="muted">Si le replay ne s'affiche pas immédiatement, il peut prendre jusqu'à 1 minute à apparaître après la fin du live. Rafraîchissez la page si besoin.</p>` : ''}
    </section>
  `;

  return htmlShell({
    title: event.title + ' - Terminé',
    color: event.primary_color,
    logoUrl: event.logo_url,
    whiteLabel: event.white_label,
    heroBody,
    mainBody,
    bodyClass: 'live-page',
    bodyScript: buildLivePageScript({
      statusUrl: null,
      chatMessagesUrl: `/api/chat/${encodeURIComponent(event.slug)}/messages`,
      accessMode: event.access_mode,
      magicToken: null,
      isLectureSeule,
      isQaMode,
      isEnded: true,
      authorPlaceholder: null
    })
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
// HTML shell (identique à /i/[token].js - duplication assumée)
// ============================================================
function htmlShell({ title, color, logoUrl, whiteLabel, heroBody, mainBody, bodyScript, bodyClass }) {
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

  /* ============ LIVE LAYOUT (C4 player + C5 chat) ============ */
  /* Sur la page live, on élargit le container pour avoir un player confortable */
  body.live-page .container { max-width: 1400px; }
  body.live-page .tip { max-width: 680px; margin-left: auto; margin-right: auto; }

  .live-layout {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-areas:
      'poll'
      'video'
      'chat';
    gap: 16px;
    margin: 0 auto 24px;
    max-width: 1400px;
  }
  /* Empilé en mobile/tablette jusqu'à 900px */
  @media (min-width: 900px) {
    .live-layout {
      grid-template-columns: minmax(0, 1.5fr) minmax(380px, 1fr);
      grid-template-areas:
        'poll  poll'
        'video chat';
      align-items: stretch;
    }
  }
  .live-poll-zone { grid-area: poll; }
  .live-video { grid-area: video; min-width: 0; display: flex; flex-direction: column; }
  .live-chat  { grid-area: chat;  min-width: 0; display: flex; }
  .player-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #0f172a;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  .player-iframe {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    border: 0; display: block;
  }
  /* === Bouton Signaler un problème technique === */
  .report-issue-bar {
    margin-top: 8px;
    text-align: right;
  }
  .report-issue-trigger {
    font: inherit; font-size: 12px; font-weight: 500;
    color: #94a3b8;
    background: transparent;
    border: 0;
    padding: 4px 8px;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
    transition: color 0.15s;
  }
  .report-issue-trigger:hover { color: #ef4444; }
  .report-issue-trigger:focus-visible { outline: 2px solid ${color}; outline-offset: 2px; border-radius: 4px; }

  .report-issue-overlay {
    position: fixed; inset: 0;
    background: rgba(15,23,42,0.65);
    display: none;
    align-items: center; justify-content: center;
    z-index: 9999;
    padding: 16px;
  }
  .report-issue-overlay.is-open { display: flex; }
  .report-issue-modal {
    background: #ffffff;
    border-radius: 12px;
    padding: 24px;
    max-width: 440px;
    width: 100%;
    box-shadow: 0 20px 50px rgba(0,0,0,0.3);
    animation: report-modal-in 0.18s ease-out;
  }
  @keyframes report-modal-in {
    from { opacity: 0; transform: translateY(8px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .report-issue-title {
    margin: 0 0 6px;
    font-size: 17px;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.3;
  }
  .report-issue-sub {
    margin: 0 0 18px;
    font-size: 13px;
    color: #64748b;
    line-height: 1.4;
  }
  .report-issue-options {
    display: grid; gap: 10px;
  }
  .report-issue-btn {
    padding: 12px 14px;
    background: #f8fafc;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    font: inherit;
    cursor: pointer;
    text-align: left;
    display: flex; flex-direction: column; gap: 2px;
    transition: background 0.15s, border-color 0.15s;
  }
  .report-issue-btn:hover {
    background: #fef2f2;
    border-color: #ef4444;
  }
  .report-issue-btn:hover .report-issue-btn-title { color: #b91c1c; }
  .report-issue-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .report-issue-btn-title {
    font-size: 14px;
    font-weight: 600;
    color: #0f172a;
    transition: color 0.15s;
  }
  .report-issue-btn-sub {
    font-size: 12px;
    color: #64748b;
  }
  .report-issue-foot {
    margin-top: 14px;
    display: flex; justify-content: flex-end; gap: 8px;
  }
  .report-issue-cancel {
    background: transparent; border: 0;
    color: #64748b; font: inherit; font-size: 13px;
    cursor: pointer; padding: 8px 12px;
    border-radius: 6px;
    transition: background 0.15s, color 0.15s;
  }
  .report-issue-cancel:hover { background: #f1f5f9; color: #0f172a; }
  .report-issue-feedback {
    padding: 14px; border-radius: 8px;
    font-size: 13px; line-height: 1.4;
  }
  .report-issue-feedback.is-success {
    background: #f0fdf4; border: 1px solid #86efac; color: #15803d;
  }
  .report-issue-feedback.is-error {
    background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c;
  }
  .chat-panel {
    display: flex; flex-direction: column;
    background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    width: 100%;
    min-height: 360px; max-height: 70vh;
  }
  /* Desktop : chat suit la hauteur du player (via stretch) sans dépasser */
  @media (min-width: 900px) {
    .chat-panel {
      min-height: 0;
      max-height: none;
      height: 100%;
    }
  }
  .chat-panel-readonly { min-height: 200px; }
  .chat-header {
    padding: 12px 14px; border-bottom: 1px solid #f1f5f9; background: #fafbfc;
    display: flex; align-items: flex-start; gap: 10px;
  }
  .chat-header-main { flex: 1; min-width: 0; }
  .chat-title { font-size: 13px; font-weight: 700; color: #0f172a; line-height: 1.2; }
  .chat-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; line-height: 1.3; }
  .chat-pseudo-btn {
    font-size: 11px; padding: 4px 8px;
    background: transparent; color: #475569;
    border: 1px solid #e2e8f0; border-radius: 5px;
    cursor: pointer; flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
  }
  .chat-pseudo-btn:hover { background: ${color}; color: #ffffff; border-color: ${color}; }
  .chat-messages {
    flex: 1 1 0;
    min-height: 0; /* Bug fix : sans ça, flex item refuse de shrink → panel grandit avec les messages */
    overflow-y: auto; overflow-x: hidden; padding: 12px 14px;
    display: flex; flex-direction: column; gap: 10px; background: #fafbfc;
  }
  @media (max-width: 899px) {
    .chat-messages { min-height: 200px; }
  }
  .chat-empty {
    color: #94a3b8; font-size: 12px; font-style: italic;
    text-align: center; padding: 24px 8px;
  }
  .chat-msg {
    background: #ffffff; border: 1px solid #f1f5f9; border-radius: 8px;
    padding: 8px 10px; word-break: break-word;
  }
  .chat-msg-head {
    display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;
  }
  .chat-msg-author { font-size: 12px; font-weight: 700; color: #0f172a; }
  .chat-msg-time { font-size: 10px; color: #94a3b8; font-variant-numeric: tabular-nums; }
  .chat-msg-body { font-size: 13px; color: #334155; line-height: 1.45; white-space: pre-wrap; }
  .chat-msg-admin .chat-msg-author { color: ${color}; }
  .chat-msg-admin { border-left: 3px solid ${color}; }
  .chat-msg-question { background: #fffbeb; border-color: #fde68a; }
  .chat-msg-question .chat-msg-author::after {
    content: ' · question';
    font-weight: 500; color: #92400e; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .chat-form { border-top: 1px solid #f1f5f9; padding: 10px 12px; background: #ffffff; }
  .chat-input {
    width: 100%; box-sizing: border-box;
    border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 8px 10px; font: inherit; font-size: 13px;
    color: #0f172a; background: #ffffff; resize: vertical; min-height: 44px;
  }
  .chat-input:focus { outline: 2px solid ${color}; outline-offset: 1px; border-color: transparent; }
  .chat-form-row {
    display: flex; justify-content: space-between; align-items: center; margin-top: 6px;
  }
  .chat-counter { font-size: 11px; color: #94a3b8; font-variant-numeric: tabular-nums; }
  .chat-send-btn {
    background: ${color}; color: #ffffff; border: 0;
    padding: 7px 14px; border-radius: 6px; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: opacity 0.15s;
  }
  .chat-send-btn:hover { opacity: 0.9; }
  .chat-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .chat-error {
    margin-top: 6px; padding: 6px 8px;
    background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;
    border-radius: 6px; font-size: 12px;
  }
  .chat-error.chat-info { background: #d1fae5; color: #065f46; border-color: #6ee7b7; }

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

  /* ============ Sondage participant (Phase C) ============ */
  .live-poll-zone {
    animation: poll-slide-in 0.4s ease;
  }
  @keyframes poll-slide-in {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .live-poll-card {
    width: 100%;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-left: 4px solid ${color};
    border-radius: 12px;
    padding: 16px 18px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .live-poll-card.is-closed {
    border-left-color: #94a3b8;
    opacity: 0.92;
  }
  .live-poll-card.is-closed .live-poll-header {
    color: #64748b;
  }
  .live-poll-card.is-closed .live-poll-header-dot {
    background: #94a3b8;
    animation: none;
  }
  .live-poll-card.is-closed .live-poll-result-row.is-mine {
    border-color: #94a3b8;
    background: #94a3b81a;
  }
  .live-poll-card.is-closed .live-poll-result-row.is-mine .live-poll-result-bar-bg {
    background: #94a3b82e;
  }
  .live-poll-card.is-closed .live-poll-result-row.is-mine .live-poll-result-label {
    color: #475569;
  }
  .live-poll-card.is-closed .live-poll-result-mine-badge {
    background: #94a3b8;
  }
  .live-poll-card.is-closed .live-poll-result-bar-bg {
    background: #e2e8f0;
  }
  .live-poll-header-row {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px;
    gap: 8px;
  }
  .live-poll-nav {
    display: flex; align-items: center; gap: 6px;
  }
  .live-poll-nav-btn {
    width: 26px; height: 26px;
    border: 1px solid #e2e8f0;
    background: #fff;
    border-radius: 5px;
    cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 15px; color: #475569;
    padding: 0; line-height: 1;
    font-family: inherit;
  }
  .live-poll-nav-btn:hover:not(:disabled) {
    border-color: ${color};
    color: ${color};
  }
  .live-poll-nav-btn:disabled {
    opacity: 0.35; cursor: not-allowed;
  }
  .live-poll-nav-count {
    font-variant-numeric: tabular-nums;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 600;
    min-width: 30px;
    text-align: center;
  }
  .live-poll-header {
    display: flex; align-items: center; gap: 8px;
    font-size: 11px; font-weight: 700;
    color: ${color};
    text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 8px;
  }
  .live-poll-header-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: ${color};
    box-shadow: 0 0 0 0 ${color};
    animation: poll-pulse 1.6s ease-in-out infinite;
  }
  @keyframes poll-pulse {
    0%, 100% { box-shadow: 0 0 0 0 ${color}40; }
    50%      { box-shadow: 0 0 0 6px ${color}00; }
  }
  .live-poll-question {
    font-size: 16px; font-weight: 700;
    color: #0f172a;
    line-height: 1.35;
    margin-bottom: 12px;
    word-break: break-word;
  }
  .live-poll-options-vote {
    display: flex; flex-direction: column; gap: 8px;
    margin-bottom: 12px;
  }
  .live-poll-option-vote {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    background: #fafbfc;
  }
  .live-poll-option-vote:hover {
    border-color: ${color};
    background: #fff;
  }
  .live-poll-option-vote input[type="radio"] {
    margin: 0; cursor: pointer;
  }
  .live-poll-option-vote input[type="radio"]:checked + .live-poll-option-text {
    color: ${color};
    font-weight: 600;
  }
  .live-poll-option-text {
    flex: 1; min-width: 0;
    font-size: 14px;
    color: #1e293b;
    word-break: break-word;
  }
  .live-poll-vote-btn {
    width: 100%;
    padding: 11px 16px;
    background: ${color};
    color: #ffffff;
    border: none; border-radius: 8px;
    font: inherit; font-weight: 700; font-size: 14px;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.05s;
  }
  .live-poll-vote-btn:hover:not(:disabled) { opacity: 0.92; }
  .live-poll-vote-btn:active:not(:disabled) { transform: translateY(1px); }
  .live-poll-vote-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Mode résultats (après vote ou si non-votant) */
  .live-poll-options-results {
    display: flex; flex-direction: column; gap: 10px;
    margin-bottom: 8px;
  }
  .live-poll-result-row {
    display: flex; flex-direction: column;
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #fafbfc;
    position: relative;
    overflow: hidden;
  }
  .live-poll-result-row.is-mine {
    border-color: ${color};
    background: ${color}0d;
  }
  .live-poll-result-bar-bg {
    position: absolute; top: 0; left: 0; bottom: 0;
    background: ${color}1a;
    transition: width 0.4s ease;
    z-index: 0;
  }
  .live-poll-result-row.is-mine .live-poll-result-bar-bg {
    background: ${color}2e;
  }
  .live-poll-result-content {
    position: relative; z-index: 1;
    display: flex; justify-content: space-between; align-items: center;
    gap: 12px;
  }
  .live-poll-result-label {
    flex: 1; min-width: 0;
    font-size: 14px; color: #1e293b;
    word-break: break-word;
  }
  .live-poll-result-row.is-mine .live-poll-result-label {
    font-weight: 700;
    color: ${color};
  }
  .live-poll-result-mine-badge {
    display: inline-block;
    font-size: 10px; font-weight: 700;
    background: ${color}; color: #fff;
    padding: 2px 6px; border-radius: 4px;
    margin-left: 6px;
    vertical-align: middle;
  }
  .live-poll-result-pct {
    font-size: 14px; font-weight: 700;
    color: #1e293b;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .live-poll-footer {
    font-size: 12px;
    color: #64748b;
    text-align: center;
    margin-top: 6px;
  }
  .live-poll-error {
    color: #b91c1c;
    font-size: 13px;
    padding: 8px 10px;
    background: #fef2f2;
    border-radius: 6px;
    margin-top: 8px;
  }

  /* ============ nomacast-lot-2a-v1 : C2 Présence ============ */
  .hero-badges {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }
  .hero-badges .state-badge { margin-bottom: 0; }
  .presence-badge {
    background: rgba(255,255,255,0.10);
  }
  .presence-badge .state-dot { background: #4ade80; }

  /* ============ nomacast-lot-2a-v1 : C1 Reactions ============ */
  .live-video { position: relative; }
  .reactions-overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 60px;
    pointer-events: none;
    overflow: hidden;
    z-index: 5;
  }
  .reaction-float {
    position: absolute;
    bottom: 0;
    font-size: 32px;
    line-height: 1;
    user-select: none;
    animation: reaction-rise 1.8s ease-out forwards;
    will-change: transform, opacity;
    text-shadow: 0 2px 8px rgba(0,0,0,0.25);
  }
  @keyframes reaction-rise {
    0%   { transform: translateY(0) scale(0.6); opacity: 0; }
    15%  { transform: translateY(-15px) scale(1.15); opacity: 1; }
    100% { transform: translateY(-180px) scale(0.95); opacity: 0; }
  }
  .reactions-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    border-bottom: 1px solid #e2e8f0;
    /* nomacast-lot-2a-bis-l2-v1 : fade 200ms lors d'un rebuild (changement config emojis en live) */
    transition: opacity 0.2s ease;
  }
  .reaction-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 6px 12px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 999px;
    cursor: pointer;
    font-size: 18px;
    font-family: inherit;
    color: #0f172a;
    transition: transform 0.1s ease, border-color 0.15s ease, background 0.15s ease;
    user-select: none;
  }
  .reaction-btn:hover {
    border-color: ${color};
    background: #f1f5f9;
  }
  .reaction-btn:active {
    transform: scale(0.92);
  }
  .reaction-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .reaction-count {
    font-size: 12px;
    font-weight: 700;
    color: #64748b;
    font-variant-numeric: tabular-nums;
  }
  .reaction-btn:hover .reaction-count {
    color: ${color};
  }

  /* ============ nomacast-lot-2a-v1 : C4 CTA banner ============ */
  .cta-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    background: ${color};
    color: #ffffff;
    border-radius: 10px 10px 0 0;
    margin-bottom: -1px;
    box-shadow: 0 -2px 6px rgba(15,23,42,0.05);
    animation: cta-slide-in 0.35s ease-out;
  }
  @keyframes cta-slide-in {
    0%   { opacity: 0; transform: translateY(-8px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .cta-banner-button {
    flex: 1;
    display: inline-block;
    padding: 9px 14px;
    background: #ffffff;
    color: #0f172a;
    font-size: 14px;
    font-weight: 700;
    text-align: center;
    text-decoration: none;
    border-radius: 7px;
    transition: transform 0.1s ease, box-shadow 0.15s ease;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cta-banner-button:hover {
    box-shadow: 0 4px 10px rgba(0,0,0,0.18);
  }
  .cta-banner-button:active {
    transform: scale(0.97);
  }
  .cta-banner-close {
    flex-shrink: 0;
    width: 28px; height: 28px;
    padding: 0;
    background: rgba(255,255,255,0.18);
    color: #ffffff;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    font-family: inherit;
    transition: background 0.15s ease;
  }
  .cta-banner-close:hover {
    background: rgba(255,255,255,0.32);
  }
</style>
</head>
<body${bodyClass ? ' class="' + escapeHtml(bodyClass) + '"' : ''}>
  <header class="page-header">${headerHtml}</header>
  <section class="hero"><div class="hero-inner">${heroBody}</div></section>
  <main class="page-main"><div class="container">${mainBody}</div></main>
  ${footerHtml}
  ${bodyScript || ''}
</body>
</html>`;
}

// ============================================================
// Helpers Live (player Cloudflare Stream + chat C5)
// Duplication assumée avec functions/i/[token].js.
// ============================================================
function buildPlayerHtml(playbackUrl, primaryColor) {
  // Le Stream Player Cloudflare prend un param ?primaryColor=RRGGBB (sans #)
  // Lot A4 : autoplay=true + muted=true (forcé car browsers bloquent autoplay avec son)
  const colorParam = (primaryColor || '#5A98D6').replace('#', '');
  const src = playbackUrl
    + (playbackUrl.includes('?') ? '&' : '?')
    + 'primaryColor=' + encodeURIComponent(colorParam)
    + '&letterboxColor=transparent'
    + '&autoplay=true'
    + '&muted=true';
  return `
    <div class="player-wrap">
      <iframe
        class="player-iframe"
        src="${escapeHtml(src)}"
        loading="lazy"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
        allowfullscreen
        title="Lecteur vidéo en direct"
      ></iframe>
    </div>
  `;
}

function buildChatPanelHtml({ isLectureSeule, isQaMode, isEnded }) {
  // Mode ended : historique des messages, pas de form
  if (isEnded) {
    return `
      <div class="chat-panel chat-panel-ended">
        <div class="chat-header">
          <div class="chat-header-main">
            <div class="chat-title">${isQaMode ? 'Questions' : 'Chat'} - terminé</div>
            <div class="chat-sub">Historique des échanges pendant l'événement.</div>
          </div>
        </div>
        <div class="chat-messages" id="chat-messages">
          <div class="chat-empty" id="chat-empty">Aucun message échangé pendant cet événement.</div>
        </div>
      </div>
    `;
  }
  if (isLectureSeule) {
    return `
      <div class="chat-panel chat-panel-readonly chat-panel-announces">
        <div class="chat-header">
          <div class="chat-header-main">
            <div class="chat-title">Annonces</div>
            <div class="chat-sub">Messages du modérateur.</div>
          </div>
        </div>
        <div class="chat-messages" id="chat-messages">
          <div class="chat-empty" id="chat-empty">Aucune annonce pour le moment.</div>
        </div>
      </div>
    `;
  }
  return `
    <div class="chat-panel">
      <div class="chat-header">
        <div class="chat-header-main">
          <div class="chat-title">${isQaMode ? 'Questions' : 'Chat'}</div>
          <div class="chat-sub">${isQaMode ? 'Vos questions sont modérées avant diffusion.' : 'Échangez en direct.'}</div>
        </div>
        <button type="button" class="chat-pseudo-btn" id="chat-pseudo-btn" style="display:none;" title="Changer mon pseudo">Pseudo</button>
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="chat-empty" id="chat-empty">Aucun message pour le moment. Soyez le premier !</div>
      </div>
      <form class="chat-form" id="chat-form" autocomplete="off">
        <textarea
          class="chat-input"
          id="chat-input"
          rows="2"
          maxlength="500"
          placeholder="${isQaMode ? 'Posez votre question…' : 'Votre message…'}"
          required></textarea>
        <div class="chat-form-row">
          <span class="chat-counter" id="chat-counter">0 / 500</span>
          <button type="submit" class="chat-send-btn" id="chat-send-btn">Envoyer</button>
        </div>
        <div class="chat-error" id="chat-error" style="display:none"></div>
      </form>
    </div>
  `;
}

// Script JS de la page live (polling chat + polling status pour live→ended).
// Concaténation + (pas de template strings) pour éviter les conflits ${...}
// avec le template serveur.
function buildLivePageScript({ statusUrl, chatMessagesUrl, pollsActiveUrl, voteUrlBase, reportIssueUrl, presenceHeartbeatUrl, presenceStatsUrl, reactionsUrl, reactionsRecentUrl, reactionsConfigUrl, reactionEmojis, ctaActiveUrl, accessMode, magicToken, isLectureSeule, isQaMode, isEnded, hasPresence, hasReactions, hasCta, authorPlaceholder }) {
  return `<script>
(function () {
  var STATUS_URL = ${JSON.stringify(statusUrl)};
  var CHAT_URL = ${JSON.stringify(chatMessagesUrl)};
  var POLLS_ACTIVE_URL = ${JSON.stringify(pollsActiveUrl || null)};
  var VOTE_URL_BASE = ${JSON.stringify(voteUrlBase || null)};
  var REPORT_ISSUE_URL = ${JSON.stringify(reportIssueUrl || null)};
  // nomacast-lot-2a-v1 : URLs des 3 nouvelles features
  var PRESENCE_HEARTBEAT_URL = ${JSON.stringify(presenceHeartbeatUrl || null)};
  var PRESENCE_STATS_URL = ${JSON.stringify(presenceStatsUrl || null)};
  var REACTIONS_URL = ${JSON.stringify(reactionsUrl || null)};
  var REACTIONS_RECENT_URL = ${JSON.stringify(reactionsRecentUrl || null)};
  // nomacast-lot-2a-bis-l2-v1 : config dynamique emojis (polling 15s + rebuild fade 200ms)
  var REACTIONS_CONFIG_URL = ${JSON.stringify(reactionsConfigUrl || null)};
  var REACTION_EMOJIS = ${JSON.stringify(reactionEmojis || [])};
  var REACTION_LABELS = ${JSON.stringify(REACTION_LABELS)};
  var CTA_ACTIVE_URL = ${JSON.stringify(ctaActiveUrl || null)};
  var ACCESS_MODE = ${JSON.stringify(accessMode)};
  var MAGIC_TOKEN = ${JSON.stringify(magicToken || null)};
  var IS_LECTURE_SEULE = ${JSON.stringify(!!isLectureSeule)};
  var IS_QA = ${JSON.stringify(!!isQaMode)};
  var IS_ENDED = ${JSON.stringify(!!isEnded)};
  var HAS_PRESENCE = ${JSON.stringify(!!hasPresence)};
  var HAS_REACTIONS = ${JSON.stringify(!!hasReactions)};
  var HAS_CTA = ${JSON.stringify(!!hasCta)};
  var AUTHOR_NAME = ${JSON.stringify(authorPlaceholder)};
  // nomacast-lot-2a-v1 : anon_key partagé entre présence et reactions (rempli au 1er heartbeat)
  var ANON_KEY = null;

  // ============ Polling status (live -> ended) ============
  // Pas de polling status en mode ended (l'event est déjà terminé)
  if (!IS_ENDED && STATUS_URL) {
    var statusTimer = null;
    function pollStatus() {
      var qs = window.location.search || '';
      fetch(STATUS_URL + qs, { cache: 'no-store', credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data && data.status && data.status !== 'live') {
            window.location.reload();
            return;
          }
          statusTimer = setTimeout(pollStatus, 30000);
        })
        .catch(function () {
          statusTimer = setTimeout(pollStatus, 30000);
        });
    }
    statusTimer = setTimeout(pollStatus, 30000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        clearTimeout(statusTimer);
        pollStatus();
      }
    });
  }

  // ============ Chat ============
  // En lecture seule (mais event live) : on garde le polling pour afficher les
  // annonces admin (broadcasts du modérateur). Le form est absent côté HTML donc
  // l'envoi est impossible côté participant.
  // En lecture seule + ended : historique des messages (idem mode normal ended).

  var elMessages = document.getElementById('chat-messages');
  var elEmpty = document.getElementById('chat-empty');
  var elForm = document.getElementById('chat-form');
  var elInput = document.getElementById('chat-input');
  var elCounter = document.getElementById('chat-counter');
  var elSendBtn = document.getElementById('chat-send-btn');
  var elError = document.getElementById('chat-error');

  // En mode ended, elForm est absent. Ne PAS bail si pas de form.
  if (!elMessages) return;

  var lastTimestamp = null;
  var seenIds = Object.create(null);
  var chatTimer = null;

  function htmlEscape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function renderMessage(m) {
    if (seenIds[m.id]) return;
    // Filtre en lecture seule : n'afficher QUE les messages admin (annonces broadcast)
    if (IS_LECTURE_SEULE && !IS_ENDED && m.author_kind !== 'admin') return;
    seenIds[m.id] = true;
    if (elEmpty) { elEmpty.style.display = 'none'; }

    var kindClass = 'chat-msg-' + (m.author_kind || 'guest');
    var pinClass = m.kind === 'question' ? ' chat-msg-question' : '';
    var div = document.createElement('div');
    div.className = 'chat-msg ' + kindClass + pinClass;
    div.innerHTML =
      '<div class="chat-msg-head">'
      + '<span class="chat-msg-author">' + htmlEscape(m.author_name) + '</span>'
      + '<span class="chat-msg-time">' + formatTime(m.created_at) + '</span>'
      + '</div>'
      + '<div class="chat-msg-body"></div>';
    div.querySelector('.chat-msg-body').textContent = m.content;
    elMessages.appendChild(div);
  }

  function scrollToBottom(force) {
    var nearBottom = (elMessages.scrollHeight - elMessages.scrollTop - elMessages.clientHeight) < 80;
    if (force || nearBottom) {
      elMessages.scrollTop = elMessages.scrollHeight;
    }
  }

  function pollChat() {
    var url = CHAT_URL;
    if (lastTimestamp) {
      url += '?since=' + encodeURIComponent(lastTimestamp);
    }
    var headers = {};
    if (MAGIC_TOKEN) headers['X-Magic-Token'] = MAGIC_TOKEN;

    fetch(url, { headers: headers, credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.messages && data.messages.length) {
          var atBottom = (elMessages.scrollHeight - elMessages.scrollTop - elMessages.clientHeight) < 80;
          data.messages.forEach(function (m) {
            renderMessage(m);
            if (m.created_at) lastTimestamp = m.created_at;
          });
          if (atBottom) scrollToBottom(true);
        }
      })
      .catch(function () {})
      .then(function () {
        // En mode ended, poll moins fréquent (historique stable)
        chatTimer = setTimeout(pollChat, IS_ENDED ? 15000 : 4000);
      });
  }

  // ============ Form handlers (UNIQUEMENT si form présent) ============
  if (elForm && elInput && !IS_LECTURE_SEULE && !IS_ENDED) {
    if (elCounter) {
      elInput.addEventListener('input', function () {
        elCounter.textContent = elInput.value.length + ' / 500';
      });
    }

    // Lot A5 : Entrée → submit ; Shift+Entrée → nouvelle ligne
    elInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (typeof elForm.requestSubmit === 'function') {
          elForm.requestSubmit();
        } else {
          elForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      }
    });

    // Bouton "Changer pseudo"
    var elPseudoBtn = document.getElementById('chat-pseudo-btn');
    if (elPseudoBtn && !MAGIC_TOKEN) {
      elPseudoBtn.style.display = 'inline-block';
      elPseudoBtn.addEventListener('click', function () {
        var current = '';
        try { current = localStorage.getItem('nomacast-chat-author') || ''; } catch (e) {}
        var newName = (window.prompt('Choisissez un pseudo (utilisé pour tous vos chats Nomacast) :', current) || '').trim();
        if (newName) {
          if (newName.length > 60) newName = newName.slice(0, 60);
          try { localStorage.setItem('nomacast-chat-author', newName); } catch (e) {}
        }
      });
    }

    // Submit handler
    elForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var content = elInput.value.trim();
      if (!content) return;

      var authorName = AUTHOR_NAME;
      if (ACCESS_MODE !== 'private') {
        var stored = '';
        try { stored = localStorage.getItem('nomacast-chat-author') || ''; } catch (e) {}
        if (!authorName) authorName = stored;
        if (!authorName) {
          var input = (window.prompt('Choisissez un pseudo pour participer au chat :', '') || '').trim();
          if (!input) return;
          if (input.length > 60) input = input.slice(0, 60);
          authorName = input;
          try { localStorage.setItem('nomacast-chat-author', authorName); } catch (e) {}
        }
      }

      elSendBtn.disabled = true;
      elError.style.display = 'none';

      var body = { content: content };
      if (IS_QA) body.kind = 'question';
      if (ACCESS_MODE !== 'private') body.author_name = authorName;

      var headers = { 'Content-Type': 'application/json' };
      if (MAGIC_TOKEN) headers['X-Magic-Token'] = MAGIC_TOKEN;

      var url = CHAT_URL + (window.location.search || '');

      fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
        credentials: 'same-origin'
      })
        .then(function (r) {
          return r.json().then(function (data) { return { ok: r.ok, status: r.status, data: data }; })
            .catch(function () { return { ok: r.ok, status: r.status, data: {} }; });
        })
        .then(function (res) {
          if (!res.ok) {
            elError.textContent = (res.data && res.data.error) || ('Erreur ' + res.status);
            elError.style.display = 'block';
          } else {
            elInput.value = '';
            if (elCounter) elCounter.textContent = '0 / 500';
            if (res.data && res.data.message && res.data.message.status === 'approved') {
              renderMessage(res.data.message);
              if (res.data.message.created_at) lastTimestamp = res.data.message.created_at;
              scrollToBottom(true);
            } else {
              elError.textContent = 'Question envoyée. Elle sera diffusée après modération.';
              elError.style.display = 'block';
              elError.classList.add('chat-info');
              setTimeout(function () { elError.style.display = 'none'; elError.classList.remove('chat-info'); }, 4000);
            }
          }
        })
        .catch(function (err) {
          elError.textContent = 'Réseau indisponible : ' + err.message;
          elError.style.display = 'block';
        })
        .then(function () {
          elSendBtn.disabled = false;
        });
    });
  } // fin if (elForm && elInput && !IS_LECTURE_SEULE && !IS_ENDED)

  // Démarrage du polling chat (actif aussi en mode ended pour l'historique)
  pollChat();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      clearTimeout(chatTimer);
      pollChat();
    }
  });

  // ============ Sondages (Phase C) ============
  // Pas de polling sondage en mode ended (l'event est terminé, pas de live polls)
  if (!IS_ENDED && POLLS_ACTIVE_URL) {
    var pollZone = document.getElementById('live-poll-zone');
    var pollTimer = null;
    var currentPollId = null;  // id du sondage actuellement affiché
    var hasVoted = false;
    var submittingVote = false;
    var historyIndex = 0;       // index dans le carrousel d'history (closed)
    var displayState = 'none';  // 'active' | 'history' | 'none'

    function renderState(active, history) {
      // Décision : que montre-t-on ?
      // - Si active live → on l'affiche en mode vote/résultats
      // - Sinon si history non vide → on affiche history[historyIndex] en mode lecture
      // - Sinon → on cache la zone
      if (active) {
        renderPollCard(active, 'active', history);
      } else if (history && history.length > 0) {
        if (historyIndex >= history.length) historyIndex = 0;
        if (historyIndex < 0) historyIndex = history.length - 1;
        renderPollCard(history[historyIndex], 'history', history);
      } else {
        pollZone.style.display = 'none';
        pollZone.innerHTML = '';
        currentPollId = null;
        hasVoted = false;
        displayState = 'none';
      }
    }

    function renderPollCard(poll, mode, history) {
      // mode : 'active' (live, votable) | 'history' (closed, lecture seule)
      var isHistory = (mode === 'history');
      var serverSaysVoted = !!poll.my_vote;

      if (currentPollId !== poll.id) {
        currentPollId = poll.id;
        hasVoted = serverSaysVoted;
      } else if (serverSaysVoted) {
        hasVoted = true;
      }
      displayState = mode;
      pollZone.style.display = '';

      var html = '<div class="live-poll-card' + (isHistory ? ' is-closed' : '') + '">';

      // Header row : titre + nav arrows (si history avec >= 2)
      html += '<div class="live-poll-header-row">';
      html += '<div class="live-poll-header">';
      html += '<span class="live-poll-header-dot"></span>';
      if (isHistory) {
        html += '<span>Sondage terminé</span>';
      } else if (hasVoted) {
        html += '<span>Résultats en direct</span>';
      } else {
        html += '<span>Question en direct</span>';
      }
      html += '</div>';

      // Nav arrows seulement si history mode et > 1 sondage
      if (isHistory && history && history.length > 1) {
        html += '<div class="live-poll-nav">';
        html += '<button type="button" class="live-poll-nav-btn" id="live-poll-nav-prev" title="Précédent">‹</button>';
        html += '<span class="live-poll-nav-count">' + (historyIndex + 1) + ' / ' + history.length + '</span>';
        html += '<button type="button" class="live-poll-nav-btn" id="live-poll-nav-next" title="Suivant">›</button>';
        html += '</div>';
      }
      html += '</div>';

      html += '<div class="live-poll-question">' + htmlEscape(poll.question) + '</div>';

      var options = poll.options || [];
      var showVoteForm = (mode === 'active' && !hasVoted);

      if (showVoteForm) {
        html += '<div class="live-poll-options-vote">';
        options.forEach(function (o, i) {
          html += '<label class="live-poll-option-vote">';
          html += '<input type="radio" name="poll-' + htmlEscape(poll.id) + '" value="' + htmlEscape(o.id) + '"' + (i === 0 ? ' checked' : '') + '>';
          html += '<span class="live-poll-option-text">' + htmlEscape(o.label) + '</span>';
          html += '</label>';
        });
        html += '</div>';
        html += '<button type="button" class="live-poll-vote-btn" id="live-poll-vote-btn"' + (submittingVote ? ' disabled' : '') + '>';
        html += submittingVote ? 'Envoi…' : 'Voter';
        html += '</button>';
        html += '<div class="live-poll-error" id="live-poll-error" style="display:none;"></div>';
      } else {
        // Mode résultats : barres %
        html += '<div class="live-poll-options-results">';
        options.forEach(function (o) {
          var pct = (o.percentage != null ? o.percentage : 0);
          var isMine = (poll.my_vote === o.id);
          html += '<div class="live-poll-result-row' + (isMine ? ' is-mine' : '') + '">';
          html += '<div class="live-poll-result-bar-bg" style="width:' + pct + '%;"></div>';
          html += '<div class="live-poll-result-content">';
          html += '<div class="live-poll-result-label">' + htmlEscape(o.label);
          if (isMine) html += '<span class="live-poll-result-mine-badge">✓ votre vote</span>';
          html += '</div>';
          html += '<div class="live-poll-result-pct">' + pct + '%</div>';
          html += '</div>';
          html += '</div>';
        });
        html += '</div>';
        var totalVotes = poll.total_votes != null ? poll.total_votes : 0;
        html += '<div class="live-poll-footer">' + totalVotes + ' vote' + (totalVotes !== 1 ? 's' : '') + ' au total</div>';
      }
      html += '</div>';
      pollZone.innerHTML = html;

      // Handlers
      if (showVoteForm) {
        var voteBtn = document.getElementById('live-poll-vote-btn');
        if (voteBtn) voteBtn.addEventListener('click', function () { submitVote(poll.id); });
      }
      if (isHistory && history && history.length > 1) {
        var prevBtn = document.getElementById('live-poll-nav-prev');
        var nextBtn = document.getElementById('live-poll-nav-next');
        if (prevBtn) prevBtn.addEventListener('click', function () {
          historyIndex = (historyIndex - 1 + history.length) % history.length;
          currentPollId = null; // force re-render (peut changer hasVoted)
          renderPollCard(history[historyIndex], 'history', history);
        });
        if (nextBtn) nextBtn.addEventListener('click', function () {
          historyIndex = (historyIndex + 1) % history.length;
          currentPollId = null;
          renderPollCard(history[historyIndex], 'history', history);
        });
      }
    }

    function submitVote(pollId) {
      var checked = pollZone.querySelector('input[type="radio"]:checked');
      if (!checked) return;
      var optionId = checked.value;
      submittingVote = true;
      var voteBtn = document.getElementById('live-poll-vote-btn');
      var errEl = document.getElementById('live-poll-error');
      if (voteBtn) { voteBtn.disabled = true; voteBtn.textContent = 'Envoi…'; }
      if (errEl) errEl.style.display = 'none';

      var headers = { 'Content-Type': 'application/json' };
      if (MAGIC_TOKEN) headers['X-Magic-Token'] = MAGIC_TOKEN;

      fetch(VOTE_URL_BASE + '/' + encodeURIComponent(pollId) + '/vote', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: headers,
        body: JSON.stringify({ option_id: optionId })
      })
        .then(function (r) {
          return r.json().then(function (body) { return { status: r.status, ok: r.ok, body: body }; });
        })
        .then(function (res) {
          submittingVote = false;
          if (res.ok) {
            hasVoted = true;
            clearTimeout(pollTimer);
            pollActivePolls();
          } else {
            var msg = (res.body && res.body.error) || ('Erreur ' + res.status);
            if (errEl) {
              errEl.textContent = msg;
              errEl.style.display = 'block';
            }
            if (voteBtn) { voteBtn.disabled = false; voteBtn.textContent = 'Voter'; }
            if (res.status === 409) {
              clearTimeout(pollTimer);
              pollActivePolls();
            }
          }
        })
        .catch(function (err) {
          submittingVote = false;
          if (errEl) {
            errEl.textContent = 'Réseau indisponible : ' + err.message;
            errEl.style.display = 'block';
          }
          if (voteBtn) { voteBtn.disabled = false; voteBtn.textContent = 'Voter'; }
        });
    }

    function pollActivePolls() {
      var headers = {};
      if (MAGIC_TOKEN) headers['X-Magic-Token'] = MAGIC_TOKEN;
      var qs = window.location.search || '';
      fetch(POLLS_ACTIVE_URL + qs, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: headers
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data) {
            renderState(data.poll || null, data.history || []);
          } else {
            renderState(null, []);
          }
        })
        .catch(function () {})
        .then(function () {
          pollTimer = setTimeout(pollActivePolls, 5000);
        });
    }

    pollActivePolls();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        clearTimeout(pollTimer);
        pollActivePolls();
      }
    });
  }

  // ============================================================
  // SIGNALER UN PROBLÈME TECHNIQUE
  // ============================================================
  (function setupReportIssue() {
    if (!REPORT_ISSUE_URL) return;
    var trigger = document.getElementById('report-issue-trigger');
    var overlay = document.getElementById('report-issue-overlay');
    var content = document.getElementById('report-issue-content');
    if (!trigger || !overlay || !content) return;

    var initialHtml = content.innerHTML;

    function openModal() {
      content.innerHTML = initialHtml;
      bindOptions();
      overlay.classList.add('is-open');
    }
    function closeModal() {
      overlay.classList.remove('is-open');
    }

    function bindOptions() {
      var btns = content.querySelectorAll('.report-issue-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function () {
          sendReport(this.getAttribute('data-type'));
        });
      }
      var cancelBtn = document.getElementById('report-issue-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    }

    function showFeedback(kind, message) {
      var btnLabel = kind === 'success' ? 'Fermer' : 'Annuler';
      content.innerHTML =
        '<div class="report-issue-feedback is-' + kind + '">' + message + '</div>' +
        '<div class="report-issue-foot">' +
          '<button type="button" class="report-issue-cancel" id="report-issue-close-feedback">' + btnLabel + '</button>' +
        '</div>';
      document.getElementById('report-issue-close-feedback').addEventListener('click', closeModal);
    }

    async function sendReport(type) {
      var btns = content.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) btns[i].disabled = true;

      var body = { type: type };
      // INVITEE_ID est défini dans _token_.js mais pas ici (chat public)
      if (typeof INVITEE_ID !== 'undefined' && INVITEE_ID) body.invitee_id = INVITEE_ID;

      try {
        var res = await fetch(REPORT_ISSUE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (res.ok) {
          showFeedback('success', 'Signalement envoyé. Notre équipe technique a été alertée.');
        } else {
          var rawText = await res.text().catch(function () { return ''; });
          var parsed = null;
          try { parsed = JSON.parse(rawText); } catch (e) {}
          var reason = parsed && parsed.error
            ? parsed.error
            : (rawText.length < 200 && rawText ? rawText : 'envoi impossible');
          console.error('[report-issue]', res.status, REPORT_ISSUE_URL, rawText.slice(0, 500));
          showFeedback('error', 'Erreur (HTTP ' + res.status + ') : ' + reason + '. Réessayez ou contactez l\\'organisateur.');
        }
      } catch (e) {
        console.error('[report-issue network]', e);
        showFeedback('error', 'Erreur réseau : ' + e.message + '. Vérifiez votre connexion.');
      }
    }

    trigger.addEventListener('click', openModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeModal();
    });
  })();

  // ============================================================
  // nomacast-lot-2a-v1 : C2 Présence (heartbeat + compteur)
  // Anonyme : 1er heartbeat envoyé sans identifiant, serveur génère anon_key depuis IP,
  // on le récupère dans la réponse et l'utilise pour les heartbeats suivants.
  // ============================================================
  if (HAS_PRESENCE && PRESENCE_HEARTBEAT_URL && PRESENCE_STATS_URL && !IS_ENDED) {
    (function setupPresence() {
      var presenceBadge = document.getElementById('presence-badge');
      var presenceCount = document.getElementById('presence-count');
      var heartbeatTimer = null;
      var statsTimer = null;

      function sendHeartbeat() {
        var body = ANON_KEY ? { anon_key: ANON_KEY } : {};
        fetch(PRESENCE_HEARTBEAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'same-origin',
          cache: 'no-store'
        })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (data && data.anon_key && !ANON_KEY) {
              ANON_KEY = data.anon_key;
            }
          })
          .catch(function () {});
      }

      function fetchStats() {
        fetch(PRESENCE_STATS_URL, { cache: 'no-store', credentials: 'same-origin' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (data && typeof data.online === 'number') {
              if (presenceCount) presenceCount.textContent = data.online;
              if (presenceBadge) presenceBadge.style.display = '';
            }
          })
          .catch(function () {});
      }

      // Premier appel immédiat puis intervalles
      sendHeartbeat();
      fetchStats();
      heartbeatTimer = setInterval(sendHeartbeat, 30000);
      statsTimer = setInterval(fetchStats, 20000);

      // Re-pinger immédiatement quand l'onglet redevient visible
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          sendHeartbeat();
          fetchStats();
        }
      });

      // Heartbeat final sur unload (sendBeacon ne supporte pas application/json par défaut,
      // on utilise un Blob typé pour rester compatible)
      window.addEventListener('pagehide', function () {
        try {
          if (!ANON_KEY) return; // pas d'anon_key encore = pas la peine
          var blob = new Blob([JSON.stringify({ anon_key: ANON_KEY })], { type: 'application/json' });
          navigator.sendBeacon && navigator.sendBeacon(PRESENCE_HEARTBEAT_URL, blob);
        } catch (e) {}
      });
    })();
  }

  // ============================================================
  // nomacast-lot-2a-v1 : C1 Reactions (envoi + polling + overlay éphémère)
  // Pas de spawn optimiste : l'API /recent ne renvoie pas l'invitee_id/anon_key,
  // donc impossible de dédupliquer. On attend le polling pour spawn (~2s de latence).
  // nomacast-lot-2a-bis-l2-v1 : + polling 15s sur /reactions/config pour barre dynamique en live
  // ============================================================
  if (HAS_REACTIONS && REACTIONS_URL && REACTIONS_RECENT_URL && !IS_ENDED) {
    (function setupReactions() {
      var bar = document.getElementById('reactions-bar');
      var overlay = document.getElementById('reactions-overlay');
      if (!bar || !overlay) return;

      var lastSince = new Date().toISOString();
      var pollTimer = null;
      var configTimer = null;
      var sendCooldown = false;
      // État courant de la barre : référence pour détecter un changement via polling config
      var currentEmojis = (Array.isArray(REACTION_EMOJIS) && REACTION_EMOJIS.length > 0)
        ? REACTION_EMOJIS.slice()
        : [];

      // Click → POST reaction (feedback visuel via :active CSS, transform scale 0.92)
      bar.addEventListener('click', function (e) {
        var btn = e.target.closest('.reaction-btn');
        if (!btn || sendCooldown) return;
        var emoji = btn.getAttribute('data-emoji');
        if (!emoji) return;
        // Throttling local 250ms pour éviter spam de clics
        sendCooldown = true;
        setTimeout(function () { sendCooldown = false; }, 250);
        // POST : pas de invitee_id (anonyme), le serveur identifie par IP pour rate-limit
        fetch(REACTIONS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji: emoji }),
          credentials: 'same-origin',
          cache: 'no-store'
        }).catch(function () {});
      });

      function fetchRecent() {
        var url = REACTIONS_RECENT_URL + (REACTIONS_RECENT_URL.indexOf('?') >= 0 ? '&' : '?') + 'since=' + encodeURIComponent(lastSince);
        fetch(url, { cache: 'no-store', credentials: 'same-origin' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (!data) return;
            // API : { reactions: [{ emoji, created_at }], totals: { '👏': N, ... }, server_time: '<ISO>' }
            if (Array.isArray(data.reactions)) {
              data.reactions.forEach(function (r) {
                if (r.emoji) spawnFloat(r.emoji);
              });
              if (data.reactions.length > 0) {
                lastSince = data.reactions[data.reactions.length - 1].created_at || lastSince;
              } else if (data.server_time) {
                lastSince = data.server_time;
              }
            }
            // Totaux 5min : on n'écrase QUE les compteurs des emojis présents dans la barre actuelle
            if (data.totals && typeof data.totals === 'object') {
              Object.keys(data.totals).forEach(function (emoji) {
                var span = bar.querySelector('.reaction-count[data-for="' + cssEscape(emoji) + '"]');
                if (span) span.textContent = data.totals[emoji] || 0;
              });
            }
          })
          .catch(function () {});
      }

      function spawnFloat(emoji) {
        var f = document.createElement('div');
        f.className = 'reaction-float';
        f.textContent = emoji;
        f.style.left = (10 + Math.random() * 70) + '%';
        overlay.appendChild(f);
        setTimeout(function () {
          if (f.parentNode) f.parentNode.removeChild(f);
        }, 2000);
      }

      function cssEscape(s) {
        if (window.CSS && CSS.escape) return CSS.escape(s);
        return String(s).replace(/(["\\\\\\[\\]])/g, '\\\\$1');
      }

      // nomacast-lot-2a-bis-l2-v1 : escape attribut HTML minimal (pour les emojis dans les data-attrs)
      function escAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }

      // nomacast-lot-2a-bis-l2-v1 : génère le HTML d'un bouton (miroir client du buildReactionsBarHtml serveur)
      function buildBtnHtml(emoji) {
        var label = REACTION_LABELS[emoji] || emoji;
        return '<button type="button" class="reaction-btn" data-emoji="' + escAttr(emoji) + '" aria-label="' + escAttr(label) + '">'
          + escAttr(emoji) + '<span class="reaction-count" data-for="' + escAttr(emoji) + '">0</span></button>';
      }

      // nomacast-lot-2a-bis-l2-v1 : compare 2 listes d'emojis (order-sensitive)
      function sameList(a, b) {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; }
        return true;
      }

      // nomacast-lot-2a-bis-l2-v1 : rebuild de la barre avec fade 200ms et préservation des compteurs
      function rebuildBar(newEmojis) {
        // Snapshot des compteurs actuels avant swap (on les remettra pour les emojis conservés)
        var counts = {};
        var spans = bar.querySelectorAll('.reaction-count');
        for (var i = 0; i < spans.length; i++) {
          var e = spans[i].getAttribute('data-for');
          if (e) counts[e] = spans[i].textContent;
        }
        // Fade out via opacity (CSS transition 0.2s déjà déclarée sur .reactions-bar)
        bar.style.opacity = '0';
        setTimeout(function () {
          bar.innerHTML = newEmojis.map(buildBtnHtml).join('');
          // Restauration des compteurs pour les emojis encore présents
          newEmojis.forEach(function (em) {
            if (counts[em] != null) {
              var s = bar.querySelector('.reaction-count[data-for="' + cssEscape(em) + '"]');
              if (s) s.textContent = counts[em];
            }
          });
          // Fade in
          bar.style.opacity = '1';
          currentEmojis = newEmojis.slice();
        }, 200);
      }

      // nomacast-lot-2a-bis-l2-v1 : polling 15s sur /reactions/config pour propagation live
      function fetchConfig() {
        if (!REACTIONS_CONFIG_URL) return;
        fetch(REACTIONS_CONFIG_URL, { cache: 'no-store', credentials: 'same-origin' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (!data || !Array.isArray(data.emojis) || data.emojis.length === 0) return;
            if (!sameList(data.emojis, currentEmojis)) {
              rebuildBar(data.emojis);
            }
          })
          .catch(function () {});
      }

      fetchRecent();
      pollTimer = setInterval(fetchRecent, 2000);
      if (REACTIONS_CONFIG_URL) {
        configTimer = setInterval(fetchConfig, 15000);
      }
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          // Reset le curseur pour ne pas spawn 50 reactions d'un coup au retour
          lastSince = new Date().toISOString();
          fetchRecent();
          // Resync immédiat de la config aussi (au cas où l'admin l'a changée pendant l'absence)
          fetchConfig();
        }
      });
    })();
  }

  // ============================================================
  // nomacast-lot-2a-v1 : C4 CTA banner (polling + dismiss persistant localStorage)
  // ============================================================
  if (HAS_CTA && CTA_ACTIVE_URL && !IS_ENDED) {
    (function setupCta() {
      var banner = document.getElementById('cta-banner');
      var btnEl = document.getElementById('cta-banner-button');
      var closeEl = document.getElementById('cta-banner-close');
      if (!banner || !btnEl || !closeEl) return;

      var DISMISSED_PREFIX = 'nomacast-cta-dismissed-';
      var currentCtaId = null;
      var pollTimer = null;

      function isDismissed(ctaId) {
        try { return !!localStorage.getItem(DISMISSED_PREFIX + ctaId); }
        catch (e) { return false; }
      }
      function markDismissed(ctaId) {
        try { localStorage.setItem(DISMISSED_PREFIX + ctaId, '1'); } catch (e) {}
      }

      closeEl.addEventListener('click', function () {
        if (currentCtaId) markDismissed(currentCtaId);
        banner.style.display = 'none';
      });

      function fetchActive() {
        fetch(CTA_ACTIVE_URL, { cache: 'no-store', credentials: 'same-origin' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            // API : { cta: { id, label, url, activated_at, expires_in_seconds } } ou { cta: null }
            var cta = data && data.cta ? data.cta : null;
            if (!cta || !cta.id || !cta.url || isDismissed(cta.id)) {
              banner.style.display = 'none';
              currentCtaId = null;
              return;
            }
            if (cta.id === currentCtaId) return; // pas de changement
            currentCtaId = cta.id;
            btnEl.textContent = cta.label || 'Découvrir';
            btnEl.setAttribute('href', cta.url);
            banner.style.display = '';
          })
          .catch(function () {});
      }

      fetchActive();
      pollTimer = setInterval(fetchActive, 10000);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') fetchActive();
      });
    })();
  }

})();
<\/script>`;
}

// ============================================================
// Helpers Countdown + polling (page draft)
// Duplication assumée avec functions/i/[token].js - pas d'import croisé.
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
        L'événement va bientôt commencer.
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

    // Lot A1 : masquer progressivement les unités à zéro
    function setUnitVisible(el, visible) {
      if (!el) return;
      var unit = el.parentElement;
      if (unit && unit.classList.contains('countdown-unit')) {
        unit.style.display = visible ? '' : 'none';
      }
    }
    setUnitVisible(elDays,    d > 0);
    setUnitVisible(elHours,   d > 0 || h > 0);
    setUnitVisible(elMinutes, d > 0 || h > 0 || m > 0);
    // Secondes toujours visibles
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
    `\n\nPour rejoindre : ${chatLink}\n\nPropulsé par Nomacast - https://nomacast.fr`;

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
  if (!mins) return '-';
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
