// functions/event-admin/[token].js
// GET /event-admin/:token  →  Page client de gestion des invités.
//
// Le paramètre :token peut être :
//   (a) Un token HMAC dérivé du slug + ADMIN_PASSWORD (legacy admin Nomacast)
//   (b) Le slug de l'event, avec un cookie session client valide pour cet event
//
// Le JS embarqué appelle /api/event-admin/<HMAC>/* (HMAC toujours calculé côté serveur)
// pour les ops CRUD ; le client n'a jamais besoin de connaître le HMAC explicitement
// quand il passe par le cookie session.
//
// Marqueur : nomacast-analytics-visits-tracking-v1 + nomacast-client-credentials-v1

import { getSessionFromRequest } from '../_lib/session.js';

export const onRequestGet = async ({ params, request, env }) => {
  if (!env.DB || !env.ADMIN_PASSWORD) {
    return htmlError('Service indisponible', 'Le service n\'est pas correctement configuré.', 500);
  }

  // ============================================================
  // Résolution du token :
  //  1. Essayer comme HMAC (admin Nomacast — backup)
  //  2. Sinon essayer comme slug + cookie session client
  //  3. Sinon redirection vers /event-admin/login (ou 404 si slug inexistant)
  // ============================================================
  const events = await env.DB.prepare(
    'SELECT id, slug, title, client_name, scheduled_at, status, white_label, primary_color, logo_url, access_mode FROM events'
  ).all();

  let event = null;
  let isClientSession = false;

  // 1. HMAC match (admin Nomacast)
  for (const ev of (events.results || [])) {
    const expected = await computeClientToken(ev.slug, env.ADMIN_PASSWORD);
    if (params.token === expected) { event = ev; break; }
  }

  // 2. Slug match + cookie session
  if (!event) {
    const slugEv = (events.results || []).find(ev => ev.slug === params.token);
    if (slugEv) {
      try {
        const session = await getSessionFromRequest(request, env);
        if (session && session.event_id === slugEv.id) {
          event = slugEv;
          isClientSession = true;
        } else {
          // Slug valide mais pas authentifié → redirection vers login
          const loginUrl = new URL('/event-admin/login', request.url).toString();
          return new Response(null, {
            status: 302,
            headers: { 'Location': loginUrl, 'Cache-Control': 'no-store' }
          });
        }
      } catch (e) {
        const loginUrl = new URL('/event-admin/login', request.url).toString();
        return new Response(null, {
          status: 302,
          headers: { 'Location': loginUrl, 'Cache-Control': 'no-store' }
        });
      }
    }
  }

  if (!event) {
    return htmlError(
      'Lien invalide',
      'Ce lien d\'administration n\'est pas valide ou a été révoqué. Contactez l\'équipe Nomacast.',
      404
    );
  }

  // Si on est en mode cookie (slug), on a besoin de calculer le HMAC en interne
  // pour le passer au JS embarqué qui appelle /api/event-admin/<HMAC>/*
  const apiToken = isClientSession
    ? await computeClientToken(event.slug, env.ADMIN_PASSWORD)
    : params.token;

  // Calcul du token preview admin (HMAC du slug seul) pour permettre au client
  // de voir un aperçu de son event privé via /chat/<slug>?preview=<token>.
  const adminPreviewToken = await computePreviewToken(event.slug, env.ADMIN_PASSWORD);

  // Tracking visits détaillé (analytics - chaque consultation du dashboard client)
  // Permet de mesurer l'engagement client : fréquence de consultation, partage du lien
  // dans l'équipe client (anon_key différent = autre personne), moments-clés (pré/pendant/post-event).
  // Wrappé en try/catch indépendant : non-bloquant pour le rendu de la page.
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
      VALUES (?, ?, NULL, ?, ?, 'event-admin', ?, ?, ?, ?)
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
    console.error('[event-admin/token] visits track failed', err);
  }

  return new Response(renderPage(event, apiToken, adminPreviewToken, isClientSession), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
};

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

