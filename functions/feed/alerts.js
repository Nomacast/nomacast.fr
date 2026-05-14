// functions/feed/alerts.js
// GET /feed/alerts?event=<event_id>&token=<hmac>[&bg=transparent|dark]
//
// Page HTML standalone que vMix charge en Browser Input.
// Polling toutes les 2 secondes de /api/feed/alerts.
// Style adapté à un overlay broadcast (texte gros, contrasté, animations).

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const eventId = (url.searchParams.get('event') || '').trim();
  const token = (url.searchParams.get('token') || '').trim();
  const bg = (url.searchParams.get('bg') || 'dark').trim();
  const w = (url.searchParams.get('w') || '480').trim();
  // Note : on n'authentifie PAS ici, c'est juste le shell HTML.
  // La vérification du token se fait côté endpoint JSON (/api/feed/alerts).

  if (!eventId || !token) {
    return new Response(
      `<!doctype html><html><body style="font-family:sans-serif;padding:20px;color:#b91c1c;background:#000;">
        <h2>Paramètres manquants</h2>
        <p>URL requise : <code>/feed/alerts?event=ID&amp;token=TOKEN</code></p>
        <p>Génère l'URL complète depuis la régie <code>/admin/live.html</code> → bouton "Copier URL vMix".</p>
      </body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const bodyBg = bg === 'transparent' ? 'transparent' : '#0f172a';

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Feed alertes — vMix</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; }
    body {
      background: ${bodyBg};
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 16px;
      line-height: 1.35;
      padding: 12px;
      overflow: hidden;
    }
    .feed-root {
      width: 100%;
      max-width: 100%;
    }
    .feed-card {
      background: rgba(0, 0, 0, 0.85);
      border: 2px solid rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      padding: 12px 16px;
      transition: border-color 0.3s, background 0.3s, box-shadow 0.3s;
    }
    .feed-card.state-calm {
      border-color: rgba(74, 222, 128, 0.5);
    }
    .feed-card.state-audio {
      border-color: #f59e0b;
      box-shadow: 0 0 24px rgba(245, 158, 11, 0.4);
    }
    .feed-card.state-video {
      border-color: #3b82f6;
      box-shadow: 0 0 24px rgba(59, 130, 246, 0.4);
    }
    .feed-card.state-both {
      border-color: #ef4444;
      box-shadow: 0 0 24px rgba(239, 68, 68, 0.5);
    }
    .feed-card.flash {
      animation: feed-flash 0.6s ease-out;
    }
    @keyframes feed-flash {
      0%   { background: rgba(239, 68, 68, 0.85); }
      100% { background: rgba(0, 0, 0, 0.85); }
    }
    .feed-header {
      display: flex; align-items: center; gap: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      margin-bottom: 8px;
    }
    .feed-dot {
      width: 12px; height: 12px;
      border-radius: 50%;
      background: #4ade80;
      flex-shrink: 0;
    }
    .feed-card.state-audio .feed-dot { background: #f59e0b; animation: feed-pulse 1.4s infinite; }
    .feed-card.state-video .feed-dot { background: #3b82f6; animation: feed-pulse 1.4s infinite; }
    .feed-card.state-both  .feed-dot { background: #ef4444; animation: feed-pulse 1s infinite; }
    @keyframes feed-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50%      { transform: scale(1.5); opacity: 0.5; }
    }
    .feed-title {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.9);
      line-height: 1.2;
      flex: 1;
    }
    .feed-card.state-audio .feed-title { color: #fbbf24; }
    .feed-card.state-video .feed-title { color: #60a5fa; }
    .feed-card.state-both  .feed-title { color: #fca5a5; }
    .feed-count {
      font-size: 22px; font-weight: 900;
      font-variant-numeric: tabular-nums;
      color: #ffffff;
      line-height: 1;
    }
    .feed-list {
      display: flex; flex-direction: column;
      gap: 6px;
    }
    .feed-item {
      display: flex; align-items: center;
      gap: 8px;
      padding: 6px 8px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      font-size: 13px;
    }
    .feed-item-type {
      flex-shrink: 0;
      font-size: 10px; font-weight: 800;
      letter-spacing: 0.06em;
      padding: 3px 6px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .feed-item-type.t-audio { background: #f59e0b; color: #1c1917; }
    .feed-item-type.t-video { background: #3b82f6; color: #ffffff; }
    .feed-item-type.t-both  { background: #ef4444; color: #ffffff; }
    .feed-item-author {
      flex: 1; min-width: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      font-weight: 600;
      color: #ffffff;
    }
    .feed-item-time {
      flex-shrink: 0;
      color: rgba(255,255,255,0.55);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    .feed-empty {
      color: rgba(255,255,255,0.5);
      font-size: 12px;
      font-style: italic;
      text-align: center;
      padding: 6px 0;
    }
    .feed-error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid #ef4444;
      color: #fca5a5;
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 12px;
      margin-top: 8px;
    }
    .feed-foot {
      margin-top: 8px;
      font-size: 10px;
      color: rgba(255,255,255,0.35);
      text-align: center;
      letter-spacing: 0.05em;
    }
  </style>
</head>
<body>
  <div class="feed-root">
    <div class="feed-card state-calm" id="feed-card">
      <div class="feed-header">
        <span class="feed-dot"></span>
        <span class="feed-title" id="feed-title">Aucune alerte</span>
        <span class="feed-count" id="feed-count">0</span>
      </div>
      <div class="feed-list" id="feed-list">
        <div class="feed-empty" id="feed-empty">Aucune alerte technique des 60 dernières minutes.</div>
      </div>
      <div class="feed-foot" id="feed-foot">— en ligne —</div>
    </div>
  </div>

<script>
(function () {
  var EVENT_ID = ${JSON.stringify(eventId)};
  var TOKEN = ${JSON.stringify(token)};
  var API_URL = '/api/feed/alerts?event=' + encodeURIComponent(EVENT_ID) + '&token=' + encodeURIComponent(TOKEN);

  var card     = document.getElementById('feed-card');
  var titleEl  = document.getElementById('feed-title');
  var countEl  = document.getElementById('feed-count');
  var listEl   = document.getElementById('feed-list');
  var emptyEl  = document.getElementById('feed-empty');
  var footEl   = document.getElementById('feed-foot');

  var TYPE_LABEL_FR = { audio: 'son', video: 'image', both: 'son + image' };
  var TYPE_TITLE_FR = { audio: 'Problème audio', video: 'Problème vidéo', both: 'Problème audio + vidéo' };
  var SEVERITY = { audio: 1, video: 2, both: 3 }; // both = worst

  var seenIds = {};
  var pollTimer = null;
  var consecutiveErrors = 0;

  function htmlEscape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function timeAgo(iso) {
    var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 5)    return "à l'instant";
    if (diff < 60)   return 'il y a ' + diff + ' s';
    if (diff < 3600) return 'il y a ' + Math.floor(diff / 60) + ' min';
    var h = Math.floor(diff / 3600);
    return 'il y a ' + h + ' h';
  }

  function worstType(alerts) {
    var max = 0; var winner = null;
    alerts.forEach(function (a) {
      var s = SEVERITY[a.type] || 0;
      if (s > max) { max = s; winner = a.type; }
    });
    return winner;
  }

  function setState(stateClass) {
    card.classList.remove('state-calm', 'state-audio', 'state-video', 'state-both');
    card.classList.add(stateClass);
  }

  function flash() {
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
  }

  function render(alerts) {
    var count = alerts.length;
    countEl.textContent = String(count);

    if (count === 0) {
      setState('state-calm');
      titleEl.textContent = 'Aucune alerte';
      listEl.innerHTML = '<div class="feed-empty">Aucune alerte technique des 60 dernières minutes.</div>';
      return;
    }

    var worst = worstType(alerts);
    setState('state-' + worst);

    if (count === 1) {
      titleEl.textContent = TYPE_TITLE_FR[alerts[0].type] || 'Alerte technique';
    } else {
      titleEl.textContent = count + ' alertes techniques';
    }

    var html = '';
    alerts.slice(0, 5).forEach(function (a) {
      html += '<div class="feed-item">'
        +   '<span class="feed-item-type t-' + htmlEscape(a.type) + '">' + htmlEscape(TYPE_LABEL_FR[a.type] || a.type) + '</span>'
        +   '<span class="feed-item-author">' + htmlEscape(a.author_label || 'Anonyme') + '</span>'
        +   '<span class="feed-item-time">' + htmlEscape(timeAgo(a.created_at)) + '</span>'
        + '</div>';
    });
    if (count > 5) {
      html += '<div class="feed-empty">+ ' + (count - 5) + ' autres alertes</div>';
    }
    listEl.innerHTML = html;
  }

  function detectNewAlerts(alerts) {
    var hasNew = false;
    alerts.forEach(function (a) {
      if (!seenIds[a.id]) hasNew = true;
      seenIds[a.id] = true;
    });
    return hasNew;
  }

  async function poll() {
    try {
      var res = await fetch(API_URL, { cache: 'no-store' });
      if (!res.ok) {
        consecutiveErrors++;
        var t = await res.text().catch(function () { return ''; });
        footEl.textContent = 'Erreur HTTP ' + res.status + (consecutiveErrors > 3 ? ' (' + consecutiveErrors + ')' : '');
        if (res.status === 403) {
          footEl.textContent = 'Token invalide — régénère l\\'URL depuis la régie';
        }
        return;
      }
      consecutiveErrors = 0;
      var data = await res.json();
      var alerts = data.alerts || [];
      var hasNew = detectNewAlerts(alerts);
      render(alerts);
      if (hasNew && alerts.length > 0) flash();
      footEl.textContent = '— en ligne · ' + new Date().toLocaleTimeString('fr-FR') + ' —';
    } catch (err) {
      consecutiveErrors++;
      footEl.textContent = 'Hors ligne (' + consecutiveErrors + ')';
    }
  }

  function loop() {
    poll().finally(function () {
      pollTimer = setTimeout(loop, 2500);
    });
  }
  loop();

  // Refresh times every 10s pour mettre à jour les "il y a X sec"
  setInterval(function () {
    var items = document.querySelectorAll('.feed-item-time');
    if (items.length === 0) return;
    poll(); // re-render complet (simple)
  }, 10000);
})();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
};
