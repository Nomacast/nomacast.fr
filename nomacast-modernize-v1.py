#!/usr/bin/env python3
"""
nomacast-modernize-v1.py
=========================

Applique 4 modifications idempotentes sur le site Nomacast :

  1. Sélecteur de langue : 'FR · EN' / 'EN · FR' → icône globe + dropdown
  2. Bandeau dismissable de suggestion de langue (navigator.language ≠ page)
  3. Sélecteur de langue ajouté en footer
  4. Harmonisation des ombres / radius des CTA (.btn-primary, .price-cta,
     .form-submit, .btn-ghost, .cases-cta, .nav-cta)

USAGE
-----
À lancer à la racine du repo nomacast.fr :

    python3 nomacast-modernize-v1.py

Stdlib uniquement. Re-exécutable sans risque (marqueurs idempotents).

PAGES TRAITÉES
--------------
  CATÉGORIE A (~76 pages) : nav classique avec `lang-switch`
    → 4 modifs appliquées
  CATÉGORIE B (~14 pages) : landing 'devis-*'/'quote-*' avec `devis-lang-switch`
    → modifs 1+2 uniquement (pas de nav classique, pas de footer Nomacast)

PAGES IGNORÉES
--------------
  - Fichiers dans /en/ avec <html lang="fr"> (doublons en cours de nettoyage)
  - 404.html, merci.html, thank-you.html, en/404.html, en/merci.html,
    en/thank-you.html (pages statiques, pas de nav)
  - nmc-*.html (pages admin, noindex)

MARQUEURS IDEMPOTENTS
---------------------
  nomacast-lang-globe-v1    sélecteur globe
  nomacast-lang-banner-v1   bandeau suggestion
  nomacast-lang-footer-v1   sélecteur footer
  nomacast-cta-shadows-v1   ombres CTA

PRÉSERVE
--------
  - Encodage UTF-8
  - Fins de ligne CRLF (newline='')
"""

import os
import re
import sys
from pathlib import Path

ROOT = Path('.')

# ─────────────────────────────────────────────────────────────────────
# 1. CONSTANTES — Templates HTML/CSS/JS à injecter
# ─────────────────────────────────────────────────────────────────────

