#!/usr/bin/env python3
"""
script_PAGESPEED.py v2 — Test PageSpeed Insights API.

⚠️ ATTENTION SÉCURITÉ :
La clé API est en dur ci-dessous. AVANT DE COMMIT CE FICHIER :
- Soit déplacer dans une variable d'environnement (export PAGESPEED_API_KEY=...)
- Soit ajouter ce fichier au .gitignore

Améliorations vs v1 :
- Récupère les 4 catégories Lighthouse (Perf, A11y, BP, SEO)
- Support clé API → 25 000 requêtes/jour
- Backoff exponentiel sur 429
- Sauvegarde CSV incrémentale après chaque page (pas de perte si plantage)
- Reprise automatique sur les pages déjà testées (relance le script et il continue)

Prérequis : pip install requests
Usage : py script_PAGESPEED.py
"""
import requests
import csv
import time
import os
from urllib.parse import quote

# ─── CONFIG ───
# La clé peut aussi être lue depuis la variable d'env PAGESPEED_API_KEY (priorité)
PAGESPEED_API_KEY = os.environ.get("PAGESPEED_API_KEY", "AIzaSyC_F0BRjKpWKpn8aQFUO_sw3OM4BGp7jRs")
STRATEGY = "mobile"  # ou "desktop"
OUTPUT_CSV = "resultats_pagespeed.csv"
CATEGORIES = ["performance", "accessibility", "best-practices", "seo"]

DELAY_WITH_KEY = 0.5     # secondes entre 2 requêtes avec clé
DELAY_WITHOUT_KEY = 5.0  # secondes entre 2 requêtes sans clé
MAX_RETRIES = 5
INITIAL_BACKOFF = 10  # secondes pour 1ère erreur 429

# ─── URLS À TESTER ───
URLS = [
    # FR
    "https://www.nomacast.fr/",
    "https://www.nomacast.fr/tarifs.html",
    "https://www.nomacast.fr/cas-clients.html",
    "https://www.nomacast.fr/captation-evenement-entreprise.html",
    "https://www.nomacast.fr/streaming-multi-plateformes.html",
    "https://www.nomacast.fr/captation-conference-seminaire.html",
    "https://www.nomacast.fr/captation-interview-table-ronde.html",
    "https://www.nomacast.fr/captation-video-corporate.html",
    "https://www.nomacast.fr/captation-video-evenement.html",
    "https://www.nomacast.fr/captation-4k.html",
    "https://www.nomacast.fr/emission-live-corporate.html",
    "https://www.nomacast.fr/live-streaming-evenement.html",
    "https://www.nomacast.fr/streaming-multiplex-multi-sites.html",
    "https://www.nomacast.fr/prestataire-captation-evenement.html",
    "https://www.nomacast.fr/agences-partenaires.html",
    "https://www.nomacast.fr/devis.html",
    "https://www.nomacast.fr/devis-captation-4k.html",
    "https://www.nomacast.fr/devis-captation-conference-seminaire.html",
    "https://www.nomacast.fr/devis-captation-evenement.html",
    "https://www.nomacast.fr/devis-captation-table-ronde.html",
    "https://www.nomacast.fr/devis-emission-live-corporate.html",
    "https://www.nomacast.fr/devis-live-streaming-evenement.html",
    "https://www.nomacast.fr/devis-live-streaming-paris.html",
    "https://www.nomacast.fr/cas-client-comedie-francaise.html",
    "https://www.nomacast.fr/cas-client-digital-benchmark-berlin.html",
    "https://www.nomacast.fr/cas-client-figma-conference.html",
    "https://www.nomacast.fr/cas-client-gl-events.html",
    "https://www.nomacast.fr/cas-client-johnson-johnson.html",
    "https://www.nomacast.fr/cas-client-louvre-lahorde.html",
    "https://www.nomacast.fr/cas-client-morning.html",
    "https://www.nomacast.fr/blog.html",
    "https://www.nomacast.fr/blog-ag-mixte-presentiel-distanciel.html",
    "https://www.nomacast.fr/plan-du-site.html",
    # EN
    "https://www.nomacast.fr/en/",
    "https://www.nomacast.fr/en/pricing.html",
    "https://www.nomacast.fr/en/case-studies.html",
    "https://www.nomacast.fr/en/corporate-event-filming.html",
    "https://www.nomacast.fr/en/multi-platform-streaming.html",
    "https://www.nomacast.fr/en/conference-seminar-filming.html",
    "https://www.nomacast.fr/en/interview-roundtable-filming.html",
    "https://www.nomacast.fr/en/corporate-video-production.html",
    "https://www.nomacast.fr/en/event-video-production.html",
    "https://www.nomacast.fr/en/4k-video-recording.html",
    "https://www.nomacast.fr/en/corporate-live-show.html",
    "https://www.nomacast.fr/en/event-live-streaming.html",
    "https://www.nomacast.fr/en/multi-site-live-streaming.html",
    "https://www.nomacast.fr/en/b2b-event-filming-provider.html",
    "https://www.nomacast.fr/en/partner-agencies.html",
    "https://www.nomacast.fr/en/quote.html",
    "https://www.nomacast.fr/en/quote-4k-filming.html",
    "https://www.nomacast.fr/en/quote-conference-seminar-filming.html",
    "https://www.nomacast.fr/en/quote-corporate-live-show.html",
    "https://www.nomacast.fr/en/quote-event-filming.html",
    "https://www.nomacast.fr/en/quote-event-live-streaming.html",
    "https://www.nomacast.fr/en/quote-interview-roundtable-filming.html",
    "https://www.nomacast.fr/en/quote-live-streaming-paris.html",
    "https://www.nomacast.fr/en/case-comedie-francaise.html",
    "https://www.nomacast.fr/en/case-digital-benchmark-berlin.html",
    "https://www.nomacast.fr/en/case-figma-conference.html",
    "https://www.nomacast.fr/en/case-gl-events.html",
    "https://www.nomacast.fr/en/case-johnson-johnson.html",
    "https://www.nomacast.fr/en/case-louvre-lahorde.html",
    "https://www.nomacast.fr/en/case-morning.html",
    "https://www.nomacast.fr/en/blog.html",
    "https://www.nomacast.fr/en/blog-hybrid-agm-in-person-remote.html",
]

