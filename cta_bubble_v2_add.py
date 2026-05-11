#!/usr/bin/env python3
"""
Nomacast — Ajout bulle CTA flottante sur pages sans bulle
==========================================================

Insère la bulle `.float-call` + l'IntersectionObserver dans les pages
de contenu qui n'en avaient jamais eu :

  FR : 7 cas-client-*, cas-clients.html, prestations.html,
       agences-partenaires.html, faq.html, blog.html + 1 article
  EN : 7 case-*,      case-studies.html,    services.html,
       partner-agencies.html,       faq.html, blog.html + 1 article

Total : 13 FR + 13 EN = 26 pages.

Pages volontairement IGNORÉES (non touchées) :
  - tarifs.html / en/pricing.html (configurateurs)
  - devis-*.html / en/quote-*.html (landings devis = form = conversion)
  - 404, mentions-legales, politique-de-confidentialite, plan-du-site,
    merci (FR) + équivalents EN (legal-notice, privacy-policy, sitemap,
    thank-you)
  - nmc-7k9q3p2x.html (filename obscur, à clarifier)
  - Les 24 pages déjà patchées par cta_bubble_v2.py (marker v2 présent →
    skip automatique)

Caractéristiques :
  - Whitelist explicite (TARGETS) → aucune page hors-cible touchée
  - Idempotent : skip si marker `nomacast-cta-bubble-add-v1` présent
  - Détection FR/EN via chemin (dossier `en/`)
  - Détection `id="contact"` dans la page :
      → présent  : href="#contact"
      → absent   : href="index.html#contact" (relatif, résout vers
                   en/index.html#contact pour les pages EN)
  - Insère bulle + observer juste avant </body> (position: fixed →
    l'emplacement DOM n'a pas d'impact visuel)
  - WARN si `.float-call` n'apparaît nulle part dans le fichier source
    (signal que le CSS commun pourrait manquer)

Usage :
    python cta_bubble_v2_add.py [racine_du_repo] [--apply]
"""

import sys
import re
import argparse
from pathlib import Path

MARKER = "nomacast-cta-bubble-add-v1"

# ─── Whitelist : pages où on AJOUTE la bulle ───────────────────────
TARGETS = [
    # FR
    "cas-client-comedie-francaise.html",
    "cas-client-digital-benchmark-berlin.html",
    "cas-client-figma-conference.html",
    "cas-client-gl-events.html",
    "cas-client-johnson-johnson.html",
    "cas-client-louvre-lahorde.html",
    "cas-client-morning.html",
    "cas-clients.html",
    "prestations.html",
    "agences-partenaires.html",
    "faq.html",
    "blog.html",
    "blog-ag-mixte-presentiel-distanciel.html",
    # EN
    "en/case-comedie-francaise.html",
    "en/case-digital-benchmark-berlin.html",
    "en/case-figma-conference.html",
    "en/case-gl-events.html",
    "en/case-johnson-johnson.html",
    "en/case-louvre-lahorde.html",
    "en/case-morning.html",
    "en/case-studies.html",
    "en/services.html",
    "en/partner-agencies.html",
    "en/faq.html",
    "en/blog.html",
    "en/blog-hybrid-agm-in-person-remote.html",
]

# ─── Blocs HTML/JS à injecter ──────────────────────────────────────

def build_bubble(is_en: bool, contact_href: str) -> str:
    if is_en:
        return (
            '<!-- nomacast-cta-bubble-add-v1 : floating CTA bubble mobile -->\n'
            f'<a aria-label="Get a quote within 24 hours" class="float-call" href="{contact_href}">\n'
            '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><path d="M22 6l-10 7L2 6"></path></svg>\n'
            '  Quote in 24h\n'
            '</a>\n'
        )
    return (
        '<!-- nomacast-cta-bubble-add-v1 : bulle CTA flottante mobile -->\n'
        f'<a aria-label="Obtenir un devis sous 24 heures" class="float-call" href="{contact_href}">\n'
        '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><path d="M22 6l-10 7L2 6"></path></svg>\n'
        '  Devis sous 24h\n'
        '</a>\n'
    )


OBSERVER_JS = (
    '<script>\n'
    '/* nomacast-cta-bubble-add-v1 : masque .float-call quand #contact OU footer est visible */\n'
    '(function(){\n'
    '  var btn = document.querySelector(\'.float-call\');\n'
    '  if (!btn || !(\'IntersectionObserver\' in window)) return;\n'
    '  var targets = [\n'
    '    document.querySelector(\'#contact\'),\n'
    '    document.querySelector(\'.site-footer\') || document.querySelector(\'footer\')\n'
    '  ].filter(Boolean);\n'
    '  if (!targets.length) return;\n'
    '  var visible = new WeakSet();\n'
    '  var io = new IntersectionObserver(function(entries){\n'
    '    entries.forEach(function(e){\n'
    '      if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target);\n'
    '    });\n'
    '    var anyVisible = targets.some(function(t){ return visible.has(t); });\n'
    '    btn.style.transition = \'opacity .25s, transform .25s\';\n'
    '    if (anyVisible) {\n'
    '      btn.style.opacity = \'0\';\n'
    '      btn.style.transform = \'translateY(20px)\';\n'
    '      btn.style.pointerEvents = \'none\';\n'
    '    } else {\n'
    '      btn.style.opacity = \'\';\n'
    '      btn.style.transform = \'\';\n'
    '      btn.style.pointerEvents = \'\';\n'
    '    }\n'
    '  }, {threshold: 0.01, rootMargin: \'0px\'});\n'
    '  targets.forEach(function(t){ io.observe(t); });\n'
    '})();\n'
    '</script>\n'
)

