#!/usr/bin/env python3
"""
nomacast-footer-lang-match-header.py
=====================================

Aligne le sélecteur de langue du footer sur celui du header :
- Supprime l'ancien <span class="footer-lang"> (format icône + FR · EN)
- Supprime le nouveau <a class="footer-lang-link"> (format "English")
- Injecte un dropdown globe identique au header (🌐 FR ▾ + menu FR/EN)
- Injecte un CSS qui adapte le dropdown au fond foncé du footer + ouverture vers le haut

USAGE
-----
À lancer à la racine du repo nomacast.fr :

    python3 nomacast-footer-lang-match-header.py

Stdlib uniquement. Idempotent. Préserve CRLF.

Le JS existant (initLangGlobe) gère automatiquement tout `.lang-globe` du DOM,
donc le dropdown footer fonctionnera sans modif supplémentaire du script principal.
"""

import os
import re
import sys
from pathlib import Path

# ─────────────────────────────────────────────────────────────────────
# Constantes
# ─────────────────────────────────────────────────────────────────────

GLOBE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
CHEVRON_SVG = '<svg class="lang-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'

CSS_BLOCK = """
/* nomacast-footer-lang-v3 — dropdown globe dans le footer, identique au header */
.footer-lang-switch { position: relative; display: inline-flex; align-items: center; margin-left: auto; }
.footer-lang-switch .lang-globe { color: rgba(255,255,255,.55); font-size: 12px; padding: 4px 0; font-weight: 400; }
.footer-lang-switch .lang-globe:hover { color: #fff; background: transparent; }
.footer-lang-switch .lang-globe[aria-expanded="true"] { color: #fff; background: transparent; border-color: transparent; }
.footer-lang-switch .lang-globe > svg:first-of-type { width: 12px; height: 12px; opacity: .65; }
.footer-lang-switch .lang-globe .lang-chevron { width: 10px; height: 10px; }
.footer-lang-switch .lang-dropdown { top: auto; bottom: calc(100% + 6px); right: 0; }
@media (max-width: 600px) {
  .footer-lang-switch { margin-left: 0 !important; }
}
"""

# ─────────────────────────────────────────────────────────────────────
# Utilitaires HTML
# ─────────────────────────────────────────────────────────────────────

def find_matching_close_span(content, after_pos):
    """Renvoie l'index de fin (après </span>) du span ouvert avant after_pos.
    Gère l'imbrication via comptage."""
    pat = re.compile(r'<span\b[^>]*>|</span>', re.IGNORECASE)
    depth = 1
    for m in pat.finditer(content, after_pos):
        if m.group(0).startswith('</'):
            depth -= 1
            if depth == 0:
                return m.end()
        else:
            depth += 1
    return -1

def find_matching_close_div(content, after_pos):
    """Renvoie l'index de fin (après </div>) du div ouvert avant after_pos."""
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

def detect_page_lang(content):
    m = re.search(r'<html\s+lang="([a-z-]+)"', content, re.IGNORECASE)
    if not m: return 'fr'
    return m.group(1).lower().split('-')[0]

def get_alt_link(content, target_lang):
    """Récupère le href du <link rel='alternate' hreflang='...'> pour la langue cible.
    Tolère plusieurs ordres d'attributs."""
    patterns = [
        r'<link\s+(?:[^>]*\s+)?rel="alternate"\s+(?:[^>]*\s+)?hreflang="' + target_lang + r'"\s+(?:[^>]*\s+)?href="([^"]+)"',
        r'<link\s+(?:[^>]*\s+)?hreflang="' + target_lang + r'"\s+(?:[^>]*\s+)?href="([^"]+)"',
        r'<link\s+href="([^"]+)"\s+(?:[^>]*\s+)?hreflang="' + target_lang + r'"',
    ]
    for p in patterns:
        m = re.search(p, content, re.IGNORECASE)
        if m: return m.group(1)
    return None

# ─────────────────────────────────────────────────────────────────────
# Construction du dropdown footer
# ─────────────────────────────────────────────────────────────────────

