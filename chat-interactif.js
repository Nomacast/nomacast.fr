/**
 * chat-interactif-v1 · Wizard interactif Nomacast
 *
 * Fonctionnalités :
 *  - Navigation séquentielle (Précédent / Suivant) avec toggle "Voir toutes les étapes"
 *  - Calcul tarifaire en temps réel (mapping durée libre → tier de la grille)
 *  - Récapitulatif live de la configuration
 *  - Upload logo avec preview et validation
 *  - Validation des champs requis (étape 01, 02, 05)
 *  - Tracking GTM (events chat_wizard_*)
 *  - Persistance préférence d'affichage en localStorage
 *  - Soumission placeholder en attendant la Cloudflare Function (Étape 3)
 */

(function () {
  'use strict';

  // ============================================================
  // CONSTANTES
  // ============================================================
  var STEP_COUNT = 5;
  var REVIEW_STEP = 'review';

  // Grille tarifaire : [durée_tier][audience_tier]
  // duration tiers : 2h / 3h / 4h / 6h+
  // audience tiers : <50 / 50-149 / 150-299 / 300+
  var PRICE_GRID = {
    2: [290, 390, 490, 690],
    3: [390, 490, 590, 790],
    4: [490, 590, 690, 890],
    6: [590, 790, 990, 1290]
  };
  var WHITELABEL_PRICE = 150;
  var SUBTITLES_PRICE = 200;

  var STORAGE_KEY = 'nmc-wizard-mode';
  var LOGO_MAX_SIZE = 2 * 1024 * 1024; // 2 Mo
  var LOGO_VALID_TYPES = /^image\/(png|jpe?g|svg\+xml)$/;
  var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ============================================================
  // DOM REFS
  // ============================================================
  var wizard = document.getElementById('wizard-form');
  if (!wizard) return; // safety

  var wizardSection = document.getElementById('wizard');
  var steps = Array.prototype.slice.call(wizard.querySelectorAll('.wizard-step'));
  var recap = wizard.querySelector('.wizard-recap');
  var nav = wizard.querySelector('.wizard-nav');
  var btnPrev = wizard.querySelector('.wizard-btn-prev');
  var btnNext = wizard.querySelector('.wizard-btn-next');
  var btnSubmit = wizard.querySelector('.wizard-submit');
  var progressSteps = Array.prototype.slice.call(wizard.querySelectorAll('.wizard-progress-step'));

  var modeToggle = document.querySelector('.wizard-mode-toggle');
  var modeToggleLabel = modeToggle && modeToggle.querySelector('.wizard-mode-toggle-label');
  var stepIndicator = document.querySelector('.wizard-step-indicator');

  // Inputs
  var durationInput = wizard.querySelector('input[name="duration"]');
  var audienceInput = wizard.querySelector('input[name="audience"]');
  var colorInput = wizard.querySelector('input[name="primary-color"]');
  var whitelabelToggle = wizard.querySelector('input[name="white-label"]');
  var subtitlesCheckbox = wizard.querySelector('input[name="mode-subtitles"]');
  var logoInput = wizard.querySelector('input[name="logo"]');
  var emailInput = wizard.querySelector('input[name="email"]');

  var modeCheckboxes = Array.prototype.slice.call(
    wizard.querySelectorAll('input[type="checkbox"][name^="mode-"]')
  );
  var accessModeRadios = Array.prototype.slice.call(
    wizard.querySelectorAll('input[name="access-mode"]')
  );

  // Récap cibles
  var recapT = {
    duration: wizard.querySelector('[data-recap="duration"]'),
    audience: wizard.querySelector('[data-recap="audience"]'),
    modes: wizard.querySelector('[data-recap="modes"]'),
    accessMode: wizard.querySelector('[data-recap="access-mode"]'),
    color: wizard.querySelector('[data-recap="color"]'),
    whiteLabel: wizard.querySelector('[data-recap="white-label"]'),
    price: wizard.querySelector('[data-recap="price"]')
  };

  // SVG flèche du bouton Suivant (extrait une fois pour réinjection)
  var btnNextSvgHTML = btnNext && btnNext.querySelector('svg')
    ? btnNext.querySelector('svg').outerHTML
    : '';

  // ============================================================
  // STATE
  // ============================================================
  var state = {
    mode: 'sequential', // 'sequential' | 'stacked'
    currentStep: 1,
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
    try {
      return new Intl.NumberFormat('fr-FR').format(n);
    } catch (e) {
      return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
  }

  function getLabelText(input) {
    // Récupère le texte de l'option (label parent) sans le tip ni les inputs imbriqués
    var label = input.parentElement;
    if (!label) return '';
    var clone = label.cloneNode(true);
    var tip = clone.querySelector('.wizard-option-tip');
    if (tip) tip.parentNode.removeChild(tip);
    var inp = clone.querySelector('input');
    if (inp) inp.parentNode.removeChild(inp);
    return clone.textContent.trim();
  }

  function firstInteraction() {
    if (state.firstInteractionFired) return;
    state.firstInteractionFired = true;
    track('chat_wizard_started');
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
    // Durée
    var h = parseFloat(durationInput.value);
    if (h > 0) {
      var hLabel = (h === 1) ? '1 heure' : (h + ' heures');
      // Bonus : préciser le tier appliqué quand >4h
      if (h > 4 && h <= 6) hLabel = h + ' heures (tier 6h)';
      else if (h > 6) hLabel = h + ' heures (tier plancher 6h+)';
      recapT.duration.textContent = hLabel;
    } else {
      recapT.duration.textContent = 'À saisir en étape 01';
    }

    // Audience
    var a = parseInt(audienceInput.value, 10);
    recapT.audience.textContent = (a > 0) ? (a + ' participants') : 'À saisir en étape 02';

    // Modes
    var checked = modeCheckboxes
      .filter(function (c) { return c.checked; })
      .map(getLabelText);
    recapT.modes.textContent = checked.length
      ? checked.join(' · ')
      : 'À sélectionner en étape 03';

    // Mode d'accès
    var accessChecked = accessModeRadios.filter(function (r) { return r.checked; })[0];
    if (accessChecked) {
      recapT.accessMode.textContent = getLabelText(accessChecked);
    }

    // Couleur
    recapT.color.textContent = colorInput.value.toUpperCase();

    // Marque blanche
    recapT.whiteLabel.textContent = (whitelabelToggle && whitelabelToggle.checked)
      ? 'Marque blanche complète (+150 €)'
      : 'Logo Nomacast conservé';

    // Prix
    var p = calculatePrice();
    recapT.price.textContent = (p === null)
      ? 'À partir de 290 € HT'
      : (formatPriceNumber(p) + ' € HT');
  }

  // ============================================================
  // NAVIGATION ENTRE ÉTAPES
  // ============================================================
  function setBtnNextLabel(label) {
    if (!btnNext) return;
    btnNext.innerHTML = label + ' ' + btnNextSvgHTML;
  }

  function updateProgressBar() {
    progressSteps.forEach(function (el, i) {
      var idx = i + 1;
      el.classList.remove('active', 'completed');
      if (state.currentStep === REVIEW_STEP) {
        el.classList.add('completed');
      } else if (idx < state.currentStep) {
        el.classList.add('completed');
      } else if (idx === state.currentStep) {
        el.classList.add('active');
      }
    });
  }

  function updateStepIndicator() {
    if (!stepIndicator) return;
    if (state.mode === 'stacked') {
      stepIndicator.textContent = 'Toutes les étapes visibles';
    } else if (state.currentStep === REVIEW_STEP) {
      stepIndicator.textContent = 'Vérification avant envoi';
    } else {
      var s = String(state.currentStep).padStart(2, '0');
      stepIndicator.textContent = 'Étape ' + s + ' sur 0' + STEP_COUNT;
    }
  }

  function scrollToWizard() {
    if (!wizardSection) return;
    var rect = wizardSection.getBoundingClientRect();
    var top = rect.top + window.pageYOffset - 80;
    window.scrollTo({ top: top, behavior: 'smooth' });
  }

  function showStep(stepNum) {
    state.currentStep = stepNum;

    if (state.mode === 'sequential') {
      steps.forEach(function (s) { s.style.display = 'none'; });
      recap.style.display = 'none';
      nav.style.display = '';

      if (stepNum === REVIEW_STEP) {
        // Récap en mode "vérification" : on l'affiche, on garde Précédent, on masque Suivant
        recap.style.display = '';
        btnPrev.disabled = false;
        btnPrev.style.opacity = '1';
        btnPrev.style.cursor = 'pointer';
        btnNext.style.display = 'none';
      } else {
        var step = steps.filter(function (s) {
          return String(s.getAttribute('data-step')) === String(stepNum);
        })[0];
        if (step) step.style.display = '';

        btnPrev.disabled = (stepNum === 1);
        btnPrev.style.opacity = (stepNum === 1) ? '0.4' : '1';
        btnPrev.style.cursor = (stepNum === 1) ? 'not-allowed' : 'pointer';

        btnNext.style.display = '';
        setBtnNextLabel(stepNum === STEP_COUNT ? 'Vérifier ma demande' : 'Suivant');
      }
    }

    updateProgressBar();
    updateStepIndicator();
    scrollToWizard();
  }

  function nextStep() {
    firstInteraction();

    if (state.currentStep === REVIEW_STEP) return;

    if (!validateStep(state.currentStep)) return;

    track('chat_wizard_step_completed', { step: state.currentStep });

    if (state.currentStep === STEP_COUNT) {
      showStep(REVIEW_STEP);
    } else {
      showStep(state.currentStep + 1);
    }
  }

  function prevStep() {
    if (state.currentStep === 1) return;
    if (state.currentStep === REVIEW_STEP) {
      showStep(STEP_COUNT);
    } else {
      showStep(state.currentStep - 1);
    }
  }

  // ============================================================
  // MODE TOGGLE (Option C hybride)
  // ============================================================
  function setMode(mode) {
    state.mode = mode;

    if (mode === 'stacked') {
      steps.forEach(function (s) { s.style.display = ''; });
      recap.style.display = '';
      nav.style.display = 'none';
      if (modeToggleLabel) modeToggleLabel.textContent = 'Voir étape par étape';
    } else {
      if (modeToggleLabel) modeToggleLabel.textContent = 'Voir toutes les étapes';
      showStep(state.currentStep === REVIEW_STEP ? STEP_COUNT : state.currentStep);
    }

    updateStepIndicator();
  }

  function loadSavedMode() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'stacked' || saved === 'sequential') return saved;
    } catch (e) { /* localStorage indisponible */ }
    return 'sequential';
  }

  function saveMode(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) {}
  }

  // ============================================================
  // VALIDATION
  // ============================================================
  function markFieldError(field, hasError) {
    if (!field) return;
    field.style.borderColor = hasError ? '#e23636' : '';
  }

  function validateStep(stepNum) {
    if (stepNum === 1) {
      var h = parseFloat(durationInput.value);
      if (!h || h <= 0) {
        markFieldError(durationInput, true);
        durationInput.focus();
        return false;
      }
      markFieldError(durationInput, false);
    }

    if (stepNum === 2) {
      var a = parseInt(audienceInput.value, 10);
      if (!a || a <= 0) {
        markFieldError(audienceInput, true);
        audienceInput.focus();
        return false;
      }
      markFieldError(audienceInput, false);
    }

    // Étape 03 et 04 : pas de champ requis

    if (stepNum === 5) {
      if (!emailInput.value || !EMAIL_REGEX.test(emailInput.value)) {
        markFieldError(emailInput, true);
        emailInput.focus();
        return false;
      }
      markFieldError(emailInput, false);
    }

    return true;
  }

  // ============================================================
  // UPLOAD LOGO + PREVIEW
  // ============================================================
  function setupLogoPreview() {
    if (!logoInput) return;
    var dropZone = logoInput.closest('.wizard-file-drop');
    if (!dropZone) return;

    var originalHTML = dropZone.innerHTML;

    logoInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;

      if (!LOGO_VALID_TYPES.test(file.type)) {
        alert('Format non supporté. Formats acceptés : PNG, JPG, SVG.');
        logoInput.value = '';
        return;
      }
      if (file.size > LOGO_MAX_SIZE) {
        alert('Fichier trop volumineux. Taille maximum : 2 Mo.');
        logoInput.value = '';
        return;
      }

      var reader = new FileReader();
      reader.onload = function (evt) {
        var sizeKb = Math.round(file.size / 1024);
        var preview = ''
          + '<input type="file" name="logo" accept=".png,.jpg,.jpeg,.svg" hidden>'
          + '<div style="display:flex;align-items:center;gap:14px;justify-content:center;">'
          + '  <img src="' + evt.target.result + '" alt="Aperçu logo" style="max-height:48px;max-width:120px;object-fit:contain;background:#fff;border:1px solid var(--border);border-radius:6px;padding:4px;">'
          + '  <div style="text-align:left;">'
          + '    <div class="wizard-file-drop-text"><strong>' + escapeHtml(file.name) + '</strong></div>'
          + '    <div class="wizard-file-drop-hint">' + sizeKb + ' Ko · cliquez pour changer</div>'
          + '  </div>'
          + '</div>';
        dropZone.innerHTML = preview;
        // Re-bind the input that was just replaced
        logoInput = dropZone.querySelector('input[name="logo"]');
        setupLogoInputAgain();
      };
      reader.readAsDataURL(file);
    });

    function setupLogoInputAgain() {
      // Réattacher le handler sur le nouvel input
      if (!logoInput) return;
      logoInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!LOGO_VALID_TYPES.test(file.type)) {
          alert('Format non supporté. PNG, JPG ou SVG attendus.');
          logoInput.value = '';
          return;
        }
        if (file.size > LOGO_MAX_SIZE) {
          alert('Fichier trop volumineux. Maximum 2 Mo.');
          logoInput.value = '';
          return;
        }
        var r = new FileReader();
        r.onload = function (ev) {
          var sz = Math.round(file.size / 1024);
          var img = dropZone.querySelector('img');
          var txt = dropZone.querySelector('.wizard-file-drop-text');
          var hint = dropZone.querySelector('.wizard-file-drop-hint');
          if (img) img.src = ev.target.result;
          if (txt) txt.innerHTML = '<strong>' + escapeHtml(file.name) + '</strong>';
          if (hint) hint.textContent = sz + ' Ko · cliquez pour changer';
        };
        r.readAsDataURL(file);
      });
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
      email: emailInput.value,
      firstname: wizard.querySelector('input[name="firstname"]').value,
      lastname: wizard.querySelector('input[name="lastname"]').value,
      company: wizard.querySelector('input[name="company"]').value,
      phone: wizard.querySelector('input[name="phone"]').value,
      event_date: wizard.querySelector('input[name="event-date"]').value,
      notes: wizard.querySelector('textarea[name="notes"]').value,
      estimated_price: calculatePrice()
    };
  }

  function handleSubmit() {
    if (!validateStep(5)) return;

    var data = collectFormData();
    track('chat_wizard_submitted', {
      duration: data.duration,
      audience: data.audience,
      modes_count: data.modes.length,
      white_label: data.white_label,
      subtitles: data.subtitles,
      estimated_price: data.estimated_price
    });

    // Placeholder : backend Cloudflare Function à venir (Étape 3)
    console.log('[Nomacast Chat Interactif] Configuration soumise :', data);
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = 'Configuration enregistrée · Backend à venir';
    btnSubmit.style.opacity = '0.7';
    btnSubmit.style.cursor = 'default';
  }

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    // Mode initial : récupération localStorage ou sequential par défaut
    var initialMode = loadSavedMode();

    // Wire navigation
    if (btnNext) btnNext.addEventListener('click', nextStep);
    if (btnPrev) btnPrev.addEventListener('click', prevStep);

    // Wire mode toggle
    if (modeToggle) {
      modeToggle.addEventListener('click', function () {
        var newMode = (state.mode === 'sequential') ? 'stacked' : 'sequential';
        setMode(newMode);
        saveMode(newMode);
        track('chat_wizard_mode_toggled', { mode: newMode });
      });
    }

    // Wire récap live
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

    // Logo upload
    setupLogoPreview();

    // Soumission
    if (btnSubmit) btnSubmit.addEventListener('click', handleSubmit);

    // Application du mode initial + 1ère mise à jour récap
    setMode(initialMode);
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
