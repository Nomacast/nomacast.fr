# Rapport : architecture bilingue FR/EN et SEO

**Date** : 14 mai 2026
**Périmètre** : structure URL, hreflang, glossaire, mots-clés SEO, sitemap

---

## 1. Architecture bilingue

| Brique | Convention |
|---|---|
| Structure URL | `/{slug-fr}.html` (FR) et `/en/{slug-en}.html` (EN) |
| Cible linguistique EN | **Anglais britannique** (filming, colour, organisation, AGM) |
| Hreflang | `fr`, `en`, `x-default` (FR par défaut) |
| og:locale | `fr_FR` et `en_GB` (avec `og:locale:alternate`) |
| Mapping slugs | `docs/MAPPING-SLUGS.md` (37 entrées) |
| Glossaire | `docs/GLOSSAIRE-FR-EN.md` |
| Form action EN | `../envoyer.php` (chemin relatif depuis `/en/`) |
| Détection langue | `<input type="hidden" name="lang" value="en">` dans tous les forms EN (seul mécanisme fiable, Referer trop fragile) |
| Chemins images EN | `../images/...` (et non `/images/...` qui casse en preview Cloudflare) |

---

## 2. Décisions de structure (07-08/05/2026)

| Date | Décision | Élément technique |
|---|---|---|
| 07/05 | Sous-répertoire `/en/` (pas de sous-domaine `en.nomacast.fr`) | Bénéficie du SEO existant et simplifie le DNS |
| 07/05 | IDs HTML FR conservés côté EN (`#offre`, `#cas-clients`, `#agences`, `#apropos`) | Convention multilingue standard (Apple, Stripe). Évite duplication CSS. Les `<h2>` visibles sont traduits, pas les ancres |
| 07/05 | Anchor "Agencies" : desktop = `#agences` (teaser home), mobile = `partner-agencies.html` | Identique au FR pour cohérence |
| 07/05 | Slugs EN sémantiques (`case-louvre-lahorde`, `conference-seminar-filming`) | SEO-friendly et descriptifs |
| 07/05 | Convention de date EN | `15 September 2022` (UK), pas `September 15, 2022` (US) |
| 07/05 | Refus traduire IDs HTML (`#offre` → `#services`) | Risque CSS, pas d'impact SEO réel |
| 07/05 | Refus uniformiser nav "Agencies" desktop/mobile | Choix UX volontaire identique au FR |
| 07/05 | Format devise UK côté EN | Symbole `€` **avant** le montant : `€1,500`, `−€150`. JS `eur(n) = "€" + fmt(n)`. `toLocaleString("en-GB")` pour virgule UK : `1,500` au lieu de `1 500` |

---

## 3. Glossaire FR → EN (extraits clés)

| FR | EN |
|---|---|
| Tournage / Captation | filming / video filming |
| Vidéaste événementiel | event videographer |
| Régie | production gallery / gallery |
| Devis | Quote |
| HT | (excl. VAT) |
| TTC | (incl. VAT) |
| Marque blanche | white-label |
| Clé en main | turnkey |
| Sur-mesure | bespoke |
| Repérage | site survey |
| Mise en place J-1 | day-before setup |
| Plateau | set / rig |
| Cadreur | camera operator |
| Plan du site | Sitemap |
| Mentions légales | Legal notice |
| Confidentialité | Privacy policy |
| Prestations | Services |
| Cas clients | Case studies |
| Tarifs | Pricing |
| Devis sous 24h | Quote in 24h |
| Cas clients narratif | In brief / Context / Challenge / Solution / Outcome |

**Termes non traduits** : noms propres (Brainsonic, Peech Studio, GL Events, Havas Event, Plissken, Livee, Ekoss), lieux historiques ((LA)HORDE × Louvre, Comédie-Française, Morning, Stratégies, Théâtre à la table), noms techniques produits (vMix, NDI, Canon CR-N500).

---

## 4. Switchers de langue (patterns)

Selon la structure de nav de chaque page :