# CSS commun (modifs 1+2+3+4) — bloc unique injecté en bas du <style> principal
CSS_BLOCK = """
/* ════════════════════════════════════════════════════════════
   nomacast-modernize-v1 — Sélecteur globe, bandeau, footer, ombres CTA
   ════════════════════════════════════════════════════════════ */

/* nomacast-cta-shadows-v1 : harmonisation des CTA */
.nav-cta { border-radius: 8px !important; box-shadow: 0 2px 6px rgba(14,165,233,0.35) !important; transition: background 0.2s, transform 0.15s, box-shadow 0.2s !important; }
.nav-cta:hover { box-shadow: 0 6px 16px rgba(14,165,233,0.55) !important; }
.btn-primary, .price-cta, .form-submit { box-shadow: 0 2px 6px rgba(14,165,233,0.35) !important; transition: background 0.2s, transform 0.15s, box-shadow 0.2s !important; }
.btn-primary:hover, .price-cta:hover, .form-submit:hover { box-shadow: 0 6px 16px rgba(14,165,233,0.55) !important; }
.btn-ghost { box-shadow: 0 1px 3px rgba(11,25,41,0.10) !important; transition: background 0.2s, transform 0.15s, box-shadow 0.2s, border-color 0.2s !important; }
.btn-ghost:hover { box-shadow: 0 4px 12px rgba(11,25,41,0.15) !important; }
.cases-cta { box-shadow: 0 4px 12px rgba(11,25,41,0.25) !important; transition: background 0.3s, transform 0.3s, box-shadow 0.3s !important; }
.cases-cta:hover { box-shadow: 0 8px 20px rgba(11,25,41,0.35) !important; }

/* nomacast-lang-globe-v1 : sélecteur globe + dropdown */
.lang-switch { position: relative; padding: 0 !important; margin-left: 8px; }
.lang-globe { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1px solid transparent; color: var(--ink-muted, #4d6b8a); cursor: pointer; padding: 6px 10px; border-radius: 8px; font: inherit; font-size: 13px; font-weight: 600; letter-spacing: 0.02em; transition: background .15s, color .15s, border-color .15s; }
.lang-globe:hover { background: rgba(90,152,214,.08); color: var(--cyan, #5A98D6); }
.lang-globe[aria-expanded="true"] { background: rgba(90,152,214,.12); color: var(--cyan, #5A98D6); border-color: rgba(90,152,214,.18); }
.lang-globe svg { width: 15px; height: 15px; flex-shrink: 0; }
.lang-globe .lang-chevron { width: 11px; height: 11px; opacity: .7; transition: transform .2s; }
.lang-globe[aria-expanded="true"] .lang-chevron { transform: rotate(180deg); }
.lang-dropdown { position: absolute; top: calc(100% + 6px); right: 0; min-width: 160px; background: #fff; border: 1px solid var(--border, #dae4f0); border-radius: 10px; box-shadow: 0 8px 24px rgba(11,25,41,0.12); padding: 6px; margin: 0; list-style: none; z-index: 100; }
.lang-dropdown[hidden] { display: none; }
.lang-dropdown li { list-style: none; }
.lang-dropdown a { display: block; padding: 9px 14px; color: var(--ink, #0b1929); font-size: 13px; font-weight: 500; text-decoration: none; border-radius: 6px; transition: background .15s, color .15s; }
.lang-dropdown a:hover { background: rgba(90,152,214,.10); color: var(--cyan, #5A98D6); }
.lang-dropdown a.active { background: rgba(90,152,214,.12); color: var(--cyan, #5A98D6); font-weight: 600; cursor: default; }
@media (max-width: 768px) { .lang-switch { display: none !important; } }
.nav-lang-mobile { display: none; }
@media (max-width: 768px) {
 .nav-lang-mobile { display: inline-flex; align-items: center; margin-left: auto; margin-right: 4px; position: relative; }
 .nav-lang-mobile .lang-globe { padding: 6px 8px; }
 .nav-lang-mobile .lang-dropdown { right: -8px; }
}

/* nomacast-lang-banner-v1 : bandeau de suggestion */
.lang-suggest { position: fixed; top: 0; left: 0; right: 0; z-index: 1000; background: #0b1929; color: #fff; padding: 10px 20px; display: flex; align-items: center; justify-content: center; gap: 14px; font-size: 14px; font-family: var(--font-body, inherit); box-shadow: 0 2px 8px rgba(0,0,0,0.15); animation: lang-suggest-slide-in .35s ease-out; }
.lang-suggest[hidden] { display: none; }
.lang-suggest-text { opacity: .85; }
.lang-suggest-link { color: #5A98D6; font-weight: 600; text-decoration: none; }
.lang-suggest-link:hover { text-decoration: underline; }
.lang-suggest-close { background: transparent; border: none; color: #fff; font-size: 22px; cursor: pointer; padding: 0 4px; opacity: .55; line-height: 1; transition: opacity .15s; }
.lang-suggest-close:hover { opacity: 1; }
@keyframes lang-suggest-slide-in { from { transform: translateY(-100%); } to { transform: translateY(0); } }
@media (max-width: 600px) { .lang-suggest { flex-wrap: wrap; padding: 8px 14px; font-size: 13px; gap: 6px; text-align: center; justify-content: center; } }

/* nomacast-lang-footer-v1 : sélecteur dans le footer */
.footer-lang { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: rgba(255,255,255,.5); }
.footer-lang svg { width: 12px; height: 12px; opacity: .65; }
.footer-lang a { color: rgba(255,255,255,.5); text-decoration: none; transition: color .2s; }
.footer-lang a:hover { color: #5A98D6; }
.footer-lang a.active { color: #fff; font-weight: 600; }
.footer-lang .footer-lang-sep { opacity: .35; }

/* Page 'devis-*' / 'quote-*' et landings produits : adapter le dropdown aux headers allégés */
.devis-lang-switch, .landing-lang-switch { position: relative; list-style: none; padding: 0; margin: 0; }
.devis-lang-switch .lang-globe, .landing-lang-switch .lang-globe { padding: 6px 10px; }
.devis-lang-switch .lang-dropdown, .landing-lang-switch .lang-dropdown { right: 0; }
"""

