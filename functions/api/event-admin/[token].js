// functions/event-admin/[token].js
// GET /event-admin/:token  →  Page client de gestion des invités.
//
// Valide le token côté serveur, sert le HTML avec les infos event injectées.
// Le JS embarqué appelle ensuite /api/event-admin/:token/* pour les ops CRUD.

export const onRequestGet = async ({ params, env }) => {
  if (!env.DB || !env.ADMIN_PASSWORD) {
    return htmlError('Service indisponible', 'Le service n\'est pas correctement configuré.', 500);
  }

  // Résolution token → event
  const events = await env.DB.prepare(
    'SELECT id, slug, title, client_name, scheduled_at, status, white_label, primary_color, logo_url FROM events'
  ).all();

  let event = null;
  for (const ev of (events.results || [])) {
    const expected = await computeClientToken(ev.slug, env.ADMIN_PASSWORD);
    if (params.token === expected) { event = ev; break; }
  }

  if (!event) {
    return htmlError(
      'Lien invalide',
      'Ce lien d\'administration n\'est pas valide ou a été révoqué. Contactez l\'équipe Nomacast.',
      404
    );
  }

  return new Response(renderPage(event, params.token), {
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

function renderPage(event, token) {
  const apiBase = `/api/event-admin/${token}`;
  const dateLabel = formatDate(event.scheduled_at);

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

.container { max-width: 900px; margin: 0 auto; padding: 28px 20px 60px; }

.event-card {
  background: linear-gradient(135deg, #5D9CEC 0%, #4A87D6 100%);
  color: #ffffff; border-radius: 14px; padding: 24px 28px; margin-bottom: 24px;
}
.event-card h1 { margin: 0 0 6px; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
.event-card-meta { font-size: 14px; opacity: 0.9; }

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
</style>
</head>
<body>

<header class="header">
  <a href="https://www.nomacast.fr/" target="_blank" rel="noopener" class="header-logo">
    <span class="logo-dot">&bull;</span><span class="logo-text">&nbsp;Nomacast</span>
  </a>
  <span class="header-baseline">Gestion des invités</span>
</header>

<main class="container">

  <section class="event-card">
    <h1>${escapeHtml(event.title)}</h1>
    <div class="event-card-meta">
      ${event.client_name ? escapeHtml(event.client_name) + ' · ' : ''}${escapeHtml(dateLabel)}
    </div>
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

  <div class="footer">
    Propulsé par <a href="https://www.nomacast.fr/" target="_blank" rel="noopener">Nomacast</a> · Live streaming corporate
  </div>

</main>

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
    <div class="modal-row">
      <label>Colle ici tes invités au format CSV (une ligne par invité)</label>
      <textarea id="csv-text" placeholder="email@example.com,Nom Prénom&#10;autre@example.com,Autre Personne&#10;contact@example.com"></textarea>
      <p class="muted" style="font-size:12px;margin:6px 0 0">Format : <code>email,nom</code> · le nom est optionnel · ligne d'entête ignorée.</p>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn btn-primary" id="csv-submit">Importer</button>
    </div>
  </div>
</div>

<script>
(function () {
  var API = ${JSON.stringify(apiBase)};
  var state = { invitees: [] };

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

  // Import CSV
  $('btn-import').addEventListener('click', function () {
    $('csv-text').value = '';
    $('modal-csv').hidden = false;
    setTimeout(function () { $('csv-text').focus(); }, 50);
  });
  $('csv-submit').addEventListener('click', async function () {
    var text = $('csv-text').value.trim();
    if (!text) { alert('Colle ton CSV'); return; }
    var lines = text.split(/\\r?\\n/).filter(function (l) { return l.trim(); });
    var rows = lines.map(function (l) {
      var parts = l.split(/[,;\\t]/).map(function (p) { return p.trim(); });
      return { email: parts[0], full_name: parts[1] || '' };
    }).filter(function (r) { return r.email && r.email.includes('@'); });
    if (rows.length === 0) { alert('Aucun email valide trouvé'); return; }
    this.disabled = true; this.textContent = '...';
    try {
      var data = await api('/invitees', { method: 'POST', body: { invitees: rows } });
      var msg = data.added + ' ajouté(s)';
      if (data.duplicates > 0) msg += ', ' + data.duplicates + ' doublon(s)';
      if (data.errors && data.errors.length > 0) msg += ', ' + data.errors.length + ' erreur(s)';
      showMsg(data.added > 0 ? 'success' : 'error', msg);
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
        var data = await r.json();
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
})();
</script>

</body>
</html>`;
}