| Pattern CSS | Position | Pages concernées |
|---|---|---|
| `.lang-switch` (variant principal) | Dernier `<li>` de `.nav-links` | 24 pages avec `<ul class="nav-links">` (services, cas clients, blog, index, agences, tarifs) |
| `.devis-lang-switch` | Avant `<a class="tel-link">` dans `.header-actions` | 7 pages devis |
| `.landing-lang-switch` | Avant `<a class="nav-tel">` dans `.nav-right` | 2 landings simplifiées (`captation-video-corporate`, `captation-evenement-entreprise`) |
| `.lang-switch` light | Avant `<a class="nav-back">` | 3 pages légales + tarifs |
| **Exclu** | — | `404.html` (servi sur n'importe quel chemin invalide, version unifiée FR/EN minimaliste) |
| **Exclu** | — | `merci.html` / `en/thank-you.html` (destinations one-way, switcher retiré 09/05 — voir RAPPORT-FORMULAIRES) |

Tous les scripts de patch sont **idempotents** (skipped si la classe est déjà présente).

---

## 5. Sitemap

| Date | État | Détail |
|---|---|---|
| 08/05 | Sitemap bilingue régénéré : 56 URLs (28 FR + 28 EN) | Chaque URL déclare ses 3 alternates (`fr`/`en`/`x-default`), namespace `xmlns:xhtml="http://www.w3.org/1999/xhtml"` |
| 09/05 | **54 URLs (27 FR + 27 EN)** | Retrait de `devis-live-streaming-paris.html` et `en/quote-live-streaming-paris.html` |
| 11/05 (LOT 36) | **+2 entrées : `faq.html` + `en/faq.html`** | Date `lastmod` mise à jour à `2026-05-11` sur 8 pages |

### Pages exclues du sitemap (`noindex` volontaire)

- `404.html`, `merci.html`, `en/thank-you.html`
- **Toutes les pages `devis-*` et `quote-*`** (LP Ads pures) — ne doivent pas concurrencer les pages services hub canoniques en SEO organique
- Page admin `nmc-7k9q3p2x.html`

### Convention canonique homepages

| Page | URL canonique |
|---|---|
| Home FR | `https://www.nomacast.fr/` |
| Home EN | `https://www.nomacast.fr/en/` |

**Aucune référence ne doit utiliser `/index.html`** pour les homepages (canonical, hreflang, og:url, JSON-LD, liens nav). Les autres pages utilisent leur slug `.html` complet.

---

## 6. Mots-clés SEO ajoutés

### Stratégie globale (07-10/05/2026)

- **Pas de modification d'URL slugs** : `webcast` et `videographer` n'apparaissent pas dans les URLs. Casser des URL stables pour un gain marginal n'est pas justifié.
- **Eyebrow comme injecteur SEO** : convention pour intégrer un mot-clé sans toucher au H1 (qui garde sa force commerciale).
- **FAQ dédiée** "webcast/webinar vs live streaming" ajoutée en position 2 sur les pages live-streaming.

### Mots-clés FR

| Mot-clé | Pages cibles | Mentions |
|---|---|---|
| Vidéaste événementiel | `prestataire-captation-evenement` (eyebrow), `index` (meta), `agences-partenaires` (subtitle) | 3 |
| Webcast professionnel | `live-streaming-evenement` (subtitle + FAQ) | 2 |
| Webinaire d'entreprise | `live-streaming-evenement` (subtitle + FAQ) | 2 |

### Mots-clés EN

| Mot-clé | Pages cibles | Mentions |
|---|---|---|
| Corporate event videographer | `en/index` (meta), `en/quote-live-streaming-paris` (subtitle) | 2 |
| Event videographer | `en/b2b-event-filming-provider` (eyebrow), `en/quote-live-streaming-paris` (eyebrow) | 2 |
| Professional webcast | `en/event-live-streaming` (subtitle + FAQ) | 2 |
| Corporate webcasting | `en/event-live-streaming` (subtitle + FAQ) | 2 |

### Schema.org `knowsAbout` (index FR + EN)

10 → **17 entrées** (10/05) : ajout webcast multi-cam, webinaire premium, keynote, colloque, symposium, événement hybride, direction technique.

### FAQ enrichie (LOT 18)

3 questions ajoutées sur l'index FR/EN, synchronisées en HTML **et** JSON-LD `FAQPage` :
1. Différence webcast / webinaire / live streaming
2. Quels types d'événements captez-vous ?
3. Êtes-vous une agence audiovisuelle ?

---

## 7. Couverture SEO complète

| LOT | Date | Pages | Type |
|---|---|---|---|
| 18 | 10/05 | 8 | Meta descriptions enrichies + FAQ + Schema |
| 18.5 | 10/05 | 34 | Meta sur 20 services + 14 devis |
| **Total** | | **42 pages** | |

Pages **non patchées** volontairement : 16 cas-clients (focus client unique), 4 blog (SEO du contenu lui-même), 6 utilitaires (mentions, 404, merci, plan-du-site).

---

## 8. Pages légales

| Date | Décision | Élément technique |
|---|---|---|
| 09/05 | `mentions-legales.html` et `en/legal-notice.html` passés en `index, follow` | Cohérence avec pages de confidentialité déjà indexables |
| — | **SIRET toujours commenté** | `<!-- <p>SIRET ... -->` à compléter |
| — | Statut juridique acté | Auto-entrepreneur EI Jérôme Bouquillon, 14 rue de l'Aubrac 75012 Paris |
| — | Hébergeur affiché | Cloudflare Inc. (101 Townsend Street, San Francisco) + filiale RGPD Cloudflare Ireland Ltd (Dublin) |

---

## 9. Bug critique résolu : conversion fantôme (LOT 2, 08/05)

| Problème | Solution |
|---|---|
| Le script de `merci.html` / `en/thank-you.html` poussait l'event `form_submit` à chaque chargement de page (peu importe la provenance : bookmark, lien partagé, robot) → conversion fantôme dans Google Ads | Garde-fou : l'event ne se déclenche **que si** le paramètre `?type=` est présent dans l'URL (ajouté par `envoyer.php` après validation serveur Turnstile + honeypot + champs) |

Détails complets : voir RAPPORT-FORMULAIRES-TRACKING-ADS.

---

## 10. Audits anti-régression

### Garde-fou anti-résidus FR sur pages EN

Avant toute livraison EN, lancer `grep -i` sur stop-words FR fermés :
```
prestations, cas clients, agences, tarifs, devis,
appeler, matériel, propriété, expérience, fichier,
installation, voir les, configurer
```

### Cross-check hreflang/canonical/sitemap

Avant toute re-soumission de sitemap :
- Vérifier que `<loc>` sitemap = `canonical` HTML pour chaque URL déclarée
- Vérifier que tous les `href` non-externes pointent sur un fichier existant
- Vérifier que les homepages n'utilisent jamais `/index.html`

---

## 11. Pending SEO

- [ ] **SIRET** dans mentions-legales.html + en/legal-notice.html
- [ ] **Soumettre `sitemap.xml`** à Google Search Console (après LOT 25/36)
- [ ] **LinkedIn Post Inspector + Facebook Debug** : forcer refresh og:image après LOT 21
- [ ] Dans 3 semaines (~04/06/2026) : check Field Data CrUX dans Search Console

---

*État de référence pour le SEO et l'architecture bilingue au 14 mai 2026.*
