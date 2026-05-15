/**
 * chat-interactif-v3 · Nomacast Configurator (EN)
 *
 * Architecture v3 (mode page unique, pattern tarifs.html) :
 *  - 4 sections de configuration visibles en permanence à gauche
 *  - Aside sticky à droite avec sous-total, breakdown, formulaire et CTA
 *  - Pas de wizard séquentiel, pas de progress bar, pas de Précédent/Suivant
 *
 * Fonctionnalités :
 *  - Calcul tarifaire en temps réel (mapping libre → tier)
 *  - Récap live synchronisé entre les inputs et l'aside
 *  - Upload logo avec preview et validation
 *  - Validation au moment du submit (durée, audience, email)
 *  - Tracking GTM (events chat_wizard_*)
 *
 * Trusted Types compat · chat-preview-v3
 *  - Brave avec Shields actifs et CSP `require-trusted-types-for 'script'`
 *    bloquent les `element.innerHTML = string` natifs.
 *  - La policy 'default' ci-dessous passe nos strings sans transformation,
 *    ce qui rend toutes les assignations innerHTML transparentes.
 */

// Trusted Types policy AVANT l'IIFE : capture la moindre assignation innerHTML
// dans le code suivant. Sans cette policy, updatePreview() plante silencieusement
// sur les navigateurs strict (Brave Shields, CSP enforced).
if (typeof window !== 'undefined' && window.trustedTypes && window.trustedTypes.createPolicy) {
  try {
    window.trustedTypes.createPolicy('default', {
      createHTML: function (input) { return input; },
      createScriptURL: function (input) { return input; },
      createScript: function (input) { return input; }
    });
  } catch (e) {
    // La policy 'default' existe déjà OU le navigateur la refuse : on laisse passer.
    // Le code continue à fonctionner sur les navigateurs non-strict.
    console.warn('[CHAT-INTERACTIF] Trusted Types default policy not installed:', e && e.message);
  }
}

