#!/usr/bin/env python3
"""
script_PAGESPEED.py — Test PageSpeed Insights API sur toutes les URLs du sitemap.

Corrige le bug "SEO: 0 ?" : récupère correctement les 4 catégories Lighthouse
(Performance, Accessibility, Best Practices, SEO) depuis la réponse JSON.

Prérequis :
    pip install requests

Usage :
    py script_PAGESPEED.py
"""
import requests
import csv
import time
import sys
from urllib.parse import quote

# ─── Configuration ───
API_URL = "AIzaSyC_F0BRjKpWKpn8aQFUO_sw3OM4BGp7jRs"
STRATEGY = "mobile"  # "mobile" ou "desktop"
CATEGORIES = ["performance", "accessibility", "best-practices", "seo"]
OUTPUT_CSV = "resultats_pagespeed.csv"
DELAY_BETWEEN_REQUESTS = 1.5  # secondes (éviter rate limit)

# Liste des URLs à tester
URLS = [
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


def get_score(url, max_retries=2):
    """Récupère les 4 scores Lighthouse pour une URL via l'API PageSpeed."""
    # On passe les catégories en query string
    cat_params = "&".join(f"category={c}" for c in CATEGORIES)
    full_url = f"{API_URL}?url={quote(url)}&strategy={STRATEGY}&{cat_params}"
    
    for attempt in range(max_retries + 1):
        try:
            r = requests.get(full_url, timeout=120)
            r.raise_for_status()
            data = r.json()
            
            # Path JSON : lighthouseResult.categories.{cat}.score (0-1, à multiplier par 100)
            cats = data.get("lighthouseResult", {}).get("categories", {})
            
            scores = {}
            for cat in CATEGORIES:
                # Les clés API : "performance", "accessibility", "best-practices", "seo"
                cat_data = cats.get(cat, {})
                score_val = cat_data.get("score")
                # Si null → page n'a pas pu être testée (ex. Vitals indisponibles)
                if score_val is None:
                    scores[cat] = "N/A"
                else:
                    scores[cat] = int(round(score_val * 100))
            return scores
        
        except requests.exceptions.RequestException as e:
            if attempt < max_retries:
                print(f"    (retry {attempt+1}/{max_retries} après erreur : {e})")
                time.sleep(3)
            else:
                return {cat: "ERR" for cat in CATEGORIES}
        except Exception as e:
            print(f"    Erreur parsing : {e}")
            return {cat: "ERR" for cat in CATEGORIES}


def main():
    print(f"Test de {len(URLS)} URLs en stratégie {STRATEGY}...\n")
    
    results = []
    for i, url in enumerate(URLS, 1):
        print(f"[{i}/{len(URLS)}] Test en cours : {url}")
        scores = get_score(url)
        
        perf = scores.get("performance", "?")
        a11y = scores.get("accessibility", "?")
        bp = scores.get("best-practices", "?")
        seo = scores.get("seo", "?")
        
        print(f"    -> Perf: {perf} | A11y: {a11y} | BP: {bp} | SEO: {seo}")
        
        results.append({
            "URL": url,
            "Score Performance": perf,
            "Score Accessibility": a11y,
            "Score Best Practices": bp,
            "Score SEO": seo,
        })
        
        time.sleep(DELAY_BETWEEN_REQUESTS)
    
    # Écrire le CSV
    fieldnames = ["URL", "Score Performance", "Score Accessibility", "Score Best Practices", "Score SEO"]
    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        writer.writerows(results)
    
    print(f"\n✅ Résultats sauvegardés dans {OUTPUT_CSV}")
    
    # Stats
    perf_ok = [r["Score Performance"] for r in results if isinstance(r["Score Performance"], int)]
    seo_ok = [r["Score SEO"] for r in results if isinstance(r["Score SEO"], int)]
    if perf_ok:
        print(f"\n📊 Performance : moyenne {sum(perf_ok)/len(perf_ok):.1f}, médiane {sorted(perf_ok)[len(perf_ok)//2]}")
    if seo_ok:
        print(f"📊 SEO         : moyenne {sum(seo_ok)/len(seo_ok):.1f}, médiane {sorted(seo_ok)[len(seo_ok)//2]}")


if __name__ == "__main__":
    main()
