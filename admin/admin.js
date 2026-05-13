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
  // Export global
  // ============================================================
  window.NomacastAdmin = {
    apiFetch,
    formatDate, formatDateTime, formatDuration, statusLabel,
    el, clearNode,
    showMessage, confirmAction,
    isoToLocalInput, localInputToIso
  };
})();
