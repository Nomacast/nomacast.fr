#!/usr/bin/env python3
"""
Nomacast — Déploiement bulle CTA flottante v2
==============================================

Remplace l'ancienne bulle `.float-call` (lien tel:) par la nouvelle
("Devis sous 24h" / "Quote in 24h" pointant vers #contact).

Met également à jour l'IntersectionObserver pour masquer la bulle
quand #contact OU le footer est visible (au lieu du footer seul).

Caractéristiques :
- Idempotent : skip les fichiers contenant déjà le marker `nomacast-cta-bubble-v2`
- Skip list : tarifs.html, en/pricing.html (configurateurs, le form est déjà la conversion)
- Détecte FR vs EN via le chemin (présence du dossier `en` dans le path)
- Sortie en mode dry-run par défaut → utiliser --apply pour écrire les fichiers

Usage :
    python cta_bubble_v2.py [racine_du_repo] [--apply]

Exemples :
    python cta_bubble_v2.py .                 # dry-run sur le dossier courant
    python cta_bubble_v2.py /chemin/repo --apply   # applique les modifs
"""

import sys
import re
import argparse
from pathlib import Path

MARKER = "nomacast-cta-bubble-v2"
SKIP_FILES = {"tarifs.html", "pricing.html"}

# ─── Regex de détection ─────────────────────────────────────────────

# Ancienne bulle : <a ... class="float-call" ... href="tel:..."> ... </a>
OLD_BUBBLE_RE = re.compile(
    r'<a[^>]*class="float-call"[^>]*>.*?</a>',
    re.DOTALL | re.IGNORECASE,
)

# Ancien IntersectionObserver : script qui contient `document.querySelector('.float-call')`
# et `io.observe(footer)`. Match du <script> wrap complet, comment optionnel.
OLD_OBSERVER_RE = re.compile(
    r"<script>\s*"
    r"(?:/\*(?:[^*]|\*(?!/))*\*/\s*)?"                                 # 1 commentaire propre, pas de */ interne
    r"\(function\(\)\s*\{\s*"
    r"var\s+btn\s*=\s*document\.querySelector\(['\"]\.float-call['\"]\)"
    r"(?:(?!</script>)[\s\S])*?"                                       # corps de l'IIFE, jamais ne traverse </script>
    r"io\.observe\(footer\);\s*"
    r"\}\)\(\);\s*"
    r"</script>",
    re.MULTILINE,
)

# ─── Nouveaux blocs ─────────────────────────────────────────────────

NEW_BUBBLE_FR = (
    '<!-- nomacast-cta-bubble-v2 : bulle CTA flottante mobile → #contact -->\n'
    '<a aria-label="Obtenir un devis sous 24 heures" class="float-call" href="#contact">\n'
    '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><path d="M22 6l-10 7L2 6"></path></svg>\n'
    '  Devis sous 24h\n'
    '</a>'
)

NEW_BUBBLE_EN = (
    '<!-- nomacast-cta-bubble-v2 : floating CTA bubble mobile → #contact -->\n'
    '<a aria-label="Get a quote within 24 hours" class="float-call" href="#contact">\n'
    '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewbox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><path d="M22 6l-10 7L2 6"></path></svg>\n'
    '  Quote in 24h\n'
    '</a>'
)

NEW_OBSERVER = (
    '<script>\n'
    '/* nomacast-cta-bubble-v2 : masque .float-call quand #contact OU footer est visible */\n'
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
    '</script>'
)

# ─── Logique ────────────────────────────────────────────────────────

def is_en_file(path: Path, root: Path) -> bool:
    """Vrai si le fichier est sous un dossier 'en' relatif à la racine."""
    rel = path.relative_to(root)
    return 'en' in rel.parts


def process_file(path: Path, root: Path, apply: bool) -> tuple[str, str]:
    """Returns (status, detail). status ∈ {'modified','skip-list','skip-marker','skip-nobubble','noop-observer'}"""
    if path.name in SKIP_FILES:
        return 'skip-list', 'fichier dans skip list (configurateur)'

    content = path.read_text(encoding='utf-8')

    if MARKER in content:
        return 'skip-marker', 'marker déjà présent (déjà à jour)'

    new_bubble = NEW_BUBBLE_EN if is_en_file(path, root) else NEW_BUBBLE_FR
    lang = 'EN' if new_bubble is NEW_BUBBLE_EN else 'FR'

    new_content, bubble_count = OLD_BUBBLE_RE.subn(new_bubble, content, count=1)
    if bubble_count == 0:
        return 'skip-nobubble', 'pas de bulle .float-call détectée'

    new_content, observer_count = OLD_OBSERVER_RE.subn(NEW_OBSERVER, new_content, count=1)
    obs_note = f"+ observer ({lang})" if observer_count > 0 else f"observer NON détecté ({lang}, à patcher manuellement)"

    if apply:
        path.write_text(new_content, encoding='utf-8')

    return 'modified', obs_note


def main():
    parser = argparse.ArgumentParser(description='Déploie la bulle CTA v2 sur les .html du repo Nomacast')
    parser.add_argument('root', nargs='?', default='.', help='Racine du repo (défaut: .)')
    parser.add_argument('--apply', action='store_true', help='Écrit les fichiers (sans cette option : dry-run)')
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"Erreur : {root} n'est pas un dossier", file=sys.stderr)
        sys.exit(1)

    mode = 'APPLY' if args.apply else 'DRY-RUN'
    print(f"[{mode}] Scan : {root}\n")

    counts = {'modified': 0, 'skip-list': 0, 'skip-marker': 0, 'skip-nobubble': 0}
    obs_warnings = []

    for html in sorted(root.rglob('*.html')):
        rel = html.relative_to(root)
        status, detail = process_file(html, root, apply=args.apply)
        counts[status] = counts.get(status, 0) + 1

        mark = '✓' if status == 'modified' else '·'
        print(f"  {mark} {rel}  — {detail}")

        if status == 'modified' and 'NON détecté' in detail:
            obs_warnings.append(str(rel))

    print()
    print(f"Total :")
    print(f"  • {counts['modified']} fichier(s) modifié(s)")
    print(f"  • {counts['skip-list']} skip (configurateur)")
    print(f"  • {counts['skip-marker']} skip (déjà à jour)")
    print(f"  • {counts['skip-nobubble']} skip (pas de bulle)")

    if obs_warnings:
        print()
        print(f"⚠  {len(obs_warnings)} fichier(s) avec bulle patchée mais observer NON détecté :")
        for w in obs_warnings:
            print(f"     - {w}")
        print("   → Vérifier manuellement le bloc <script> IntersectionObserver dans ces fichiers")

    if not args.apply:
        print()
        print("Mode DRY-RUN — aucun fichier modifié. Relancer avec --apply pour écrire.")


if __name__ == '__main__':
    main()
