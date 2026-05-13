/**
 * chat-interactif-v3 · Configurateur Nomacast
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
 */

(function () {
  'use strict';

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
    firstInteractionFired: false
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
    try { return new Intl.NumberFormat('fr-FR').format(n); }
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

  function calculatePrice() {
    var h = parseFloat(durationInput.value);
    var a = parseInt(audienceInput.value, 10);
    var dt = mapDurationToTier(h);
    var at = mapAudienceToTier(a);
    if (dt === null || at === null) return null;
    var p = PRICE_GRID[dt][at];
    if (whitelabelToggle && whitelabelToggle.checked) p += WHITELABEL_PRICE;
    if (subtitlesCheckbox && subtitlesCheckbox.checked) p += SUBTITLES_PRICE;
    return p;
  }

  // ============================================================
  // RÉCAP LIVE
  // ============================================================
  function updateRecap() {
    var h = parseFloat(durationInput.value);
    if (h > 0) {
      var hLabel = (h === 1) ? '1 heure' : (h + ' heures');
      if (h > 4 && h <= 6) hLabel = h + ' heures (tier 6h)';
      else if (h > 6) hLabel = h + ' heures (tier plancher 6h+)';
      setRecap('duration', hLabel);
    } else {
      setRecap('duration', 'À saisir');
    }

    var a = parseInt(audienceInput.value, 10);
    setRecap('audience', (a > 0) ? (a + ' participants') : 'À saisir');

    var checked = modeCheckboxes
      .filter(function (c) { return c.checked; })
      .map(getLabelText);
    setRecap('modes', checked.length ? checked.join(' · ') : '—');

    var accessChecked = accessModeRadios.filter(function (r) { return r.checked; })[0];
    if (accessChecked) setRecap('access-mode', getLabelText(accessChecked));

    setRecap('white-label', (whitelabelToggle && whitelabelToggle.checked)
      ? 'Marque blanche complète (+150 €)'
      : 'Logo Nomacast conservé');

    var p = calculatePrice();
    setRecap('price', (p === null) ? 'À partir de 290 € HT' : (formatPriceNumber(p) + ' € HT'));

    // Update preview interactif
    updatePreview();
  }

  // ============================================================
  // PREVIEW INTERACTIF · chat-preview-v1
  // ============================================================
  var previewMessagesEl = document.getElementById('preview-messages');
  var previewInputEl = document.getElementById('preview-input');
  var previewFootEl = document.getElementById('preview-foot');
  var previewSubtitleEl = document.getElementById('preview-subtitle');
  var previewLogoEl = document.getElementById('preview-logo');
  var previewAudienceCountEl = document.getElementById('preview-audience-count');
  var previewSection = document.getElementById('preview');

  // Faux contenu B2B réaliste, mappé par mode
  var PREVIEW_TEMPLATES = {
    qa: [
      { author: 'Marie L.', role: 'Marketing', time: 'il y a 2 min', text: 'Quelle est votre roadmap produit pour le S2 ?', upvotes: 12 },
      { author: 'Paul B.', role: 'Achats', time: 'il y a 4 min', text: 'Comment se compare votre offre face aux acteurs historiques ?', upvotes: 8 },
      { author: 'Sophie M.', role: 'DAF', time: 'il y a 7 min', text: 'Le pricing inclut-il le support et la maintenance ?', upvotes: 5 }
    ],
    libre: [
      { author: 'Thomas R.', time: 'à l\'instant', text: 'Très intéressante cette intervention, merci !' },
      { author: 'Julie F.', time: 'il y a 1 min', text: '+1 sur le point soulevé par Marie' }
    ],
    sondage: {
      question: 'Votre principal enjeu en 2026 ?',
      options: [
        { label: 'Innovation produit', votes: 42 },
        { label: 'Acquisition client', votes: 31 },
        { label: 'Réduction des coûts', votes: 27 }
      ]
    },
    quiz: {
      question: 'Part des entreprises ayant déployé l\'IA gen en 2025 ?',
      options: [
        { letter: 'A', label: '12 %', correct: false },
        { letter: 'B', label: '28 %', correct: true },
        { letter: 'C', label: '45 %', correct: false },
        { letter: 'D', label: '71 %', correct: false }
      ]
    },
    cloud: {
      question: 'Quels mots décrivent notre marque ?',
      words: [
        { text: 'Innovation', size: 4 },
        { text: 'Confiance', size: 3 },
        { text: 'Performance', size: 4 },
        { text: 'Agile', size: 2 },
        { text: 'Premium', size: 3 },
        { text: 'Sérieux', size: 2 },
        { text: 'Disruptif', size: 1 },
        { text: 'Expert', size: 3 }
      ]
    },
    reactions: [
      { svg: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>', count: 32, label: 'Bravo' },
      { svg: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>', count: 18, label: 'D\'accord' },
      { svg: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11.5l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>', count: 12, label: 'Clair' },
      { svg: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>', count: 8, label: 'Insight' }
    ]
  };

  function renderQA(item) {
    return ''
      + '<div class="pm">'
      + '  <div class="pm-head">'
      + '    <span class="pm-author">' + escapeHtml(item.author) + '</span>'
      + '    <span class="pm-time">' + escapeHtml(item.time) + '</span>'
      + '  </div>'
      + '  <div class="pm-text">' + escapeHtml(item.text) + '</div>'
      + '  <div class="pm-actions">'
      + '    <span class="pm-upvote">▲ ' + item.upvotes + '</span>'
      + '    <span class="pm-badge">Q&A modéré</span>'
      + '  </div>'
      + '</div>';
  }

  function renderLibre(item) {
    return ''
      + '<div class="pm">'
      + '  <div class="pm-head">'
      + '    <span class="pm-author">' + escapeHtml(item.author) + '</span>'
      + '    <span class="pm-time">' + escapeHtml(item.time) + '</span>'
      + '  </div>'
      + '  <div class="pm-text">' + escapeHtml(item.text) + '</div>'
      + '</div>';
  }

  function renderSondage(s) {
    var total = s.options.reduce(function (a, o) { return a + o.votes; }, 0);
    var rows = s.options.map(function (o) {
      var pct = Math.round((o.votes / total) * 100);
      return ''
        + '<div class="pm-poll-row">'
        + '  <span class="pm-poll-label-row">' + escapeHtml(o.label) + '</span>'
        + '  <div class="pm-poll-bar"><div class="pm-poll-fill" style="width:' + pct + '%"></div></div>'
        + '  <span class="pm-poll-pct">' + pct + '%</span>'
        + '</div>';
    }).join('');
    return ''
      + '<div class="pm pm-poll">'
      + '  <div class="pm-poll-head">'
      + '    <span class="pm-poll-label">Sondage live</span>'
      + '    <span style="font-size:10px;color:var(--ink-faint);">' + total + ' votes</span>'
      + '  </div>'
      + '  <div class="pm-poll-q">' + escapeHtml(s.question) + '</div>'
      + rows
      + '</div>';
  }

  function renderQuiz(q) {
    var opts = q.options.map(function (o) {
      return ''
        + '<div class="pm-quiz-opt' + (o.correct ? ' correct' : '') + '">'
        + '  <span class="pm-quiz-opt-letter">' + escapeHtml(o.letter) + '</span>'
        + '  ' + escapeHtml(o.label)
        + '</div>';
    }).join('');
    return ''
      + '<div class="pm pm-quiz">'
      + '  <div class="pm-poll-head">'
      + '    <span class="pm-poll-label">Quiz interactif</span>'
      + '  </div>'
      + '  <div class="pm-quiz-q">' + escapeHtml(q.question) + '</div>'
      + opts
      + '</div>';
  }

  function renderCloud(c) {
    var words = c.words.map(function (w) {
      return '<span class="pm-cloud-w s' + w.size + '">' + escapeHtml(w.text) + '</span>';
    }).join('');
    return ''
      + '<div class="pm pm-cloud">'
      + '  <div class="pm-cloud-q">' + escapeHtml(c.question) + '</div>'
      + '  <div class="pm-cloud-words">' + words + '</div>'
      + '</div>';
  }

  function renderReactions(reactions) {
    var chips = reactions.map(function (r) {
      return ''
        + '<span class="pm-reaction-chip" title="' + escapeHtml(r.label) + '">'
        + r.svg + ' ' + r.count
        + '</span>';
    }).join('');
    return ''
      + '<div class="pm">'
      + '  <div class="pm-head"><span class="pm-author">Réactions rapides</span></div>'
      + '  <div class="pm-reactions">' + chips + '</div>'
      + '</div>';
  }

  function renderEmpty() {
    return ''
      + '<div class="preview-empty">'
      + '  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;">'
      + '    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>'
      + '  </svg>'
      + '  <p>Cochez des modes d\'interaction ci-dessus<br>pour voir leur rendu en direct.</p>'
      + '</div>';
  }

  function lightenHex(hex, amount) {
    // Convert hex to RGB and add alpha for the light variant
    var c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(function(x){return x+x;}).join('');
    var r = parseInt(c.substr(0,2), 16);
    var g = parseInt(c.substr(2,2), 16);
    var b = parseInt(c.substr(4,2), 16);
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

    // 2. Logo client
    if (previewLogoEl) {
      if (logoInput && logoInput.files && logoInput.files[0]) {
        var reader = new FileReader();
        reader.onload = function (e) {
          previewLogoEl.src = e.target.result;
          previewLogoEl.hidden = false;
        };
        reader.readAsDataURL(logoInput.files[0]);
      } else {
        previewLogoEl.hidden = true;
      }
    }

    // 3. Audience count (utilise la valeur saisie ou défaut)
    if (previewAudienceCountEl) {
      var a = parseInt(audienceInput.value, 10);
      previewAudienceCountEl.textContent = (a > 0) ? a : 234;
    }

    // 4. Compose les messages selon les modes cochés
    var hasQA = wizard.querySelector('input[name="mode-qa"]');
    var hasLibre = wizard.querySelector('input[name="mode-libre"]');
    var hasSondages = wizard.querySelector('input[name="mode-sondages"]');
    var hasReactions = wizard.querySelector('input[name="mode-reactions"]');
    var hasNuage = wizard.querySelector('input[name="mode-nuage"]');
    var hasQuiz = wizard.querySelector('input[name="mode-quiz"]');
    var hasLectureSeule = wizard.querySelector('input[name="mode-lecture"]');
    var hasSubtitles = subtitlesCheckbox && subtitlesCheckbox.checked;

    var parts = [];

    if (hasQA && hasQA.checked) {
      PREVIEW_TEMPLATES.qa.forEach(function (m) { parts.push(renderQA(m)); });
    }
    if (hasSondages && hasSondages.checked) {
      parts.push(renderSondage(PREVIEW_TEMPLATES.sondage));
    }
    if (hasReactions && hasReactions.checked) {
      parts.push(renderReactions(PREVIEW_TEMPLATES.reactions));
    }
    if (hasNuage && hasNuage.checked) {
      parts.push(renderCloud(PREVIEW_TEMPLATES.cloud));
    }
    if (hasQuiz && hasQuiz.checked) {
      parts.push(renderQuiz(PREVIEW_TEMPLATES.quiz));
    }
    if (hasLibre && hasLibre.checked) {
      PREVIEW_TEMPLATES.libre.forEach(function (m) { parts.push(renderLibre(m)); });
    }

    if (parts.length === 0) {
      previewMessagesEl.innerHTML = renderEmpty();
    } else {
      previewMessagesEl.innerHTML = parts.join('');
    }

    // 5. Lecture seule → masquer l'input
    if (previewInputEl) {
      previewInputEl.style.display = (hasLectureSeule && hasLectureSeule.checked) ? 'none' : 'flex';
    }

    // 6. Marque blanche → masquer le footer "Propulsé par Nomacast"
    if (previewFootEl) {
      previewFootEl.style.display = (whitelabelToggle && whitelabelToggle.checked) ? 'none' : 'block';
    }

    // 7. Sous-titrage → afficher le bandeau sous la vidéo
    if (previewSubtitleEl) {
      previewSubtitleEl.hidden = !hasSubtitles;
    }
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
  // VALIDATION
  // ============================================================
  function validateAllForSubmit() {
    // Durée
    var h = parseFloat(durationInput.value);
    if (!h || h <= 0) {
      markFieldError(durationInput, true);
      durationInput.focus();
      durationInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    markFieldError(durationInput, false);

    // Audience
    var a = parseInt(audienceInput.value, 10);
    if (!a || a <= 0) {
      markFieldError(audienceInput, true);
      audienceInput.focus();
      audienceInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  // UPLOAD LOGO + PREVIEW
  // ============================================================
  function setupLogoPreview() {
    if (!logoInput) return;
    var dropZone = logoInput.closest('.wizard-file-drop');
    if (!dropZone) return;

    function handleFile(file) {
      if (!file) return;
      if (!LOGO_VALID_TYPES.test(file.type)) {
        alert('Format non supporté. Formats acceptés : PNG, JPG, SVG.');
        logoInput.value = ''; return;
      }
      if (file.size > LOGO_MAX_SIZE) {
        alert('Fichier trop volumineux. Taille maximum : 2 Mo.');
        logoInput.value = ''; return;
      }
      var reader = new FileReader();
      reader.onload = function (evt) {
        var sizeKb = Math.round(file.size / 1024);
        dropZone.innerHTML = ''
          + '<input type="file" name="logo" accept=".png,.jpg,.jpeg,.svg" hidden>'
          + '<div style="display:flex;align-items:center;gap:14px;justify-content:center;">'
          + '  <img src="' + evt.target.result + '" alt="Aperçu logo" style="max-height:48px;max-width:120px;object-fit:contain;background:#fff;border:1px solid var(--border);border-radius:6px;padding:4px;">'
          + '  <div style="text-align:left;">'
          + '    <div class="wizard-file-drop-text"><strong>' + escapeHtml(file.name) + '</strong></div>'
          + '    <div class="wizard-file-drop-hint">' + sizeKb + ' Ko · cliquez pour changer</div>'
          + '  </div>'
          + '</div>';
        logoInput = dropZone.querySelector('input[name="logo"]');
        logoInput.addEventListener('change', function (e) {
          handleFile(e.target.files && e.target.files[0]);
        });
      };
      reader.readAsDataURL(file);
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
      logo_filename: (logoInput && logoInput.files && logoInput.files[0]) ? logoInput.files[0].name : null,
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
      btnSubmit.innerHTML = 'Envoi en cours…';
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
      showSubmitError('Veuillez compléter la vérification anti-robot avant d\'envoyer.');
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
          window.location.href = '/chat-interactif-merci.html?id=' + encodeURIComponent(result.body.id);
        } else {
          var msg = (result.body && result.body.error)
            ? result.body.error
            : 'Une erreur est survenue. Merci de réessayer dans un instant.';
          showSubmitError(msg);
          setSubmitLoading(false);
        }
      })
      .catch(function (err) {
        console.error('[Nomacast Chat Interactif] Submit error:', err);
        showSubmitError('Impossible d\'envoyer. Vérifiez votre connexion et réessayez.');
        setSubmitLoading(false);
      });
  }

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    var liveInputs = [durationInput, audienceInput, colorInput, whitelabelToggle, subtitlesCheckbox];
    liveInputs.forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', function () { firstInteraction(); updateRecap(); });
      el.addEventListener('change', function () { firstInteraction(); updateRecap(); });
    });

    modeCheckboxes.forEach(function (c) {
      c.addEventListener('change', function () {
        firstInteraction();
        updateRecap();
        if (c.name === 'mode-subtitles') {
          track('chat_wizard_subtitles_toggled', { enabled: c.checked });
        }
      });
    });

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

    if (btnSubmit) btnSubmit.addEventListener('click', handleSubmit);

    updateRecap();
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