# JS commun (modifs 1+2) — fonctionnement dropdown + bandeau de suggestion
JS_BLOCK = """
<!-- nomacast-modernize-v1 : JS sélecteur globe + bandeau suggestion langue -->
<script>
(function(){
  // ─── 1. Dropdown langue globe ───────────────────────────────
  function initLangGlobe(){
    var globes = document.querySelectorAll('.lang-globe');
    if (!globes.length) return;
    function closeAll(except){
      globes.forEach(function(b){
        if (b === except) return;
        b.setAttribute('aria-expanded','false');
        var dd = b.nextElementSibling;
        if (dd && dd.classList.contains('lang-dropdown')) dd.hidden = true;
      });
    }
    globes.forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var dd = btn.nextElementSibling;
        if (!dd || !dd.classList.contains('lang-dropdown')) return;
        var isOpen = btn.getAttribute('aria-expanded') === 'true';
        closeAll(isOpen ? null : btn);
        btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
        dd.hidden = isOpen;
      });
      btn.addEventListener('keydown', function(e){
        if (e.key === 'Escape'){
          btn.setAttribute('aria-expanded','false');
          var dd = btn.nextElementSibling;
          if (dd && dd.classList.contains('lang-dropdown')) dd.hidden = true;
        }
      });
    });
    document.addEventListener('click', function(){ closeAll(null); });
  }

  // ─── 2. Bandeau suggestion langue ───────────────────────────
  function initLangBanner(){
    var SK = 'nmc-lang-suggest-dismissed';
    try { if (sessionStorage.getItem(SK)) return; } catch(e){}
    var pageLang = (document.documentElement.lang || 'fr').toLowerCase().slice(0,2);
    var navLang = ((navigator.language || navigator.userLanguage || 'en')).toLowerCase().slice(0,2);
    if (pageLang === navLang) return;
    if (navLang !== 'fr' && navLang !== 'en') return;
    var alt = document.querySelector('link[rel="alternate"][hreflang="' + navLang + '"]');
    if (!alt || !alt.href) return;
    var el = document.getElementById('lang-suggest');
    if (!el) return;
    var msg = (navLang === 'en')
      ? { text: 'This site is also available in English.', link: 'View English version →' }
      : { text: 'Ce site est aussi disponible en français.', link: 'Voir la version française →' };
    var t = el.querySelector('.lang-suggest-text');
    var l = el.querySelector('.lang-suggest-link');
    var c = el.querySelector('.lang-suggest-close');
    if (t) t.textContent = msg.text;
    if (l){ l.textContent = msg.link; l.href = alt.href; l.setAttribute('hreflang', navLang); l.setAttribute('lang', navLang); }
    el.hidden = false;
    if (c) c.addEventListener('click', function(){
      el.hidden = true;
      try { sessionStorage.setItem(SK, '1'); } catch(e){}
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ initLangGlobe(); initLangBanner(); });
  } else { initLangGlobe(); initLangBanner(); }
})();
</script>
"""

# HTML du bandeau (catégorie A + B) — à insérer juste après <body>
BANNER_HTML = """<!-- nomacast-lang-banner-v1 -->
<div id="lang-suggest" class="lang-suggest" hidden role="region" aria-label="Language suggestion"><span class="lang-suggest-text"></span><a class="lang-suggest-link" href="#"></a><button type="button" class="lang-suggest-close" aria-label="Close">&times;</button></div>
"""

# Icône SVG du globe
GLOBE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
CHEVRON_SVG = '<svg class="lang-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'

# ─────────────────────────────────────────────────────────────────────
# 2. UTILITAIRES
# ─────────────────────────────────────────────────────────────────────

def read_text(path):
    """Lit un fichier UTF-8 en preservant les CRLF."""
    with open(path, 'r', encoding='utf-8', newline='') as f:
        return f.read()

def write_text(path, content):
    """Écrit un fichier UTF-8 en preservant les CRLF."""
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)

def should_skip(path, content):
    """Décide si une page doit être ignorée."""
    name = os.path.basename(str(path))
    p = str(path).replace('\\', '/')
    # Pages admin / utilitaires
    if name.startswith('nmc-'): return True
    if name in ('404.html', 'merci.html', 'thank-you.html'): return True
    # Doublons FR dans /en/
    if '/en/' in p and re.search(r'<html\s+lang="fr"', content): return True
    return False

def detect_category(content):
    """A = nav classique, B = devis, C = landing produit."""
    if ('"lang-switch"' in content
        or '"nav-lang-mobile"' in content
        or '"mobile-lang-switch"' in content):
        return 'A'
    if '"devis-lang-switch"' in content: return 'B'
    if '"landing-lang-switch"' in content: return 'C'
    return None

def has_hreflang(content):
    """True si la page a des <link rel='alternate' hreflang=...> dans le head."""
    return bool(re.search(r'<link[^>]+hreflang=', content))

def detect_page_lang(content):
    """Renvoie 'fr' ou 'en' selon <html lang=...>."""
    m = re.search(r'<html\s+lang="([a-z-]+)"', content, re.IGNORECASE)
    if not m: return 'fr'
    return m.group(1).lower().split('-')[0]