// Duplication assumée avec functions/api/admin/events/[id].js et functions/chat/[slug].js
async function computePreviewToken(slug, secret) {
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

function htmlError(title, message, status) {
  return new Response(`<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#f4f6fa;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.box{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:32px;max-width:480px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04)}
h1{margin:0 0 12px;font-size:20px}
p{margin:0;color:#64748b;line-height:1.6;font-size:14px}
</style></head>
<body><div class="box"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div></body>
</html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' }
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
       + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function renderPage(event, token, adminPreviewToken, isClientSession) {
  const apiBase = `/api/event-admin/${token}`;
  const dateLabel = formatDate(event.scheduled_at);
  const isPrivate = event.access_mode === 'private';
  const liveUrl = isPrivate
    ? `https://nomacast.fr/chat/${event.slug}?preview=${adminPreviewToken}`
    : `https://nomacast.fr/chat/${event.slug}`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${escapeHtml(event.title)} — Gestion des invités</title>
<style>
*,*::before,*::after { box-sizing: border-box; }
body {
  margin: 0; font-family: -apple-system,system-ui,'Segoe UI',Roboto,sans-serif;
  background: #f4f6fa; color: #0f172a; min-height: 100vh;
}
.header {
  background: #ffffff; border-bottom: 1px solid #e2e8f0;
  padding: 18px 24px; display: flex; align-items: center; justify-content: space-between;
}
.header-logo {
  text-decoration: none; font-size: 20px; font-weight: 800;
  letter-spacing: -0.5px; line-height: 1;
}
.logo-dot { color: #5D9CEC; }
.logo-text { color: #0f172a; }
.header-baseline {
  font-size: 12px; color: #94a3b8; font-style: italic;
}
@media (max-width: 600px) { .header-baseline { display: none; } }

/* nomacast-tabs-v1 : header en marque blanche (logo client) */
.header-whitelabel {
  justify-content: space-between;
}
.header-client-logo {
  max-height: 36px; max-width: 220px; width: auto; height: auto;
  object-fit: contain;
}

/* nomacast-client-credentials-v1 : bouton déconnexion + alignement */
.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}
.header-logout {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-decoration: none;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.header-logout:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #94a3b8;
}

/* nomacast-tabs-v1 : bandeau d'onglets DATA / RÉGIE LIVE */
.tabs-bar {
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  padding: 0;
  display: flex;
  justify-content: center;
  gap: 0;
}
.tabs-bar-inner {
  display: flex;
  gap: 4px;
  padding: 0 20px;
}
.tab-btn {
  background: transparent;
  border: 0;
  border-bottom: 3px solid transparent;
  padding: 14px 24px 12px;
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  font-family: inherit;
  border-radius: 0;
}
.tab-btn:hover {
  color: #0f172a;
  background: #f8fafc;
}
.tab-btn.active {
  color: #5A98D6;
  border-bottom-color: #5A98D6;
}
.tab-btn-icon {
  font-size: 16px;
  line-height: 1;
}
.tab-panel {
  display: none;
}
.tab-panel.active {
  display: block;
}
.tab-panel-live {
  padding: 0;
}
.tab-iframe-wrap {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 16px 20px 40px;
}
.tab-iframe-frame {
  width: 100%;
  height: calc(100vh - 200px);
  min-height: 600px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #ffffff;
  display: block;
}
.tab-iframe-loading {
  padding: 40px;
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
}

.container { max-width: 900px; margin: 0 auto; padding: 28px 20px 60px; }

.event-card {
  background: linear-gradient(135deg, #5D9CEC 0%, #4A87D6 100%);
  color: #ffffff; border-radius: 14px; padding: 24px 28px; margin-bottom: 24px;
}
.event-card h1 { margin: 0 0 6px; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
.event-card-meta { font-size: 14px; opacity: 0.9; }

/* Lien live de l'event */
.link-card {
  background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px;
  padding: 16px 18px; margin-bottom: 16px;
}
.link-card-head {
  display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
}
.link-card-label {
  font-size: 11px; font-weight: 700; color: #1e40af;
  letter-spacing: 0.1em; text-transform: uppercase;
}
.link-card-badge {
  font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
  letter-spacing: 0.06em; text-transform: uppercase;
}
.link-card-badge-public { background: #dbeafe; color: #1e40af; }
.link-card-badge-private { background: #fef3c7; color: #92400e; }
.link-card-url {
  display: block; word-break: break-all; font-family: ui-monospace, monospace;
  font-size: 13px; color: #1e3a8a; text-decoration: none;
  padding: 8px 10px; background: #fff; border: 1px solid #dbeafe;
  border-radius: 6px; margin-bottom: 10px;
}
.link-card-url:hover { background: #fafbfc; }
.link-card-actions { display: flex; gap: 8px; }
.link-card-warn, .link-card-hint {
  margin: 10px 0 0; font-size: 12px; color: #475569; line-height: 1.5;
}
.link-card-warn { color: #92400e; }

.stats {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;
}
@media (max-width: 540px) { .stats { grid-template-columns: 1fr; } }
.stat {
  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
  padding: 16px 18px;
}
.stat-label { font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 0.1em; text-transform: uppercase; }
.stat-value { font-size: 28px; font-weight: 800; color: #0f172a; margin-top: 4px; line-height: 1; }
.stat-sub { font-size: 12px; color: #64748b; margin-top: 4px; }

.toolbar {
  display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
  padding: 12px 14px; margin-bottom: 12px;
}
.toolbar-spacer { flex: 1; }

.btn {
  display: inline-block; padding: 8px 14px; font-size: 13px; font-weight: 600;
  border-radius: 8px; cursor: pointer; border: 1px solid transparent;
  text-decoration: none; transition: all 0.15s;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: #5D9CEC; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #4A87D6; }
.btn-secondary { background: #f1f5f9; color: #0f172a; border-color: #e2e8f0; }
.btn-secondary:hover:not(:disabled) { background: #e2e8f0; }
.btn-ghost { background: transparent; color: #64748b; }
.btn-ghost:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
.btn-sm { padding: 6px 10px; font-size: 12px; }
.btn-danger { color: #dc2626; }

.table-wrap {
  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;
}
table { width: 100%; border-collapse: collapse; }
th, td { padding: 12px 16px; text-align: left; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
th { background: #fafbfc; font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 0.08em; text-transform: uppercase; }
tr:last-child td { border-bottom: none; }
tbody tr:hover { background: #fafbfc; }
.cell-email { font-weight: 600; color: #0f172a; }
.cell-name { color: #475569; }
.cell-actions { text-align: right; white-space: nowrap; }

.badge {
  display: inline-block; padding: 3px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600;
}
.badge-pending { background: #fef3c7; color: #92400e; }
.badge-sent { background: #d1fae5; color: #065f46; }
.badge-seen { background: #dbeafe; color: #1e40af; }

.empty {
  background: #fff; border: 1px dashed #e2e8f0; border-radius: 12px;
  padding: 60px 24px; text-align: center; color: #94a3b8; font-size: 14px;
}

.message {
  padding: 10px 14px; margin-bottom: 12px; border-radius: 8px; font-size: 13px;
}
.message-success { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
.message-error { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }

.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15,23,42,0.5);
  display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 100;
}
.modal-backdrop[hidden] { display: none; }
.modal {
  background: #fff; border-radius: 14px; padding: 28px;
  max-width: 480px; width: 100%; max-height: 90vh; overflow: auto;
  box-shadow: 0 20px 50px rgba(0,0,0,0.2);
}
.modal h2 { margin: 0 0 16px; font-size: 18px; }
.modal-row { margin-bottom: 12px; }
.modal-row label { display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 4px; }
.modal-row input[type=email], .modal-row input[type=text], .modal-row textarea {
  width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 14px; font-family: inherit;
}
.modal-row textarea { min-height: 200px; resize: vertical; font-family: ui-monospace, monospace; font-size: 13px; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; }

/* CSV import dropzone */
.csv-drop {
  display: flex; align-items: center; justify-content: center;
  min-height: 90px;
  border: 2px dashed #cbd5e1; border-radius: 8px;
  padding: 24px 16px; text-align: center; cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  box-sizing: border-box;
}
.csv-drop:hover, .csv-drop.dragover {
  border-color: #5D9CEC; background: #eff6ff;
}
.csv-drop-text { font-size: 14px; color: #64748b; }
.csv-drop-text strong { color: #5D9CEC; }
.csv-drop-filename { display: block; margin-top: 6px; font-size: 12px; color: #475569; font-style: italic; }
.csv-preview {
  margin-top: 16px; max-height: 240px; overflow: auto;
  border: 1px solid #e2e8f0; border-radius: 6px;
}
.csv-preview table { width: 100%; border-collapse: collapse; font-size: 12px; }
.csv-preview th, .csv-preview td {
  padding: 6px 10px; text-align: left; border-bottom: 1px solid #f1f5f9;
}
.csv-preview thead th {
  background: #fafbfc; position: sticky; top: 0;
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8;
}
.csv-info { margin-top: 14px; font-size: 12px; color: #64748b; }
.csv-error {
  margin-top: 14px; padding: 10px 12px;
  background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;
  border-radius: 6px; font-size: 13px;
}

.muted { color: #94a3b8; }

/* Branding card */
.branding-card {
  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
  margin-bottom: 20px; overflow: hidden;
}
.branding-summary {
  padding: 14px 18px; cursor: pointer; user-select: none;
  display: flex; align-items: center; gap: 10px;
  list-style: none;
}
.branding-summary::-webkit-details-marker { display: none; }
.branding-summary::after {
  content: '▾'; margin-left: auto; color: #94a3b8;
  transition: transform 0.2s;
}
.branding-card[open] .branding-summary::after { transform: rotate(180deg); }
.branding-icon { font-size: 16px; }
.branding-title { font-weight: 700; font-size: 14px; }
.branding-sub { font-size: 12px; color: #94a3b8; }
.branding-body {
  padding: 18px; border-top: 1px solid #f1f5f9;
}
.branding-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 24px;
}
@media (max-width: 600px) { .branding-grid { grid-template-columns: 1fr; } }
.branding-field label {
  display: block; font-size: 12px; font-weight: 700;
  color: #64748b; letter-spacing: 0.04em; text-transform: uppercase;
  margin-bottom: 8px;
}
.branding-hint {
  font-size: 12px; color: #94a3b8; margin: 8px 0 0; line-height: 1.5;
}
.color-row { display: flex; gap: 8px; align-items: center; }
.color-row input[type=color] {
  width: 48px; height: 38px; padding: 0; border: 1px solid #e2e8f0;
  border-radius: 8px; cursor: pointer; background: #fff;
}
.color-row input[type=text] {
  flex: 1; padding: 8px 12px; border: 1px solid #e2e8f0;
  border-radius: 8px; font-family: ui-monospace, monospace;
  font-size: 13px;
}
.logo-preview-wrap {
  width: 100%; height: 80px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: #5D9CEC; margin-bottom: 10px;
  transition: background 0.2s;
}
.logo-preview-wrap img {
  max-height: 50px; max-width: 80%; object-fit: contain;
}
.logo-empty { color: rgba(255,255,255,0.7); font-size: 12px; font-style: italic; }
.logo-actions { display: flex; gap: 6px; }
.branding-footer {
  margin-top: 18px; padding-top: 14px; border-top: 1px solid #f1f5f9;
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
}
.branding-saved { font-size: 12px; color: #16a34a !important; }

.footer {
  margin-top: 40px; padding: 24px; text-align: center;
  font-size: 12px; color: #94a3b8;
}
.footer a { color: #64748b; text-decoration: none; }
.footer a:hover { text-decoration: underline; }

/* nomacast-analytics-event-admin-ui-v1 — styles dashboard statistiques */
.analytics-card {
  background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;
  padding: 18px 20px; margin-top: 24px;
  box-shadow: 0 1px 3px rgba(15,23,42,0.04);
}
.stats-card-header {
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px; margin-bottom: 14px; flex-wrap: wrap;
}
.stats-card-title {
  font-size: 14px; font-weight: 700; color: #0f172a;
  display: flex; align-items: center; gap: 8px;
}
.stats-card-title-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #94a3b8; display: inline-block;
}
.stats-card-title-dot.live {
  background: #ef4444;
  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
  animation: stats-pulse 1.8s infinite;
}
@keyframes stats-pulse {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6); }
  70% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
.stats-card-meta { font-size: 11px; color: #94a3b8; }
.stats-card-actions { display: flex; gap: 8px; align-items: center; }
.stats-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px; margin-bottom: 18px;
}
.stats-tile {
  background: #f8fafc; border: 1px solid #f1f5f9;
  border-radius: 8px; padding: 12px 14px;
}
.stats-tile-label {
  font-size: 10px; font-weight: 700; color: #475569;
  letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 6px;
}
.stats-tile-value { font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1; }
.stats-tile-sub { font-size: 11px; color: #94a3b8; margin-top: 4px; }
.stats-tile.highlight .stats-tile-value { color: #5A98D6; }
.stats-tile.live-now {
  background: rgba(239, 68, 68, 0.05);
  border-color: rgba(239, 68, 68, 0.2);
}
.stats-tile.live-now .stats-tile-value { color: #ef4444; }
.stats-section-title {
  font-size: 11px; font-weight: 700; color: #475569;
  letter-spacing: 0.05em; text-transform: uppercase;
  margin-bottom: 10px; margin-top: 4px;
}
.stats-chart-wrap {
  background: #f8fafc; border: 1px solid #f1f5f9;
  border-radius: 8px; padding: 12px; margin-bottom: 18px;
}
.stats-chart-svg { width: 100%; height: 180px; display: block; }
.stats-chart-empty {
  padding: 30px 12px; text-align: center;
  color: #94a3b8; font-size: 13px; font-style: italic;
}
.stats-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.stats-table th {
  text-align: left; padding: 8px 10px; background: #f8fafc;
  color: #475569; font-weight: 700; font-size: 11px;
  letter-spacing: 0.03em; text-transform: uppercase;
  border-bottom: 1px solid #f1f5f9;
}
.stats-table td {
  padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a;
}
.stats-table tr:last-child td { border-bottom: none; }
.stats-table td.muted { color: #94a3b8; }
.stats-table-empty {
  padding: 18px; text-align: center;
  color: #94a3b8; font-size: 13px; font-style: italic;
}
.stats-present-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: #10b981; margin-right: 6px; vertical-align: middle;
}
.stats-source-badge {
  display: inline-block; font-size: 10px; font-weight: 700;
  padding: 2px 6px; border-radius: 4px;
  background: #f1f5f9; color: #475569;
  text-transform: uppercase; letter-spacing: 0.03em;
}
.stats-source-badge.self { background: rgba(90, 152, 214, 0.08); color: #5A98D6; }
.stats-error {
  padding: 12px 14px; background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #ef4444; border-radius: 8px; font-size: 13px;
}
.stats-loading {
  padding: 18px; text-align: center; color: #94a3b8; font-size: 13px;
}
.btn-csv-export {
  font: inherit; font-size: 12px; font-weight: 600;
  padding: 7px 12px; background: #f1f5f9; color: #0f172a;
  border: 1px solid #e2e8f0; border-radius: 7px;
  cursor: pointer; text-decoration: none; display: inline-flex;
  align-items: center; gap: 6px;
  transition: background 0.15s ease;
}
.btn-csv-export:hover { background: #e2e8f0; }
</style>
</head>
<body>

<!-- nomacast-tabs-v1 : header conditionné selon white_label -->
${event.white_label === 1 || event.white_label === true
  ? (event.logo_url
    ? `<header class="header header-whitelabel">
        <div class="header-left">
          <img src="${escapeHtml(event.logo_url)}" alt="${escapeHtml(event.client_name || event.title)}" class="header-client-logo">
          <span class="header-baseline">Espace organisateur</span>
        </div>
        ${isClientSession ? `<a href="/event-admin/logout" class="header-logout">Déconnexion</a>` : ''}
      </header>`
    : `<header class="header header-whitelabel">
        <span class="header-baseline">Espace organisateur</span>
        ${isClientSession ? `<a href="/event-admin/logout" class="header-logout">Déconnexion</a>` : ''}
      </header>`)
  : `<header class="header">
      <a href="https://www.nomacast.fr/" target="_blank" rel="noopener" class="header-logo">
        <span class="logo-dot">&bull;</span><span class="logo-text">&nbsp;Nomacast</span>
      </a>
      <div class="header-right">
        <span class="header-baseline">Gestion des invités</span>
        ${isClientSession ? `<a href="/event-admin/logout" class="header-logout">Déconnexion</a>` : ''}
      </div>
    </header>`}

<!-- nomacast-tabs-v1 : bandeau d'onglets DATA / RÉGIE LIVE -->
<div class="tabs-bar">
  <div class="tabs-bar-inner">
    <button type="button" class="tab-btn active" data-tab="data">Données &amp; invités</button>
    <button type="button" class="tab-btn" data-tab="live">Régie en direct</button>
  </div>
</div>

<main class="container tab-panel tab-panel-data active" id="panel-data">

  <section class="event-card">
    <h1>${escapeHtml(event.title)}</h1>
    <div class="event-card-meta">
      ${event.client_name ? escapeHtml(event.client_name) + ' · ' : ''}${escapeHtml(dateLabel)}
    </div>
  </section>

  <section class="link-card">
    <div class="link-card-head">
      <span class="link-card-label">Lien de l'événement</span>
      <span class="link-card-badge link-card-badge-${isPrivate ? 'private' : 'public'}">${isPrivate ? 'privé' : 'public'}</span>
    </div>
    <a class="link-card-url" id="live-url" href="${escapeHtml(liveUrl)}" target="_blank" rel="noopener">${escapeHtml(liveUrl)}</a>
    <div class="link-card-actions">
      <button class="btn btn-secondary btn-sm" id="live-copy" type="button">Copier le lien</button>
      <a class="btn btn-secondary btn-sm" href="${escapeHtml(liveUrl)}" target="_blank" rel="noopener">Ouvrir ↗</a>
    </div>
    ${isPrivate
      ? `<p class="link-card-warn">Lien preview administrateur — utile pour tester le rendu. Ne le partage pas : les invités utilisent leur lien personnel reçu par email.</p>`
      : `<p class="link-card-hint">Lien public partageable. N'importe qui peut s'y connecter.</p>`}
  </section>

  <div id="message-zone"></div>

  ${event.white_label === 1 || event.white_label === true ? `
  <details class="branding-card">
    <summary class="branding-summary">
      <span class="branding-icon">🎨</span>
      <span class="branding-title">Personnalisation</span>
      <span class="branding-sub">couleur · logo</span>
    </summary>
    <div class="branding-body">
      <div class="branding-grid">

        <div class="branding-field">
          <label>Couleur principale</label>
          <div class="color-row">
            <input type="color" id="branding-color" value="${escapeHtml(event.primary_color || '#5D9CEC')}">
            <input type="text" id="branding-color-hex" value="${escapeHtml(event.primary_color || '#5D9CEC')}" placeholder="#RRGGBB" maxlength="7">
          </div>
          <p class="branding-hint">Utilisée pour le bandeau de la page chat et le bouton d'action dans l'email.</p>
        </div>

        <div class="branding-field">
          <label>Logo</label>
          <div class="logo-preview-wrap" id="logo-preview-wrap" style="background:${escapeHtml(event.primary_color || '#5D9CEC')}">
            ${event.logo_url
              ? '<img src="' + escapeHtml(event.logo_url) + '" alt="logo">'
              : '<span class="logo-empty">Aucun logo</span>'}
          </div>
          <div class="logo-actions">
            <input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
            <button class="btn btn-secondary btn-sm" id="logo-pick">Importer un logo…</button>
            <button class="btn btn-ghost btn-sm btn-danger" id="logo-remove" ${event.logo_url ? '' : 'hidden'}>Retirer</button>
          </div>
          <p class="branding-hint">PNG, JPG, WEBP ou SVG · 2 Mo max. S'affiche en haut de la page chat des invités.</p>
        </div>

      </div>
      <div class="branding-footer">
        <span class="branding-saved muted" id="branding-saved" hidden>✓ Enregistré</span>
        <button class="btn btn-primary" id="branding-save">Enregistrer la personnalisation</button>
      </div>
    </div>
  </details>
  ` : ''}

  <section class="stats" id="stats-zone">
    <div class="stat"><div class="stat-label">Invités</div><div class="stat-value" id="stat-total">—</div><div class="stat-sub">au total</div></div>
    <div class="stat"><div class="stat-label">Envoyés</div><div class="stat-value" id="stat-sent">—</div><div class="stat-sub">invitations envoyées</div></div>
    <div class="stat"><div class="stat-label">En attente</div><div class="stat-value" id="stat-pending">—</div><div class="stat-sub">à envoyer</div></div>
  </section>

  <div class="toolbar">
    <button class="btn btn-secondary" id="btn-add">+ Ajouter un invité</button>
    <button class="btn btn-secondary" id="btn-import">Importer CSV</button>
    <div class="toolbar-spacer"></div>
    <button class="btn btn-ghost btn-sm btn-danger" id="btn-delete-all" hidden>Tout supprimer</button>
    <button class="btn btn-primary" id="btn-send" disabled>Envoyer les invitations</button>
  </div>

  <div id="list-zone" class="table-wrap"></div>

  <!-- nomacast-analytics-event-admin-ui-v1 : dashboard statistiques -->
  <div id="analytics-zone"></div>

  ${event.white_label === 1 || event.white_label === true
    ? ''
    : `<div class="footer">
      Propulsé par <a href="https://www.nomacast.fr/" target="_blank" rel="noopener">Nomacast</a> · Live streaming corporate
    </div>`}

</main>

<!-- nomacast-tabs-v1 : panel régie live (iframe lazy-loaded au premier clic sur l'onglet) -->
<div class="tab-panel tab-panel-live" id="panel-live">
  <div class="tab-iframe-wrap">
    <iframe
      id="live-iframe"
      class="tab-iframe-frame"
      data-src="/admin/live.html?id=${escapeHtml(event.id)}&client=1"
      title="Régie en direct"
      loading="lazy"
      referrerpolicy="same-origin"></iframe>
  </div>
</div>

<!-- Modal Ajout -->
<div class="modal-backdrop" id="modal-add" hidden>
  <div class="modal">
    <h2>Ajouter un invité</h2>
    <div class="modal-row">
      <label>Email *</label>
      <input type="email" id="add-email" placeholder="invite@example.com" required>
    </div>
    <div class="modal-row">
      <label>Nom complet (optionnel)</label>
      <input type="text" id="add-name" placeholder="Jean Dupont">
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn btn-primary" id="add-submit">Ajouter</button>
    </div>
  </div>
</div>

<!-- Modal Import CSV -->
<div class="modal-backdrop" id="modal-csv" hidden>
  <div class="modal">
    <h2>Importer un CSV</h2>
    <p class="muted" style="font-size:12px;margin:0 0 12px">
      Colonnes attendues : <code>email</code>, <code>full_name</code>, <code>company</code>.
      Les en-têtes sont obligatoires (1ère ligne du CSV). Max 500 invités par import.
    </p>
    <div class="csv-drop" id="csv-drop" role="button" tabindex="0">
      <input type="file" id="csv-file" accept=".csv,text/csv" hidden>
      <div>
        <div class="csv-drop-text">Cliquez pour <strong>choisir un fichier</strong> ou glissez-le ici</div>
        <span class="csv-drop-filename" id="csv-filename" hidden></span>
      </div>
    </div>
    <div id="csv-preview-wrap"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn btn-primary" id="csv-submit" disabled>Importer</button>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script>
<script>
(function () {
  var API = ${JSON.stringify(apiBase)};
  var state = { invitees: [], csvData: null };

  // ============================================================
  // nomacast-tabs-v1 : gestion des onglets DATA / RÉGIE LIVE
  // - Onglet par défaut : data (boot)
  // - L'iframe régie live est lazy-loaded au 1er clic sur l'onglet (data-src → src)
  // - Persistance dans l'URL via fragment (#live) pour permettre le partage et le refresh
  // ============================================================
  (function setupTabs() {
    var tabBtns = document.querySelectorAll('.tab-btn');
    var panels = {
      data: document.getElementById('panel-data'),
      live: document.getElementById('panel-live')
    };
    var iframe = document.getElementById('live-iframe');
    var iframeLoaded = false;

    function activate(name) {
      if (!panels[name]) return;
      for (var i = 0; i < tabBtns.length; i++) {
        var b = tabBtns[i];
        if (b.getAttribute('data-tab') === name) b.classList.add('active');
        else b.classList.remove('active');
      }
      for (var k in panels) {
        if (Object.prototype.hasOwnProperty.call(panels, k)) {
          if (k === name) panels[k].classList.add('active');
          else panels[k].classList.remove('active');
        }
      }
      // Lazy-load de l'iframe régie au premier clic
      if (name === 'live' && iframe && !iframeLoaded) {
        var src = iframe.getAttribute('data-src');
        if (src) {
          iframe.setAttribute('src', src);
          iframeLoaded = true;
        }
      }
      // Mémoriser dans l'URL pour permettre refresh / partage de lien profond
      if (history && history.replaceState) {
        var newHash = name === 'live' ? '#live' : '';
        history.replaceState(null, '', window.location.pathname + window.location.search + newHash);
      }
    }

    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].addEventListener('click', function (e) {
        activate(e.currentTarget.getAttribute('data-tab'));
      });
    }

    // Au boot : restaurer depuis l'URL si fragment #live ou #data
    var initial = window.location.hash === '#live' ? 'live' : 'data';
    activate(initial);
  })();

  function $(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function showMsg(type, text) {
    var z = $('message-zone');
    z.innerHTML = '<div class="message message-' + type + '">' + escapeHtml(text) + '</div>';
    setTimeout(function () { if (z.firstChild) z.removeChild(z.firstChild); }, 5000);
  }

  async function api(path, opts) {
    opts = opts || {};
    var r = await fetch(API + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    var data;
    try { data = await r.json(); } catch (e) { data = {}; }
    if (!r.ok) throw new Error(data.error || 'Erreur ' + r.status);
    return data;
  }

  async function loadInvitees() {
    try {
      var data = await api('/invitees');
      state.invitees = data.invitees || [];
      render();
    } catch (err) {
      showMsg('error', 'Chargement échoué : ' + err.message);
    }
  }

  function render() {
    var total = state.invitees.length;
    var sent = state.invitees.filter(function (i) { return i.invited_at; }).length;
    var pending = total - sent;

    $('stat-total').textContent = total;
    $('stat-sent').textContent = sent;
    $('stat-pending').textContent = pending;
    $('btn-send').disabled = pending === 0;
    $('btn-send').textContent = pending > 0
      ? 'Envoyer les invitations (' + pending + ')'
      : 'Tout envoyé';
    $('btn-delete-all').hidden = total === 0;

    var listZone = $('list-zone');
    if (total === 0) {
      listZone.outerHTML = '<div id="list-zone" class="empty">Aucun invité pour l\\'instant. Clique sur « + Ajouter un invité » ou « Importer CSV » pour commencer.</div>';
      return;
    }

    var rows = state.invitees.map(function (inv) {
      var status = inv.last_seen_at
        ? '<span class="badge badge-seen">connecté</span>'
        : (inv.invited_at
          ? '<span class="badge badge-sent">envoyé</span>'
          : '<span class="badge badge-pending">en attente</span>');
      return '<tr>'
        + '<td class="cell-email">' + escapeHtml(inv.email) + '</td>'
        + '<td class="cell-name">' + escapeHtml(inv.full_name || '—') + '</td>'
        + '<td>' + status + '</td>'
        + '<td class="cell-actions">'
        + (inv.invited_at
            ? '<button class="btn btn-ghost btn-sm" data-resend="' + inv.id + '">Renvoyer</button>'
            : '')
        + ' <button class="btn btn-ghost btn-sm btn-danger" data-delete="' + inv.id + '">Supprimer</button>'
        + '</td>'
        + '</tr>';
    }).join('');

    listZone.outerHTML =
      '<div id="list-zone" class="table-wrap"><table>'
      + '<thead><tr><th>Email</th><th>Nom</th><th>Statut</th><th></th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div>';
  }

  // Délégation : actions sur les boutons des lignes
  document.addEventListener('click', async function (e) {
    var t = e.target;

    // Renvoyer un invité
    if (t.hasAttribute && t.hasAttribute('data-resend')) {
      var id = t.getAttribute('data-resend');
      if (!confirm('Renvoyer l\\'invitation à cet invité ?')) return;
      t.disabled = true; t.textContent = '...';
      try {
        await api('/invitees/' + id + '/resend', { method: 'POST' });
        showMsg('success', 'Invitation renvoyée.');
        loadInvitees();
      } catch (err) {
        showMsg('error', 'Renvoi échoué : ' + err.message);
        t.disabled = false; t.textContent = 'Renvoyer';
      }
    }

    // Supprimer un invité
    if (t.hasAttribute && t.hasAttribute('data-delete')) {
      var id2 = t.getAttribute('data-delete');
      if (!confirm('Supprimer cet invité ?')) return;
      try {
        await api('/invitees/' + id2, { method: 'DELETE' });
        showMsg('success', 'Invité supprimé.');
        loadInvitees();
      } catch (err) {
        showMsg('error', 'Suppression échouée : ' + err.message);
      }
    }

    // Fermer une modal
    if (t.hasAttribute && t.hasAttribute('data-close')) {
      var m = t.closest('.modal-backdrop');
      if (m) m.hidden = true;
    }
  });

  // Ajout
  $('btn-add').addEventListener('click', function () {
    $('add-email').value = '';
    $('add-name').value = '';
    $('modal-add').hidden = false;
    setTimeout(function () { $('add-email').focus(); }, 50);
  });
  $('add-submit').addEventListener('click', async function () {
    var email = $('add-email').value.trim();
    var name = $('add-name').value.trim();
    if (!email || !email.includes('@')) { alert('Email invalide'); return; }
    this.disabled = true; this.textContent = '...';
    try {
      var data = await api('/invitees', { method: 'POST', body: { email: email, full_name: name } });
      if (data.added > 0) {
        showMsg('success', 'Invité ajouté.');
        $('modal-add').hidden = true;
        loadInvitees();
      } else if (data.duplicates > 0) {
        showMsg('error', 'Cet email est déjà dans la liste.');
      } else {
        showMsg('error', 'Aucun ajout : ' + ((data.errors || [])[0] || {}).error);
      }
    } catch (err) {
      showMsg('error', 'Ajout échoué : ' + err.message);
    } finally {
      this.disabled = false; this.textContent = 'Ajouter';
    }
  });

  // Import CSV (file picker + drag-drop + Papa Parse — même UX que admin Nomacast)
  var csvDropZone = $('csv-drop');
  var csvInput = $('csv-file');
  var csvPreviewWrap = $('csv-preview-wrap');
  var csvSubmit = $('csv-submit');
  var csvFilename = $('csv-filename');

  function resetCsvModal() {
    csvInput.value = '';
    state.csvData = null;
    csvSubmit.disabled = true;
    csvFilename.hidden = true;
    csvFilename.textContent = '';
    csvPreviewWrap.innerHTML = '';
  }

  $('btn-import').addEventListener('click', function () {
    resetCsvModal();
    $('modal-csv').hidden = false;
  });

  csvDropZone.addEventListener('click', function () { csvInput.click(); });
  csvDropZone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); csvInput.click(); }
  });
  csvInput.addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (file) parseCsvFile(file);
  });
  csvDropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    csvDropZone.classList.add('dragover');
  });
  csvDropZone.addEventListener('dragleave', function () { csvDropZone.classList.remove('dragover'); });
  csvDropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    csvDropZone.classList.remove('dragover');
    var file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) parseCsvFile(file);
  });

  function parseCsvFile(file) {
    csvFilename.textContent = file.name;
    csvFilename.hidden = false;
    if (typeof Papa === 'undefined') {
      csvPreviewWrap.innerHTML = '<div class="csv-error">Bibliothèque CSV non chargée (vérifie ta connexion réseau).</div>';
      csvSubmit.disabled = true;
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        var rows = (results.data || []).map(function (r) {
          var emailKey = Object.keys(r).find(function (k) { return /^email$/i.test(k.trim()); });
          var nameKey = Object.keys(r).find(function (k) { return /^(full_name|name|nom|nom complet)$/i.test(k.trim()); });
          var companyKey = Object.keys(r).find(function (k) { return /^(company|entreprise|société|societe)$/i.test(k.trim()); });
          return {
            email: emailKey ? String(r[emailKey] || '').trim() : '',
            full_name: nameKey ? String(r[nameKey] || '').trim() : '',
            company: companyKey ? String(r[companyKey] || '').trim() : ''
          };
        }).filter(function (r) { return r.email && r.email.includes('@'); });

        if (rows.length === 0) {
          csvPreviewWrap.innerHTML = '<div class="csv-error">Aucune ligne exploitable. Vérifie que ton CSV a une colonne <code>email</code>.</div>';
          csvSubmit.disabled = true;
          state.csvData = null;
          return;
        }
        state.csvData = rows;
        renderCsvPreview(rows);
        csvSubmit.disabled = false;
      },
      error: function (err) {
        csvPreviewWrap.innerHTML = '<div class="csv-error">Parsing CSV échoué : ' + escapeHtml(err.message) + '</div>';
        csvSubmit.disabled = true;
        state.csvData = null;
      }
    });
  }

  function renderCsvPreview(rows) {
    var html = '<div class="csv-info">' + rows.length + ' ligne(s) prête(s) à importer (aperçu des 10 premières) :</div>';
    html += '<div class="csv-preview"><table>';
    html += '<thead><tr><th>Email</th><th>Nom</th><th>Entreprise</th></tr></thead><tbody>';
    rows.slice(0, 10).forEach(function (r) {
      html += '<tr><td>' + escapeHtml(r.email) + '</td>'
        + '<td>' + escapeHtml(r.full_name || '—') + '</td>'
        + '<td>' + escapeHtml(r.company || '—') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    csvPreviewWrap.innerHTML = html;
  }

  csvSubmit.addEventListener('click', async function () {
    if (!state.csvData || !state.csvData.length) return;
    this.disabled = true; this.textContent = 'Import…';
    try {
      var data = await api('/invitees', { method: 'POST', body: { invitees: state.csvData } });
      var msg = (data.added || data.created_count || 0) + ' ajouté(s)';
      var dup = data.duplicates || data.skipped_count || 0;
      if (dup > 0) msg += ' · ' + dup + ' doublon(s)';
      var errs = (data.errors && data.errors.length) || data.errors_count || 0;
      if (errs > 0) msg += ' · ' + errs + ' erreur(s)';
      showMsg((data.added || data.created_count) > 0 ? 'success' : 'error', msg);
      $('modal-csv').hidden = true;
      loadInvitees();
    } catch (err) {
      showMsg('error', 'Import échoué : ' + err.message);
    } finally {
      this.disabled = false; this.textContent = 'Importer';
    }
  });

  // Envoyer batch
  $('btn-send').addEventListener('click', async function () {
    var pending = state.invitees.filter(function (i) { return !i.invited_at; }).length;
    if (pending === 0) return;
    if (!confirm('Envoyer l\\'invitation par email à ' + pending + ' invité(s) ?')) return;
    this.disabled = true; this.textContent = 'Envoi...';
    try {
      var data = await api('/send-invitations', { method: 'POST' });
      var msg = (data.sent_count || 0) + ' email(s) envoyé(s)';
      if (data.failed_count > 0) msg += ' · ' + data.failed_count + ' échec(s)';
      showMsg(data.sent_count > 0 ? 'success' : 'error', msg);
      loadInvitees();
    } catch (err) {
      showMsg('error', 'Envoi échoué : ' + err.message);
      this.disabled = false; this.textContent = 'Envoyer les invitations';
    }
  });

  // Tout supprimer
  $('btn-delete-all').addEventListener('click', async function () {
    var count = state.invitees.length;
    var answer = prompt(
      'Supprimer DÉFINITIVEMENT les ' + count + ' invité(s) ?\\n\\n'
      + 'Tape SUPPRIMER pour confirmer :'
    );
    if (answer !== 'SUPPRIMER') return;
    try {
      var data = await api('/invitees', { method: 'DELETE' });
      showMsg('success', data.deleted_count + ' invité(s) supprimé(s).');
      loadInvitees();
    } catch (err) {
      showMsg('error', 'Suppression échouée : ' + err.message);
    }
  });

  // Fermer modal par clic sur backdrop
  document.querySelectorAll('.modal-backdrop').forEach(function (m) {
    m.addEventListener('click', function (e) {
      if (e.target === m) m.hidden = true;
    });
  });

  // Bouton "Copier" du lien live
  var liveCopyBtn = $('live-copy');
  if (liveCopyBtn) {
    liveCopyBtn.addEventListener('click', function () {
      var url = ($('live-url').getAttribute('href') || '').trim();
      if (!url) return;
      var btn = this;
      navigator.clipboard.writeText(url).then(
        function () {
          btn.textContent = 'Copié ✓';
          setTimeout(function () { btn.textContent = 'Copier le lien'; }, 1500);
        },
        function () { window.prompt('Copie ce lien :', url); }
      );
    });
  }

  // ============================================================
  // Branding (color + logo) - uniquement si white_label === true
  // ============================================================
  var brandingSave = document.getElementById('branding-save');
  if (brandingSave) {
    var colorInput = document.getElementById('branding-color');
    var colorHex = document.getElementById('branding-color-hex');
    var previewWrap = document.getElementById('logo-preview-wrap');
    var logoPick = document.getElementById('logo-pick');
    var logoFile = document.getElementById('logo-file');
    var logoRemove = document.getElementById('logo-remove');
    var brandingSaved = document.getElementById('branding-saved');
    var pendingLogoUrl = undefined; // undefined = pas changé, null = retiré, string = nouveau

    // Sync entre color picker et hex input
    colorInput.addEventListener('input', function () {
      colorHex.value = colorInput.value;
      previewWrap.style.background = colorInput.value;
    });
    colorHex.addEventListener('input', function () {
      var v = colorHex.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        colorInput.value = v;
        previewWrap.style.background = v;
      }
    });

    // Bouton "Importer un logo"
    logoPick.addEventListener('click', function () {
      logoFile.click();
    });

    logoFile.addEventListener('change', async function () {
      var f = logoFile.files[0];
      if (!f) return;
      var allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
      if (!allowed.includes(f.type)) {
        showMsg('error', 'Format non supporté (PNG, JPG, WEBP, SVG).');
        return;
      }
      if (f.size > 2 * 1024 * 1024) {
        showMsg('error', 'Fichier trop volumineux (max 2 Mo).');
        return;
      }
      logoPick.disabled = true;
      logoPick.textContent = 'Upload…';
      try {
        var fd = new FormData();
        fd.append('file', f);
        var r = await fetch(API + '/upload-logo', { method: 'POST', body: fd });
        var data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Upload échoué');
        pendingLogoUrl = data.url;
        previewWrap.innerHTML = '<img src="' + escapeHtml(data.url) + '" alt="logo">';
        logoRemove.hidden = false;
        showMsg('success', 'Logo importé. N\\'oublie pas d\\'enregistrer.');
      } catch (err) {
        showMsg('error', 'Upload échoué : ' + err.message);
      } finally {
        logoPick.disabled = false;
        logoPick.textContent = 'Importer un logo…';
        logoFile.value = '';
      }
    });

    logoRemove.addEventListener('click', function () {
      pendingLogoUrl = null;
      previewWrap.innerHTML = '<span class="logo-empty">Aucun logo</span>';
      logoRemove.hidden = true;
    });

    brandingSave.addEventListener('click', async function () {
      brandingSave.disabled = true;
      brandingSave.textContent = 'Enregistrement…';
      brandingSaved.hidden = true;
      var payload = { primary_color: colorHex.value.trim() };
      if (pendingLogoUrl !== undefined) payload.logo_url = pendingLogoUrl;
      try {
        var r = await fetch(API, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        var data;
        try { data = await r.json(); } catch (e) { data = {}; }
        if (!r.ok) throw new Error(data.error || 'Échec');
        showMsg('success', 'Personnalisation enregistrée.');
        brandingSaved.hidden = false;
        setTimeout(function () { brandingSaved.hidden = true; }, 3000);
        pendingLogoUrl = undefined;
      } catch (err) {
        showMsg('error', 'Enregistrement échoué : ' + err.message);
      } finally {
        brandingSave.disabled = false;
        brandingSave.textContent = 'Enregistrer la personnalisation';
      }
    });
  }

  // Init
  loadInvitees();

  // ============================================================
  // nomacast-analytics-event-admin-ui-v1 — Module Statistiques (régie client)
  // Polling 5s en mode live, snapshot à froid en draft/ended.
  // Endpoint : GET /api/event-admin/<token>/stats (déjà préfixé via apiBase).
  // Export CSV : GET /api/event-admin/<token>/export-csv (uniquement si ended).
  // ============================================================
  var analyticsZone = $('analytics-zone');
  if (analyticsZone) {
    var statsPollTimer = null;
    var statsLastFetchAt = 0;
    var statsInFlight = false;
    var statsMounted = false;
    var statsVisListener = null;

    function el(tag, opts) {
      opts = opts || {};
      var node = document.createElement(tag);
      if (opts.className) node.className = opts.className;
      if (opts.text != null) node.textContent = opts.text;
      if (opts.html != null) node.innerHTML = opts.html;
      if (opts.attrs) {
        for (var k in opts.attrs) if (Object.prototype.hasOwnProperty.call(opts.attrs, k)) {
          node.setAttribute(k, opts.attrs[k]);
        }
      }
      if (opts.style) {
        for (var k2 in opts.style) if (Object.prototype.hasOwnProperty.call(opts.style, k2)) {
          node.style[k2] = opts.style[k2];
        }
      }
      if (opts.children) {
        for (var i = 0; i < opts.children.length; i++) {
          var c = opts.children[i];
          if (c) node.appendChild(c);
        }
      }
      return node;
    }

    function clearNode(node) {
      while (node && node.firstChild) node.removeChild(node.firstChild);
    }

    function mountStats() {
      clearNode(analyticsZone);
      analyticsZone.appendChild(el('div', {
        className: 'analytics-card',
        children: [el('div', { className: 'stats-loading', text: 'Chargement des statistiques…' })]
      }));
      fetchAndRenderStats();
      statsMounted = true;
      // Visibility listener (1 seul, ré-utilisé)
      if (!statsVisListener) {
        statsVisListener = function () {
          if (document.visibilityState === 'visible') {
            if (statsPollTimer) { clearTimeout(statsPollTimer); statsPollTimer = null; }
            fetchAndRenderStats();
          }
        };
        document.addEventListener('visibilitychange', statsVisListener);
      }
    }

    function scheduleStatsPoll() {
      statsPollTimer = setTimeout(function () {
        if (document.visibilityState !== 'visible') {
          scheduleStatsPoll();
          return;
        }
        fetchAndRenderStats().then(function () {
          // Le scheduling suivant est décidé après render selon ev.status
        });
      }, 5000);
    }

    async function fetchAndRenderStats() {
      if (statsInFlight) return;
      statsInFlight = true;
      try {
        var stats = await api('/stats');
        statsLastFetchAt = Date.now();
        renderStatsCard(stats.event || {}, stats);
        // Polling 5s UNIQUEMENT si live
        if (stats.event && stats.event.status === 'live') {
          if (statsPollTimer) clearTimeout(statsPollTimer);
          scheduleStatsPoll();
        } else {
          if (statsPollTimer) { clearTimeout(statsPollTimer); statsPollTimer = null; }
        }
      } catch (err) {
        clearNode(analyticsZone);
        analyticsZone.appendChild(el('div', {
          className: 'analytics-card',
          children: [el('div', { className: 'stats-error', text: 'Erreur statistiques : ' + err.message })]
        }));
      } finally {
        statsInFlight = false;
      }
    }

    function renderStatsCard(ev, stats) {
      var s = stats.summary || {};
      var status = ev.status || 'draft';

      var titleText;
      if (status === 'draft') titleText = 'Statistiques — pré-événement';
      else if (status === 'live') titleText = 'Statistiques — en direct';
      else if (status === 'ended') titleText = "Bilan de l'événement";
      else titleText = 'Statistiques';

      var titleDot = el('span', { className: 'stats-card-title-dot' + (status === 'live' ? ' live' : '') });
      var titleBox = el('div', {
        className: 'stats-card-title',
        children: [titleDot, el('span', { text: titleText })]
      });
      var metaBox = el('div', {
        className: 'stats-card-meta',
        text: status === 'live'
          ? 'Mis à jour automatiquement toutes les 5s'
          : 'Calculé le ' + new Date(statsLastFetchAt || Date.now()).toLocaleTimeString('fr-FR')
      });
      var actions = el('div', { className: 'stats-card-actions' });
      // Bouton export CSV uniquement quand l'event est terminé
      if (status === 'ended') {
        var csvBtn = el('a', {
          className: 'btn-csv-export',
          attrs: {
            href: API + '/export-csv',
            download: '',
            title: 'Télécharger le détail par invité au format CSV'
          },
          children: [el('span', { text: '↓' }), el('span', { text: 'Exporter en CSV' })]
        });
        actions.appendChild(csvBtn);
      }
      var header = el('div', {
        className: 'stats-card-header',
        children: [titleBox, metaBox, actions]
      });

      var body = document.createDocumentFragment();
      body.appendChild(header);

      if (status === 'draft') {
        renderTilesDraft(body, s);
        renderPerInviteeTable(body, stats.per_invitee || [], status);
      } else if (status === 'live') {
        renderTilesLive(body, s);
        renderTimelineChart(body, stats.timeline || [], s.peak_concurrent || 0);
        renderTopChatters(body, stats.top_chatters || []);
        renderPerInviteeTable(body, stats.per_invitee || [], status);
      } else if (status === 'ended') {
        renderTilesEnded(body, s, ev);
        renderTimelineChart(body, stats.timeline || [], s.peak_concurrent || 0);
        renderTopChatters(body, stats.top_chatters || []);
        renderPerInviteeTable(body, stats.per_invitee || [], status);
        renderGeoAndSources(body, stats.geography || [], stats.traffic_sources || []);
      }

      clearNode(analyticsZone);
      var card = el('div', { className: 'analytics-card' });
      card.appendChild(body);
      analyticsZone.appendChild(card);
    }

    function renderTilesDraft(parent, s) {
      var clickPct = s.invitations_sent > 0
        ? Math.round((s.invitees_clicked / s.invitations_sent) * 100)
        : 0;
      var tiles = el('div', { className: 'stats-tiles' });
      tiles.appendChild(tile('Invitations envoyées', s.invitations_sent + ' / ' + s.invitees_total));
      tiles.appendChild(tile('Clics uniques sur lien', String(s.invitees_clicked), clickPct + "% d'engagement", true));
      if (s.invitees_self_registered > 0) {
        tiles.appendChild(tile('Inscriptions publiques', String(s.invitees_self_registered)));
      }
      parent.appendChild(tiles);
    }

    function renderTilesLive(parent, s) {
      var tiles = el('div', { className: 'stats-tiles' });
      var liveTile = el('div', { className: 'stats-tile live-now' });
      liveTile.appendChild(el('div', { className: 'stats-tile-label', text: 'En ligne maintenant' }));
      liveTile.appendChild(el('div', { className: 'stats-tile-value', text: String(s.concurrent_now) }));
      liveTile.appendChild(el('div', { className: 'stats-tile-sub', text: 'spectateurs connectés' }));
      tiles.appendChild(liveTile);
      tiles.appendChild(tile('Pic concurrents', String(s.peak_concurrent),
        s.peak_concurrent_at ? formatRelativeTime(s.peak_concurrent_at) : null, true));
      tiles.appendChild(tile('Présents au total', String((s.invitees_attended || 0) + (s.public_unique_viewers || 0))));
      tiles.appendChild(tile('Messages approuvés', String(s.messages_approved)));
      if (s.messages_pending > 0) tiles.appendChild(tile('À modérer', String(s.messages_pending), 'messages en attente'));
      if (s.reactions_total > 0) tiles.appendChild(tile('Réactions', String(s.reactions_total)));
      parent.appendChild(tiles);
    }

    function renderTilesEnded(parent, s, ev) {
      var totalAttendees = (s.invitees_attended || 0) + (s.public_unique_viewers || 0);
      var attendPct = s.invitees_total > 0
        ? Math.round((s.invitees_attended / s.invitees_total) * 100)
        : null;
      var avgPct = ev.duration_minutes && s.avg_duration_seconds
        ? Math.round((s.avg_duration_seconds / (ev.duration_minutes * 60)) * 100)
        : 0;

      var tiles = el('div', { className: 'stats-tiles' });
      tiles.appendChild(tile('Présents au total', String(totalAttendees),
        attendPct !== null ? attendPct + '% des invités' : null, true));
      tiles.appendChild(tile('Pic concurrents', String(s.peak_concurrent)));
      tiles.appendChild(tile('Durée moyenne', formatSeconds(s.avg_duration_seconds), avgPct + '% du live'));
      tiles.appendChild(tile('Messages chat', String((s.messages_approved || 0) + (s.qa_approved || 0))));
      if (s.reactions_total > 0) tiles.appendChild(tile('Réactions', String(s.reactions_total)));
      if (s.polls_total > 0) tiles.appendChild(tile('Sondages', String(s.polls_total)));
      if (s.quotes_total > 0) tiles.appendChild(tile('Citations', String(s.quotes_total)));
      parent.appendChild(tiles);
    }

    function tile(label, value, sub, highlight) {
      var t = el('div', { className: 'stats-tile' + (highlight ? ' highlight' : '') });
      t.appendChild(el('div', { className: 'stats-tile-label', text: label }));
      t.appendChild(el('div', { className: 'stats-tile-value', text: value }));
      if (sub) t.appendChild(el('div', { className: 'stats-tile-sub', text: sub }));
      return t;
    }

    function renderTimelineChart(parent, timeline, peak) {
      parent.appendChild(el('div', { className: 'stats-section-title', text: 'Courbe de présence' }));
      var wrap = el('div', { className: 'stats-chart-wrap' });
      if (!timeline.length) {
        wrap.appendChild(el('div', {
          className: 'stats-chart-empty',
          text: 'Aucune donnée de présence pour le moment.'
        }));
        parent.appendChild(wrap);
        return;
      }
      var w = 800, h = 180, padL = 40, padR = 12, padT = 12, padB = 26;
      var iw = w - padL - padR, ih = h - padT - padB;
      var maxY = Math.max(peak || 0,
        Math.max.apply(null, timeline.map(function (p) { return p.viewers; })),
        1);
      var topY = Math.ceil(maxY * 1.1);

      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svg.setAttribute('class', 'stats-chart-svg');
      svg.setAttribute('preserveAspectRatio', 'none');

      [0.25, 0.5, 0.75].forEach(function (frac) {
        var y = padT + ih * (1 - frac);
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', padL); line.setAttribute('y1', y);
        line.setAttribute('x2', w - padR); line.setAttribute('y2', y);
        line.setAttribute('stroke', '#e2e8f0');
        line.setAttribute('stroke-dasharray', '2 4');
        svg.appendChild(line);
      });

      [0, Math.round(topY / 2), topY].forEach(function (val) {
        var y = padT + ih * (1 - (val / topY));
        var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', padL - 6); t.setAttribute('y', y + 3);
        t.setAttribute('text-anchor', 'end');
        t.setAttribute('font-size', '10');
        t.setAttribute('fill', '#94a3b8');
        t.textContent = String(val);
        svg.appendChild(t);
      });

      var n = timeline.length;
      var points = timeline.map(function (p, i) {
        var x = padL + (n > 1 ? (i / (n - 1)) * iw : iw / 2);
        var y = padT + ih * (1 - p.viewers / topY);
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');

      var areaPoints = points + ' ' + (padL + iw).toFixed(1) + ',' + (padT + ih) + ' ' + padL + ',' + (padT + ih);
      var area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      area.setAttribute('points', areaPoints);
      area.setAttribute('fill', '#5A98D6');
      area.setAttribute('fill-opacity', '0.12');
      svg.appendChild(area);

      var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      poly.setAttribute('points', points);
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', '#5A98D6');
      poly.setAttribute('stroke-width', '2');
      poly.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(poly);

      [0, Math.floor(n / 2), n - 1].forEach(function (i) {
        if (i < 0 || i >= n) return;
        var x = padL + (n > 1 ? (i / (n - 1)) * iw : iw / 2);
        var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', x); t.setAttribute('y', h - 8);
        t.setAttribute('text-anchor', i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle'));
        t.setAttribute('font-size', '10');
        t.setAttribute('fill', '#94a3b8');
        t.textContent = formatTimeOnly(timeline[i].ts);
        svg.appendChild(t);
      });

      wrap.appendChild(svg);
      parent.appendChild(wrap);
    }

    function renderTopChatters(parent, top) {
      if (!top.length) return;
      parent.appendChild(el('div', {
        className: 'stats-section-title',
        text: 'Participants les plus actifs (chat)'
      }));
      var table = el('table', { className: 'stats-table' });
      var thead = el('thead');
      thead.appendChild(el('tr', { children: [
        el('th', { text: 'Nom' }),
        el('th', { text: 'Messages', attrs: { style: 'text-align:right' } })
      ]}));
      table.appendChild(thead);
      var tbody = el('tbody');
      top.slice(0, 5).forEach(function (r) {
        tbody.appendChild(el('tr', { children: [
          el('td', { text: r.name || '—' }),
          el('td', { text: String(r.messages_count), attrs: { style: 'text-align:right' } })
        ]}));
      });
      table.appendChild(tbody);
      parent.appendChild(el('div', {
        style: { marginBottom: '18px' },
        children: [table]
      }));
    }

    function renderPerInviteeTable(parent, perInvitee, status) {
      parent.appendChild(el('div', { className: 'stats-section-title', text: 'Détail par invité' }));
      if (!perInvitee.length) {
        parent.appendChild(el('div', {
          className: 'stats-table-empty',
          text: "Aucun invité n'a encore été ajouté à cet événement."
        }));
        return;
      }
      var table = el('table', { className: 'stats-table' });
      var headers = ['Invité', 'Source'];
      if (status === 'draft') headers.push('Vu le lien', 'Visites');
      else headers.push('Vu le lien', 'Présence', 'Durée', 'Messages');
      var thead = el('thead');
      thead.appendChild(el('tr', { children: headers.map(function (h) { return el('th', { text: h }); }) }));
      table.appendChild(thead);
      var tbody = el('tbody');
      perInvitee.slice(0, 50).forEach(function (r) {
        var cells = [];
        var nameCell = el('td');
        if (r.is_present_now) {
          nameCell.appendChild(el('span', {
            className: 'stats-present-dot',
            attrs: { title: 'Connecté maintenant' }
          }));
        }
        nameCell.appendChild(document.createTextNode(r.name || r.email || '—'));
        if (r.email && r.name) {
          nameCell.appendChild(el('div', {
            className: 'stats-tile-sub',
            style: { marginTop: '2px' },
            text: r.email
          }));
        }
        cells.push(nameCell);
        cells.push(el('td', { children: [el('span', {
          className: 'stats-source-badge' + (r.source === 'self_registered' ? ' self' : ''),
          text: r.source === 'self_registered' ? 'inscrit' : 'invité'
        })]}));
        cells.push(el('td', {
          className: r.first_visit_at ? '' : 'muted',
          text: r.first_visit_at ? '✓' : '—'
        }));
        if (status !== 'draft') {
          cells.push(el('td', {
            className: r.total_duration_sec > 0 ? '' : 'muted',
            text: r.total_duration_sec > 0 ? '✓' : '—'
          }));
          cells.push(el('td', {
            className: r.total_duration_sec > 0 ? '' : 'muted',
            text: r.total_duration_sec > 0 ? formatSeconds(r.total_duration_sec) : '—'
          }));
          cells.push(el('td', {
            className: r.messages_count > 0 ? '' : 'muted',
            text: String(r.messages_count || 0)
          }));
        } else {
          cells.push(el('td', {
            className: r.visits_count > 0 ? '' : 'muted',
            text: String(r.visits_count || 0)
          }));
        }
        tbody.appendChild(el('tr', { children: cells }));
      });
      table.appendChild(tbody);
      parent.appendChild(table);
      if (perInvitee.length > 50) {
        parent.appendChild(el('div', {
          className: 'stats-tile-sub',
          style: { marginTop: '8px', textAlign: 'center' },
          text: 'Affichage limité aux 50 premiers (' + perInvitee.length + ' au total).'
        }));
      }
    }

    function renderGeoAndSources(parent, geography, sources) {
      if (!geography.length && !sources.length) return;
      var row = el('div', { style: { display: 'flex', gap: '18px', marginTop: '18px', flexWrap: 'wrap' } });
      if (geography.length) {
        var geoBlock = el('div', { style: { flex: '1', minWidth: '200px' } });
        geoBlock.appendChild(el('div', { className: 'stats-section-title', text: 'Origine géographique' }));
        var table = el('table', { className: 'stats-table' });
        var tbody = el('tbody');
        geography.slice(0, 6).forEach(function (g) {
          tbody.appendChild(el('tr', { children: [
            el('td', { text: g.country_code }),
            el('td', { text: String(g.count), attrs: { style: 'text-align:right' } })
          ]}));
        });
        table.appendChild(tbody);
        geoBlock.appendChild(table);
        row.appendChild(geoBlock);
      }
      if (sources.length) {
        var srcBlock = el('div', { style: { flex: '1', minWidth: '200px' } });
        srcBlock.appendChild(el('div', { className: 'stats-section-title', text: 'Sources de trafic' }));
        var table2 = el('table', { className: 'stats-table' });
        var tbody2 = el('tbody');
        sources.slice(0, 6).forEach(function (s2) {
          tbody2.appendChild(el('tr', { children: [
            el('td', { text: s2.referrer_domain }),
            el('td', { text: String(s2.count), attrs: { style: 'text-align:right' } })
          ]}));
        });
        table2.appendChild(tbody2);
        srcBlock.appendChild(table2);
        row.appendChild(srcBlock);
      }
      parent.appendChild(row);
    }

    function formatSeconds(s) {
      s = parseInt(s, 10) || 0;
      if (s < 60) return s + 's';
      if (s < 3600) {
        var m = Math.floor(s / 60);
        var rs = s % 60;
        return rs > 0 ? m + 'min ' + rs + 's' : m + 'min';
      }
      var h = Math.floor(s / 3600);
      var mm = Math.floor((s % 3600) / 60);
      return mm > 0 ? h + 'h ' + mm + 'min' : h + 'h';
    }

    function formatTimeOnly(iso) {
      if (!iso) return '';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    function formatRelativeTime(iso) {
      if (!iso) return '';
      var d = new Date(iso);
      var diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 60) return 'il y a ' + diffSec + 's';
      if (diffSec < 3600) return 'il y a ' + Math.floor(diffSec / 60) + 'min';
      if (diffSec < 86400) return 'il y a ' + Math.floor(diffSec / 3600) + 'h';
      return formatTimeOnly(iso);
    }

    // Mount au boot
    mountStats();
  }
})();
</script>

</body>
</html>`;
}