# ─── Détections ────────────────────────────────────────────────────

CONTACT_ID_RE = re.compile(r'\bid\s*=\s*["\']contact["\']', re.IGNORECASE)
FLOAT_CALL_RE = re.compile(r'\.float-call\b')
BODY_CLOSE_RE = re.compile(r'</body\s*>', re.IGNORECASE)


def is_en_file(rel: Path) -> bool:
    return len(rel.parts) > 0 and rel.parts[0] == 'en'


def process_file(repo_root: Path, rel_str: str, apply: bool) -> tuple[str, str]:
    # Normalise les séparateurs (Windows ↔ POSIX)
    rel = Path(rel_str.replace('\\', '/'))
    path = repo_root / rel

    if not path.exists():
        return 'not-found', "fichier introuvable dans le repo"

    content = path.read_text(encoding='utf-8')

    if MARKER in content:
        return 'skip-marker', 'marker déjà présent (déjà ajouté)'

    # Détection contexte
    is_en = is_en_file(rel)
    lang = 'EN' if is_en else 'FR'
    has_contact_id = bool(CONTACT_ID_RE.search(content))
    has_float_css_ref = bool(FLOAT_CALL_RE.search(content))
    contact_href = '#contact' if has_contact_id else 'index.html#contact'

    bubble = build_bubble(is_en, contact_href)
    insertion = bubble + OBSERVER_JS

    new_content, count = BODY_CLOSE_RE.subn(insertion + '</body>', content, count=1)
    if count == 0:
        return 'no-body', "</body> introuvable — fichier non modifié"

    if apply:
        path.write_text(new_content, encoding='utf-8')

    notes = [lang, f'href={contact_href}']
    if not has_float_css_ref:
        notes.append('⚠ CSS .float-call non référencée dans le fichier')
    return 'added', ' | '.join(notes)


def main():
    parser = argparse.ArgumentParser(
        description="Ajoute la bulle CTA flottante sur les pages Nomacast qui n'en ont pas"
    )
    parser.add_argument('root', nargs='?', default='.', help='Racine du repo (défaut: .)')
    parser.add_argument('--apply', action='store_true', help='Écrit les fichiers (sinon dry-run)')
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"Erreur : {root} n'est pas un dossier", file=sys.stderr)
        sys.exit(1)

    mode = 'APPLY' if args.apply else 'DRY-RUN'
    print(f"[{mode}] Scan : {root}")
    print(f"        Cibles : {len(TARGETS)} fichiers en whitelist\n")

    counts = {}
    css_warnings = []

    for rel_str in sorted(TARGETS):
        status, detail = process_file(root, rel_str, apply=args.apply)
        counts[status] = counts.get(status, 0) + 1
        mark = '✓' if status == 'added' else '·'
        print(f"  {mark} {rel_str}  — {detail}")
        if '⚠' in detail:
            css_warnings.append(rel_str)

    print()
    print("Total :")
    print(f"  • {counts.get('added', 0)} fichier(s) avec bulle ajoutée")
    print(f"  • {counts.get('skip-marker', 0)} skip (déjà ajoutée)")
    print(f"  • {counts.get('not-found', 0)} skip (fichier non trouvé)")
    print(f"  • {counts.get('no-body', 0)} skip (</body> introuvable)")

    if css_warnings:
        print()
        print(f"⚠  {len(css_warnings)} fichier(s) ne référencent pas `.float-call` :")
        for w in css_warnings:
            print(f"     - {w}")
        print("   → La bulle est insérée mais SERA INVISIBLE si le CSS `.float-call`")
        print("     n'est pas chargé via la feuille de style commune.")
        print("     Action : ouvrir une de ces pages, vérifier s'il y a un <link rel=\"stylesheet\">")
        print("     vers un fichier CSS partagé ou un <style> commun avec les autres pages.")
        print("     Si le CSS est vraiment absent, soit l'ajouter à la feuille globale,")
        print("     soit me redemander un patch avec injection de <style> local.")

    if not args.apply:
        print()
        print("Mode DRY-RUN — aucun fichier modifié. Relancer avec --apply pour écrire.")


if __name__ == '__main__':
    main()