def get_alt_link(content, target_lang):
    """Récupère le href du <link rel="alternate" hreflang="..."> pour la langue cible."""
    m = re.search(
        r'<link\s+(?:[^>]*\s+)?rel="alternate"\s+(?:[^>]*\s+)?hreflang="' + target_lang + r'"\s+(?:[^>]*\s+)?href="([^"]+)"',
        content, re.IGNORECASE
    )
    if not m:
        # Inversion possible des attributs
        m = re.search(
            r'<link\s+(?:[^>]*\s+)?hreflang="' + target_lang + r'"\s+(?:[^>]*\s+)?href="([^"]+)"',
            content, re.IGNORECASE
        )
    if not m:
        m = re.search(
            r'<link\s+href="([^"]+)"\s+hreflang="' + target_lang + r'"',
            content, re.IGNORECASE
        )
    return m.group(1) if m else None

# ─────────────────────────────────────────────────────────────────────
# 3. MODIFICATIONS
# ─────────────────────────────────────────────────────────────────────

def apply_css_block(content):
    """Injecte le bloc CSS unique avant la fermeture du premier </style>."""
    if 'nomacast-modernize-v1' in content: return content, False
    m = re.search(r'</style>', content)
    if not m: return content, False
    insert_pos = m.start()
    new_content = content[:insert_pos] + CSS_BLOCK + content[insert_pos:]
    return new_content, True

def apply_js_block(content):
    """Injecte le bloc JS avant </body>."""
    if 'nomacast-modernize-v1 : JS' in content: return content, False
    m = re.search(r'</body>', content)
    if not m: return content, False
    insert_pos = m.start()
    new_content = content[:insert_pos] + JS_BLOCK + content[insert_pos:]
    return new_content, True

def apply_banner_html(content):
    """Insère le HTML du bandeau juste après <body...>."""
    if 'id="lang-suggest"' in content: return content, False
    m = re.search(r'(<body[^>]*>)', content)
    if not m: return content, False
    end_pos = m.end()
    new_content = content[:end_pos] + '\n' + BANNER_HTML + content[end_pos:]
    return new_content, True

def build_globe_dropdown(page_lang, alt_link, is_mobile=False):
    """Construit le HTML du dropdown globe (FR + EN)."""
    label_fr_long = 'FR — Français'
    label_en_long = 'EN — English'
    aria_label = 'Choisir la langue' if page_lang == 'fr' else 'Choose language'
    current_label = page_lang.upper()
    if page_lang == 'fr':
        fr_attrs = 'class="active" aria-current="page"'
        fr_href = '""'
        en_attrs = f'hreflang="en" lang="en"'
        en_href = f'"{alt_link}"' if alt_link else '"#"'
    else:
        fr_attrs = f'hreflang="fr" lang="fr"'
        fr_href = f'"{alt_link}"' if alt_link else '"#"'
        en_attrs = 'class="active" aria-current="page"'
        en_href = '""'
    btn = (
        f'<button type="button" class="lang-globe" aria-haspopup="listbox" '
        f'aria-expanded="false" aria-label="{aria_label}">'
        f'{GLOBE_SVG}'
        f'<span class="lang-current">{current_label}</span>'
        f'{CHEVRON_SVG}'
        f'</button>'
    )
    dd = (
        f'<ul class="lang-dropdown" role="listbox" hidden>'
        f'<li role="option"><a href={fr_href} {fr_attrs}>{label_fr_long}</a></li>'
        f'<li role="option"><a href={en_href} {en_attrs}>{label_en_long}</a></li>'
        f'</ul>'
    )
    return btn + dd

