import requests
import re
import time
import csv

# ==========================================
# VOS PARAMÈTRES (À MODIFIER)
# ==========================================
API_KEY = 'AIzaSyC_F0BRjKpWKpn8aQFUO_sw3OM4BGp7jRs'
SITEMAP_URL = 'https://www.nomacast.fr/sitemap.xml'
STRATEGIE = 'mobile' 
FICHIER_RESULTAT = 'resultats_pagespeed.csv'
# ==========================================

def recuperer_urls_sitemap(sitemap_url):
    print(f"📄 Lecture du sitemap : {sitemap_url}")
    try:
        response = requests.get(sitemap_url)
        # Utilisation d'une expression régulière pour trouver toutes les balises <loc>
        urls = re.findall(r'<loc>(https?://.*?)</loc>', response.text)
        print(f"✅ {len(urls)} URLs trouvées dans le sitemap.\n")
        return urls
    except Exception as e:
        print(f"❌ Erreur lors de la lecture du sitemap : {e}")
        return []

def tester_pagespeed():
    urls = recuperer_urls_sitemap(SITEMAP_URL)
    
    if not urls:
        print("Aucune URL à tester. Fin du script.")
        return

    # Préparation du fichier CSV
    with open(FICHIER_RESULTAT, mode='w', newline='', encoding='utf-8') as fichier_csv:
        writer = csv.writer(fichier_csv, delimiter=';')
        # En-têtes du fichier
        writer.writerow(['URL', 'Score Performance', 'Accessibilité', 'Bonnes Pratiques', 'SEO'])

        print("🚀 Lancement des tests (cela peut prendre du temps)...\n")

        for index, url in enumerate(urls, start=1):
            print(f"[{index}/{len(urls)}] Test en cours : {url}")
            api_url = f"https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url={url}&key={API_KEY}&strategy={STRATEGIE}"
            
            try:
                response = requests.get(api_url)
                data = response.json()
                
                # Extraction des scores (multipliés par 100 pour être sur 100)
                categories = data.get('lighthouseResult', {}).get('categories', {})
                
                perf = categories.get('performance', {}).get('score', 0) * 100
                access = categories.get('accessibility', {}).get('score', 0) * 100
                best_prac = categories.get('best-practices', {}).get('score', 0) * 100
                seo = categories.get('seo', {}).get('score', 0) * 100
                
                print(f"    -> Performance: {int(perf)} | SEO: {int(seo)}")
                
                # Écriture dans le fichier CSV
                writer.writerow([url, int(perf), int(access), int(best_prac), int(seo)])
                
            except Exception as e:
                print(f"    -> ❌ Erreur avec cette URL. (Peut-être un blocage Google)")
                writer.writerow([url, 'Erreur', '', '', ''])
            
            # Pause vitale pour ne pas dépasser les quotas de l'API gratuite de Google
            time.sleep(3)

    print(f"\n🎉 Terminé ! Les résultats sont sauvegardés dans le fichier : {FICHIER_RESULTAT}")

# Lancement du script
if __name__ == '__main__':
    tester_pagespeed()