// functions/quote/[id].js
// GET /quote/<id>
//
// Page de partage : affiche la citation graphiquement (HTML/CSS) avec
// meta OG pour LinkedIn, et un bouton "Partager sur LinkedIn".
// LinkedIn lit les OG tags lors du partage du lien.

export const onRequestGet = async ({ params, request, env }) => {
  try {
    if (!env.DB) return notFound('D1 manquant');

    const q = await env.DB.prepare(`
      SELECT q.id, q.content, q.speaker_name, q.author_name, q.created_at, q.status,
             e.title AS event_title, e.slug AS event_slug, e.primary_color
      FROM event_quotes q
      JOIN events e ON e.id = q.event_id
      WHERE q.id = ?
    `).bind(params.id).first();

    if (!q || !['approved', 'pinned'].includes(q.status)) {
      return notFound('Citation introuvable ou non publiée');
    }

    const color = (q.primary_color && /^#[0-9a-fA-F]{6}$/.test(q.primary_color)) ? q.primary_color : '#5A98D6';
    const speaker = q.speaker_name || '—';
    const url = new URL(request.url);
    const ogUrl = `${url.origin}/quote/${q.id}`;
    const ogImage = `${url.origin}/og-image.webp`; // image générique Nomacast (fallback)
    const ogTitle = `« ${truncate(q.content, 100)} »`;
    const ogDescription = `Citation de ${speaker} — ${q.event_title} · partagée via Nomacast`;

    const shareUrl = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(ogUrl);
    const twitterUrl = 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(ogUrl) + '&text=' + encodeURIComponent(ogTitle);

    const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(ogTitle)}</title>
  <meta name="description" content="${escapeHtml(ogDescription)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(ogUrl)}">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(ogDescription)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  <link rel="canonical" href="${escapeHtml(ogUrl)}">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, ${color} 0%, ${color}cc 100%);
      color: #ffffff;
      display: flex; align-items: center; justify-content: center;
      padding: 32px 20px;
    }
    .card {
      max-width: 720px; width: 100%;
      background: rgba(255,255,255,0.06);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 18px;
      padding: 48px 40px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .quote-mark {
      font-size: 72px; line-height: 1;
      color: rgba(255,255,255,0.4);
      margin-bottom: 12px; font-family: Georgia, serif;
    }
    .quote-content {
      font-size: clamp(20px, 3.5vw, 30px);
      font-weight: 600; line-height: 1.35;
      letter-spacing: -0.01em;
      color: #ffffff;
      margin: 0 0 24px;
    }
    .quote-speaker {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.85);
      margin: 0 0 6px;
    }
    .quote-event {
      font-size: 13px;
      color: rgba(255,255,255,0.65);
      margin: 0;
    }
    .actions {
      margin-top: 36px; padding-top: 24px;
      border-top: 1px solid rgba(255,255,255,0.15);
      display: flex; gap: 10px; flex-wrap: wrap;
    }
    .btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 18px;
      background: #ffffff; color: ${color};
      text-decoration: none;
      border-radius: 8px;
      font-size: 14px; font-weight: 700;
      letter-spacing: 0.02em;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.9; }
    .btn-ghost {
      background: transparent;
      color: #ffffff;
      border: 1px solid rgba(255,255,255,0.4);
    }
    .footer {
      margin-top: 32px;
      font-size: 11px;
      color: rgba(255,255,255,0.55);
      text-align: center;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .footer a { color: #ffffff; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="quote-mark">"</div>
    <p class="quote-content">${escapeHtml(q.content)}</p>
    <p class="quote-speaker">${escapeHtml(speaker)}</p>
    <p class="quote-event">${escapeHtml(q.event_title)}</p>
    <div class="actions">
      <a class="btn" href="${escapeHtml(shareUrl)}" target="_blank" rel="noopener">Partager sur LinkedIn</a>
      <a class="btn btn-ghost" href="${escapeHtml(twitterUrl)}" target="_blank" rel="noopener">Partager sur X</a>
    </div>
    <p class="footer"><a href="https://www.nomacast.fr" target="_blank" rel="noopener">Nomacast · live streaming corporate</a></p>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Robots-Tag': 'index, follow'  // OK pour partage social
      }
    });
  } catch (err) {
    console.error('[quote page]', err);
    return notFound('Erreur serveur');
  }
};

function notFound(msg) {
  return new Response('<!doctype html><html><body style="font-family:sans-serif;padding:32px;"><h1>Citation introuvable</h1><p>' + escapeHtml(msg) + '</p></body></html>', {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function truncate(s, n) {
  s = String(s || '');
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