def apply_lang_globe_categoryA(content, page_lang, alt_link):
    """Catégorie A : remplace lang-switch (desktop) + nav-lang-mobile (mobile).
    Tolérant à l'ordre des attributs et à la variante <ul class="lang-switch"> (pages satellites).
    """
    if 'data-marker="nomacast-lang-globe-v1"' in content:
        return content, False
    changed = False
    inner = build_globe_dropdown(page_lang, alt_link)
    aria_label = 'Choisir la langue' if page_lang == 'fr' else 'Choose language'

    # Variante 1 : <li ... class="lang-switch" ...>...</li>  (pages principales)
    li_pat = re.compile(r'<li[^>]*class="lang-switch"[^>]*>.*?</li>', re.DOTALL)
    if li_pat.search(content):
        new_li = (
            f'<li class="lang-switch" aria-label="{aria_label}" data-marker="nomacast-lang-globe-v1">'
            f'{inner}</li>'
        )
        content = li_pat.sub(new_li, content, count=1)
        changed = True
    else:
        # Variante 2 : <ul class="lang-switch">...</ul>  (pages satellites)
        ul_pat = re.compile(r'<ul[^>]*class="lang-switch"[^>]*>.*?</ul>', re.DOTALL)
        if ul_pat.search(content):
            new_ul = (
                f'<ul class="lang-switch" aria-label="{aria_label}" data-marker="nomacast-lang-globe-v1">'
                f'<li style="list-style:none;padding:0;margin:0;">{inner}</li>'
                f'</ul>'
            )
            content = ul_pat.sub(new_ul, content, count=1)
            changed = True

    # Mobile principal : <ul ... class="nav-lang-mobile" ...>...</ul>
    mobile_pat = re.compile(r'<ul[^>]*class="nav-lang-mobile"[^>]*>.*?</ul>', re.DOTALL)
    if mobile_pat.search(content):
        new_mobile = (
            f'<ul class="nav-lang-mobile" aria-label="{aria_label}" data-marker="nomacast-lang-globe-v1">'
            f'<li>{inner}</li>'
            f'</ul>'
        )
        content = mobile_pat.sub(new_mobile, content, count=1)
        changed = True

    # Mobile alternatif (overlay menu satellites) : <div ... class="mobile-lang-switch" ...>...</div>
    mobile_alt_pat = re.compile(r'<div[^>]*class="mobile-lang-switch"[^>]*>.*?</div>', re.DOTALL)
    if mobile_alt_pat.search(content):
        new_mobile_alt = (
            f'<div class="mobile-lang-switch" aria-label="{aria_label}" data-marker="nomacast-lang-globe-v1">'
            f'{inner}'
            f'</div>'
        )
        content = mobile_alt_pat.sub(new_mobile_alt, content, count=1)
        changed = True

    return content, changed

def apply_lang_globe_simple_ul(content, classname, page_lang, alt_link):
    """Catégories B (devis-lang-switch) et C (landing-lang-switch) : remplace <ul class=classname>."""
    if 'data-marker="nomacast-lang-globe-v1"' in content:
        return content, False
    pat = re.compile(r'<ul[^>]*class="' + re.escape(classname) + r'"[^>]*>.*?</ul>', re.DOTALL)
    inner = build_globe_dropdown(page_lang, alt_link)
    aria_label = 'Choisir la langue' if page_lang == 'fr' else 'Choose language'
    new_html = (
        f'<ul class="{classname}" aria-label="{aria_label}" data-marker="nomacast-lang-globe-v1">'
        f'<li style="list-style:none;padding:0;margin:0;">{inner}</li>'
        f'</ul>'
    )
    if pat.search(content):
        content = pat.sub(new_html, content, count=1)
        return content, True
    return content, False

def apply_lang_globe_categoryB(content, page_lang, alt_link):
    """Catégorie B : landing devis/quote."""
    return apply_lang_globe_simple_ul(content, 'devis-lang-switch', page_lang, alt_link)

def apply_lang_globe_categoryC(content, page_lang, alt_link):
    """Catégorie C : landing produit."""
    return apply_lang_globe_simple_ul(content, 'landing-lang-switch', page_lang, alt_link)

def _find_matching_close_li(content, after_pos):
    """Renvoie l'index de fin (après </li>) du <li> dont le contenu commence à after_pos.
    Gère l'imbrication. -1 si non trouvé."""
    pat = re.compile(r'<li\b[^>]*>|</li>', re.IGNORECASE)
    depth = 1
    for m in pat.finditer(content, after_pos):
        if m.group(0).startswith('</'):
            depth -= 1
            if depth == 0:
                return m.end()
        else:
            depth += 1
    return -1

def apply_lang_reorder(content):
    """Déplace le bloc <li class='lang-switch'> AVANT le <li> contenant <a class='nav-cta'>.

    Idempotent : check l'ordre avant de modifier (si déjà bon, on saute).
    Gère l'imbrication des <li> via comptage de balises.
    """
    open_pat = re.compile(r'<li[^>]*class="lang-switch"[^>]*>')
    open_match = open_pat.search(content)
    if not open_match:
        return content, False
    lang_end = _find_matching_close_li(content, open_match.end())
    if lang_end < 0:
        return content, False
    # Trouver le CTA (sans imbrication ici car nav-cta est juste <li><a>...</a></li>)
    cta_pat = re.compile(
        r'<li[^>]*>\s*<a[^>]*class="nav-cta"[^>]*>.*?</a>\s*</li>',
        re.DOTALL
    )
    cta_match = cta_pat.search(content)
    if not cta_match:
        return content, False
    # Déjà bien ordonné : skip
    if open_match.start() < cta_match.start():
        return content, False
    # Extraire le bloc lang complet (avec dropdown imbriqué)
    lang_block = content[open_match.start():lang_end]
    content_no_lang = content[:open_match.start()] + content[lang_end:]
    cta_match2 = cta_pat.search(content_no_lang)
    if not cta_match2:
        return content, False
    new_content = (
        content_no_lang[:cta_match2.start()]
        + lang_block
        + content_no_lang[cta_match2.start():]
    )
    return new_content, True

