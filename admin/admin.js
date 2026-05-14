// admin/admin.js — Helpers partagés des pages admin

(function () {
  'use strict';

  // ============================================================
  // Fetch wrapper : credentials automatiques (Basic Auth same-origin)
  // ============================================================
  // Le browser réutilise les credentials Basic Auth déjà cachés
  // pour les requêtes vers la même origine. Pas besoin de header
  // explicite ici.

  async function apiFetch(url, options) {
    options = options || {};
    options.headers = Object.assign(
      { 'Content-Type': 'application/json' },
      options.headers || {}
    );
    if (options.body && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
    }

    let response, payload;
    try {
      response = await fetch(url, options);
    } catch (err) {
      throw new Error('Erreur réseau : ' + err.message);
    }

    try {
      payload = await response.json();
    } catch (e) {
      payload = null;
    }

    if (!response.ok) {
      const msg = (payload && payload.error) || `Erreur HTTP ${response.status}`;
      const error = new Error(msg);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  // ============================================================
  // Formatters
  // ============================================================
  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric'
    }) + ' à ' + d.toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit'
    });
  }

  function formatDuration(minutes) {
    if (!minutes || isNaN(minutes)) return '—';
    const m = parseInt(minutes, 10);
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm > 0 ? h + 'h ' + mm + 'min' : h + 'h';
  }

  function statusLabel(status) {
    switch (status) {
      case 'draft': return 'Brouillon';
      case 'live': return 'En direct';
      case 'ended': return 'Terminé';
      default: return status;
    }
  }

  // ============================================================
  // DOM helpers (zéro innerHTML)
  // ============================================================
  function el(tag, opts) {
    const e = document.createElement(tag);
    if (!opts) return e;
    if (opts.className) e.className = opts.className;
    if (opts.text != null) e.textContent = opts.text;
    if (opts.html != null) {
      // Pour les rares cas où on veut du HTML brut (icônes SVG inline depuis nous-mêmes).
      // À utiliser AVEC PRÉCAUTION et JAMAIS avec du contenu utilisateur.
      e.innerHTML = opts.html;
    }
    if (opts.attrs) {
      for (const k in opts.attrs) {
        if (Object.prototype.hasOwnProperty.call(opts.attrs, k)) {
          if (opts.attrs[k] === false || opts.attrs[k] == null) continue;
          if (opts.attrs[k] === true) { e.setAttribute(k, ''); continue; }
          e.setAttribute(k, opts.attrs[k]);
        }
      }
    }
    if (opts.style) {
      for (const s in opts.style) {
        if (Object.prototype.hasOwnProperty.call(opts.style, s)) e.style[s] = opts.style[s];
      }
    }
    if (opts.on) {
      for (const ev in opts.on) {
        if (Object.prototype.hasOwnProperty.call(opts.on, ev)) e.addEventListener(ev, opts.on[ev]);
      }
    }
    if (opts.children) {
      for (let i = 0; i < opts.children.length; i++) {
        const c = opts.children[i];
        if (c == null || c === false) continue;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return e;
  }

  function clearNode(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  // ============================================================
  // Messages utilisateurs (success / error)
  // ============================================================
  function showMessage(container, type, text) {
    if (!container) return;
    clearNode(container);
    const msg = el('div', {
      className: 'admin-msg admin-msg-' + (type === 'error' ? 'error' : 'success'),
      text
    });
    container.appendChild(msg);
    if (type === 'success') {
      setTimeout(function () {
        if (msg.parentNode) msg.parentNode.removeChild(msg);
      }, 4000);
    }
  }

  // ============================================================
  // Modal de confirmation simple (window.confirm pour MVP)
  // ============================================================
  function confirmAction(message) {
    return window.confirm(message);
  }

  // ============================================================
  // Datetime <input type="datetime-local"> ↔ ISO 8601
  // ============================================================
  function isoToLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
         + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function localInputToIso(local) {
    if (!local) return null;
    // local format : "YYYY-MM-DDTHH:MM" (heure locale du navigateur)
    const d = new Date(local);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  // ============================================================
  // Public link card
  // ============================================================
  function renderPublicLink(event) {
    var isPrivate = event.access_mode === 'private';
    var baseUrl = window.location.origin + '/chat/' + event.slug;
    var url = isPrivate
      ? baseUrl + '?preview=' + encodeURIComponent(event.admin_preview_token || '')
      : baseUrl;

    var card = el('div', { className: 'admin-public-link' });

    card.appendChild(el('span', {
      className: 'admin-public-link-label',
      text: isPrivate ? 'URL preview admin (privée)' : 'Page publique partageable'
    }));

    card.appendChild(el('a', {
      className: 'admin-public-link-url',
      attrs: { href: url, target: '_blank', rel: 'noopener' },
      text: url
    }));

    var actions = el('div', { className: 'admin-public-link-actions' });
    actions.appendChild(el('button', {
      className: 'admin-btn admin-btn-ghost admin-btn-sm',
      attrs: { type: 'button' },
      text: 'Copier',
      on: { click: function () {
        var btn = this;
        navigator.clipboard.writeText(url).then(
          function () {
            btn.textContent = 'Copié ✓';
            setTimeout(function () { btn.textContent = 'Copier'; }, 1500);
          },
          function () { window.prompt('Copie cette URL :', url); }
        );
      }}
    }));
    actions.appendChild(el('a', {
      className: 'admin-btn admin-btn-secondary admin-btn-sm',
      attrs: { href: url, target: '_blank', rel: 'noopener' },
      text: 'Ouvrir ↗'
    }));
    card.appendChild(actions);

    if (isPrivate) {
      var warn = el('div', {
        className: 'admin-public-link-warn',
        text: '⚠ URL privée — ne la partage pas. Les invités utilisent leur lien personnel envoyé par email.'
      });
      card.appendChild(warn);
    }

    return card;
  }

  // ============================================================
  // Client admin link card
  // ============================================================
  function renderClientAdminLink(event) {
    var card = el('div', { className: 'admin-public-link' });
    var url = window.location.origin + '/event-admin/' + (event.client_admin_token || '');

    card.appendChild(el('span', {
      className: 'admin-public-link-label',
      text: 'Lien admin client'
    }));

    card.appendChild(el('a', {
      className: 'admin-public-link-url',
      attrs: { href: url, target: '_blank', rel: 'noopener' },
      text: url
    }));

    var actions = el('div', { className: 'admin-public-link-actions' });
    actions.appendChild(el('button', {
      className: 'admin-btn admin-btn-ghost admin-btn-sm',
      attrs: { type: 'button' },
      text: 'Copier',
      on: { click: function () {
        var btn = this;
        navigator.clipboard.writeText(url).then(
          function () {
            btn.textContent = 'Copié ✓';
            setTimeout(function () { btn.textContent = 'Copier'; }, 1500);
          },
          function () { window.prompt('Copie cette URL :', url); }
        );
      }}
    }));
    actions.appendChild(el('a', {
      className: 'admin-btn admin-btn-secondary admin-btn-sm',
      attrs: { href: url, target: '_blank', rel: 'noopener' },
      text: 'Ouvrir ↗'
    }));
    card.appendChild(actions);

    card.appendChild(el('div', {
      className: 'admin-public-link-warn admin-public-link-info',
      text: 'À transmettre au client pour qu\'il gère ses propres invités sans login Nomacast. Si tu changes ADMIN_PASSWORD, ce lien sera invalidé automatiquement.'
    }));

    return card;
  }

  // ============================================================
  // Version / build info
  // ============================================================
  async function loadVersion(targetEl) {
    if (!targetEl) return;
    try {
      var resp = await fetch('/api/admin/version', { cache: 'no-store' });
      var data = await resp.json();

      // Build local (pas Cloudflare Pages)
      if (data.commit === 'local') {
        targetEl.textContent = 'build local';
        return;
      }

      // Label principal : date relative si commit_date disponible
      var label;
      if (data.commit_date) {
        label = 'build ' + formatRelativeTime(new Date(data.commit_date));
      } else {
        // Fallback : commit SHA court si l'appel GitHub a échoué
        label = 'build ' + (data.commit_short || '???');
      }
      targetEl.textContent = label;

      // Tooltip détaillé
      var tooltipLines = ['Commit : ' + (data.commit_short || '?')];
      if (data.commit_message) tooltipLines.push('« ' + data.commit_message + ' »');
      if (data.branch) tooltipLines.push('Branche : ' + data.branch);
      if (data.commit_date) {
        var d = new Date(data.commit_date);
        tooltipLines.push('Date : ' + d.toLocaleString('fr-FR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        }));
      }
      targetEl.title = tooltipLines.join('\n');
    } catch (e) {
      targetEl.textContent = 'build ?';
    }
  }

  /**
   * Format relatif court :
   *   - "à l'instant"    (< 1 min)
   *   - "il y a 23 min"  (< 1h)
   *   - "il y a 5h"      (< 24h)
   *   - "13/05 22h34"    (au-delà)
   */
  function formatRelativeTime(d) {
    var now = new Date();
    var diffMs = now - d;
    var diffMin = Math.floor(diffMs / 60000);
    var diffHrs = Math.floor(diffMs / 3600000);

    if (diffMs < 60000) return 'à l\'instant';
    if (diffMin < 60) return 'il y a ' + diffMin + ' min';
    if (diffHrs < 24) return 'il y a ' + diffHrs + 'h';

    // Date absolue compacte
    var jour = String(d.getDate()).padStart(2, '0');
    var mois = String(d.getMonth() + 1).padStart(2, '0');
    var heure = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return jour + '/' + mois + ' ' + heure + 'h' + min;
  }

  // Auto-load au DOM ready (cherche #admin-version)
  function autoLoadVersion() {
    var target = document.getElementById('admin-version');
    if (target) loadVersion(target);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoLoadVersion);
  } else {
    autoLoadVersion();
  }

  // ============================================================
  // Export global
  // ============================================================

  // ============================================================
  // Streaming live card — nomacast-stream-card-v1
  // ============================================================
  function renderStreamCard(event, onChange) {
    var card = el('div', { className: 'admin-public-link admin-stream-card' });

    card.appendChild(el('span', {
      className: 'admin-public-link-label',
      text: 'Streaming live'
    }));

    if (event.stream_uid) {
      var details = el('div', { className: 'admin-stream-details' });
      details.appendChild(buildStreamFieldRow('Server (RTMPS)', event.stream_rtmps_url));
      details.appendChild(buildStreamFieldRow('Stream Key', event.stream_rtmps_key, { secret: true }));
      if (event.stream_playback_url) {
        details.appendChild(buildStreamFieldRow('Playback URL', event.stream_playback_url));
      }
      card.appendChild(details);

      var actions = el('div', { className: 'admin-public-link-actions' });
      actions.appendChild(el('button', {
        className: 'admin-btn admin-btn-ghost admin-btn-sm',
        attrs: { type: 'button' },
        text: 'Supprimer le live input',
        on: { click: function () {
          if (!window.confirm('Supprimer le live input Cloudflare Stream ?\n' +
                              'Si une diffusion est en cours, elle sera interrompue.\n' +
                              'Cette opération est irréversible.')) return;
          var btn = this; btn.disabled = true; btn.textContent = 'Suppression...';
          apiFetch('/api/admin/events/' + encodeURIComponent(event.id) + '/stream', { method: 'DELETE' })
            .then(function () { if (typeof onChange === 'function') onChange(); })
            .catch(function (err) {
              window.alert('Suppression échouée : ' + err.message);
              btn.disabled = false; btn.textContent = 'Supprimer le live input';
            });
        }}
      }));
      card.appendChild(actions);

      card.appendChild(el('div', {
        className: 'admin-public-link-warn admin-public-link-info',
        text: 'Configure OBS avec ces credentials (latence « ultra low » recommandée, GOP 2s). La Stream Key est secrète : ne la partage pas.'
      }));

    } else {
      card.appendChild(el('div', {
        className: 'admin-public-link-warn admin-public-link-info',
        text: 'Aucun live input Cloudflare Stream associé à cet event. Provisionne-le pour récupérer la clé OBS et activer le player côté participants.'
      }));

      var actions2 = el('div', { className: 'admin-public-link-actions' });
      actions2.appendChild(el('button', {
        className: 'admin-btn admin-btn-primary admin-btn-sm',
        attrs: { type: 'button' },
        text: 'Provisionner le live input',
        on: { click: function () {
          var btn = this; btn.disabled = true; btn.textContent = 'Création...';
          apiFetch('/api/admin/events/' + encodeURIComponent(event.id) + '/stream', { method: 'POST' })
            .then(function () { if (typeof onChange === 'function') onChange(); })
            .catch(function (err) {
              window.alert('Provisionnement échoué : ' + err.message);
              btn.disabled = false; btn.textContent = 'Provisionner le live input';
            });
        }}
      }));
      card.appendChild(actions2);
    }

    return card;
  }

  function buildStreamFieldRow(label, value, opts) {
    opts = opts || {};
    var isSecret = !!opts.secret;
    var row = el('div', { className: 'admin-stream-row' });

    row.appendChild(el('div', { className: 'admin-stream-row-label', text: label }));

    var valueWrap = el('div', { className: 'admin-stream-row-value' });
    var valueText = isSecret ? '••••••••••••••••••' : (value || '—');
    var valueEl = el('code', { className: 'admin-stream-row-code', text: valueText });
    valueWrap.appendChild(valueEl);
    row.appendChild(valueWrap);

    var actions = el('div', { className: 'admin-stream-row-actions' });

    if (isSecret) {
      var revealed = false;
      var revealBtn = el('button', {
        className: 'admin-btn admin-btn-ghost admin-btn-sm',
        attrs: { type: 'button' },
        text: 'Afficher',
        on: { click: function () {
          revealed = !revealed;
          valueEl.textContent = revealed ? (value || '—') : '••••••••••••••••••';
          this.textContent = revealed ? 'Masquer' : 'Afficher';
        }}
      });
      actions.appendChild(revealBtn);
    }

    actions.appendChild(el('button', {
      className: 'admin-btn admin-btn-ghost admin-btn-sm',
      attrs: { type: 'button' },
      text: 'Copier',
      on: { click: function () {
        var btn = this;
        navigator.clipboard.writeText(value || '').then(
          function () {
            btn.textContent = 'Copié ✓';
            setTimeout(function () { btn.textContent = 'Copier'; }, 1500);
          },
          function () { window.prompt('Copie :', value); }
        );
      }}
    }));

    row.appendChild(actions);
    return row;
  }

  window.NomacastAdmin = {
    apiFetch,
    formatDate, formatDateTime, formatDuration, statusLabel,
    el, clearNode,
    showMessage, confirmAction,
    isoToLocalInput, localInputToIso,
    renderPublicLink,
    renderClientAdminLink,
    renderStreamCard,
    loadVersion
  };
})();