(function () {
  'use strict';

  console.log('[CHAT-INTERACTIF] JS loaded · chat-interactif-v3 + chat-preview-v3 · EN');

  // ============================================================
  // CONSTANTES
  // ============================================================
  var PRICE_GRID = {
    2: [290, 390, 490, 690],
    3: [390, 490, 590, 790],
    4: [490, 590, 690, 890],
    6: [590, 790, 990, 1290]
  };
  var WHITELABEL_PRICE = 150;
  var SUBTITLES_PRICE = 200;

  var LOGO_MAX_SIZE = 2 * 1024 * 1024;
  var LOGO_VALID_TYPES = /^image\/(png|jpe?g|svg\+xml)$/;
  var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ============================================================
  // DOM REFS
  // ============================================================
  var wizardSection = document.getElementById('wizard');
  var wizard = document.getElementById('wizard-form');
  if (!wizard || !wizardSection) return;

  var btnSubmit = wizardSection.querySelector('.summary-cta');
  var summaryAside = wizardSection.querySelector('.wizard-summary');

  // Inputs de configuration
  var durationInput = wizard.querySelector('input[name="duration"]');
  var audienceInput = wizard.querySelector('input[name="audience"]');
  var colorInput = wizard.querySelector('input[name="primary-color"]');
  var whitelabelToggle = wizard.querySelector('input[name="white-label"]');
  var subtitlesCheckbox = wizard.querySelector('input[name="mode-subtitles"]');
  var logoInput = wizard.querySelector('input[name="logo"]');

  // Inputs de coordonnées (dans l'aside)
  var emailInput = wizardSection.querySelector('input[name="email"]');
  var phoneInput = wizardSection.querySelector('input[name="phone"]');
  var companyInput = wizardSection.querySelector('input[name="company"]');
  var eventDateInput = wizardSection.querySelector('input[name="event-date"]');

  var modeCheckboxes = Array.prototype.slice.call(
    wizard.querySelectorAll('input[type="checkbox"][name^="mode-"]')
  );
  var accessModeRadios = Array.prototype.slice.call(
    wizard.querySelectorAll('input[name="access-mode"]')
  );

  // ============================================================
  // STATE
  // ============================================================
  var state = {
    firstInteractionFired: false,
    youMessages: [],          // messages tapés par le visiteur dans le preview · chat-preview-v2
    previewMessageSent: false, // GTM : signal d'engagement, fire une seule fois
    carouselSlides: [],        // slides actuels du carrousel · chat-preview-v5
    carouselIndex: 0,          // index courant du carrousel · chat-preview-v5
    logoDataUrl: null,         // data URL du logo uploadé pour affichage preview · chat-preview-v6
    logoFile: null             // métadonnées du logo (name, size) pour la zone de drop
  };

  // ============================================================
  // UTILS
  // ============================================================
  function track(eventName, data) {
    if (window.dataLayer) {
      var payload = { event: eventName };
      if (data) {
        for (var k in data) { if (Object.prototype.hasOwnProperty.call(data, k)) payload[k] = data[k]; }
      }
      window.dataLayer.push(payload);
    }
  }

  function formatPriceNumber(n) {
    try { return new Intl.NumberFormat('en-GB').format(n); }
    catch (e) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  }

  function getLabelText(input) {
    var label = input.parentElement;
    if (!label) return '';
    var clone = label.cloneNode(true);
    var tip = clone.querySelector('.wizard-option-tip');
    if (tip) tip.parentNode.removeChild(tip);
    var inp = clone.querySelector('input');
    if (inp) inp.parentNode.removeChild(inp);
    return clone.textContent.trim();
  }

  function setRecap(key, text) {
    var nodes = wizardSection.querySelectorAll('[data-recap="' + key + '"]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = text;
    }
  }

  function firstInteraction() {
    if (state.firstInteractionFired) return;
    state.firstInteractionFired = true;
    track('chat_wizard_started');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function markFieldError(field, hasError) {
    if (!field) return;
    // wizard-cards-v1 : si l'input est hidden (cas durée/audience), on ne peut pas appliquer
    // une bordure rouge dessus ; on marque visuellement le groupe de cards parent à la place.
    if (field.type === 'hidden') {
      var group = field.parentNode && field.parentNode.querySelector('.wizard-cards[data-group="' + field.name + '"]');
      if (group) group.classList.toggle('has-error', !!hasError);
      return;
    }
    field.style.borderColor = hasError ? '#e23636' : '';
  }

  // ============================================================
  // CALCUL TARIFAIRE
  // ============================================================
  function mapDurationToTier(h) {
    if (!h || isNaN(h) || h <= 0) return null;
    if (h <= 2) return 2;
    if (h <= 3) return 3;
    if (h <= 4) return 4;
    return 6;
  }

  function mapAudienceToTier(a) {
    if (a === null || isNaN(a) || a <= 0) return null;
    if (a < 50) return 0;
    if (a < 150) return 1;
    if (a < 300) return 2;
    return 3;
  }

  // chat-pricing-options-v1 : les options payantes (sous-titrage, marque blanche)
  // sont indépendantes du choix durée + audience. Elles doivent toujours s'ajouter
  // au sous-total affiché, y compris quand on est encore sur "À partir de 290 €".
  var BASE_PRICE = 290; // = PRICE_GRID[2][0], prix plancher du chat seul (2h, <50 audience)

  function calculateOptionsPrice() {
    var extra = 0;
    if (whitelabelToggle && whitelabelToggle.checked) extra += WHITELABEL_PRICE;
    if (subtitlesCheckbox && subtitlesCheckbox.checked) extra += SUBTITLES_PRICE;
    return extra;
  }

  function calculatePrice() {
    var h = parseFloat(durationInput.value);
    var a = parseInt(audienceInput.value, 10);
    var dt = mapDurationToTier(h);
    var at = mapAudienceToTier(a);
    if (dt === null || at === null) return null;
    return PRICE_GRID[dt][at] + calculateOptionsPrice();
  }

  // ============================================================
  // RÉCAP LIVE
  // ============================================================
  function updateRecap() {
    var h = parseFloat(durationInput.value);
    if (h > 0) {
      var hLabel = (h === 1) ? '1 hour' : (h + ' hours');
      if (h > 4 && h <= 6) hLabel = h + ' hours (6h tier)';
      else if (h > 6) hLabel = h + ' hours (6h+ floor tier)';
      setRecap('duration', hLabel);
    } else {
      setRecap('duration', 'To set');
    }

    var a = parseInt(audienceInput.value, 10);
    setRecap('audience', (a > 0) ? (a + ' attendees') : 'To set');

    var checked = modeCheckboxes
      .filter(function (c) { return c.checked; })
      .map(getLabelText);
    setRecap('modes', checked.length ? checked.join(' · ') : '—');

    var accessChecked = accessModeRadios.filter(function (r) { return r.checked; })[0];
    if (accessChecked) setRecap('access-mode', getLabelText(accessChecked));

    setRecap('white-label', (whitelabelToggle && whitelabelToggle.checked)
      ? 'Full white label (+€150)'
      : 'Nomacast logo kept');

    var p = calculatePrice();
    if (p === null) {
      // chat-pricing-options-v1 : pas encore de durée/audience, mais on inclut quand même
      // les options payantes éventuelles dans l'estimation plancher.
      var estimate = BASE_PRICE + calculateOptionsPrice();
      setRecap('price', 'From €' + formatPriceNumber(estimate) + ' excl. VAT');
    } else {
      setRecap('price', '€' + formatPriceNumber(p) + ' excl. VAT');
    }

    // Update preview interactif
    updatePreview();
  }

  // ============================================================
  // PREVIEW INTERACTIF · chat-preview-v4 (DOM API pure, zéro innerHTML)
  // ============================================================
  // Pourquoi cette version : Brave Shields, CSP strict et `require-trusted-types-for`
  // bloquent toutes les assignations `element.innerHTML = string`, ce qui faisait
  // planter silencieusement les versions v1, v2, v3. Ici on construit toute la DOM
  // via createElement / createElementNS / textContent / appendChild. Plus aucune
  // chaîne HTML n'est parsée → ça marche partout, indépendamment des policies.
  var previewMessagesEl = document.getElementById('preview-messages');
  var previewInputEl = document.getElementById('preview-input');
  var previewFootEl = document.getElementById('preview-foot');
  var previewSubtitleEl = document.getElementById('preview-subtitle');
  var previewLogoEl = document.getElementById('preview-logo');
  var previewAudienceCountEl = document.getElementById('preview-audience-count');
  var previewSection = document.getElementById('preview');

  // Helpers DOM
  function $el(tag, opts) {
    var e = document.createElement(tag);
    if (!opts) return e;
    if (opts.className) e.className = opts.className;
    if (opts.text != null) e.textContent = opts.text;
    if (opts.attrs) {
      for (var a in opts.attrs) {
        if (Object.prototype.hasOwnProperty.call(opts.attrs, a)) e.setAttribute(a, opts.attrs[a]);
      }
    }
    if (opts.style) {
      for (var s in opts.style) {
        if (Object.prototype.hasOwnProperty.call(opts.style, s)) e.style[s] = opts.style[s];
      }
    }
    if (opts.children) {
      for (var i = 0; i < opts.children.length; i++) {
        if (opts.children[i]) e.appendChild(opts.children[i]);
      }
    }
    return e;
  }

  function $svg(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
      }
    }
    return e;
  }

  function $clear(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
  }

  function $svgIcon(svgAttrs, children) {
    var s = $svg('svg', svgAttrs);
    for (var i = 0; i < children.length; i++) {
      s.appendChild($svg(children[i].tag, children[i].attrs));
    }
    return s;
  }

  // Attrs communs pour les icônes de réactions
  var REACT_ATTRS = {
    width: '11', height: '11', viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  };

  // Faux contenu B2B réaliste, mappé par mode
  var PREVIEW_TEMPLATES = {
    qa: [
      { author: 'Marie L.', role: 'Marketing', time: '2 min ago', text: 'What is your product roadmap for H2?', upvotes: 12 },
      { author: 'Paul B.', role: 'Procurement', time: '4 min ago', text: 'How does your offering compare with established players?', upvotes: 8 },
      { author: 'Sophie M.', role: 'CFO', time: '7 min ago', text: 'Does the pricing include support and maintenance?', upvotes: 5 }
    ],
    libre: [
      { author: 'Thomas R.', time: 'just now', text: 'Really interesting talk, thanks!' },
      { author: 'Julie F.', time: '1 min ago', text: '+1 on the point Marie raised' }
    ],
    sondage: {
      question: 'Your top priority for 2026?',
      options: [
        { label: 'Product innovation', votes: 42 },
        { label: 'Customer acquisition', votes: 31 },
        { label: 'Cost reduction', votes: 27 }
      ]
    },
    quiz: {
      question: 'Which acquisition channel generated the most leads in 2025?',
      options: [
        { letter: 'A', label: 'Trade shows and events', correct: false },
        { letter: 'B', label: 'LinkedIn Ads', correct: true },
        { letter: 'C', label: 'Organic search', correct: false },
        { letter: 'D', label: 'Cold emailing', correct: false }
      ]
    },
    cloud: {
      question: 'Which words describe our brand?',
      words: [
        { text: 'Innovation', size: 4 },
        { text: 'Trust', size: 3 },
        { text: 'Performance', size: 4 },
        { text: 'Agile', size: 2 },
        { text: 'Premium', size: 3 },
        { text: 'Reliable', size: 2 },
        { text: 'Disruptive', size: 1 },
        { text: 'Expert', size: 3 }
      ]
    },
    reactions: [
      { count: 32, label: 'Bravo', makeIcon: function () { return $svgIcon(REACT_ATTRS, [{ tag: 'path', attrs: { d: 'M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3' } }]); } },
      { count: 18, label: 'Agree', makeIcon: function () { return $svgIcon(REACT_ATTRS, [{ tag: 'polyline', attrs: { points: '20 6 9 17 4 12' } }]); } },
      { count: 12, label: 'Clear', makeIcon: function () { return $svgIcon(REACT_ATTRS, [{ tag: 'path', attrs: { d: 'M9 11.5l2 2 4-4' } }, { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } }]); } },
      { count: 8, label: 'Insight', makeIcon: function () { return $svgIcon(REACT_ATTRS, [
        { tag: 'line', attrs: { x1: '12', y1: '2', x2: '12', y2: '6' } },
        { tag: 'line', attrs: { x1: '12', y1: '18', x2: '12', y2: '22' } },
        { tag: 'line', attrs: { x1: '4.93', y1: '4.93', x2: '7.76', y2: '7.76' } },
        { tag: 'line', attrs: { x1: '16.24', y1: '16.24', x2: '19.07', y2: '19.07' } },
        { tag: 'line', attrs: { x1: '2', y1: '12', x2: '6', y2: '12' } },
        { tag: 'line', attrs: { x1: '18', y1: '12', x2: '22', y2: '12' } }
      ]); } }
    ],
    // Pré-Q&A : questions soumises AVANT l'événement, triées par votes
    preqa: [
      { author: 'Eloise V.', role: 'Marketing Director', time: 'submitted yesterday', text: 'Which metrics will you present to measure the launch success?', upvotes: 42 },
      { author: 'Karim B.', role: 'Product', time: 'submitted 2 days ago', text: 'Is the timeline announced at kick-off still on track despite recent trade-offs?', upvotes: 31 },
      { author: 'Lea M.', role: 'Sales Enablement', time: 'submitted 3 days ago', text: 'Will a pricing sheet be shared with the team before go-live?', upvotes: 28 }
    ],
    // Mur d'idées : post-its collaboratifs, regroupés par thème
    brainstorm: {
      question: 'How can we improve customer experience in 2027?',
      ideas: [
        { author: 'Antoine R.', text: 'Personalised video onboarding', color: 'yellow' },
        { author: 'Camille D.', text: 'VIP customer Slack community', color: 'pink' },
        { author: 'Hugo P.', text: 'Self-service video help centre', color: 'blue' },
        { author: 'Sarah K.', text: 'Monthly product insights newsletter', color: 'green' },
        { author: 'Marc T.', text: 'Monthly live with the CEO', color: 'yellow' },
        { author: 'Ines L.', text: 'Ambassador programme with rewards', color: 'blue' }
      ]
    },
    // Citations à retenir : moments clés transformés en cartes partageables
    citation: {
      text: 'Engagement is not measured by the number of views, but by the number of people who leave with an actionable idea.',
      author: 'Helen Vasseur',
      role: 'Innovation Director, Keynote',
      timestamp: '4 min ago'
    }
  };

  // -------------------- RENDERERS (retournent des DOM nodes) --------------------

  function renderQA(item) {
    return $el('div', {
      className: 'pm',
      children: [
        $el('div', {
          className: 'pm-head',
          children: [
            $el('span', { className: 'pm-author', text: item.author }),
            $el('span', { className: 'pm-time', text: item.time })
          ]
        }),
        $el('div', { className: 'pm-text', text: item.text }),
        $el('div', {
          className: 'pm-actions',
          children: [
            $el('span', { className: 'pm-upvote', text: '▲ ' + item.upvotes }),
            $el('span', { className: 'pm-badge', text: 'Moderated Q&A' })
          ]
        })
      ]
    });
  }

  function renderLibre(item) {
    return $el('div', {
      className: 'pm',
      children: [
        $el('div', {
          className: 'pm-head',
          children: [
            $el('span', { className: 'pm-author', text: item.author }),
            $el('span', { className: 'pm-time', text: item.time })
          ]
        }),
        $el('div', { className: 'pm-text', text: item.text })
      ]
    });
  }

  function renderSondage(s) {
    var total = s.options.reduce(function (a, o) { return a + o.votes; }, 0);
    var rows = s.options.map(function (o) {
      var pct = Math.round((o.votes / total) * 100);
      return $el('div', {
        className: 'pm-poll-row',
        children: [
          $el('span', { className: 'pm-poll-label-row', text: o.label }),
          $el('div', {
            className: 'pm-poll-bar',
            children: [$el('div', { className: 'pm-poll-fill', style: { width: pct + '%' } })]
          }),
          $el('span', { className: 'pm-poll-pct', text: pct + '%' })
        ]
      });
    });
    return $el('div', {
      className: 'pm pm-poll',
      children: [
        $el('div', {
          className: 'pm-poll-head',
          children: [
            $el('span', { className: 'pm-poll-label', text: 'Live poll' }),
            $el('span', {
              text: total + ' votes',
              style: { fontSize: '10px', color: 'var(--ink-faint)' }
            })
          ]
        }),
        $el('div', { className: 'pm-poll-q', text: s.question })
      ].concat(rows)
    });
  }

  function renderQuiz(q) {
    var opts = q.options.map(function (o) {
      var div = $el('div', {
        className: 'pm-quiz-opt' + (o.correct ? ' correct' : ''),
        children: [$el('span', { className: 'pm-quiz-opt-letter', text: o.letter })]
      });
      div.appendChild(document.createTextNode(' ' + o.label));
      return div;
    });
    return $el('div', {
      className: 'pm pm-quiz',
      children: [
        $el('div', {
          className: 'pm-poll-head',
          children: [$el('span', { className: 'pm-poll-label', text: 'Interactive quiz' })]
        }),
        $el('div', { className: 'pm-quiz-q', text: q.question })
      ].concat(opts)
    });
  }

  function renderCloud(c) {
    var words = c.words.map(function (w) {
      return $el('span', { className: 'pm-cloud-w s' + w.size, text: w.text });
    });
    return $el('div', {
      className: 'pm pm-cloud',
      children: [
        $el('div', { className: 'pm-cloud-q', text: c.question }),
        $el('div', { className: 'pm-cloud-words', children: words })
      ]
    });
  }

  function renderReactions(reactions) {
    var chips = reactions.map(function (r) {
      var chip = $el('span', {
        className: 'pm-reaction-chip',
        attrs: { title: r.label }
      });
      if (r.makeIcon) chip.appendChild(r.makeIcon());
      chip.appendChild(document.createTextNode(' ' + r.count));
      return chip;
    });
    return $el('div', {
      className: 'pm',
      children: [
        $el('div', {
          className: 'pm-head',
          children: [$el('span', { className: 'pm-author', text: 'Quick reactions' })]
        }),
        $el('div', { className: 'pm-reactions', children: chips })
      ]
    });
  }

  // Pré-Q&A : variante de Q&A avec badge "Pré-événement" et compteurs de votes plus élevés.
  // Visuellement très proche du Q&A modéré (réutilise le pattern .pm), avec un badge distinctif.
  function renderPreQA(item) {
    return $el('div', {
      className: 'pm pm-preqa',
      children: [
        $el('div', {
          className: 'pm-head',
          children: [
            $el('span', { className: 'pm-author', text: item.author }),
            $el('span', { className: 'pm-time', text: item.time })
          ]
        }),
        $el('div', { className: 'pm-text', text: item.text }),
        $el('div', {
          className: 'pm-actions',
          children: [
            $el('span', { className: 'pm-upvote', text: '▲ ' + item.upvotes }),
            $el('span', { className: 'pm-badge pm-badge-preqa', text: 'Pre-event' })
          ]
        })
      ]
    });
  }

  // Mur d'idées : grille de post-its colorés, regroupés sous une question commune.
  // Évoque le format brainstorming collaboratif (style Miro/Mural).
  function renderBrainstorm(b) {
    var postits = b.ideas.map(function (idea) {
      return $el('div', {
        className: 'pm-postit pm-postit-' + idea.color,
        children: [
          $el('div', { className: 'pm-postit-text', text: idea.text }),
          $el('div', { className: 'pm-postit-author', text: idea.author })
        ]
      });
    });
    return $el('div', {
      className: 'pm pm-brainstorm',
      children: [
        $el('div', {
          className: 'pm-poll-head',
          children: [
            $el('span', { className: 'pm-poll-label', text: 'Idea wall' }),
            $el('span', {
              text: b.ideas.length + ' ideas',
              style: { fontSize: '10px', color: 'var(--ink-faint)' }
            })
          ]
        }),
        $el('div', { className: 'pm-brainstorm-q', text: b.question }),
        $el('div', { className: 'pm-brainstorm-grid', children: postits })
      ]
    });
  }

  // Citation à retenir : carte type "carte partageable LinkedIn".
  // Guillemets décoratifs + citation centrale + attribution + indicateur partage.
  function renderCitation(c) {
    return $el('div', {
      className: 'pm pm-citation',
      children: [
        $el('div', {
          className: 'pm-poll-head',
          children: [
            $el('span', { className: 'pm-poll-label', text: 'Key quote' }),
            $el('span', {
              text: c.timestamp,
              style: { fontSize: '10px', color: 'var(--ink-faint)' }
            })
          ]
        }),
        $el('div', { className: 'pm-citation-mark', text: '\u201C' }),
        $el('div', { className: 'pm-citation-text', text: c.text }),
        $el('div', {
          className: 'pm-citation-author',
          children: [
            $el('strong', { text: c.author }),
            $el('span', { text: c.role })
          ]
        }),
        $el('div', { className: 'pm-citation-share', text: 'Ready to share on LinkedIn ↗' })
      ]
    });
  }

  function renderEmpty() {
    var svg = $svg('svg', {
      width: '40', height: '40', viewBox: '0 0 24 24',
      fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    svg.style.opacity = '0.3';
    svg.appendChild($svg('path', {
      d: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'
    }));

    var p = $el('p');
    p.appendChild(document.createTextNode('Check interaction modes above'));
    p.appendChild($el('br'));
    p.appendChild(document.createTextNode('to see them render live.'));

    return $el('div', {
      className: 'preview-empty',
      children: [svg, p]
    });
  }

  function buildYouMessage(text) {
    return $el('div', {
      className: 'pm pm-you',
      children: [
        $el('div', {
          className: 'pm-head',
          children: [
            $el('span', { className: 'pm-author', text: 'You' }),
            $el('span', { className: 'pm-time', text: 'just now' })
          ]
        }),
        $el('div', { className: 'pm-text', text: text })
      ]
    });
  }

  function lightenHex(hex, amount) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(function (x) { return x + x; }).join('');
    var r = parseInt(c.substr(0, 2), 16);
    var g = parseInt(c.substr(2, 2), 16);
    var b = parseInt(c.substr(4, 2), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + amount + ')';
  }

  function updatePreview() {
    if (!previewMessagesEl) return;

    // 1. Couleur principale → CSS var locale
    var color = colorInput ? colorInput.value : '#5A98D6';
    if (previewSection) {
      previewSection.style.setProperty('--preview-accent', color);
      previewSection.style.setProperty('--preview-accent-light', lightenHex(color, 0.12));
    }

    // 2. Logo client (lu depuis state.logoDataUrl · chat-preview-v6)
    if (previewLogoEl) {
      if (state.logoDataUrl) {
        previewLogoEl.src = state.logoDataUrl;
        previewLogoEl.hidden = false;
      } else {
        previewLogoEl.removeAttribute('src');
        previewLogoEl.hidden = true;
      }
    }

    // 3. Audience count
    if (previewAudienceCountEl) {
      var a = parseInt(audienceInput.value, 10);
      previewAudienceCountEl.textContent = (a > 0) ? a : 234;
    }

    // 4. Compose les slides selon les modes cochés
    var hasQA = wizard.querySelector('input[name="mode-qa"]');
    var hasPreQA = wizard.querySelector('input[name="mode-preqa"]');
    var hasLibre = wizard.querySelector('input[name="mode-libre"]');
    var hasSondages = wizard.querySelector('input[name="mode-sondages"]');
    var hasReactions = wizard.querySelector('input[name="mode-reactions"]');
    var hasNuage = wizard.querySelector('input[name="mode-nuage"]');
    var hasQuiz = wizard.querySelector('input[name="mode-quiz"]');
    var hasBrainstorm = wizard.querySelector('input[name="mode-brainstorming"]');
    var hasCitations = wizard.querySelector('input[name="mode-citations"]');
    var hasLectureSeule = wizard.querySelector('input[name="mode-lecture"]');
    var hasSubtitles = subtitlesCheckbox && subtitlesCheckbox.checked;

    // Construction des slides (1 slide par mode actif)
    var slides = [];

    if (hasQA && hasQA.checked) {
      var qaContainer = $el('div', { className: 'preview-slide preview-slide-qa' });
      PREVIEW_TEMPLATES.qa.forEach(function (m) { qaContainer.appendChild(renderQA(m)); });
      slides.push({ label: 'Moderated Q&A', node: qaContainer });
    }
    if (hasPreQA && hasPreQA.checked) {
      var preqaContainer = $el('div', { className: 'preview-slide preview-slide-preqa' });
      PREVIEW_TEMPLATES.preqa.forEach(function (m) { preqaContainer.appendChild(renderPreQA(m)); });
      slides.push({ label: 'Pre-event questions', node: preqaContainer });
    }
    if (hasLibre && hasLibre.checked) {
      var libreContainer = $el('div', { className: 'preview-slide preview-slide-libre' });
      PREVIEW_TEMPLATES.libre.forEach(function (m) { libreContainer.appendChild(renderLibre(m)); });
      slides.push({ label: 'Open chat', node: libreContainer });
    }
    if (hasSondages && hasSondages.checked) {
      slides.push({ label: 'Live poll', node: renderSondage(PREVIEW_TEMPLATES.sondage) });
    }
    if (hasQuiz && hasQuiz.checked) {
      slides.push({ label: 'Interactive quiz', node: renderQuiz(PREVIEW_TEMPLATES.quiz) });
    }
    if (hasNuage && hasNuage.checked) {
      slides.push({ label: 'Word cloud', node: renderCloud(PREVIEW_TEMPLATES.cloud) });
    }
    if (hasReactions && hasReactions.checked) {
      slides.push({ label: 'Quick reactions', node: renderReactions(PREVIEW_TEMPLATES.reactions) });
    }
    if (hasBrainstorm && hasBrainstorm.checked) {
      slides.push({ label: 'Idea wall', node: renderBrainstorm(PREVIEW_TEMPLATES.brainstorm) });
    }
    if (hasCitations && hasCitations.checked) {
      slides.push({ label: 'Key quote', node: renderCitation(PREVIEW_TEMPLATES.citation) });
    }
    // Messages "Vous" : slide bonus si l'utilisateur en a envoyé
    if (state.youMessages && state.youMessages.length) {
      var youContainer = $el('div', { className: 'preview-slide preview-slide-you' });
      state.youMessages.forEach(function (text) { youContainer.appendChild(buildYouMessage(text)); });
      slides.push({ label: 'Your messages', node: youContainer });
    }

    // Stocker dans le state, normaliser l'index courant
    state.carouselSlides = slides;
    if (state.carouselIndex >= slides.length) state.carouselIndex = 0;
    if (state.carouselIndex < 0) state.carouselIndex = 0;

    renderCarousel();
    pulsePreviewLink();

    // 5. Lecture seule → masquer l'input
    if (previewInputEl) {
      previewInputEl.style.display = (hasLectureSeule && hasLectureSeule.checked) ? 'none' : 'flex';
    }

    // 6. Marque blanche → masquer le footer
    if (previewFootEl) {
      previewFootEl.style.display = (whitelabelToggle && whitelabelToggle.checked) ? 'none' : 'block';
    }

    // 7. Sous-titrage → afficher le bandeau sous la vidéo
    if (previewSubtitleEl) {
      previewSubtitleEl.hidden = !hasSubtitles;
    }
  }

  // -------------------- CARROUSEL · chat-preview-v5 --------------------
  var carouselNavEl = document.getElementById('preview-carousel-nav');
  var carouselLabelEl = document.getElementById('preview-carousel-label');
  var carouselCountEl = document.getElementById('preview-carousel-count');
  var carouselPrevBtn = document.getElementById('preview-carousel-prev');
  var carouselNextBtn = document.getElementById('preview-carousel-next');
  var previewLinkEl = document.querySelector('.summary-preview-link');

  function renderCarousel() {
    $clear(previewMessagesEl);
    var slides = state.carouselSlides || [];

    if (slides.length === 0) {
      previewMessagesEl.appendChild(renderEmpty());
      if (carouselNavEl) carouselNavEl.classList.remove('active');
      return;
    }

    // Afficher le slide courant
    var idx = state.carouselIndex;
    previewMessagesEl.appendChild(slides[idx].node);

    // Nav : visible si plus d'un slide
    if (carouselNavEl) {
      if (slides.length > 1) {
        carouselNavEl.classList.add('active');
        if (carouselLabelEl) carouselLabelEl.textContent = slides[idx].label;
        if (carouselCountEl) carouselCountEl.textContent = (idx + 1) + ' / ' + slides.length;
      } else {
        carouselNavEl.classList.remove('active');
      }
    }
  }

  function carouselNext() {
    var slides = state.carouselSlides || [];
    if (slides.length <= 1) return;
    state.carouselIndex = (state.carouselIndex + 1) % slides.length;
    renderCarousel();
  }

  function carouselPrev() {
    var slides = state.carouselSlides || [];
    if (slides.length <= 1) return;
    state.carouselIndex = (state.carouselIndex - 1 + slides.length) % slides.length;
    renderCarousel();
  }

  if (carouselPrevBtn) carouselPrevBtn.addEventListener('click', carouselPrev);
  if (carouselNextBtn) carouselNextBtn.addEventListener('click', carouselNext);

  // Animation pulse du bouton "Voir l'aperçu" pour attirer l'œil quand ça change
  var pulseTimeout = null;
  function pulsePreviewLink() {
    if (!previewLinkEl) return;
    // Reset l'animation si elle est déjà en cours
    previewLinkEl.classList.remove('pulse');
    void previewLinkEl.offsetWidth; // force reflow pour relancer l'animation
    previewLinkEl.classList.add('pulse');
    if (pulseTimeout) clearTimeout(pulseTimeout);
    pulseTimeout = setTimeout(function () {
      if (previewLinkEl) previewLinkEl.classList.remove('pulse');
    }, 1600);
  }

  // Timer de la vidéo : incrémente en continu pour donner vie au preview
  (function setupPreviewTimer() {
    var timerEl = document.getElementById('preview-timer');
    if (!timerEl) return;
    var startMin = 14, startSec = 23;
    setInterval(function () {
      startSec++;
      if (startSec >= 60) { startSec = 0; startMin++; }
      var mm = String(startMin).padStart(2, '0');
      var ss = String(startSec).padStart(2, '0');
      timerEl.textContent = '00:' + mm + ':' + ss;
    }, 1000);
  })();

  // ============================================================
  // PREVIEW CHAT INPUT LOCAL · chat-preview-v2
  // Le visiteur peut tester l'envoi de messages dans l'aperçu.
  // Pure démo : aucun backend, le message reste local au DOM.
  // ============================================================
  function setupPreviewChatInput() {
    if (!previewInputEl || !previewMessagesEl) return;
    var inputEl = previewInputEl.querySelector('input[type="text"]');
    var sendBtn = previewInputEl.querySelector('.preview-chat-send');
    if (!inputEl || !sendBtn) return;

    function sendPreviewMessage() {
      var text = (inputEl.value || '').trim();
      if (!text) return;

      // Mémoriser dans le state pour ne pas perdre au re-render
      state.youMessages.push(text);

      // Reset + focus
      inputEl.value = '';

      // Regénérer les slides via updatePreview, puis sauter au slide "Vos messages" · chat-preview-v5
      updatePreview();
      var slides = state.carouselSlides || [];
      for (var i = 0; i < slides.length; i++) {
        if (slides[i].label === 'Your messages') {
          state.carouselIndex = i;
          renderCarousel();
          break;
        }
      }

      previewMessagesEl.scrollTop = previewMessagesEl.scrollHeight;
      inputEl.focus();

      // Tracker UNE FOIS l'envoi de message preview (signal d'engagement)
      if (!state.previewMessageSent) {
        state.previewMessageSent = true;
        track('chat_wizard_preview_message_sent', {});
      }
    }

    sendBtn.addEventListener('click', sendPreviewMessage);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendPreviewMessage();
      }
    });
  }

  // wizard-cards-v1 : helper pour cibler scroll/focus sur le widget visible
  // (l'input hidden ne peut pas recevoir le focus ni être scrollé en standard).
  function focusFieldOrCards(field) {
    if (!field) return;
    if (field.type === 'hidden') {
      var group = field.parentNode && field.parentNode.querySelector('.wizard-cards[data-group="' + field.name + '"]');
      var target = group || field;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var firstCard = group && group.querySelector('.wizard-card');
      if (firstCard && typeof firstCard.focus === 'function') firstCard.focus({ preventScroll: true });
      return;
    }
    field.focus();
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ============================================================
  // VALIDATION
  // ============================================================
  function validateAllForSubmit() {
    // Durée
    var h = parseFloat(durationInput.value);
    if (!h || h <= 0) {
      markFieldError(durationInput, true);
      focusFieldOrCards(durationInput);
      return false;
    }
    markFieldError(durationInput, false);

    // Audience
    var a = parseInt(audienceInput.value, 10);
    if (!a || a <= 0) {
      markFieldError(audienceInput, true);
      focusFieldOrCards(audienceInput);
      return false;
    }
    markFieldError(audienceInput, false);

    // Email
    if (!emailInput.value || !EMAIL_REGEX.test(emailInput.value)) {
      markFieldError(emailInput, true);
      emailInput.focus();
      return false;
    }
    markFieldError(emailInput, false);

    return true;
  }

  // ============================================================
  // UPLOAD LOGO + PREVIEW · chat-preview-v6 (DOM API pure)
  // ============================================================
  function setupLogoPreview() {
    if (!logoInput) return;
    var dropZone = logoInput.closest('.wizard-file-drop');
    if (!dropZone) return;

    function handleFile(file) {
      if (!file) return;
      if (!LOGO_VALID_TYPES.test(file.type)) {
        alert('Format not supported. Accepted formats: PNG, JPG, SVG.');
        logoInput.value = ''; return;
      }
      if (file.size > LOGO_MAX_SIZE) {
        alert('File too large. Maximum size: 2 MB.');
        logoInput.value = ''; return;
      }
      var reader = new FileReader();
      reader.onload = function (evt) {
        // Stocker pour le preview (sinon updatePreview ne le retrouve plus
        // après le re-render du dropZone)
        state.logoDataUrl = evt.target.result;
        state.logoFile = { name: file.name, size: file.size };

        renderLogoDropZone();

        // Propager au preview chat
        updatePreview();
      };
      reader.readAsDataURL(file);
    }

    // Reconstruit le contenu du dropZone via DOM API (zéro innerHTML)
    function renderLogoDropZone() {
      $clear(dropZone);

      // Nouvel input file (re-attaché)
      var newInput = $el('input', {
        attrs: { type: 'file', name: 'logo', accept: '.png,.jpg,.jpeg,.svg', hidden: 'hidden' }
      });
      dropZone.appendChild(newInput);
      logoInput = newInput;
      logoInput.addEventListener('change', function (e) {
        handleFile(e.target.files && e.target.files[0]);
      });

      if (!state.logoFile) return;

      // Aperçu visuel : image + métadonnées
      // Note : pas de background ni de border sur l'image — sinon les logos
      // blancs disparaissent dans le cadre blanc. On laisse le logo dans son
      // contexte naturel (la zone d'upload est déjà sur fond clair).
      var img = $el('img', {
        attrs: {
          src: state.logoDataUrl,
          alt: 'Logo preview'
        },
        style: {
          maxHeight: '64px', maxWidth: '160px', objectFit: 'contain',
          borderRadius: '6px'
        }
      });

      var nameStrong = $el('strong', { text: state.logoFile.name });
      var nameRow = $el('div', { className: 'wizard-file-drop-text', children: [nameStrong] });

      var hintRow = $el('div', {
        className: 'wizard-file-drop-hint',
        text: Math.round(state.logoFile.size / 1024) + ' KB · click to change'
      });

      var infoCol = $el('div', {
        style: { textAlign: 'left' },
        children: [nameRow, hintRow]
      });

      var row = $el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '14px', justifyContent: 'center' },
        children: [img, infoCol]
      });

      dropZone.appendChild(row);
    }

    logoInput.addEventListener('change', function (e) {
      handleFile(e.target.files && e.target.files[0]);
    });
  }

  // ============================================================
  // SOUMISSION
  // ============================================================
  function collectFormData() {
    var checked = modeCheckboxes.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
    var accessChecked = accessModeRadios.filter(function (r) { return r.checked; })[0];
    return {
      duration: parseFloat(durationInput.value) || null,
      audience: parseInt(audienceInput.value, 10) || null,
      modes: checked,
      access_mode: accessChecked ? accessChecked.value : null,
      color: colorInput.value,
      white_label: whitelabelToggle ? whitelabelToggle.checked : false,
      subtitles: subtitlesCheckbox ? subtitlesCheckbox.checked : false,
      logo_filename: state.logoFile ? state.logoFile.name : null,
      email: emailInput ? emailInput.value : '',
      phone: phoneInput ? phoneInput.value : '',
      company: companyInput ? companyInput.value : '',
      event_date: eventDateInput ? eventDateInput.value : '',
      estimated_price: calculatePrice()
    };
  }

  function getTurnstileToken() {
    var input = document.querySelector('input[name="cf-turnstile-response"]');
    return input ? input.value : '';
  }

  function setSubmitLoading(isLoading) {
    if (!btnSubmit) return;
    if (isLoading) {
      btnSubmit.disabled = true;
      if (!btnSubmit.dataset.originalHtml) btnSubmit.dataset.originalHtml = btnSubmit.innerHTML;
      btnSubmit.innerHTML = 'Sending…';
    } else {
      btnSubmit.disabled = false;
      if (btnSubmit.dataset.originalHtml) btnSubmit.innerHTML = btnSubmit.dataset.originalHtml;
    }
  }

  function clearSubmitError() {
    var existing = wizardSection.querySelector('.summary-error');
    if (existing) existing.parentNode.removeChild(existing);
  }

  function showSubmitError(msg) {
    clearSubmitError();
    if (!btnSubmit) return;
    var err = document.createElement('div');
    err.className = 'summary-error';
    err.textContent = msg;
    err.style.cssText = 'background: rgba(226,54,54,0.1); color: #ffb3b3; border: 1px solid rgba(226,54,54,0.3); padding: 10px 12px; border-radius: 8px; font-size: 12px; margin-bottom: 10px; text-align: center;';
    btnSubmit.parentNode.insertBefore(err, btnSubmit);
    setTimeout(function () { if (err.parentNode) err.parentNode.removeChild(err); }, 8000);
  }

  function handleSubmit() {
    clearSubmitError();

    if (!validateAllForSubmit()) return;

    var turnstileToken = getTurnstileToken();
    if (!turnstileToken) {
      showSubmitError('Please complete the anti-bot verification before sending.');
      return;
    }

    var data = collectFormData();
    data.turnstile_token = turnstileToken;

    track('chat_wizard_submitted', {
      duration: data.duration,
      audience: data.audience,
      modes_count: data.modes.length,
      white_label: data.white_label,
      subtitles: data.subtitles,
      estimated_price: data.estimated_price
    });

    setSubmitLoading(true);

    fetch('/chat-interactif', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (response) {
        return response.json().then(function (body) {
          return { status: response.status, body: body };
        });
      })
      .then(function (result) {
        if (result.status === 200 && result.body && result.body.success) {
          window.location.href = '/en/interactive-tools-thank-you.html?id=' + encodeURIComponent(result.body.id);
        } else {
          var msg = (result.body && result.body.error)
            ? result.body.error
            : 'An error occurred. Please try again in a moment.';
          showSubmitError(msg);
          setSubmitLoading(false);
        }
      })
      .catch(function (err) {
        console.error('[Nomacast Chat Interactif] Submit error:', err);
        showSubmitError('Unable to send. Check your connection and try again.');
        setSubmitLoading(false);
      });
  }

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    // wizard-cards-v1 : sélecteur visuel à base de cartes pour durée + audience.
    // Au clic, on injecte data-value dans l'input hidden correspondant et on dispatche
    // un événement "input" pour que tout le code existant (updateRecap, calculatePrice,
    // validation, submit) continue de fonctionner sans modification.
    Array.prototype.slice.call(wizard.querySelectorAll('.wizard-cards')).forEach(function (group) {
      group.addEventListener('click', function (e) {
        var card = e.target.closest('.wizard-card');
        if (!card || !group.contains(card)) return;
        var name = card.getAttribute('data-target');
        var value = card.getAttribute('data-value');
        var input = wizard.querySelector('input[name="' + name + '"]');
        if (!input) return;
        Array.prototype.slice.call(group.querySelectorAll('.wizard-card')).forEach(function (c) {
          c.classList.toggle('active', c === card);
        });
        group.classList.remove('has-error');
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        track('chat_wizard_card_selected', { field: name, value: value });
      });
    });

    var liveInputs = [durationInput, audienceInput, colorInput, whitelabelToggle, subtitlesCheckbox];
    liveInputs.forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', function () { firstInteraction(); updateRecap(); });
      el.addEventListener('change', function () { firstInteraction(); updateRecap(); });
    });

    // Modes incompatibles avec "Lecture seule" : si Lecture seule activée, ces modes sont désactivés
    // (et inversement, si l'un de ces modes est activé, Lecture seule est désactivée).
    // Modes COMPATIBLES avec Lecture seule (non listés ici) : mode-preqa, mode-citations, mode-subtitles.
    var LECTURE_INCOMPATIBLES = ['mode-qa', 'mode-libre', 'mode-sondages', 'mode-reactions', 'mode-nuage', 'mode-quiz', 'mode-brainstorming'];

    // Met à jour la zone d'affichage des conflits entre modes (#mode-conflicts).
    // Appelée à chaque change de mode.
    function updateModeConflicts() {
      var container = document.getElementById('mode-conflicts');
      if (!container) return;
      var conflicts = [];

      // Notification quand Lecture seule est active (rappel que les autres modes sont désactivés)
      var lectureInput = wizard.querySelector('input[name="mode-lecture"]');
      if (lectureInput && lectureInput.checked) {
        conflicts.push({
          type: 'info',
          title: '"Read-only" mode active',
          text: 'Interactive modes (Q&A, polls, chat, quiz, idea wall…) are automatically disabled because they are incompatible. Still available: pre-event Q&A, key quotes and live captions.'
        });
      }

      // Render
      container.innerHTML = '';
      if (conflicts.length === 0) {
        container.hidden = true;
        return;
      }
      conflicts.forEach(function (c) {
        var msg = document.createElement('div');
        msg.className = 'mode-conflict-msg is-' + c.type;
        msg.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
          '<div><strong>' + c.title + '</strong><br>' + c.text + '</div>';
        container.appendChild(msg);
      });
      container.hidden = false;
    }

    modeCheckboxes.forEach(function (c) {
      c.addEventListener('change', function () {
        // SMART : si Lecture seule vient d'être cochée → décoche tous les modes incompatibles
        // (Note : modifier .checked en JS NE déclenche PAS l'event change, donc pas de cascade infinie)
        if (c.name === 'mode-lecture' && c.checked) {
          LECTURE_INCOMPATIBLES.forEach(function (name) {
            var input = wizard.querySelector('input[name="' + name + '"]');
            if (input && input.checked) input.checked = false;
          });
        }
        // SMART (inverse) : si un mode incompatible vient d'être coché → décoche Lecture seule
        if (LECTURE_INCOMPATIBLES.indexOf(c.name) !== -1 && c.checked) {
          var lectureInput = wizard.querySelector('input[name="mode-lecture"]');
          if (lectureInput && lectureInput.checked) lectureInput.checked = false;
        }
        // SMART : MUTEX Q&A ⟷ Chat libre (exclusion bidirectionnelle)
        // Les deux modes sont conceptuellement redondants (chacun ouvre un canal de questions/messages).
        // Cocher l'un décoche automatiquement l'autre.
        if (c.name === 'mode-qa' && c.checked) {
          var libreInput = wizard.querySelector('input[name="mode-libre"]');
          if (libreInput && libreInput.checked) libreInput.checked = false;
        }
        if (c.name === 'mode-libre' && c.checked) {
          var qaInput = wizard.querySelector('input[name="mode-qa"]');
          if (qaInput && qaInput.checked) qaInput.checked = false;
        }

        firstInteraction();
        updateRecap();
        updateModeConflicts();
        if (c.name === 'mode-subtitles') {
          track('chat_wizard_subtitles_toggled', { enabled: c.checked });
        }
      });
    });

    // Init : afficher les conflits éventuels au chargement
    updateModeConflicts();

    accessModeRadios.forEach(function (r) {
      r.addEventListener('change', function () {
        firstInteraction();
        updateRecap();
        track('chat_wizard_access_mode_changed', { mode: r.value });
      });
    });

    if (whitelabelToggle) {
      whitelabelToggle.addEventListener('change', function () {
        track('chat_wizard_whitelabel_toggled', { enabled: whitelabelToggle.checked });
      });
    }

    setupLogoPreview();
    setupPreviewChatInput();
    setupCustomToolForm();

    if (btnSubmit) btnSubmit.addEventListener('click', handleSubmit);

    updateRecap();
  }

  // ============================================================
  // MINI FORMULAIRE "OUTIL SUR MESURE" · custom-tools-cta-v2
  // ============================================================
  // Formulaire indépendant du wizard principal.
  // POST vers le même endpoint /chat-interactif avec type='custom-tool-request'.
  // Le backend (functions/envoyer.php.js) doit discriminer sur le champ `type` pour envoyer un email différent.
  function setupCustomToolForm() {
    var form = document.getElementById('custom-tool-form');
    if (!form) return;
    var feedback = document.getElementById('custom-tool-feedback');
    var submitBtn = form.querySelector('.custom-tool-form-dark-submit');
    var originalBtnHtml = submitBtn.innerHTML;

    function showFeedback(type, text) {
      feedback.className = 'custom-tool-form-dark-feedback is-' + type;
      feedback.textContent = text;
      feedback.hidden = false;
    }
    function hideFeedback() {
      feedback.hidden = true;
      feedback.textContent = '';
      feedback.className = 'custom-tool-form-dark-feedback';
    }
    function setLoading(isLoading) {
      if (isLoading) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Sending…';
      } else {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      hideFeedback();

      var description = form.querySelector('#custom-tool-description').value.trim();
      var email = form.querySelector('#custom-tool-email').value.trim();
      var honeypot = form.querySelector('input[name="hp_company_url"]').value.trim();

      // Honeypot rempli = bot. On simule un succès silencieux.
      if (honeypot) {
        showFeedback('success', 'Request sent. We will get back to you within 24h.');
        form.reset();
        return;
      }

      // Validation
      if (!description || description.length < 10) {
        showFeedback('error', 'Please describe your need in a few sentences (minimum 10 characters).');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFeedback('error', 'Please enter a valid work email.');
        return;
      }

      setLoading(true);

      // Track GTM
      try { track('chat_wizard_custom_tool_submitted', { description_length: description.length }); } catch (e) {}

      var payload = {
        type: 'custom-tool-request',
        email: email,
        description: description,
        page_source: 'interactive-tools',  // EN variant — différencier en analytics côté backend
        submitted_at: new Date().toISOString()
      };

      fetch('/chat-interactif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          if (response.ok) return response.json();
          throw new Error('HTTP ' + response.status);
        })
        .then(function (result) {
          setLoading(false);
          if (result && (result.success || result.ok || result.status === 'ok')) {
            showFeedback('success', 'Request sent. We will get back to you within 24h with a technical scope.');
            form.reset();
          } else {
            showFeedback('error', 'An error occurred. Please try again or contact evenement@nomacast.fr directly.');
          }
        })
        .catch(function () {
          setLoading(false);
          showFeedback('error', 'Unable to send. Check your connection and try again.');
        });
    });
  }

  // ============================================================
  // BOOT
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