def _find_matching_close_div(content, after_pos):
    """Renvoie l'index de fin (après </div>) du <div> dont le contenu commence à after_pos.
    Gère l'imbrication. -1 si non trouvé."""
    pat = re.compile(r'<div\b[^>]*>|</div>', re.IGNORECASE)
    depth = 1
    for m in pat.finditer(content, after_pos):
        if m.group(0).startswith('</'):
            depth -= 1
            if depth == 0:
                return m.end()
        else:
            depth += 1
    return -1

def apply_footer_lang(content, page_lang, alt_link):
    """Insère un lien sobre 'English'/'Français' à la fin de footer-bottom-links.
    Robuste aux divs imbriqués via comptage de balises.
    """
    if 'class="footer-lang-link"' in content: return content, False
    open_pat = re.compile(r'<div[^>]*class="footer-bottom-links"[^>]*>')
    open_match = open_pat.search(content)
    if not open_match: return content, False
    div_end = _find_matching_close_div(content, open_match.end())
    if div_end < 0: return content, False
    # Construire un lien sobre, dans le style des autres liens footer-bottom-links
    other_lang = 'en' if page_lang == 'fr' else 'fr'
    label = 'English' if other_lang == 'en' else 'Français'
    href = alt_link if alt_link else '#'
    footer_lang_html = (
        f'<a href="{href}" hreflang="{other_lang}" lang="{other_lang}" '
        f'class="footer-lang-link" data-marker="nomacast-lang-footer-v2">'
        f'{GLOBE_SVG}{label}</a>'
    )
    insert_pos = div_end - len('</div>')
    new_content = content[:insert_pos] + footer_lang_html + content[insert_pos:]
    return new_content, True

def clean_residue(content):
    """Supprime les vestiges <a hreflang>EN/FR</a></span> d'anciens patches."""
    pat = re.compile(
        r'(</a>)<a\s+href="[^"]*"\s+hreflang="(?:en|fr)"\s+lang="(?:en|fr)">(?:EN|FR)</a></span>',
        re.IGNORECASE
    )
    new_content, n = pat.subn(r'\1', content)
    return new_content, n > 0

GLOBE_POLISH_CSS = """
/* nomacast-globe-polish-v1 — ajustements visuels globe header/footer/mobile */
.lang-globe { padding: 4px 8px !important; font-size: 14px !important; }
.lang-globe:not([aria-expanded="true"]) { border-color: transparent !important; background: transparent !important; }
.lang-globe > svg:first-of-type { width: 13px !important; height: 13px !important; opacity: .7; }
.lang-globe .lang-chevron { width: 10px !important; height: 10px !important; }
@media (max-width: 768px) {
  .nav-lang-mobile { margin-right: 0 !important; }
  .burger-btn { margin-left: 4px !important; }
}
.footer-lang-link { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: rgba(255,255,255,.35); text-decoration: none; transition: color .2s; }
.footer-lang-link:hover { color: #5A98D6; }
.footer-lang-link svg { width: 12px; height: 12px; opacity: .65; }
"""

FOOTER_MOBILE_V2_CSS = """
/* nomacast-footer-mobile-v2 — alignement gauche partout sur mobile + globe header aligné */
@media (max-width: 600px) {
  .site-footer { padding-bottom: 90px; }
  .footer-grid > * { text-align: left !important; }
  .footer-col-brand .footer-logo { justify-content: flex-start !important; }
  .footer-col-brand { text-align: left !important; }
  .footer-tagline, .footer-contact, .footer-zone, .footer-links a, .footer-col-title { text-align: left !important; }
}
.lang-switch .lang-globe { padding: 4px 0 !important; font-weight: 400 !important; }
.lang-switch .lang-globe > svg:first-of-type { margin-right: 2px; }
"""

