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
  }

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

  function handleSubmit() {
    if (!validateAllForSubmit()) return;

    var data = collectFormData();
    track('chat_wizard_submitted', {
      duration: data.duration,
      audience: data.audience,
      modes_count: data.modes.length,
      white_label: data.white_label,
      subtitles: data.subtitles,
      estimated_price: data.estimated_price
    });

    console.log('[Nomacast Chat Interactif] Configuration soumise :', data);
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = 'Configuration enregistrée · Backend à venir';
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