def build_footer_lang_html(page_lang, alt_link):
    """Construit le bloc <div class="footer-lang-switch"> identique au header."""
    aria_label = 'Choisir la langue' if page_lang == 'fr' else 'Choose language'
    current_label = page_lang.upper()
    if page_lang == 'fr':
        fr_link = '<li role="option"><a href="" class="active" aria-current="page">FR — Français</a></li>'
        en_href = alt_link if alt_link else '/en/'
        en_link = f'<li role="option"><a href="{en_href}" hreflang="en" lang="en">EN — English</a></li>'
    else:
        fr_href = alt_link if alt_link else '/'
        fr_link = f'<li role="option"><a href="{fr_href}" hreflang="fr" lang="fr">FR — Français</a></li>'
        en_link = '<li role="option"><a href="" class="active" aria-current="page">EN — English</a></li>'
    return (
        f'<div class="footer-lang-switch" data-marker="nomacast-lang-footer-v3">'
        f'<button type="button" class="lang-globe" aria-haspopup="listbox" '
        f'aria-expanded="false" aria-label="{aria_label}">'
        f'{GLOBE_SVG}'
        f'<span class="lang-current">{current_label}</span>'
        f'{CHEVRON_SVG}'
        f'</button>'
        f'<ul class="lang-dropdown" role="listbox" hidden>{fr_link}{en_link}</ul>'
        f'</div>'
    )

# ─────────────────────────────────────────────────────────────────────
# Nettoyage et injection
# ─────────────────────────────────────────────────────────────────────

def remove_old_footer_lang_span(content):
    """Supprime tous les <span class="footer-lang">...</span> (ancien format)."""
    pat = re.compile(r'<span[^>]*class="footer-lang"[^>]*>')
    count = 0
    while True:
        m = pat.search(content)
        if not m: break
        end = find_matching_close_span(content, m.end())
        if end < 0: break
        content = content[:m.start()] + content[end:]
        count += 1
    return content, count

def remove_old_footer_lang_link(content):
    """Supprime tous les <a class="footer-lang-link">...</a> (format sobre intermédiaire)."""
    pat = re.compile(r'<a[^>]*class="footer-lang-link"[^>]*>.*?</a>', re.DOTALL)
    new_content, n = pat.subn('', content)
    return new_content, n

def inject_css(content):
    """Injecte le bloc CSS du footer-lang-switch avant </style>."""
    if 'nomacast-footer-lang-v3' in content:
        return content, False
    m = re.search(r'</style>', content)
    if not m: return content, False
    return content[:m.start()] + CSS_BLOCK + content[m.start():], True

def inject_footer_dropdown(content, page_lang, alt_link):
    """Insère le nouveau dropdown footer-lang-switch juste avant </div> de footer-bottom-links."""
    if 'data-marker="nomacast-lang-footer-v3"' in content:
        return content, False
    open_pat = re.compile(r'<div[^>]*class="footer-bottom-links"[^>]*>')
    open_match = open_pat.search(content)
    if not open_match: return content, False
    div_end = find_matching_close_div(content, open_match.end())
    if div_end < 0: return content, False
    dropdown_html = build_footer_lang_html(page_lang, alt_link)
    insert_pos = div_end - len('</div>')
    return content[:insert_pos] + dropdown_html + content[insert_pos:], True

# ─────────────────────────────────────────────────────────────────────
# Processing
# ─────────────────────────────────────────────────────────────────────

def process_file(path):
    with open(path, 'r', encoding='utf-8', newline='') as f:
        content = f.read()
    original = content
    actions = []
    # Détection langue + lien alt
    page_lang = detect_page_lang(content)
    other_lang = 'en' if page_lang == 'fr' else 'fr'
    alt_link = get_alt_link(content, other_lang)
    # 1. Nettoyage des anciens formats
    content, n1 = remove_old_footer_lang_span(content)
    if n1 > 0: actions.append(f'-span({n1})')
    content, n2 = remove_old_footer_lang_link(content)
    if n2 > 0: actions.append(f'-link({n2})')
    # 2. Injection du nouveau dropdown
    content, c = inject_footer_dropdown(content, page_lang, alt_link)
    if c: actions.append('+dropdown')
    # 3. Injection du CSS
    content, c = inject_css(content)
    if c: actions.append('+css')
    if content == original:
        return 'unchanged', ''
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    return 'modified', ' '.join(actions)

def main():
    html_files = sorted([p for p in Path('.').rglob('*.html') if '.git' not in p.parts])
    if not html_files:
        print('Aucun fichier HTML trouvé. Lancer à la racine du repo.')
        return 1
    stats = {'modified': 0, 'unchanged': 0}
    for path in html_files:
        status, details = process_file(path)
        if status == 'modified':
            print(f'  ✅ {path} — {details}')
            stats['modified'] += 1
        else:
            stats['unchanged'] += 1
    print()
    print('═' * 60)
    print(f'  ✅ Modifiées   : {stats["modified"]}')
    print(f'  ⏭  Inchangées  : {stats["unchanged"]}')
    print('═' * 60)
    return 0

if __name__ == '__main__':
    sys.exit(main())