INDEX_FOOTER_CSS = """
/* nomacast-footer-sync-v1 — CSS footer aligné sur index.html (pour tarifs/pricing) */
.site-footer{display:block;background:#0b1929;color:rgba(255,255,255,.6);padding:72px clamp(24px,5vw,64px) 32px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:14px;line-height:1.65}
.footer-grid{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:48px;padding-bottom:48px;border-bottom:1px solid rgba(255,255,255,.08)}
.footer-col-brand .footer-logo{font-family:'Outfit',system-ui,sans-serif;font-size:20px;font-weight:700;letter-spacing:-.03em;color:#fff;display:flex;align-items:center;gap:8px;margin-bottom:20px}
.footer-logo-dot{width:7px;height:7px;background:#5A98D6;border-radius:50%;display:inline-block}
.footer-tagline{font-size:13px;color:rgba(255,255,255,.55);line-height:1.6;margin:0 0 20px;font-weight:300}
.footer-contact{font-size:13px;color:rgba(255,255,255,.7);margin:0}
.footer-contact a{color:rgba(255,255,255,.7);text-decoration:none;transition:color .2s}
.footer-contact a:hover{color:#5A98D6}
.footer-col-title{font-family:'Outfit',system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff;margin:0 0 16px}
.footer-links{list-style:none;padding:0;margin:0}
.footer-links li{margin-bottom:8px}
.footer-links a{color:rgba(255,255,255,.55);text-decoration:none;font-size:13px;transition:color .2s}
.footer-links a:hover{color:#5A98D6}
.footer-zone{font-size:13px;color:rgba(255,255,255,.55);line-height:1.6;margin:0;font-weight:300}
.footer-bottom{max-width:1180px;margin:0 auto;padding-top:28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
.footer-credits{font-size:12px;color:rgba(255,255,255,.35)}
.footer-bottom-links{display:flex;flex-wrap:wrap;gap:12px 20px}
.footer-bottom-links a{font-size:12px;color:rgba(255,255,255,.35);text-decoration:none;transition:color .2s}
.footer-bottom-links a:hover{color:#5A98D6}
@media(max-width:900px){.footer-grid{grid-template-columns:1fr 1fr;gap:32px}}
@media(max-width:600px){.footer-grid{grid-template-columns:1fr;gap:32px;padding-bottom:32px}.footer-bottom{flex-direction:column;align-items:flex-start}}
"""

def apply_globe_polish(content):
    if 'nomacast-globe-polish-v1' in content: return content, False
    m = re.search(r'</style>', content)
    if not m: return content, False
    return content[:m.start()] + GLOBE_POLISH_CSS + content[m.start():], True

def apply_footer_mobile_v2(content):
    if 'nomacast-footer-mobile-v2' in content: return content, False
    m = re.search(r'</style>', content)
    if not m: return content, False
    return content[:m.start()] + FOOTER_MOBILE_V2_CSS + content[m.start():], True

def apply_footer_sync(path, content):
    """Pour tarifs.html et en/pricing.html : remplace le footer par celui d'index.html / en/index.html."""
    p_str = str(path).replace('\\', '/')
    if p_str.endswith('tarifs.html') and not p_str.startswith('en/'):
        src_path = 'index.html'
        alt_path = '/en/pricing.html'
    elif p_str.endswith('en/pricing.html'):
        src_path = 'en/index.html'
        alt_path = '/tarifs.html'
    else:
        return content, False
    if not os.path.exists(src_path):
        return content, False
    with open(src_path, 'r', encoding='utf-8', newline='') as f:
        src_content = f.read()
    src_footer_match = re.search(r'<footer class="site-footer">.*?</footer>', src_content, re.DOTALL)
    if not src_footer_match:
        return content, False
    src_footer = src_footer_match.group(0)
    # Adapter le href du footer-lang-link
    src_footer = re.sub(
        r'(<a\s+href=")[^"]+(" hreflang="(?:en|fr)" lang="(?:en|fr)" class="footer-lang-link")',
        r'\1' + alt_path + r'\2',
        src_footer
    )
    # Injecter aussi le CSS footer si absent
    if 'nomacast-footer-sync-v1' not in content:
        m = re.search(r'</style>', content)
        if m:
            content = content[:m.start()] + INDEX_FOOTER_CSS + content[m.start():]
    # Remplacer le footer existant (le pattern match le 1er <footer class="site-footer">)
    target_pat = re.compile(r'<footer class="site-footer">.*?</footer>', re.DOTALL)
    if not target_pat.search(content):
        return content, False
    # Si le footer existant est DÉJÀ ce nouveau format, skip
    target_match = target_pat.search(content)
    if 'class="footer-grid"' in target_match.group(0) and 'class="footer-col-brand"' in target_match.group(0):
        # Déjà synchronisé
        if alt_path in target_match.group(0):
            return content, False
    content = target_pat.sub(src_footer, content, count=1)
    return content, True

