#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix_floatcall.py — Nomacast.fr

Corrige le bug "zone blanche en fin de scroll mobile" causé par .float-call sans
règle CSS de base (display:none + position:fixed). Sur les pages buggées,
le <a class="float-call"> est rendu en display:inline avec un <svg> sans
width/height qui prend 390×390px, créant ~424px de blanc après le footer.

Détection automatique. Idempotent (marqueur : nomacast-floatcall-fix-v1).
Aucune dépendance, stdlib uniquement. Exécuter à la racine du repo.

Usage :
    python fix_floatcall.py            # applique le fix
    python fix_floatcall.py --dry-run  # liste seulement, sans modifier
"""

import os
import re
import sys
from pathlib import Path

# ─── Marqueur idempotent ──────────────────────────────────────────────────────
FIX_MARKER = "nomacast-floatcall-fix-v1"

# ─── CSS à injecter ───────────────────────────────────────────────────────────
# Reproduit la définition standard utilisée sur les pages saines (captation-*,
# emission-live-corporate, etc.). Affichage uniquement < 768px (mobile).
FIX_CSS = (
    "/* " + FIX_MARKER + " : fix zone blanche mobile "
    "(float-call sans position:fixed laisse un SVG inline ~390px en bas de page) */\n"
    ".float-call{display:none;position:fixed;bottom:24px;right:20px;z-index:99;"
    "background:var(--cyan);color:#fff;border-radius:100px;padding:14px 20px;"
    "font-family:var(--font-body);font-size:15px;font-weight:600;text-decoration:none;"
    "box-shadow:0 4px 24px rgba(14,165,233,.45);align-items:center;gap:8px;"
    "transition:transform .2s}\n"
    ".float-call svg{width:18px;height:18px;flex-shrink:0}\n"
    "@media(max-width:768px){.float-call{display:flex}}\n"
)

# ─── Ancre d'insertion (règle présente sur les 13 pages buggées) ──────────────
# On insère le fix juste AVANT cette règle, dans le même bloc <style>.
ANCHOR_RE = re.compile(
    r'(body\.menu-open\s*\.float-call\s*\{[^}]*\})'
)

# ─── Détection : la page a-t-elle déjà position:fixed sur .float-call ? ───────
HAS_FIXED_RE = re.compile(
    r'\.float-call\s*\{[^}]*position\s*:\s*fixed', re.IGNORECASE
)

# ─── Détection DOM : le <a class="float-call"> est-il présent ? ──────────────
HAS_DOM_RE = re.compile(r'class\s*=\s*["\']float-call["\']')


def classify(html: str) -> str:
    """Retourne le statut d'un fichier : 'fix', 'skip:*' ou 'err:*'."""
    if not HAS_DOM_RE.search(html):
        return "skip:no-float-call-in-dom"
    if FIX_MARKER in html:
        return "skip:already-patched"
    if HAS_FIXED_RE.search(html):
        return "skip:position-fixed-already-defined"
    if not ANCHOR_RE.search(html):
        return "err:anchor-not-found"
    return "fix"


def apply_fix(html: str) -> str:
    """Insère le CSS de fix juste avant l'ancre."""
    return ANCHOR_RE.sub(FIX_CSS + r"\1", html, count=1)


def main():
    dry = "--dry-run" in sys.argv

    root = Path(".").resolve()
    print(f"📂 Racine : {root}")
    print(f"🔧 Mode   : {'DRY-RUN (aucune écriture)' if dry else 'APPLY'}")
    print()

    # Tous les .html à la racine (pas en/, pas dans des sous-dossiers techniques)
    html_files = sorted(p for p in root.glob("*.html"))

    patched = []
    skipped = []
    errors = []

    for path in html_files:
        try:
            html = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            html = path.read_text(encoding="latin-1")

        status = classify(html)

        if status == "fix":
            new_html = apply_fix(html)
            if new_html == html:
                errors.append((path.name, "no-substitution-applied"))
                print(f"❌ {path.name} : substitution échouée")
                continue
            if not dry:
                path.write_text(new_html, encoding="utf-8")
            patched.append(path.name)
            print(f"✅ {path.name} : fix {'(simulé)' if dry else 'appliqué'}")
        elif status.startswith("skip"):
            skipped.append((path.name, status.split(":", 1)[1]))
        else:  # err
            errors.append((path.name, status.split(":", 1)[1]))
            print(f"❌ {path.name} : {status}")

    # ─── Résumé ──────────────────────────────────────────────────────────────
    print()
    print("─" * 60)
    print(f"✅ Patchées : {len(patched)}")
    print(f"⏭  Ignorées : {len(skipped)}")
    print(f"❌ Erreurs  : {len(errors)}")

    if skipped:
        print("\n⏭  Détail ignorées :")
        # Regrouper par raison pour la lisibilité
        by_reason = {}
        for name, reason in skipped:
            by_reason.setdefault(reason, []).append(name)
        for reason, names in by_reason.items():
            print(f"   • {reason} ({len(names)}) : {', '.join(names[:3])}"
                  + (f"… +{len(names)-3}" if len(names) > 3 else ""))

    if errors:
        print("\n❌ Détail erreurs :")
        for name, reason in errors:
            print(f"   • {name} : {reason}")

    if dry:
        print("\n💡 Aucune modification écrite. Relancer sans --dry-run pour appliquer.")

    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