API_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
FIELDS = ["URL", "Score Performance", "Score Accessibility", "Score Best Practices", "Score SEO"]


def get_score(url):
    """Récupère les 4 scores Lighthouse pour une URL avec retry/backoff."""
    cat_params = "&".join(f"category={c}" for c in CATEGORIES)
    full_url = f"{API_URL}?url={quote(url)}&strategy={STRATEGY}&{cat_params}"
    if PAGESPEED_API_KEY:
        full_url += f"&key={PAGESPEED_API_KEY}"

    backoff = INITIAL_BACKOFF
    for attempt in range(MAX_RETRIES + 1):
        try:
            r = requests.get(full_url, timeout=120)

            if r.status_code == 429:
                if attempt < MAX_RETRIES:
                    print(f"    (429 rate limit, attente {backoff}s avant retry {attempt+1}/{MAX_RETRIES})")
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                else:
                    print(f"    (Rate limit persistant après {MAX_RETRIES} tentatives, abandon)")
                    return {cat: "ERR" for cat in CATEGORIES}

            r.raise_for_status()
            data = r.json()

            cats = data.get("lighthouseResult", {}).get("categories", {})
            scores = {}
            for cat in CATEGORIES:
                cat_data = cats.get(cat, {})
                score_val = cat_data.get("score")
                scores[cat] = "N/A" if score_val is None else int(round(score_val * 100))
            return scores

        except requests.exceptions.RequestException as e:
            if attempt < MAX_RETRIES:
                print(f"    (erreur {type(e).__name__}, retry dans {backoff}s)")
                time.sleep(backoff)
                backoff *= 2
            else:
                return {cat: "ERR" for cat in CATEGORIES}
        except Exception as e:
            print(f"    Erreur parsing : {e}")
            return {cat: "ERR" for cat in CATEGORIES}

    return {cat: "ERR" for cat in CATEGORIES}


def load_existing_results():
    """Charge le CSV existant pour reprendre où on s'est arrêté (si succès)."""
    if not os.path.exists(OUTPUT_CSV):
        return {}
    existing = {}
    try:
        with open(OUTPUT_CSV, encoding='utf-8') as f:
            for row in csv.DictReader(f, delimiter=';'):
                perf = row.get("Score Performance", "")
                # Reprendre seulement les pages testées avec succès (pas ERR)
                if perf and perf != "ERR" and perf != "":
                    existing[row["URL"]] = row
    except Exception:
        pass
    return existing


def save_results(results):
    """Sauvegarde tous les résultats dans le CSV (écrasement)."""
    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, delimiter=';')
        writer.writeheader()
        writer.writerows(results)


def main():
    has_key = bool(PAGESPEED_API_KEY)
    delay = DELAY_WITH_KEY if has_key else DELAY_WITHOUT_KEY

    print(f"━━━ PageSpeed batch test ━━━")
    print(f"Stratégie : {STRATEGY}")
    print(f"Clé API   : {'✅ configurée' if has_key else '❌ aucune (rate-limited)'}")
    print(f"Délai     : {delay}s entre 2 requêtes")
    print(f"URLs      : {len(URLS)}")
    print()

    existing = load_existing_results()
    if existing:
        print(f"📂 {len(existing)} résultats précédents trouvés → reprise.\n")

    results = []

    for i, url in enumerate(URLS, 1):
        if url in existing:
            results.append(existing[url])
            print(f"[{i}/{len(URLS)}] {url}  (déjà testée, sauté)")
            continue

        print(f"[{i}/{len(URLS)}] {url}")
        scores = get_score(url)

        perf = scores.get("performance", "?")
        a11y = scores.get("accessibility", "?")
        bp = scores.get("best-practices", "?")
        seo = scores.get("seo", "?")

        print(f"    → Perf: {perf} | A11y: {a11y} | BP: {bp} | SEO: {seo}")

        results.append({
            "URL": url,
            "Score Performance": perf,
            "Score Accessibility": a11y,
            "Score Best Practices": bp,
            "Score SEO": seo,
        })

        save_results(results)  # Sauvegarde incrémentale après chaque page
        time.sleep(delay)

    save_results(results)
    print(f"\n✅ Résultats sauvegardés dans {OUTPUT_CSV}")

    # Stats finales
    def stats(key):
        vals = [r[key] for r in results if isinstance(r[key], int)
                or (isinstance(r[key], str) and r[key].isdigit())]
        vals = [int(v) for v in vals]
        if not vals:
            return None
        avg = sum(vals) / len(vals)
        median = sorted(vals)[len(vals) // 2]
        n90 = sum(1 for v in vals if v >= 90)
        n_low = sum(1 for v in vals if v < 70)
        return avg, median, n90, n_low, len(vals)

    print("\n━━━ STATS ━━━")
    for label, key in [("Performance", "Score Performance"),
                        ("Accessibility", "Score Accessibility"),
                        ("Best Practices", "Score Best Practices"),
                        ("SEO", "Score SEO")]:
        s = stats(key)
        if s:
            avg, median, n90, n_low, total = s
            print(f"  {label:<15} moyenne {avg:>5.1f}  médiane {median:>3}  "
                  f"≥90: {n90}/{total}  <70: {n_low}/{total}")


if __name__ == "__main__":
    main()