# ─────────────────────────────────────────────────────────────────────
# 4. PROCESSING D'UN FICHIER
# ─────────────────────────────────────────────────────────────────────

def process_file(path):
    """Applique les modifs sur un fichier. Retourne (status, details)."""
    try:
        content = read_text(path)
    except Exception as e:
        return ('error', f'read error: {e}')
    if should_skip(path, content):
        return ('skip', 'page hors périmètre')
    category = detect_category(content)
    page_has_hreflang = has_hreflang(content)
    if category is None and not page_has_hreflang:
        return ('skip', 'pas de sélecteur ni hreflang')
    page_lang = detect_page_lang(content)
    other_lang = 'en' if page_lang == 'fr' else 'fr'
    alt_link = get_alt_link(content, other_lang)
    original = content
    actions = []
    # MOD 4 : CSS global
    content, c = apply_css_block(content)
    if c: actions.append('css')
    # MOD 1+2 : JS global
    content, c = apply_js_block(content)
    if c: actions.append('js')
    # MOD 2 : Bandeau HTML (sur toutes les pages avec hreflang)
    content, c = apply_banner_html(content)
    if c: actions.append('banner')
    # MOD 1 : Sélecteur globe (selon catégorie)
    if category == 'A':
        content, c = apply_lang_globe_categoryA(content, page_lang, alt_link)
    elif category == 'B':
        content, c = apply_lang_globe_categoryB(content, page_lang, alt_link)
    elif category == 'C':
        content, c = apply_lang_globe_categoryC(content, page_lang, alt_link)
    else:
        c = False
    if c: actions.append('globe')
    # MOD 1bis : Réordonnement (catégorie A uniquement)
    if category == 'A':
        content, c = apply_lang_reorder(content)
        if c: actions.append('reorder')
    # MOD 3 : Footer langue (catégorie A uniquement, et si footer-bottom-links présent)
    if category == 'A':
        content, c = apply_footer_lang(content, page_lang, alt_link)
        if c: actions.append('footer')
    # MOD 3bis : Footer sync (uniquement pour tarifs.html et en/pricing.html)
    content, c = apply_footer_sync(path, content)
    if c: actions.append('footer-sync')
    # MOD 5 : Nettoyage des vestiges <a>EN</a></span> d'anciens patches
    content, c = clean_residue(content)
    if c: actions.append('clean')
    # MOD 6 : Polish visuel du globe header + footer-lang-link
    content, c = apply_globe_polish(content)
    if c: actions.append('polish')
    # MOD 7 : Footer mobile aligné gauche + globe header padding 0
    content, c = apply_footer_mobile_v2(content)
    if c: actions.append('mobile-v2')
    if content == original:
        cat_label = f'cat.{category}' if category else 'no-cat'
        return ('unchanged', f'{cat_label}, déjà modernisé')
    write_text(path, content)
    cat_label = f'cat.{category}' if category else 'no-cat'
    return ('modified', f'{cat_label} · ' + '+'.join(actions))

# ─────────────────────────────────────────────────────────────────────
# 5. MAIN
# ─────────────────────────────────────────────────────────────────────

def main():
    html_files = sorted([p for p in ROOT.rglob('*.html') if '.git' not in p.parts])
    if not html_files:
        print('Aucun fichier HTML trouvé. Lancer le script à la racine du repo.')
        return 1
    stats = {'modified': [], 'unchanged': [], 'skip': [], 'error': []}
    for path in html_files:
        status, details = process_file(path)
        stats[status].append((str(path), details))
        icon = {'modified':'✅', 'unchanged':'⏭ ', 'skip':'➖', 'error':'❌'}[status]
        print(f'  {icon} {path}  —  {details}')
    print()
    print('═' * 70)
    print(f'  ✅ Modifiées   : {len(stats["modified"]):3d}')
    print(f'  ⏭  Déjà à jour : {len(stats["unchanged"]):3d}')
    print(f'  ➖ Ignorées    : {len(stats["skip"]):3d}')
    print(f'  ❌ Erreurs     : {len(stats["error"]):3d}')
    print('═' * 70)
    if stats['error']:
        print('\nERREURS :')
        for p, d in stats['error']:
            print(f'  - {p} : {d}')
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
