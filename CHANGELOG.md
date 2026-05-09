## 2026-05-09, Audit hreflang/canonical pré-soumission sitemap + correction des deux homepages FR/EN (mismatch /index.html ↔ /)

### Contexte

Suite à la finalisation du chantier bilingue (entrée 2026-05-08), question utilisateur sur la re-soumission du `sitemap.xml` à Google Search Console et Bing Webmaster Tools. Avant soumission, audit complet de cohérence entre `sitemap.xml` (56 URLs : 28 FR + 28 EN), les 35 fichiers EN du zip livré le 2026-05-08, et la home FR `index.html`.

L'audit a remonté un seul écart structurel mais qui se manifestait dans plusieurs balises : la home EN canonicalisait vers `/en/index.html` alors que le sitemap déclarait `/en/`. Effet miroir partiel côté FR (canonical OK sur `/`, mais `hreflang="en"` et lien de nav EN pointaient vers `/en/index.html`).

### Diagnostic d'audit

#### Cross-check sitemap ↔ fichiers EN (28 URLs déclarées)

- **27 / 28 pages EN** : `<loc>` du sitemap ↔ `canonical` HTML ↔ `hreflang="en"` parfaitement alignés ✓
- **1 / 28 — homepage EN** : mismatch
  - `sitemap.xml` : `<loc>https://www.nomacast.fr/en/</loc>`
  - `en/index.html` : `<link rel="canonical" href="https://www.nomacast.fr/en/index.html">`
  - Idem pour `hreflang="en"`, `og:url`, schema.org WebSite `url`, schema.org BreadcrumbList `item` (5 occurrences au total dans le `<head>` et les blocs JSON-LD)
  - Risque : avertissement GSC "Indexée mais avec une URL canonique différente" → consolidation des signaux sur `/en/index.html`, sitemap considéré comme désaligné

#### Pages exclues du sitemap (vérification noindex)

- **6 pages `quote-*`** (devis-* equivalents) : toutes `<meta name="robots" content="noindex, follow">` ✓
- **`thank-you.html`** : `<meta name="robots" content="noindex, nofollow">` ✓
- **`quote-live-streaming-paris.html`** (seule quote-* présente dans le sitemap, landing Ads Paris) : `<meta name="robots" content="index, follow">` ✓
- Comptage cohérent : 35 fichiers EN livrés − 7 noindex = 28 URLs EN dans le sitemap ✓

#### Audit côté FR (home uniquement)

`index.html` analysée :
- `canonical` → `https://www.nomacast.fr/` ✓ (déjà propre, sans `/index.html`)
- `og:url` → `https://www.nomacast.fr/` ✓
- schema.org `url` → `https://www.nomacast.fr/` ✓
- ⚠️ `hreflang="en"` → `https://www.nomacast.fr/en/index.html` (devrait être `/en/`)
- ⚠️ Lien de nav `<a hreflang="en">EN</a>` (header) → `href="/en/index.html"` (devrait être `/en/`)

→ 2 occurrences à corriger pour parité avec le sitemap et la nouvelle canonical EN.

### Modifications appliquées

#### `index.html` (FR home) — 2 corrections

- **L21** : `<link rel="alternate" hreflang="en" href="https://www.nomacast.fr/en/">` (était `/en/index.html`)
- **L1717** : `<a href="/en/" hreflang="en" lang="en">EN</a>` (était `/en/index.html`)
- Timestamp DOCTYPE : `<!-- Last update: 2026-05-09 11:00 -->`

#### `en/index.html` (EN home) — 5 corrections

- **L19** : `<link rel="canonical" href="https://www.nomacast.fr/en/">`
- **L21** : `<link rel="alternate" hreflang="en" href="https://www.nomacast.fr/en/">`
- **L25** : `<meta property="og:url" content="https://www.nomacast.fr/en/">`
- **L189** (JSON-LD WebSite) : `"url": "https://www.nomacast.fr/en/"`
- **L215** (JSON-LD BreadcrumbList, position 1 "Home") : `"item": "https://www.nomacast.fr/en/"`
- Timestamp DOCTYPE : `<!-- Last update: 2026-05-09 11:00 -->`

Vérification post-édition : `grep -c 'en/index\.html'` → 0 dans les deux fichiers. Le seul résidu textuel `nomacast.fr/en/pricing.html` mentionné dans la FAQ ligne 311 d'`en/index.html` est une URL de page différente (page Pricing), pas un lien vers la home — non concerné.

### Décisions techniques actées

- **Convention canonique pour les homepages** : la home FR utilise la forme courte `https://www.nomacast.fr/`, la home EN utilise `https://www.nomacast.fr/en/`. Aucune référence (canonical, hreflang, og:url, schema.org `url`, schema.org BreadcrumbList `item`, liens de nav internes) ne doit utiliser `/index.html` pour les homepages. Cette règle ne s'applique qu'aux homepages — toutes les autres pages utilisent leur slug `.html` complet et étaient déjà conformes.
- **Garde-fou pour futures sessions** : avant toute re-soumission de sitemap, faire tourner un cross-check `<loc>` sitemap ↔ `canonical` HTML pour chaque URL déclarée. Le mismatch homepage est passé à travers la livraison du 2026-05-08 (chantier bilingue) précisément parce qu'aucune vérification ne croisait sitemap et HTML.
- **Cloudflare** (hosting actuel, depuis 2026-05-06) : après chaque changement structurel sur les homepages ou le sitemap, purger le cache au minimum sur `index.html`, `en/index.html` et `sitemap.xml` (Caching → Configuration → Purge Cache). Page Rule recommandée : `Cache Level: Bypass` sur `sitemap.xml` pour éviter qu'une version périmée soit servie à Googlebot.
- **Page Rules anti-duplicate-content recommandées** (à ajouter dans Cloudflare) : 301 de `*nomacast.fr/index.html` → `*nomacast.fr/` et `*nomacast.fr/en/index.html` → `*nomacast.fr/en/`. Élimine définitivement tout risque de double indexation sur les variantes avec `/index.html`.

### Prochaines étapes (post-déploiement)

1. **Déployer** les 2 fichiers via le workflow Apps Script Drive → GitHub `main` → Cloudflare Pages auto-deploy
2. **Purger le cache Cloudflare** sur `/`, `/en/`, `/index.html`, `/en/index.html`, `/sitemap.xml`
3. **Soumettre `sitemap.xml`** à Google Search Console (Sitemaps → Submit) et Bing Webmaster Tools
4. **Inspecter / demander indexation** dans GSC pour les pages clés EN (homepage, pricing, 2-3 services hub) — accélère la découverte au-delà du sitemap
5. **Test hreflang** facultatif via https://www.merkle.com/uk/products/technology/hreflang-tags-testing-tool sur `/`, `/en/`, et 2-3 paires de sous-pages pour validation finale

### Fichiers livrés

- `index.html` (FR home, timestamp DOCTYPE `<!-- Last update: 2026-05-09 11:00 -->`)
- `en/index.html` (EN home, timestamp DOCTYPE `<!-- Last update: 2026-05-09 11:00 -->`)

Aucune modification sur `sitemap.xml` : le fichier est déjà correct, c'est le HTML des deux homepages qui devait s'aligner sur lui.

---

## 2026-05-08 (post-audit), Ré-application des modifs du 7 mai sur tarifs.html et pricing.html après régression silencieuse

### Contexte

Constat utilisateur en session : ouverture des fichiers `tarifs.html` (timestamp `2026-05-08 08:56`) et `pricing.html` (timestamp `2026-05-07 23:15`) — les modifications du 7 mai (add-on Photographe événementiel + bandeau "Vue technique" dark variant A) ne sont plus présentes dans `tarifs.html` et partiellement absentes dans `pricing.html`. L'entrée CHANGELOG du 7 mai documente bien ces modifications, mais les fichiers livrés ne les portent plus.

Diagnostic : régression silencieuse pendant la session d'audit du 8 mai matin. Probablement une édition de `tarifs.html` à partir d'une base antérieure au 7 mai 18:00 (avant la livraison Photographe + bandeau), qui a écrasé les changements sans s'en apercevoir. `pricing.html` a conservé l'add-on Photographer (déjà en place avant l'audit) mais a perdu le bandeau.

### État pré-ré-application

| Fichier | Add-on Photographe | Bandeau Vue technique |
|---|---|---|
| `tarifs.html` (FR) | Absent | Ancien `tech-switch` en Step 02 |
| `pricing.html` (EN) | Présent | Ancien `tech-switch` en Step 02 |

### Modifications ré-appliquées

#### tarifs.html (FR) — ré-application complète

- **Add-on Photographe** : card HTML dans `.addons-grid` Step 04, `state.addons.photographe = false`, `ADDON_PRICES.photographe = { half: 1150, full: 1150, "2days": 1750, "3days": 2350 }`, `ADDON_MATERIEL.photographe` (Canon EOS 5D Mark IV, 3 objectifs, édition, livraison J+1/J+2), branche `compute()` ajoutant le prix au total après mécanique partenaire, `photographePriceEl` dans `render()` pour MAJ dynamique selon durée.
- **buildAddons()** : `forEach` sur les 3 add-ons (`bestof`, `interviews`, `photographe`). Tracking GA4 refactoré en map `addonLabels` + lookup générique sur `ADDON_PRICES[addonId]` (au lieu de ternaires en cascade).
- **Bandeau Vue technique** : retrait du `<label class="tech-switch">` du bas de Step 02, insertion du `<label class="tech-banner">` dark inversé sans icône entre Step 02 et Step 03 (3e enfant de `.steps`). Wording : `Voir le matériel inclus` + `Micros, trépieds, ordinateur, câblage… le matériel technique prévu pour chaque partie du dispositif.`
- **CSS** : nouveau bloc `.tech-banner.*` (gradient slate `#1a2332` → `#0f1825`, bordure cyan fine, glow radial cyan, titre blanc, description blanc 62%, slider blanc 18% → cyan en mode actif). Ancien bloc `.tech-switch.*` retiré.
- **Animation chain** : `.steps` a 5 enfants. `.tech-banner` hérite de `animation-delay: .16s`, Step 03 passe à `.24s` (nth-child(4)), Step 04 à `.32s` (nth-child(5)).
- **`setTechMode()`** : ajout du toggle `.active` sur `#tech-banner-label` pour feedback visuel.
- **Timestamp** : `<!-- Last update: 2026-05-08 19:00 -->`.

#### pricing.html (EN) — bandeau seulement

- **Add-on Photographer** : déjà en place, intact, pas d'intervention.
- **Bandeau Tech view** : mêmes modifications structurelles que sur `tarifs.html` (retrait `tech-switch`, insertion `tech-banner` dark sans icône, CSS, animation chain, `setTechMode()`).
- **Wording EN** : `See included equipment` + `Mics, tripods, computer, cabling… the technical kit included for every part of your setup.` Choix de "kit" en cohérence avec "Make use of the kit already on site" déjà présent dans la description Interviews.
- **Commentaires JS `setTechMode()`** : traduits en anglais à l'occasion (étaient restés en français dans `pricing.html`).
- **Timestamp** : `<!-- Last update: 2026-05-08 19:00 -->`.

### Décisions techniques actées

- **Garde-fou anti-régression** : avant toute session d'édition substantielle sur `tarifs.html` ou `pricing.html`, vérifier que les modifications de la dernière entrée CHANGELOG sont bien présentes dans le fichier. Diff rapide : `grep -c "data-addon=\"photographe\"" tarifs.html` doit retourner `1`, `grep -c "class=\"tech-banner\"" tarifs.html` doit retourner `1`. Si zéro, la base utilisée est antérieure et il faut récupérer la bonne version avant d'éditer.
- **Validation post-livraison** : le timestamp DOCTYPE seul ne garantit pas l'intégrité du contenu (un fichier peut être bumpé sans avoir reçu les modifs). Ajouter une vérification systématique sur 2-3 marqueurs structurels après livraison (ex. présence de `data-addon="photographe"`, `class="tech-banner"`, `id="tech-banner-label"`).
- **Parité FR/EN** (rappel, déjà acté le 7 mai) : toute modif structurelle doit être propagée aux deux fichiers dans la même session. Cette session de ré-application confirme l'utilité de la règle : les deux fichiers ont divergé pendant l'audit du 8 mai sur des dimensions différentes (tarifs.html a perdu plus que pricing.html).
- Aucun changement de logique métier ou de tarif dans cette ré-application : c'est strictement le rétablissement de l'état du 7 mai 18:00 / 23:45.

### Fichiers livrés

- `tarifs.html` (timestamp DOCTYPE `<!-- Last update: 2026-05-08 19:00 -->`)
- `pricing.html` (timestamp DOCTYPE `<!-- Last update: 2026-05-08 19:00 -->`)

---

## 2026-05-08 (audit), Audit complet FR/EN post-déploiement + correctifs Lots A/B/C — switcher mobile, terminologie, résidus FR

### Contexte

Session d'audit déclenchée par deux observations utilisateur post-déploiement :

1. **Question UX mobile** : sur l'index, le switcher de langue `FR · EN` est centré entre le logo et le burger via le `justify-content:space-between` du nav. L'utilisateur souhaite le rapprocher du burger menu pour une meilleure lecture du groupe d'actions à droite.
2. **Suspicion de version drift** : impression que certaines pages n'ont pas reçu les dernières modifications (constat fondé visuellement sur des screenshots mobiles d'`agences-partenaires.html`).

L'audit a confirmé plusieurs incohérences réelles entre les pages FR et EN, ainsi que quelques résidus de migration non finalisés. Cinq lots de correctifs ont été identifiés (A à E), trois ont été appliqués (A, B, C), deux ont été délibérément skippés (D faux positif, E acceptable en l'état).

### Diagnostic d'audit

#### Côté FR (35 pages)

**Modèles de switcher mobile coexistants** (incohérence d'expérience utilisateur) :
- **24 pages standard** avec `<ul class="nav-lang-mobile">` injecté dans le top nav (visible sur mobile fermé, à côté du burger) — index, services, cas clients, blog, agences, etc.
- **11 pages spéciales** avec `<ul class="mobile-lang-switch">` dans le mobile-overlay uniquement (visible que quand le burger est ouvert) — devis-* (sauf paris), captation-evenement-entreprise, captation-video-corporate, mentions-legales, merci, plan-du-site, politique-de-confidentialite

→ Pas réellement bloquant (les deux modèles fonctionnent) mais asymétrie d'UX entre familles de pages. Harmonisation reportée à une itération future.

**Résidus terminologiques détectés** :
- `tarifs.html` (JSON-LD FAQ ligne 179) : "France entière, Europe, ponctuellement au-delà" — non aligné sur la guideline validée.
- `captation-video-evenement.html` (FAQ ligne 497) : "à la clôture de l'événement" — la convention validée est "dès la fin de l'événement" (formulation moins formelle, plus fluide).
- `cas-client-digital-benchmark-berlin.html` ligne 414 : "à la clôture du vendredi" — usage légitime de "clôture" au sens propre (fermeture d'un événement de 3 jours), conservé.

**Wording CTA "Devis gratuit" non migré vers "Devis sous 24h"** :
- `captation-evenement-entreprise.html` : 5 CTA boutons + 1 form-title (nav-cta-sm "Devis gratuit", btn-primary hero "Devis gratuit sous 24h", form-title "Devis gratuit sous 24h", sticky CTA "Obtenir mon devis gratuit", btn-primary cta-band "Devis gratuit sous 24h")
- `captation-video-corporate.html` : 5 CTA boutons + 1 form-title (mêmes positions)
- `prestataire-captation-evenement.html` : 1 CTA sticky bottom card (ligne 524)
- `devis-live-streaming-paris.html` : 1 CTA sticky bottom card (ligne 490)

→ Le texte descriptif `Devis gratuit et personnalisé sous 24h` (contact-pitch) sur 10 pages standards a été **conservé volontairement** : il s'agit de prose commerciale où le mot "gratuit" est un argument de réassurance, pas un libellé de bouton.

#### Côté EN (35 pages)

**Résidus français sur `corporate-video-production.html`** (page EN avec contenu FR oublié) :
- Ligne 290 : `<a class="nav-cta-sm">Devis gratuit</a>`
- Ligne 552 : `<h2 class="cta-title">Votre prochain contenu corporate,<br>produit avec les standards professionnels.</h2>`
- Ligne 553 : `<p class="cta-sub">Interview, table ronde, émission live, AG : devis gratuit sous 24h.</p>`
- Ligne 555 : `Devis gratuit sous 24h` (btn-primary cta-band)

→ Cette page avait visiblement été partiellement oubliée lors du chantier bilingue de la session précédente.

**Pages EN sans aucun switcher de langue UI** (asymétrie avec les équivalents FR) :
- `legal-notice.html` (équivalent FR `mentions-legales.html` a `.lang-switch` desktop + `.mobile-lang-switch`)
- `privacy-policy.html` (équivalent FR `politique-de-confidentialite.html` a switcher complet)
- `sitemap.html` (équivalent FR `plan-du-site.html` a switcher complet)
- `thank-you.html` (équivalent FR `merci.html` a `merci-lang-switch`)

→ Les hreflang sont présents (Google sait), mais aucun bouton FR/EN visible : un utilisateur EN sur ces pages ne pouvait pas revenir au FR via l'UI. Bug de l'injection EN qui avait omis ces 4 pages utility.

**Pages EN avec switcher "fallback" mobile mal calé** :
- `corporate-event-filming.html`, `corporate-video-production.html` (landings simples)
- `quote-*` (7 pages devis EN)

→ Sur ces 9 pages, `.lang-switch` reste visible en mobile mais avec `margin-top:8px` (wrap sous le tel). Côté FR équivalent, ces pages utilisent `.mobile-lang-switch` dans l'overlay. Asymétrie de design, non corrigée dans cette session (acceptable visuellement).

**Wording CTA EN inconsistent** (5 variantes coexistantes) :
| Variante | Occurrences |
|---|---|
| "Quote in 24h" | 58 |
| "Quote within 24h" | 33 |
| "Request a quote" | 31 |
| "Free quote" | 13 |
| "Get a quote" | 2 |

→ Toutes ces formulations sont valides en anglais britannique (`<html lang="en-GB">`). Pas critique. Harmonisation reportée (lot E skippé en accord avec l'utilisateur).

#### Faux positif d'audit

L'audit initial avait flaggé l'absence de `og:locale:alternate` sur 8 pages utility (4 FR + 4 EN). Vérification en profondeur : ces pages **n'ont AUCUNE balise Open Graph** (pas de `og:title`, `og:description`, `og:type`, `og:locale`, `og:image`). C'est cohérent par design : ces pages sont en `<meta name="robots" content="noindex, follow">`, donc elles ne sont pas faites pour être partagées sur les réseaux sociaux. Ajouter uniquement `og:locale:alternate` sans le reste serait incohérent. **Non-anomalie confirmée**, lot D skippé.

### Lot A — Résidus FR + ajout switcher 4 pages utility EN

**Fichier 1 : `en/corporate-video-production.html`** (4 traductions FR → EN)

| Ligne | Avant (FR) | Après (EN) |
|---|---|---|
| 290 | `Devis gratuit` (nav-cta-sm) | `Free quote` |
| 552 | `Votre prochain contenu corporate,<br>produit avec les standards professionnels.` | `Your next corporate content,<br>produced to professional standards.` |
| 553 | `Interview, table ronde, émission live, AG : devis gratuit sous 24h.` | `Interview, round table, live show, AGM: free quote within 24h.` |
| 555 | `Devis gratuit sous 24h` (btn-primary cta-band) | `Free quote within 24h` |

→ Wording aligné sur `corporate-event-filming.html` (autre landing simple EN déjà bien traduite). Cohérence assurée entre les 2 landings simples.

**Fichiers 2-5 : `en/legal-notice.html`, `en/privacy-policy.html`, `en/sitemap.html`, `en/thank-you.html`** (ajout switcher FR/EN)

CSS `.lang-switch` ajouté avant `</style>` sur les 4 pages :
```css
.lang-switch{display:inline-flex;align-items:center;gap:6px;margin-left:auto;margin-right:12px;padding:6px 4px;font-size:13px;font-weight:600;letter-spacing:.02em;color:var(--ink-muted);list-style:none}
.lang-switch a{color:var(--ink-muted);text-decoration:none;padding:4px 6px;border-radius:4px;transition:color .15s,background .15s}
.lang-switch a:hover{color:var(--cyan);background:rgba(90,152,214,.08);text-decoration:none}
.lang-switch a.active{color:var(--cyan);pointer-events:none}
.lang-switch .lang-sep{color:var(--ink-faint);font-weight:400;user-select:none}
@media(max-width:600px){.lang-switch{margin-left:0;margin-right:8px;font-size:12px}}
```

HTML switcher injecté entre `nav-logo` et `nav-back` (3 pages avec nav classique) :
```html
<ul class="lang-switch" aria-label="Choose language">
  <li><a href="/{fr-page}.html" hreflang="fr" lang="fr">FR</a></li>
  <li><span class="lang-sep" aria-hidden="true">·</span></li>
  <li><a href="" class="active" aria-current="page">EN</a></li>
</ul>
```

Sur `thank-you.html` (structure centrée sans nav), variant inline injecté avant le `btn-home`, en miroir du pattern `merci-lang-switch` côté FR (CSS `margin-bottom:24px`, sans `margin-left:auto`).

URLs de retour vers la version FR :
- `/en/legal-notice.html` → `/mentions-legales.html`
- `/en/privacy-policy.html` → `/politique-de-confidentialite.html`
- `/en/sitemap.html` → `/plan-du-site.html`
- `/en/thank-you.html` → `/merci.html`

**Note** : la règle `@media(max-width:768px){.lang-switch{display:none}}` utilisée côté FR (qui s'appuie sur le fallback `.mobile-lang-switch` de l'overlay) **n'a pas été reproduite** ici, car ces 4 pages EN n'ont pas de mobile-overlay. À la place, le `@media(max-width:600px)` réduit la taille (12px au lieu de 13px) pour s'intégrer proprement avec le `nav-back`.

### Lot B — `margin-left:auto` sur `.nav-lang-mobile` (46 pages)

Demande utilisateur initiale : sur mobile, le switcher `FR · EN` est centré entre logo et burger à cause du `justify-content:space-between` du nav. Le rapprocher du burger améliore la lecture du groupe d'actions à droite.

**Fix appliqué** sur le bloc CSS unique `.nav-lang-mobile{display:inline-flex;...}` à l'intérieur de `@media(max-width:768px){...}` :

```css
/* Avant */
.nav-lang-mobile{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:600;letter-spacing:.02em;margin-right:14px;list-style:none}

/* Après */
.nav-lang-mobile{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:600;letter-spacing:.02em;margin-left:auto;margin-right:12px;list-style:none}
```

Le `margin-left:auto` consume tout l'espace flex disponible à gauche du switcher, ce qui le pousse contre le burger. Le `margin-right` est légèrement réduit (14px → 12px) pour resserrer un peu plus le couple `FR · EN | burger`.

**Effet visuel sur mobile** :
```
Avant : ● Nomacast        FR · EN        ☰
Après : ● Nomacast                FR · EN ☰
```

**Pages patchées** (46 au total — application via Python avec recherche-remplacement exacte du bloc CSS, pattern strictement identique sur toutes les pages) :

- **23 pages FR** : agences-partenaires, blog, blog-ag-mixte-presentiel-distanciel, captation-4k, captation-conference-seminaire, captation-interview-table-ronde, captation-video-evenement, cas-client-* (7 pages), cas-clients, devis-live-streaming-paris, emission-live-corporate, index, live-streaming-evenement, prestataire-captation-evenement, streaming-multi-plateformes, streaming-multiplex-multi-sites, tarifs.
- **23 pages EN** : 4k-video-recording, b2b-event-filming-provider, blog, blog-hybrid-agm-in-person-remote, case-* (7 pages), case-studies, conference-seminar-filming, corporate-live-show, event-live-streaming, event-video-production, index, interview-roundtable-filming, multi-platform-streaming, multi-site-live-streaming, partner-agencies, pricing, quote-live-streaming-paris.

**Pages non concernées** (n'ont pas de `.nav-lang-mobile` dans leur structure) : 11 pages FR avec `.mobile-lang-switch` dans l'overlay (devis-* sauf paris, captation-evenement-entreprise, captation-video-corporate, légales, merci, plan-du-site) + les 12 pages EN équivalentes (quote-*, corporate-event-filming, corporate-video-production, legal-notice, privacy-policy, sitemap, thank-you).

### Lot C — Terminologie (6 pages FR)

**Migration "Devis gratuit" → "Devis sous 24h" sur les CTA boutons** (4 pages FR, 12 occurrences) :

- `captation-evenement-entreprise.html` (5 modifs) :
  - L315 nav-cta-sm : `Devis gratuit` → `Devis sous 24h`
  - L337 btn-primary hero : `Devis gratuit sous 24h` → `Devis sous 24h`
  - L342 form-title : `Devis gratuit sous 24h` → `Devis sous 24h`
  - L453 sticky CTA : `Obtenir mon devis gratuit` → `Devis sous 24h`
  - L582 btn-primary cta-band : `Devis gratuit sous 24h` → `Devis sous 24h`
- `captation-video-corporate.html` (5 modifs aux mêmes positions logiques : nav-cta-sm L307, btn-primary hero L328, form-title L333, sticky CTA L484, btn-primary cta-band L571)
- `prestataire-captation-evenement.html` (1 modif) : L524 sticky CTA bottom card
- `devis-live-streaming-paris.html` (1 modif) : L490 sticky CTA bottom card

**Conservé volontairement** :
- 10 occurrences `Devis gratuit et personnalisé sous 24h` dans `<p class="contact-pitch">` (texte descriptif, pas un CTA bouton)
- 3 occurrences "Devis gratuit sous 24h" dans les meta `description` / `og:description` / `twitter:description` de `captation-evenement-entreprise.html` (SEO, "gratuit" est un argument de différenciation)
- Texte descriptif `Devis gratuit sous 24h, souvent répondu dans la journée. Ou appelez directement.` (cta-sub L580 captation-evenement-entreprise) et `Interview, table ronde, émission live, AG : devis gratuit sous 24h.` (cta-sub L569 captation-video-corporate) → prose, pas un bouton

**Migration "à la clôture de l'événement" → "dès la fin de l'événement"** :

- `captation-video-evenement.html` ligne 497 : FAQ "Combien de temps pour recevoir le fichier après l'événement ?" — réponse "Le fichier est remis le soir même, à la clôture de l'événement..." → "...dès la fin de l'événement..."

**Migration "France entière" → "France et Europe"** sur `tarifs.html` :

- Ligne 179 (JSON-LD FAQ "Le déplacement est-il inclus dans le tarif ?") : `"Pour les événements en province ou à l'international (France entière, Europe, ponctuellement au-delà)..."` → `"Pour les événements hors Paris (France et Europe, ponctuellement au-delà)..."`

→ Aligné sur la guideline géographique validée : **"France & Europe"** est le terme principal, **"Paris"** est ajouté de manière cohérente pour le référencement (pattern `Paris · France · Europe` dans la zone footer, `Paris, France et Europe` dans la prose).

### Lot D — Skip (faux positif d'audit)

Voir section "Diagnostic d'audit > Faux positif" ci-dessus. Les 8 pages utility (4 FR + 4 EN) n'ont aucune balise Open Graph par design, cohérent avec leur statut `noindex`. Ajouter uniquement `og:locale:alternate` sans le reste de l'OG serait incohérent. Décision : ne rien faire.

### Lot E — Skip (variabilité acceptable)

Les 5 variantes de wording CTA EN ("Quote in 24h", "Quote within 24h", "Request a quote", "Free quote", "Get a quote") cohabitent sur 17 pages EN. Toutes sont des formulations valides en anglais britannique. Effort d'harmonisation jugé non prioritaire en accord avec l'utilisateur. Reporté à une éventuelle itération future si besoin de cohérence renforcée pour le branding ou le testing publicitaire.

### Décisions de cadrage validées en cours de session

1. **`tarifs.html` n'a pas besoin du CTA standard "Devis sous 24h"** : c'est un simulateur où le formulaire est lui-même le mécanisme de conversion. Ajouter un CTA générique au-dessus du simulateur ferait doublon et perturberait le flow. Le footer plus court (3 colonnes au lieu de 4, sans section "Agences") est aussi cohérent pour une page-outil. Mon audit initial avait flaggé ces points comme anomalies, requalifiés en intentionnels.

2. **Guideline géographique nuancée** : "France & Europe" est le terme principal validé, et "Paris" est ajouté de manière cohérente pour le SEO. Patterns confirmés :
   - Zone footer : `Paris · France · Europe` (avec point médian)
   - Prose : `Paris, France et Europe` ou `Paris, France & Europe` (meta description anglaise)
   - À éviter : `France entière`

3. **Asymétrie switcher mobile FR/EN reste tolérée** sur les 11 pages FR avec `mobile-lang-switch` (overlay) et 9 pages EN avec `lang-switch` margin-top fallback. Migration vers le modèle uniforme `nav-lang-mobile` reportée à une itération future. Bloquer cette session sur cette harmonisation aurait retardé les correctifs critiques (résidus FR, pages EN sans switcher).

### Fichier livré

- **`NOMACAST_final.zip`** (859 KB, 72 fichiers HTML) — structure réorganisée pour la lisibilité de la livraison :
  ```
  NOMACAST_final.zip
  ├── fr/  (37 fichiers .html — racine du site)
  └── en/  (35 fichiers .html — sous-dossier /en/)
  ```
  À déployer sur LWS : copier les fichiers du dossier `fr/` à la racine du serveur, et les fichiers du dossier `en/` dans `/en/`. Les fichiers non-HTML (sitemap.xml, robots.txt, functions/, images/, favicon.svg, og-image.jpg, _redirects, BingSiteAuth.xml, llms.txt, 2438d00ec5944f38979efedc262f1dc0.txt) **ne sont pas inclus** dans cette livraison car non modifiés depuis la session précédente — la version déployée actuellement reste valide.

### Limitations résiduelles (à traiter dans une itération future)

1. **Asymétrie de switcher mobile FR/EN** : 11 pages FR utilisent `.mobile-lang-switch` dans le mobile-overlay alors que 24 autres utilisent `.nav-lang-mobile` dans le top nav. Côté EN, 9 pages utilisent `.lang-switch` avec `margin-top:8px` en fallback mobile au lieu de `nav-lang-mobile`. Migration vers un modèle uniforme à prévoir si la cohérence d'UX devient un sujet.

2. **Wording CTA EN non harmonisé** : 5 variantes coexistent. Si harmonisation souhaitée, recommandation est `Quote within 24h` (cohérent avec `<html lang="en-GB">`) sauf sur `corporate-event-filming.html` et `corporate-video-production.html` (landings simples) où `Free quote within 24h` reste pertinent (le mot "free" est un argument commercial sur ces formats de conversion).

3. **`corporate-video-production.html` — incohérence interne mineure** : suite à mes traductions (Lot A), la page utilise désormais `Free quote within 24h` sur le btn-primary cta-band (ligne 555) mais `Free quote in 24h` sur les autres CTA du formulaire intégré (lignes 311, 316, 468 — déjà existants en EN avant cette session). Cette inconsistance fait partie du Lot E global (harmonisation EN). Non bloquante.

### Tests recommandés post-déploiement

1. Sur `index.html` mobile : confirmer que `FR · EN` est bien collé au burger à droite (et non centré entre logo et burger).
2. Sur les 4 pages utility EN (`legal-notice`, `privacy-policy`, `sitemap`, `thank-you`) : cliquer "FR" et vérifier la redirection vers la version FR équivalente.
3. Sur `captation-evenement-entreprise.html` et `captation-video-corporate.html` : vérifier que tous les CTA boutons (nav, hero, form-title, sticky card, cta-band) affichent désormais "Devis sous 24h" et plus "Devis gratuit".
4. Sur `tarifs.html` : la FAQ "Le déplacement est-il inclus dans le tarif ?" mentionne désormais "France et Europe (ponctuellement au-delà)" et plus "France entière".
5. Sur `captation-video-evenement.html` : la FAQ "Combien de temps pour recevoir le fichier après l'événement ?" mentionne "dès la fin de l'événement" et plus "à la clôture de l'événement".


## 2026-05-08 (hotfix), Fix mobile-lang-switch positionnement + masquage float-call quand menu mobile ouvert

### Contexte

Bug remonté en QA après déploiement de la session principale du 2026-05-08 : sur mobile, quand on ouvre le menu burger, le switcher de langue `FR · EN` est mal positionné et le bouton tel flottant `.float-call` (bulle bleue à droite) le recouvre. Visible sur la page index et les pages avec mobile-overlay (cas clients, services, blog, agences).

Diagnostic :

1. **Mobile-lang-switch dans le flux normal du DOM** : mon script `fr_switcher_patch.py` injectait le switcher avant `<div class="mobile-overlay-footer">` dans le DOM, mais le footer est en `position:absolute; bottom:32px;`. Du coup le switcher était dans le flux centré du `display:flex; justify-content:center;` du mobile-overlay, alors que le footer est ancré en bas. Les deux ne sont jamais alignés correctement, et le switcher peut se retrouver sous le `.mobile-overlay-links` sans alignement vertical garanti par rapport au footer.

2. **`.float-call` (bouton tel flottant) reste affiché par-dessus le mobile-overlay** : ce bouton est en `position:fixed; bottom:24px; right:24px; z-index:50;` et pas de règle `body.menu-open .float-call { display:none }` n'était présente. Du coup quand le menu burger est ouvert, le bouton tel flottant recouvre le coin droit de l'écran, masquant la moitié droite du switcher (le `EN` notamment).

### Fix appliqué

CSS du `mobile-lang-switch` repositionné en `position:absolute` ancré au-dessus du footer :

```css
.mobile-lang-switch{
  position:absolute;
  bottom:80px;       /* footer est à bottom:32px, switcher au-dessus avec marge */
  left:0; right:0;
  display:flex;
  justify-content:center;
  align-items:center;
  gap:14px;
  padding:14px 32px 0;
  border-top:1px solid rgba(255,255,255,.1);
  font-size:14px;
  font-weight:600;
  letter-spacing:.04em;
}
body.menu-open .float-call{display:none!important}
```

Le `padding-top` reste pour conserver la séparation visuelle (la border-top fait office de filet de séparation au-dessus du switcher). Le `margin` initial est retiré car inutile en `position:absolute`.

La règle `body.menu-open .float-call{display:none!important}` est ajoutée systématiquement (même sur les pages sans `.float-call`, où elle est sans effet — coût zéro).

### Pages patchées

- **35 pages FR** (toutes celles avec `mobile-lang-switch` injecté lors de la session principale) — patches appliqués sur le CSS via `fix_mobile_lang_switch.py`
- **13 pages EN avec `.float-call`** (4k-video-recording, b2b-event-filming-provider, conference-seminar-filming, corporate-event-filming, corporate-live-show, corporate-video-production, event-live-streaming, event-video-production, index, interview-roundtable-filming, multi-platform-streaming, multi-site-live-streaming, quote-live-streaming-paris) — règle `body.menu-open .float-call` ajoutée via `fix_en_float_call.py`. Note : les pages EN services n'avaient pas de `mobile-lang-switch` à corriger (le `lang-switch` desktop est dans `nav-links` qui est cachée en mobile, donc pas de switcher visible en mobile sur ces pages — limitation connue à corriger dans une itération future).

### Fichiers livrés (hotfix)

- `nomacast-fr-pages-patched.zip` (434 KB, 35 fichiers HTML) — re-livré avec le fix CSS appliqué. À déposer à la racine `G:\Mon Drive\NOMACAST\` (écrase la version précédente de la session du jour).
- `nomacast-en-pages-fix-floatcall.zip` (179 KB, 13 fichiers HTML) — pages EN avec ajout de la règle `body.menu-open .float-call`. À déposer dans `G:\Mon Drive\NOMACAST\en\` (écrase les versions précédentes).

### Limitation résiduelle (à traiter dans une itération future)

Sur les pages EN services hub (10 pages : `4k-video-recording`, `b2b-event-filming-provider`, `conference-seminar-filming`, `corporate-event-filming`, `corporate-live-show`, `corporate-video-production`, `event-live-streaming`, `event-video-production`, `interview-roundtable-filming`, `multi-platform-streaming`, `multi-site-live-streaming`), il n'y a pas de switcher dans le mobile-overlay. Le `lang-switch` est uniquement dans `<ul class="nav-links">` qui est cachée en mobile. L'utilisateur EN sur mobile ne peut pas revenir au FR depuis le menu burger.

À corriger : injecter un `mobile-lang-switch` côté EN dans le mobile-overlay-links avec le même CSS `position:absolute; bottom:80px;` + règle `body.menu-open .float-call`. Pas critique tant que l'utilisateur peut switcher depuis desktop ou qu'il arrive directement sur la version EN via Google.

### Scripts conservés

- `fix_mobile_lang_switch.py` (35 pages FR + détection EN avec ancien CSS)
- `fix_en_float_call.py` (13 pages EN avec float-call)


## 2026-05-08, Chantier bilingue FR/EN — finalisation : Devis 7/7, Services 9/11 restants, patches FR 35/35, sitemap

### Contexte

Suite directe de la session 2026-05-07 où Lot 1 + Lot 2 + 2 services hub avaient été livrés. Cette session boucle le chantier bilingue : tous les contenus EN sont produits, et toutes les pages FR existantes reçoivent désormais le switcher de langue + les balises `hreflang`. Le sitemap est régénéré en version bilingue. Reste après cette session : déploiement, tests live, soumission Search Console.

Total livré sur cette session : **9 pages services EN** (finalisation Lot 3) + **7 pages devis EN** + **35 pages FR patchées** (hreflang + switcher) + **1 sitemap.xml bilingue**.

### Lot Devis — 7/7 livrés

Toutes les landing pages de demande de devis traduites en EN. Workflow optimisé : la première page (`quote-conference-seminar-filming`) sert de template, les suivantes sont produites par copie + patches ciblés sur les éléments thématiques (head meta, hero, USP card, process step, price card title, FAQ, source value du formulaire, GA4 phone_location).

Pages livrées :

- **`quote-conference-seminar-filming.html`** — Conférence & séminaire (template de référence)
- **`quote-event-filming.html`** — Captation événement entreprise. USP focus livraison le jour même, FAQ adaptée (coût, déplacement Europe, last-minute, redondance internet, agences)
- **`quote-interview-roundtable-filming.html`** — Interview & table ronde. Multi-caméras 4K, son HF cravate par intervenant, social cuts. FAQ : tarif, nombre d'intervenants simultanés, son individualisé, social cuts
- **`quote-4k-filming.html`** — Captation 4K. USP renommé "3 Canon CR-N500 native 4K cameras". FAQ : coût, différence Full HD vs 4K, rushes camera-by-camera, live en 4K
- **`quote-event-live-streaming.html`** — Live streaming événement. 2 USP changées (15 ans broadcast + dedicated 5G + redundancy), 2 process steps changées (2-hour setup + tests, Live broadcast). FAQ : coût, plateformes supportées, nombre de viewers, redondance
- **`quote-corporate-live-show.html`** — Émission live corporate. 2 USP (Broadcast art direction + Set & graphics turnkey), 3 process steps (Running order & graphics, Set installation, Broadcast direction). FAQ : différence avec captation classique, tarif, animateur pro, délai préparation
- **`quote-live-streaming-paris.html`** — Landing local Paris. Structure différente (page hub avec page-hero-grid, sections section-off / section-light, KPIs, sidebar avec price-card + incl-card, 4 FAQ Paris-spécifiques). Traduction full du contenu unique : breadcrumb, h1, KPIs labels, références parisiennes, 4 FAQ (déplacement IDF, last-minute, références Paris, délai réponse)

Tous les formulaires devis EN ont reçu :
- `<input type="hidden" name="lang" value="en">` pour que `envoyer.php.js` détecte la langue
- `action="../envoyer.php"` (chemin relatif depuis `/en/`)
- `source` value adapté par page : `LP {theme} (hero)` et `LP {theme} (bottom)`
- GA4 `phone_location` adapté (ex. `'phone_location': 'quote-event-filming'`)

### Lot 3 — Services finalisé (11/11)

Audit en début de session : 8 pages services étaient déjà en EN après les sessions précédentes (résumé de compaction sous-estimait l'avancement). Restaient 3 pages avec résidus FR uniquement dans le head meta + JSON-LD + footer minimaliste.

Pages corrigées :

- **`corporate-video-production.html`** — Title FR + meta description FR + og + JSON-LD breadcrumb position-2 FR + JSON-LD FAQPage 4 questions FR + Twitter card FR + footer minimaliste FR (Mentions légales, Confidentialité, Plan du site → Legal notice, Privacy, Sitemap). Note : cette page est une landing simplifiée avec footer 3-liens court, pas le footer 4-cols principal.
- **`multi-platform-streaming.html`** — Title FR ("Streaming multi-plateformes simultané") + og:title FR + twitter:title FR + JSON-LD Article headline FR. La meta description était déjà en EN.
- **`corporate-live-show.html`** — Meta description + og:description + twitter:description encore en FR (production d'émissions live corporate, plateau TV, habillage charte, intervenants distants, multi-plateformes, dès 1 500 € HT). Title déjà EN. Le reste de la page (FAQ, hero, approche, sidebar) déjà traduit.

Audit final post-correction : zéro résidu FR sur les 11 pages services EN. Recherche regex sur termes FR caractéristiques (`Captation`, `Émission`, `Plateau`, `Prestataire`, `Régie`, `Devis sous`, `Notre approche`, `Filmez-vous`, `Pouvez-vous`, etc.) : aucun match.

### Patches FR — 35/35 pages traitées

Toutes les pages FR existantes reçoivent désormais :

1. **3 balises hreflang** : `fr` / `en` / `x-default` (FR par défaut)
2. **`<meta property="og:locale:alternate" content="en_GB">`** ajouté après `og:locale="fr_FR"`
3. **CSS du switcher** injecté avant `</style>` (variant adapté au type de page)
4. **Switcher `FR · EN`** dans la nav (variant HTML adapté à la structure de chaque page)
5. **Switcher mobile** dans le mobile-overlay (quand présent)
6. **Timestamp `<!-- Last update: ... -->`** rafraîchi

Quatre patterns de switcher selon la structure de la nav :

- **`.lang-switch`** (variant principal) — 24 pages avec `<ul class="nav-links">` : services, cas clients, blog, index, agences, tarifs, cas-clients hub, blog hub. Position : dernier `<li>` de `nav-links`. Affiché en desktop, masqué en mobile (overlay prend le relais avec `.mobile-lang-switch`).
- **`.devis-lang-switch`** — 7 pages devis (header simplifié, pas de nav-links). Position : avant le `<a class="tel-link">` dans `.header-actions`. Couleurs sombres (header sur fond clair).
- **`.landing-lang-switch`** — 2 landings simplifiées (`captation-video-corporate`, `captation-evenement-entreprise`). Position : avant `<a class="nav-tel">` dans `.nav-right`.
- **`.lang-switch` light** — 3 pages légales (`mentions-legales`, `politique-de-confidentialite`, `plan-du-site`). Position : avant `<a class="nav-back">`.
- **`.merci-lang-switch`** — `merci.html` uniquement. Position : avant `.btn-home`.

Trois scripts Python orchestrent les patches :
- **`fr_switcher_patch.py`** — pages standard avec `<ul class="nav-links">`. Pattern flexible pour matcher avec ou sans `id="nav-links"`.
- **`devis_lang_patch.py`** — pages devis (7).
- **`landing_lang_patch.py`** — landings simplifiées (2).
- **`legal_lang_patch.py`** — légales + tarifs (4 + 1).

Tous les scripts sont **idempotents** : si la page contient déjà `class="lang-switch"` ou similaire, le patch est skipped. Permet de relancer plusieurs fois sans dégât.

### Pages exclues du switcher (volontairement)

- **`404.html`** — Pas de canonical, pas de switcher : la page d'erreur est servie sur n'importe quel chemin invalide, on ne peut pas lui assigner d'alternate. Une seule version 404 unifiée FR/EN minimaliste.

### Sitemap.xml bilingue régénéré

Sitemap intégralement reconstruit avec balises `<xhtml:link rel="alternate" hreflang>` pour chaque URL (recommandation Google pour les sites multilingues).

Caractéristiques :
- **56 URLs au total** : 28 FR + 28 EN
- Chaque URL déclare ses 3 alternates (`fr`, `en`, `x-default`) — convention Google pour signaler les versions de langue à l'indexation
- Namespace `xmlns:xhtml="http://www.w3.org/1999/xhtml"` ajouté au `<urlset>`
- Lastmod mis à jour à `2026-05-08` pour les 28 pages modifiées cette session (cas clients gardent `2026-04-29` car contenus inchangés, juste hreflang ajouté)
- Priorités conservées du sitemap précédent (1.0 index, 0.9 services hub + landings, 0.8 services guides + ads, 0.7 cas clients + blog hub, 0.6 article blog, 0.4 plan-du-site, 0.3 confidentialité, 0.2 mentions légales)
- Changefreq conservés (`monthly` pour la plupart, `weekly` pour blog hub, `yearly` pour cas clients et légales)

Pages **exclues** du sitemap (volontairement noindex, non répertoriées) :
- `404.html` (page d'erreur)
- `merci.html` / `en/thank-you.html` (pages de confirmation post-formulaire, noindex)
- `devis-*` sauf `devis-live-streaming-paris` (les 6 autres landings devis sont noindex car spécifiques à des thématiques précises avec nombreux mots-clés ciblés, on ne veut pas concurrencer les pages services hub canoniques)

Script générateur `build_sitemap.py` conservé pour régénération facile à chaque ajout de page.

### Fichiers livrés (cette session)

**Pages EN — Lot 3 services finalisation (3 fichiers)** :
- `en/corporate-video-production.html`
- `en/multi-platform-streaming.html`
- `en/corporate-live-show.html`

**Pages EN — Lot Devis (7 fichiers)** :
- `en/quote-conference-seminar-filming.html`
- `en/quote-event-filming.html`
- `en/quote-interview-roundtable-filming.html`
- `en/quote-4k-filming.html`
- `en/quote-event-live-streaming.html`
- `en/quote-corporate-live-show.html`
- `en/quote-live-streaming-paris.html`

**Pages FR — Switcher + hreflang (35 fichiers, ZIP)** :
- `nomacast-fr-pages-patched.zip` (434 KB) : toutes les pages FR du site sauf `404.html`. À déposer à la racine `G:\Mon Drive\NOMACAST\` (écrase les pages FR existantes).

**Sitemap** :
- `sitemap.xml` (bilingue, 56 URLs avec hreflang). À déposer à la racine du site.

**Scripts Python** (`/home/claude/work/`, conservés pour future régénération) :
- `fr_switcher_patch.py`
- `devis_lang_patch.py`
- `landing_lang_patch.py`
- `legal_lang_patch.py`
- `build_sitemap.py`

### Tâches restantes (post-cette-session)

1. **Déployer** les 35 pages FR + 10 pages EN nouvelles + sitemap.xml sur Cloudflare Pages (push sur `main`, l'Apps Script Drive→GitHub fait le reste)
2. **Tests live** : naviguer sur 5-6 pages FR pour vérifier que le switcher s'affiche bien, qu'il pointe vers la bonne page EN, que le retour FR fonctionne
3. **Test du formulaire EN** sur 1 page devis EN : soumettre, vérifier que l'email reçu est bien en EN (le hidden field `lang=en` doit déclencher le rendu EN dans `envoyer.php.js`)
4. **Search Console** : soumettre le nouveau sitemap.xml sur https://search.google.com/search-console/sitemaps. Attendre quelques jours puis vérifier dans "Pages > Pages indexed" que les 28 URLs EN sont bien crawlées
5. **Rich Results Test** sur 2-3 pages EN pour valider que le JSON-LD Service / FAQPage / BreadcrumbList est bien lu (https://search.google.com/test/rich-results)
6. **Test hreflang** sur https://www.merkle.com/uk/products/technology/hreflang-tags-testing-tool ou Screaming Frog pour s'assurer que les balises sont cohérentes côté FR et EN

### Métriques chantier bilingue (récap global)

- **Pages EN livrées** : 44 fichiers (7 core + 9 cas clients + 2 blog + 7 devis + 11 services + 3 légal + 5 légal-style)
- **Pages FR modifiées** : 35 fichiers (switcher + hreflang)
- **Mots traduits estimés** : ≈ 80 000 mots EN (plus de 200 sections de contenu)
- **Glossaire métier** : 35+ termes FR→EN documentés dans `docs/GLOSSAIRE-FR-EN.md`
- **Mapping slugs** : 37 entrées FR→EN documentées dans `docs/MAPPING-SLUGS.md`
- **Scripts Python conservés** : 8 (case_transform, service_transform, service_common_translate, fr_switcher_patch, devis_lang_patch, landing_lang_patch, legal_lang_patch, build_sitemap)
- **Durée chantier** : 2 sessions (2026-05-07 et 2026-05-08)


## 2026-05-07, Chantier bilingue FR/EN — Lot 1 (core), Lot 2 (cas clients), Lot 3 partiel (services)

### Contexte

Lancement d'une version anglaise complète du site `nomacast.fr` pour adresser le marché B2B européen (UK, Belgique, Allemagne, Espagne, Pays-Bas). Anglais britannique cible (filming, colour, optimise, organisation). Architecture choisie : **sous-répertoire `/en/`** au lieu d'un sous-domaine, pour rester sur le même domaine et bénéficier du SEO existant.

37 pages HTML totales sur le site. Cette session livre 16 pages EN + 4 pages FR modifiées + 1 Pages Function patchée.

### Architecture bilingue : décisions actées

- **Structure URL** : `/en/{slug-en}.html` côté EN, `/{slug-fr}.html` côté FR (root inchangé)
- **Slugs traduits** pour le SEO : `case-louvre-lahorde` ↔ `cas-client-louvre-lahorde`, `pricing` ↔ `tarifs`, `conference-seminar-filming` ↔ `captation-conference-seminaire`, etc. Mapping complet maintenu dans `docs/MAPPING-SLUGS.md` (37 entrées)
- **hreflang** sur toutes les pages : `<link rel="alternate" hreflang="fr">`, `<link rel="alternate" hreflang="en">`, `<link rel="alternate" hreflang="x-default" href="…fr…">` (FR par défaut)
- **og:locale** + **og:locale:alternate** pour les social cards (en_GB / fr_FR)
- **Switcher de langue discret dans la nav** : `FR · EN`. Desktop intégré dans `.nav-links` à la fin. Mobile : intégré dans `.mobile-overlay` en `position:absolute; bottom:76px` (au-dessus du tel/email du footer) après itération QA
- **IDs HTML FR conservés** côté EN (`#offre`, `#cas-clients`, `#agences`, `#apropos`) — décision actée après push-back du QA. Raison : le CSS partage les mêmes IDs entre les deux versions, traduire les IDs imposerait de dupliquer toutes les feuilles de style, source de drift à long terme. Convention multilingue standard (Apple, Stripe). Côté SEO, Google ne valorise pas les fragments. Les `<h2>` visibles sont traduits, eux.
- **Anchor "Agencies" desktop vs mobile** : desktop pointe vers `#agences` (teaser dans home), mobile vers `partner-agencies.html` (page dédiée). Identique au FR, choix UX volontaire (le scroll-into-view + fermeture overlay mobile fait un saut visuel pas terrible, donc on bascule sur la page dédiée).

### Glossaire FR → EN clé (lexique métier)

Référentiel maintenu dans `docs/GLOSSAIRE-FR-EN.md`. Termes principaux :

- **Tournage vidéo / Captation** → `filming` ou `video filming`
- **Vidéaste événementiel** → `event videographer`
- **Régie** → `production gallery` / `gallery`
- **Devis** → `Quote` ; **HT** → `(excl. VAT)` ; **TTC** → `(incl. VAT)`
- **Marque blanche** → `white-label` ; **Clé en main** → `turnkey` ; **Sur-mesure** → `bespoke`
- **Repérage** → `site survey` ; **Mise en place J-1** → `day-before setup`
- **Plateau** → `set` ou `rig` ; **Cadreur** → `camera operator`
- **Plan du site** → `Sitemap` ; **Mentions légales** → `Legal notice` ; **Politique de confidentialité** → `Privacy policy`
- **Demande de devis** → `Quote request` ; **Fil d'Ariane** → `Breadcrumb`
- **Prestations** → `Services` ; **Cas clients** → `Case studies` ; **Tarifs** → `Pricing`
- **Devis sous 24h** → `Quote in 24h`
- **L'essentiel / Contexte / Défi / Solution / Résultat** → `In brief / Context / Challenge / Solution / Outcome`
- **Le contexte / Les contraintes / Le dispositif / Le déroulé / Résultats / Ce que j'en retiens** → `Context / Constraints / The setup / How it ran / Results / What I take away`

**Termes NON traduits** (préservés en FR) : noms propres (Brainsonic, Peech Studio, GL Events, Havas Event, Plissken, Livee, Ekoss), lieux historiques ((LA)HORDE × Louvre, Comédie-Française, Morning, Stratégies, Théâtre à la table), noms techniques de produits (vMix, NDI, Canon CR-N500).

### Format devise UK appliqué côté EN

Convention typographique britannique : symbole `€` **avant** le montant. Exemples : `€1,500`, `−€150`, `+ €500`. Implémentation dans `pricing.html` :

- Nouvelle fonction JS `eur(n) = "€" + fmt(n)` ajoutée à côté du `fmt` existant
- Tous les `fmt(...) + " €"` du configurateur remplacés par `eur(...)` : card prices, summary lines, partner discount, addon rows, bestof/photographe, savings banner, options price, hidden form fields (`h-cfg-options`, `h-cfg-addons`, `h-cfg-total`), recap text envoyé en email
- HTML statique du total également mis à jour : `<span id="total-num">€1,500</span>` au lieu de `<span id="total-num">1,500</span> €` (idem `mobile-total`)
- `Math.round(n).toLocaleString("en-GB")` pour le formatage des milliers (virgule UK : `1,500` au lieu de `1 500`)

### Pages Function `envoyer.php.js` : patch multilingue

L'endpoint Cloudflare Pages Function (`functions/envoyer.php.js`) qui gère les soumissions de formulaires a été patché pour supporter la langue. Détails :

- **Détection de langue** via champ caché `<input type="hidden" name="lang" value="en">` injecté dans tous les formulaires des pages EN. Côté JS : `const isEn = formData.get("lang") === "en"`.
- **4 constantes de redirection** dérivées : `PAGE_MERCI_FR`, `PAGE_MERCI_EN`, `PAGE_ERREUR_FR`, `PAGE_ERREUR_EN`. Sélection ternaire selon `isEn`.
- **Préfixe `[EN]`** ajouté au sujet d'email côté admin (`evenement@nomacast.fr`) pour identifier rapidement la langue d'origine.
- **Ligne "Language : English"** ajoutée dans le corps du mail si EN.
- **Templates de réponse à l'expéditeur** : versions FR et EN distinctes (signature, tagline, formules de politesse).
- Routing inchangé côté Cloudflare Pages : la fonction matche le path `/envoyer.php` qu'elle vienne de FR (`action="envoyer.php"`) ou de EN (`action="../envoyer.php"`) — Cloudflare normalise.

Testé en live sur `index.html` EN et `pricing.html` EN. Email reçu correctement formaté, redirection vers `/en/thank-you.html` validée.

### Lot 1 — Pages core (livré, validé, testé en live)

**Pages EN créées (7) :**
- `en/index.html` — homepage complète, avec switcher mobile en `position:absolute; bottom:76px`
- `en/pricing.html` — configurateur tarifs avec format `€1,500` et fonction `eur()`
- `en/404.html` — unifié FR/EN (auto-detect via `navigator.language` → switch contenu, pas de page séparée)
- `en/thank-you.html` — page merci post-formulaire, ton `Request received!` (vs `.`)
- `en/legal-notice.html` — mentions légales (SIRET, RGPD, Cloudflare/LWS hosting)
- `en/privacy-policy.html` — RGPD UK + cookies (Turnstile, GTM)
- `en/sitemap.html` — sitemap visuel des pages EN

**Pages FR modifiées (3) :**
- `index.html` (FR) — ajout switcher desktop + mobile, hreflang, faute corrigée `Partie Socialiste` → `Parti Socialiste`
- `tarifs.html` — switcher + hreflang
- `404.html` — switcher + hreflang + auto-detect langue

**Infrastructure :**
- `functions/envoyer.php.js` — patch multilingue (détaillé section précédente)

### Lot 2 — Cas clients (livré complet : 9/9)

Toutes les pages cas clients existantes traduites :

- `en/partner-agencies.html` — page agences partenaires (page hub B2B, structure complète)
- `en/case-studies.html` — index des cas clients avec 3 JSON-LD (CollectionPage + BreadcrumbList) en EN
- `en/case-louvre-lahorde.html` — Musée du Louvre × (LA)HORDE (13 caméras, 46 iPhones, 2,3M vues)
- `en/case-comedie-francaise.html` — Théâtre à la table + Molière live YouTube
- `en/case-figma-conference.html` — Customer Evenings Paris/Madrid/Barcelona depuis 2022
- `en/case-gl-events.html` — Global Industrie 6 chaînes broadcast, 8 régies vMix, 4 jours
- `en/case-johnson-johnson.html` — multiplex bidirectionnel 6 villes (Paris + 5 régions)
- `en/case-digital-benchmark-berlin.html` — EBG 850+ décideurs, 9 saisons, 3 éditions internationales
- `en/case-morning.html` — 300+ captations en 8 ans, marque blanche

Chaque cas client : title + meta desc + 3 JSON-LD (Article + BreadcrumbList + parfois autres) + hero + tldr (4 items) + sections narratives + CTA + footer-links — tout traduit, slugs internes pointent vers les versions EN.

Script Python `case_transform.py` créé pour automatiser le boilerplate commun (head, JSON-LD URLs, nav, footer, switcher CSS, slugs, hreflang). Le contenu narratif unique de chaque cas a été traduit manuellement.

### Lot 3 partiel — Services (2/11 livrés)

- `en/conference-seminar-filming.html` — page hub services (700+ lignes, structure complète : nav, prest-cards, two-col approche, sidebar price-card + incl-card, déroulé 6 étapes, FAQ visible 8 Q/A, form contact complet, footer-links 9 entrées)
- `en/corporate-event-filming.html` — landing SEO simplifiée (hero KPIs + form intégré, prestation + price-block, déroulé 6, proof-grid 3 témoignages, FAQ visible 8, CTA band)

Constat important sur les pages services : **structure HTML hétérogène entre les pages**. Certaines (`conference-seminar-filming`) sont des pages hubs avec nav-links complète + mobile-overlay + footer riche. D'autres (`corporate-event-filming`) sont des landings SEO simplifiées avec nav minimaliste + footer minimaliste + form intégré au hero. Conséquence : le script `service_transform.py` automatise une bonne partie mais chaque page nécessite une passe manuelle ciblée selon sa structure.

**Reste à faire (9 services) :**
- `corporate-video-production.html` ← `captation-video-corporate.html`
- `interview-roundtable-filming.html` ← `captation-interview-table-ronde.html`
- `4k-video-recording.html` ← `captation-4k.html`
- `event-video-production.html` ← `captation-video-evenement.html`
- `event-live-streaming.html` ← `live-streaming-evenement.html`
- `multi-site-live-streaming.html` ← `streaming-multiplex-multi-sites.html`
- `multi-platform-streaming.html` ← `streaming-multi-plateformes.html`
- `corporate-live-show.html` ← `emission-live-corporate.html`
- `b2b-event-filming-provider.html` ← `prestataire-captation-evenement.html`

### Fixes QA itérés en cours de chantier

Itération QA appliquée sur Lot 1 + Lot 2 (5 fichiers retouchés) :

**`en/index.html`**
- Switcher mobile repositionné en `position:absolute; bottom:76px; left:0; right:0;` (était centré avec les liens menu, maintenant juste au-dessus de tel/email du footer absolu)
- `/index.html` → `/` côté lien switcher FR (URL canonique propre)
- `want a price right away?` → `Want a price right away?` (capitalisation post-CTA hero)
- Faute `Partie Socialiste` → `Parti Socialiste` corrigée dans `SITE_DATA`

**`en/pricing.html`**
- Devise format UK : nouvelle fonction `eur(n)` qui préfixe `€`. Tous les usages `fmt(X) + " €"` remplacés par `eur(X)`. HTML statique total/mobile-total mis à jour.
- Emoji 💬 ajouté au début du `project-nudge` (manquait par rapport au FR)

**`en/privacy-policy.html`**
- 2 JSON-LD entièrement traduits en EN (`Privacy policy`, `Home`, `inLanguage:"en-GB"`, URLs `/en/`) — étaient restés en FR

**`en/thank-you.html`**
- `Request received!` + `Agency request received!` (avec `!`, ton plus chaleureux UK English en confirmation)

**`index.html` (FR)** : faute `Parti Socialiste` corrigée aussi côté FR

### Push-back QA (refus motivés)

Deux remontées QA non appliquées avec justification :

1. **Traduire les IDs HTML** (`#offre` → `#services`, `#cas-clients` → `#case-studies`) : refusé. Risque CSS sur les deux versions, pas d'impact SEO réel (Google ne valorise pas les fragments). Convention multilingue standard.
2. **Uniformiser la nav "Agencies" desktop/mobile** : refusé. Le comportement actuel (desktop=ancre teaser, mobile=page dédiée) est identique au FR, choix UX volontaire.

### Documentation produite

- `docs/GLOSSAIRE-FR-EN.md` — glossaire métier complet
- `docs/MAPPING-SLUGS.md` — mapping FR ↔ EN des 37 slugs
- `docs/SWITCHER-COMPONENT.md` — composant switcher (CSS + HTML desktop + mobile)
- `docs/PATCH-envoyer-php.md` — détail du patch Pages Function

### Outils créés

- `case_transform.py` — script Python automatise le boilerplate commun aux pages cas clients (head, JSON-LD URLs, nav, footer, switcher, slugs, hreflang, tel international)
- `service_transform.py` — variante adaptée aux pages services (active sur Services au lieu de Case studies, traduction "Appeler" → "Call" sur tel mobile et float-call, footer-col Prestations → Services)

### Décisions techniques actées

- **Pas de sous-domaine `en.nomacast.fr`** : sous-répertoire `/en/` privilégié pour rester sur le même domaine, garder le SEO existant et simplifier la config DNS/Cloudflare.
- **x-default = FR** dans hreflang : convention pour un site dont la version par défaut est en français.
- **Form action `../envoyer.php`** depuis les pages EN (path relatif depuis `/en/` vers la racine où la Pages Function est mappée).
- **Champ `<input type="hidden" name="lang" value="en">`** systématiquement injecté dans tous les formulaires EN — c'est le seul mécanisme fiable de détection côté Pages Function (l'inspection du Referer header est trop fragile).
- **Tous les chemins d'images relatifs** depuis `/en/` : `../images/...` (et non `/images/...` qui casse en preview Cloudflare).
- **Convention de date EN** : format ISO court `15 September 2022` (UK) au lieu de `September 15, 2022` (US).
- **Slugs EN sémantiques** : SEO-friendly (`case-louvre-lahorde`, `conference-seminar-filming`) et descriptifs (mots-clés métier dans l'URL).
- **Pages déjà existantes en EN à l'arrivée du chantier** : aucune. Tout a été créé from scratch à partir des sources FR.

### Tâches finales restantes (hors lot 3 services)

À traiter une fois Lot 3 services terminé :

- **7 pages devis** (`quote-*.html`) : structures très répétitives, automatisable en bonne partie. ~1363 lignes par page (sauf `quote-live-streaming-paris` à 676 lignes).
- **2 pages blog** (`blog.html` + `blog-hybrid-agm-in-person-remote.html`).
- **Application du switcher + hreflang sur les ~35 pages FR existantes** non encore touchées (script-able via une variante des transforms).
- **`sitemap.xml`** : ajouter toutes les URLs FR + EN avec balises `<xhtml:link rel="alternate" hreflang>` pour chaque pair de pages.
- **Soumission du sitemap mis à jour à Google Search Console**.

### Fichiers livrés (cette session)

**Lot 1 :**
- `en/index.html`, `en/pricing.html`, `en/404.html`, `en/thank-you.html`, `en/legal-notice.html`, `en/privacy-policy.html`, `en/sitemap.html`
- `index.html` (FR modifié), `tarifs.html` (FR modifié), `404.html` (unifié)
- `functions/envoyer.php.js`

**Lot 2 :**
- `en/partner-agencies.html`, `en/case-studies.html`
- `en/case-louvre-lahorde.html`, `en/case-comedie-francaise.html`, `en/case-figma-conference.html`, `en/case-gl-events.html`, `en/case-johnson-johnson.html`, `en/case-digital-benchmark-berlin.html`, `en/case-morning.html`

**Lot 3 (partiel) :**
- `en/conference-seminar-filming.html`, `en/corporate-event-filming.html`

**Documentation :**
- `docs/GLOSSAIRE-FR-EN.md`, `docs/MAPPING-SLUGS.md`, `docs/SWITCHER-COMPONENT.md`, `docs/PATCH-envoyer-php.md`

Tous les fichiers HTML EN ont le DOCTYPE `<!-- Last update: 2026-05-07 23:55 -->`.

### Tests à faire post-déploiement

- `https://nomacast.fr/en/` → page accueil EN, switcher fonctionnel, langue alternée si on clique FR
- `https://nomacast.fr/en/pricing.html` → format `€1,500`, configurateur opérationnel, soumission form → mail [EN] reçu
- Mobile : ouvrir `/en/` → hamburger → switcher juste au-dessus du tel/email
- `https://nomacast.fr/en/case-louvre-lahorde.html` → vidéo background, JSON-LD valide via Rich Results Test, breadcrumb EN
- Google Search Console : vérifier indexation EN après quelques jours

---

## 2026-05-07, Add-on Photographe + bandeau "Vue technique" repositionné dans le simulateur tarifs

### Contexte

Deux évolutions sur `tarifs.html` :

1. Ajout d'une troisième prestation post-événement (Photographe événementiel) dans la Step 04, aux côtés du Best-of monté et des Interviews post-événement.
2. Repositionnement et redesign du toggle "Vue technique" : il était discret, planqué en bas du bloc "Inclus dans tous les forfaits" en Step 02. Devenu un bandeau CTA dédié entre Step 02 et Step 03, avec icône, titre, description et toggle. Beaucoup plus visible pour les visiteurs qui veulent voir le matériel détaillé.

### Add-on Photographe : modifications appliquées

- **Card HTML** ajoutée dans la grille `.addons-grid` de la Step 04 (après la card Interviews).
- **State** : `state.addons.photographe = false` ajouté à l'objet d'état initial.
- **Tarif** : grille par durée dans `ADDON_PRICES.photographe` = `{ half: 1150, full: 1150, "2days": 1750, "3days": 2350 }`. Logique : 1 150 €/jour, +600 € par jour additionnel. Pas de tarif spécifique demi-journée (aligné sur Best-of : `half = full`).
- **Vue technique** (`ADDON_MATERIEL.photographe`) : `1× Canon EOS 5D Mark IV ou équivalent`, `3× objectifs`, `Édition`, `Livraison J+1/J+2 via weblink de 100+ photographies`. Visible uniquement quand l'add-on est coché ET la Vue technique active (même comportement que les deux autres add-ons).
- **Compute** : nouvelle branche dans `compute()` pour ajouter le prix au total après la mécanique partenaire (pas de remise sur cette ligne, comme pour les autres add-ons).
- **buildAddons()** : photographe ajouté dans le `forEach`. Le tracking GA4 a été refactoré en map `addonLabels` + lookup générique sur `ADDON_PRICES` pour éviter d'empiler des ternaires à chaque nouvel add-on.
- **render()** : mise à jour dynamique du prix affiché dans la card selon la durée sélectionnée (même mécanique que Best-of).

### Bandeau "Vue technique" : modifications appliquées

- **HTML** : le `<label class="tech-switch">` retiré du bas de l'`included-block` en Step 02. Remplacé par un `<label class="tech-banner">` inséré comme 3e enfant de `.steps`, entre Step 02 et Step 03. Variante retenue après itération visuelle : **dark inversé, sans icône**. Le bandeau contient un titre `Voir le matériel inclus`, une description (`Micros, trépieds, ordinateur, câblage… le matériel technique prévu pour chaque partie du dispositif.`), et le toggle slider à droite.
- **Input** : conserve `id="tech-switch"` pour ne pas casser les références JS existantes (`setTechMode()`, listener `change`, auto-activation en mode agence).
- **Bloc `tech-base-details`** : reste à sa place dans Step 02 sous l'`included-block` (matériel régie + éclairage de base). Le toggle global continue de le révéler/masquer comme avant. UX : quand on active le bandeau, le matériel régie apparaît dans Step 02 au-dessus, et le matériel par option apparaît dans Step 03/04 en dessous. Cohérent.
- **CSS** : nouveau bloc `.tech-banner.*` avec background slate dark (`linear-gradient(135deg, #1a2332, #0f1825)`), bordure cyan fine (`rgba(14,165,233,.3)` qui passe à `var(--cyan)` en mode actif), glow radial cyan en haut-gauche via `::before`, titre blanc, description blanc 62% opacity, slider blanc 18% qui passe au cyan en mode actif. L'ancien bloc `.tech-switch.*` retiré (mort). Les rules `.tech-base-title` et `.tech-base-list` conservées (utilisées par `tech-base-details`).
- **Animation chain** : `.steps` a désormais 5 enfants (Step 01, Step 02, bandeau, Step 03, Step 04). Les delays `:nth-child` ont été décalés en conséquence : le bandeau hérite de `.16s` via la rule `.tech-banner`, Step 03 passe à `.24s` (nth-child(4)), Step 04 à `.32s` (nth-child(5)). L'ancien rule mort `.step:nth-child(3)` retiré.
- **JS `setTechMode()`** : ajout du toggle de la classe `.active` sur `#tech-banner-label` pour le feedback visuel (bordure cyan saturée + slider cyan). Le reste du comportement (auto-activation en mode agence, persistance du tech-mode sur body) inchangé.

### Décisions techniques actées

- Add-ons post-événement : trois prestations distinctes (Best-of monté, Interviews post-événement, Photographe événementiel). Chaque add-on est calculé en dehors de la mécanique partenaire (pas de remise grille A, pas de charm, pas d'absorption). Tarif fixe ajouté au total final.
- Tarif photographe : 1 150 €/jour, +600 €/jour additionnel. Le tarif demi-journée n'est pas distinct du tarif jour entier (aligné sur la logique Best-of, parce que la prestation et le livrable sont les mêmes : 100+ photos éditées, livraison J+1/J+2).
- Refactor du tracking GA4 dans `buildAddons()` : map `addonLabels` + lookup `ADDON_PRICES[addonId]` au lieu de ternaires en cascade. À reproduire pour tout futur add-on (4ème, 5ème, etc.) sans toucher à la structure.
- Toggle "Vue technique" : positionné en bandeau CTA entre Step 02 et Step 03, pas dans un step-header. Choix UX : ce n'est pas une option configurable (qui modifie le devis), c'est un mode d'affichage global du matériel détaillé. Lui donner sa propre carte visuelle entre les sections de configuration le rend visible immédiatement sans le confondre avec les options techniques. L'option A "switch dans le step-header de Step 03" et l'option C "double placement avec hint" ont été écartées.
- Bandeau "Vue technique" : design dark inversé sans icône. Sur une page blanche avec déjà des accents cyan partout (CTA "Recevoir mon devis", duration cards actives, options actives), un 3e élément cyan diluerait la hiérarchie visuelle. Le dark crée un point focal par contraste et renforce le côté "outil de pro" aligné avec le positionnement Nomacast. L'icône a été retirée parce que le contraste de couleur fait déjà tout le travail de signal sur 5 éléments empilés, et que le texte "Voir le matériel inclus" porte tout le sens.
- L'`id="tech-switch"` de l'input est conservé : tout le JS existant (`setTechMode`, listener `change`, auto-activation agence) continue de fonctionner sans modification de logique. Seul le wrapper visuel a changé.
- Parité FR/EN : toute évolution structurelle du configurateur (add-on, bandeau, mécanique) doit être propagée à `pricing.html` dans la même session ou la session suivante pour éviter les divergences. Les deux fichiers partagent la même structure HTML, le même JS et les mêmes CSS variables. Seuls les libellés diffèrent.

### Propagation EN (pricing.html)

- L'add-on Photographer était déjà présent dans `pricing.html` à l'arrivée du fichier (timestamp `2026-05-07 23:15`) : pas d'intervention sur cette partie.
- Bandeau "Tech view" : mêmes modifications que sur `tarifs.html` (retrait du `tech-switch` en Step 02, insertion du `tech-banner` dark sans icône entre Step 02 et Step 03, animation chain décalée pour 5 enfants, `setTechMode()` toggle `.active` sur `#tech-banner-label`).
- Wording EN du bandeau : titre `See included equipment`, description `Mics, tripods, computer, cabling… the technical kit included for every part of your setup.` Choix de "kit" plutôt que "equipment" pour la description, plus courant en anglais britannique pour le matériel de production (cohérent avec "Make use of the kit already on site" déjà présent dans la description Interviews).
- Le commentaire JS `setTechMode()` traduit en anglais à l'occasion (était resté en français dans `pricing.html`).

### Fichiers livrés

- `tarifs.html` (timestamp DOCTYPE `<!-- Last update: 2026-05-07 18:00 -->`)
- `pricing.html` (timestamp DOCTYPE `<!-- Last update: 2026-05-07 23:45 -->`)

---

## 2026-05-07, Ajout favicon SVG sur toutes les pages

### Contexte

Le site n'avait pas de favicon. Ajout d'un favicon SVG monochrome (lettre N blanche sur fond cercle bleu `#5FA3D9`) sur l'ensemble des 37 pages HTML du site, plus dépôt du fichier `favicon.svg` à la racine.

### Modification appliquée

Insertion de la balise suivante dans le `<head>` de chaque page, juste après `<meta name="viewport">` :

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
```

Format SVG retenu (vs PNG/ICO multi-tailles) : un seul fichier vectoriel, supporté par tous les navigateurs récents (Chrome, Firefox, Safari, Edge), netteté parfaite à toutes les tailles, poids négligeable (262 octets). Pas de fallback PNG/ICO ajouté pour l'instant : à reconsidérer uniquement si une stat montre du trafic significatif depuis IE11 ou des très anciens Safari (peu probable sur cible B2B 2026).

### Périmètre

37 pages HTML modifiées (toutes les pages de la racine, y compris la page admin `nmc-7k9q3p2x.html`, les pages `noindex` mentions/merci/404, et `plan-du-site.html` qui n'avait pas encore de timestamp `Last update`).

Fichiers non modifiés : `BingSiteAuth.xml`, `sitemap.xml`, fichiers du dossier `functions/`.

### Fichiers livrés

- `favicon.svg` (à déposer à la racine du repo)
- 37 fichiers HTML modifiés (timestamp DOCTYPE `<!-- Last update: 2026-05-07 14:50 -->`)

### Décisions techniques actées

- Favicon : un seul fichier SVG à la racine (`/favicon.svg`), pas de variantes PNG/ICO multi-tailles. Si besoin futur (Apple Touch Icon, manifeste PWA), on étendra à ce moment-là sans toucher au SVG existant.
- Le favicon s'inscrit dans l'identité visuelle Nomacast : N blanc sur cercle bleu `#5FA3D9` (même bleu que la charte du site).

---

## 2026-05-07, Migration codes partenaires en Cloudflare KV + tokens opaques + back-office admin

### Contexte et motivation

Avant cette session, les codes partenaires étaient lisibles dans l'URL (`?code=FIGMA`). Un visiteur pouvait deviner les codes des autres partenaires en testant des noms (Sodexo, Brainsonic, etc.) et constater qu'il y avait des remises pour eux, ce qui leakait à la fois l'existence du système et l'identité des partenaires.

Solution retenue (Option B discutée avec Jérôme) : tokens opaques dans l'URL (`?p=e52vnc`), display name joli pour le champ Société (`Figma` au lieu de `FIGMA`), et un back-office HTML pour qu'il puisse ajouter / modifier / supprimer ses partenaires en autonomie sans intervention de Claude.

### Architecture finale

Stockage : **Cloudflare KV** (namespace `nomacast_partners`, ID `8a26bab4f86e41b2a9e490981b9b9aa1`, bindé sous `PARTNERS` dans le projet Pages). Une seule clé `data` contient l'objet `{tokens: {token → code}, codes: {code → {displayName, type, active, durations, forceOptions, discountTiers, description, createdAt}}}`. Modifications instantanées, pas de redéploiement nécessaire.

API publique (lecture client tarifs) : `/api/validate-code?p=token` ou `?code=CODE` (rétro-compat). Renvoie `{valid, code, displayName, data}` ou `{valid:false}` selon le cas.

API admin (CRUD) : `/nmc-7k9q3p2x/api/partners` avec verbes GET/POST/PUT/DELETE. Génère automatiquement les tokens à la création (6 chars alphanum lowercase, alphabet sans i/l/o/0/1 pour éviter la confusion visuelle).

Page admin : `https://nomacast.fr/nmc-7k9q3p2x.html`. URL secrète sans login (choix acté avec Jérôme : compte solo, exposition limitée). HTML/CSS/JS vanilla, pas de framework. Modal d'édition, génération automatique du code interne depuis le display name, copie de lien en un clic, désactivation sans suppression possible.

C�té `tarifs.html` : `applyPartnerCode(raw, kind)` détecte automatiquement si l'input est un token (lowercase alphanum 4-12) ou un code (uppercase alphanum 2-30), appelle l'API avec le bon paramètre, met en cache le résultat indexé par code interne. `state.partnerDisplayName` introduit pour le badge "Code partenaire actif · X" et le pré-remplissage du champ Société.

### Phase 1 : Setup KV (faite par Jérôme dans le dashboard)

1. Création du namespace KV `nomacast_partners` dans Cloudflare → Workers & Pages → KV
2. Binding au projet Pages : variable `PARTNERS` → namespace `nomacast_partners` (Settings → Bindings)
3. Import des données initiales : clé `data`, valeur = JSON migré contenant les 24 partenaires existants avec tokens générés aléatoirement et display names jolis ("Figma" pour FIGMA, "RateCard" pour RATECARD, etc.)
4. Retry deployment pour activer le binding

### Phase 2 : Refonte de validate-code.js

Le fichier `functions/api/validate-code.js` ne lit plus la variable d'environnement `PARTNER_CODES_JSON` mais le KV via `context.env.PARTNERS.get("data")`. Validation regex différente selon le paramètre (token : `/^[a-z0-9]{4,12}$/`, code : `/^[A-Z0-9]{2,30}$/`). Vérification du flag `active` côté serveur : un partenaire désactivé renvoie 410 Gone avec `{valid:false, reason:"inactive"}`. Header `Cache-Control: no-store` conservé.

### Phase 3 : Page admin + API CRUD

Nouveaux fichiers :
- `nmc-7k9q3p2x.html` à la racine du repo (page admin, accessible via URL slug secrète)
- `functions/nmc-7k9q3p2x/api/partners.js` (Pages Function CRUD avec onRequestGet, onRequestPost, onRequestPut, onRequestDelete)

Trois "types de remise" disponibles dans le formulaire d'admin, mappés en interne :
- `standard` : `forceOptions: []`, description "Tarif partenaire + remise par palier"
- `premium-reperage` : `forceOptions: ["reperage", "veille", "5g"]`
- `premium-reperage-montage` : `forceOptions: ["reperage", "veille", "5g", "montage_tc"]`

La grille de remise par paliers (1500 à 6000 € HT, paliers de 150 à 1400 €) est commune à tous les types. Les durées (half/full/2days/3days) sont identiques pour tous.

Validation côté serveur de l'admin :
- Code interne : majuscules + chiffres, 2-30 caractères
- Display name : 1-60 caractères
- Type : doit appartenir à l'enum
- Code unique : refus avec 409 Conflict si déjà existant

Génération de tokens : `crypto.getRandomValues` avec retry en cas de collision (jusqu'à 100 tentatives).

### Phase 4 : Adaptation de tarifs.html

`applyPartnerCode` rendue capable de gérer les deux paramètres (token avec `kind="token"`, code avec `kind="code"`). Auto-détection au démarrage qui priorise `?p=` sur `?code=` si les deux sont présents.

Remplissage du champ `f-societe` désormais avec `state.partnerDisplayName` au lieu de `state.partnerCode`. Conséquence : "Figma" s'affiche au lieu de "FIGMA". Plus joli, plus pro.

Badge "Code partenaire actif · X" utilise aussi le display name.

Cache local côté client : `PARTNER_CODES[code]` pour les data tarifaires, `PARTNER_DISPLAY_NAMES[code]` pour les display names. Indexé par code interne dans les deux cas.

### Procédure pour ajouter un partenaire (à utiliser dans toute conversation future)

**Méthode normale (autonome, sans Claude) :**
1. Aller sur `https://nomacast.fr/nmc-7k9q3p2x.html`
2. Cliquer "+ Ajouter un partenaire"
3. Renseigner le nom et le type, valider
4. Copier le lien généré (`?p=token`) et l'envoyer au contact

Pas de redéploiement nécessaire, modifications instantanées.

**Méthode dégradée (si l'admin ne marche pas)** : édition directe du KV via le dashboard Cloudflare → Workers & Pages → KV → namespace `nomacast_partners` → entrée `data` → Edit. Format JSON `{tokens, codes}`, voir l'architecture ci-dessus pour la structure exacte. Pas de redéploiement nécessaire dans ce cas non plus (KV temps réel).

### Décisions techniques actées

- Codes partenaires : architecture KV + Pages Functions. La variable d'env `PARTNER_CODES_JSON` (Plaintext) **n'est plus utilisée**. Elle peut être supprimée du dashboard Cloudflare une fois la nouvelle architecture validée en conditions réelles (à faire sous quelques jours).
- Tokens opaques : 6 caractères, alphabet `abcdefghjkmnpqrstuvwxyz23456789` (sans i/l/o/0/1). 36 milliards de combinaisons théoriques avec cet alphabet, largement assez pour un système avec quelques dizaines de partenaires.
- Rétro-compat indéfinie pour les anciens liens `?code=NOMCODE` : décision de Jérôme. Aucun partenaire externe n'a à être prévenu, les liens déjà envoyés continuent de fonctionner.
- Page admin protégée uniquement par l'obscurité de l'URL (slug `nmc-7k9q3p2x`). Pas de login. Si fuite suspectée : changer le slug = renommer la page HTML + le dossier `functions/nmc-7k9q3p2x/`. Acceptable pour un compte solo.
- Robots : la page admin a `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">` mais n'apparaît PAS dans `robots.txt` (ce serait révéler le slug). Indexation passive uniquement bloquée.
- KV est le système de stockage de référence pour toute donnée modifiable à la volée. Si on a besoin d'autres bases de données dans le futur (ex: tracking de leads, journal des prospects), on partira sur KV ou D1 selon le besoin, plus jamais sur des variables d'environnement nécessitant un redéploiement.
- Pour modifier la configuration d'un partenaire (display name, type de remise, statut actif) : passer par l'admin, jamais éditer le KV à la main sauf cas exceptionnel.

### Fichiers livrés

- `tarifs.html` (timestamp DOCTYPE `<!-- Last update: 2026-05-07 18:15 -->`)
- `functions/api/validate-code.js` (refonte complète, lit dans KV au lieu de la variable d'env)
- `nmc-7k9q3p2x.html` (nouveau, page admin)
- `functions/nmc-7k9q3p2x/api/partners.js` (nouveau, Pages Function CRUD)
- KV namespace `nomacast_partners` créé et peuplé (24 partenaires migrés)
- Binding `PARTNERS` configuré sur le projet Pages

### Tests validés

- Lecture admin : 24 partenaires affichés
- Création via admin : OK, token généré et fonctionnel via `/api/validate-code?p=`
- Modification via admin : OK
- Désactivation via admin : OK, l'API renvoie 410 ensuite
- Suppression via admin : OK
- Ancien lien `?code=FIGMA` : continue de fonctionner (rétro-compat)
- Nouveau lien `?p=token` : applique la remise et remplit le champ Société avec le display name joli
- Champ Société : non écrasé si l'utilisateur a saisi manuellement avant l'arrivée du code

---

## 2026-05-07, Fix affichage TTC sur les prix d'options du configurateur

### Bug

Quand on activait le toggle TTC sur la page `tarifs.html`, le total et les lignes du panneau récap (Options, Add-ons, remise partenaire) basculaient bien en TTC, mais les prix affichés sur les cartes d'options à cocher dans le formulaire (ex: "+ 250 €" sur chaque option) restaient en HT. Incohérence visuelle pour l'utilisateur.

### Cause racine

La fonction `shown(ht)` (qui retourne `Math.round(ht * TVA)` quand `state.ttc === true`, sinon `Math.round(ht)`) n'était pas appelée à trois endroits du rendu des prix d'options :

- Ligne 2138 : initialisation de la liste d'options (template literal `+ ${fmt(opt.price)} €`)
- Ligne 2075 : refresh des prix dans `render()` cas Pack sonorisation duplex (prix old/new)
- Ligne 2077 : refresh des prix dans `render()` cas standard

### Correctif

Aux trois endroits, encapsulation des prix dans `shown()` avant le `fmt()` :
- `fmt(opt.price)` → `fmt(shown(opt.price))`
- `fmt(fullPrice)` → `fmt(shown(fullPrice))`
- `fmt(newP)` → `fmt(shown(newP))`

L'event listener du toggle TTC (ligne 2359) appelait déjà `render()`, donc aucune modif nécessaire sur le câblage. La conversion se fait maintenant systématiquement au moment du rendu.

### Données HT volontairement préservées

Les `fmt()` sans `shown()` restants sont volontaires et n'ont pas été touchés :
- Lignes 2395, 2398 : texte récapitulatif copy-paste avec mention explicite "HT"
- Lignes 2422, 2423, 2425 : hidden fields `h-cfg-options`, `h-cfg-addons`, `h-cfg-total` envoyés au formulaire et au back-office en HT pour la facturation, indépendants de l'affichage écran

### Fichier livré

- `tarifs.html` (timestamp DOCTYPE `<!-- Last update: 2026-05-07 15:30 -->`)

### Tests à faire post-déploiement

- Sur `https://nomacast.fr/tarifs.html`, cocher quelques options, basculer le toggle HT/TTC. Vérifier que les prix sur les cartes d'options changent en cohérence avec le total et le breakdown.
- Vérifier le cas Pack sonorisation : si duplex coché en premier, son passe à 500 € (HT) ou 600 € (TTC) avec le prix barré 750/900.

---

## 2026-05-07, Ajout code partenaire DIXXIT

Ajout du code `DIXXIT` (standard, mêmes barèmes que les codes "non spéciaux") à la variable `PARTNER_CODES_JSON` sur Cloudflare. Total désormais : 22 codes.

### Liste à jour

22 codes : MORNING, SOLARIS, PEECH, FIGMA, SODEXO, PLISSKEN, GALLERIA, AGENCE, CONSTELLATION, HVH, NEXTON, RATECARD, GS1, PRACHE, V3, BEARIDEAS, EKOSS, ESRI, WOJO, ACTITO, INWINK, DIXXIT.

### Lien partenaire

`https://nomacast.fr/tarifs.html?code=DIXXIT`

### Procédure (rappel, voir entrée précédente pour le détail)

1. Cloudflare → Variables → `PARTNER_CODES_JSON` → Edit → coller la nouvelle valeur
2. Save
3. Deployments → Retry deployment sur le dernier
4. Tester `https://nomacast.fr/api/validate-code?code=DIXXIT` doit retourner `{"valid":true,...}`

---

## 2026-05-06 (suite), Migration codes partenaires en Pages Function + ajout 13 codes

### Architecture mise en place

Les codes partenaires ne sont plus stockés en clair dans `tarifs.html`. Ils vivent dans une variable d'environnement Cloudflare Pages (`PARTNER_CODES_JSON`, type Plaintext) et sont validés via une Pages Function `/api/validate-code`.

Fichiers concernés :
- `functions/api/validate-code.js` (nouvelle Pages Function, sert l'endpoint `/api/validate-code?code=XXX`)
- `tarifs.html` (objet `PARTNER_CODES = {}` désormais vide à l'init, peuplé dynamiquement après appel API ; `applyPartnerCode` rendue async)

C�té client, `applyPartnerCode(raw)` fait un `fetch('/api/validate-code?code=' + raw)`. Si la réponse est `{valid:true, code, data}`, l'objet `data` est mis en cache local dans `PARTNER_CODES[code]` pour la session, puis le rendu se fait normalement. Si invalide, `state.partnerCode` reste à `null`.

C�té serveur, la Pages Function valide la regex `/^[A-Z0-9]{2,30}$/`, parse `context.env.PARTNER_CODES_JSON`, fait un lookup, renvoie 200 ou 404. Header `Cache-Control: no-store` pour éviter qu'un attaquant devine les codes via le cache CDN.

### Décision : Plaintext et non Secret

La variable `PARTNER_CODES_JSON` est en Plaintext (pas Secret). Raison : compte Cloudflare solo, donc Secret n'apporte aucune protection supplémentaire et empêche l'édition in-place (la valeur n'est pas affichée après save). Plaintext permet d'éditer le JSON directement dans le dashboard sans tout recoller. Côté sécurité publique, identique à Secret : la valeur ne sort jamais des serveurs Cloudflare.

### Procédure pour ajouter un code partenaire (à utiliser dans toute conversation future)

1. Cloudflare → Workers & Pages → projet nomacast-fr → Settings → Variables and Secrets
2. Ligne `PARTNER_CODES_JSON` → Edit
3. Ajouter une nouvelle entrée dans le JSON. Pour un code standard (95% des cas), copier exactement le bloc d'un code existant comme `INWINK` ou `WOJO` (qui ont la grille standard partagée par tous les codes "non spéciaux").
4. Save
5. **Étape obligatoire** : redéployer pour que la Pages Function voie la nouvelle variable. Cloudflare → Deployments → trois points sur le dernier déploiement → Retry deployment. Attendre ~30s.
6. Tester : `https://nomacast.fr/api/validate-code?code=NOUVEAUCODE` doit renvoyer `{"valid":true,...}`.
7. Le lien partenaire à envoyer : `https://nomacast.fr/tarifs.html?code=NOUVEAUCODE`.

### Structure du JSON (référence)

Tous les codes ont la forme :
```
"NOMCODE": {
  "durations": { "half": 1500, "full": 1750, "2days": 2250, "3days": 3000 },
  "forceOptions": [],
  "discountTiers": [...11 paliers de 1500 à 6000...],
  "description": "Tarif partenaire + remise par palier"
}
```

Variantes existantes :
- Codes standards (PEECH, FIGMA, SODEXO, PLISSKEN, GALLERIA, AGENCE, CONSTELLATION, HVH, NEXTON, RATECARD, GS1, PRACHE, V3, BEARIDEAS, EKOSS, ESRI, WOJO, ACTITO, INWINK, DIXXIT) : `forceOptions: []`, description "Tarif partenaire + remise par palier".
- MORNING : `forceOptions: ["reperage","veille","5g","montage_tc"]`, description spécifique.
- SOLARIS : `forceOptions: ["reperage","veille","5g"]`, description spécifique.

Validation côté serveur : nom du code doit matcher `/^[A-Z0-9]{2,30}$/`. Donc majuscules + chiffres, 2 à 30 caractères, pas de tirets ni d'underscore.

### Décisions techniques actées

- Codes partenaires : architecture Pages Function + variable d'env Cloudflare. Plus jamais en clair dans le HTML servi.
- Variable `PARTNER_CODES_JSON` : type Plaintext (compte solo, pas besoin de Secret, édition in-place plus pratique).
- Modifier la variable nécessite TOUJOURS un redéploiement Cloudflare Pages (Retry deployment dans le dashboard) sinon la Pages Function ne voit pas la nouvelle valeur.
- Endpoint `/api/validate-code` : GET only, header `Cache-Control: no-store` obligatoire pour empêcher la divination par cache.
- Convention de nommage des codes : majuscules et chiffres uniquement, 2 à 30 caractères, validé regex côté serveur.

### Fichiers livrés

- `tarifs.html` (timestamp DOCTYPE `<!-- Last update: 2026-05-06 18:00 -->`)
- `functions/api/validate-code.js` (nouvelle Pages Function)
- Variable Cloudflare `PARTNER_CODES_JSON` créée en Plaintext

---

## 2026-05-06 (suite), Fix codes partenaires FIGMA / SODEXO + masquage bouton agence

### Bug fix : codes partenaires FIGMA, SODEXO, AGENCE non fonctionnels

Cause racine : la structure JSON de `const PARTNER_CODES = {...}` dans `tarifs.html` (autour de la ligne 1097) était cassée. L'objet `PEECH` n'avait pas de propriété `description` ni de `}` de fermeture, ce qui faisait que `FIGMA`, `SODEXO` et `AGENCE` se retrouvaient imbriqués comme propriétés DE `PEECH` au lieu d'être au niveau racine. Conséquence : `PARTNER_CODES["FIGMA"]`, `PARTNER_CODES["SODEXO"]` et `PARTNER_CODES["AGENCE"]` retournaient `undefined`, ce qui faisait `applyPartnerCode()` partir en early-return sur `null`. AGENCE était aussi cassé sans qu'on s'en rende compte (probablement parce que la checkbox agence couvrait ce parcours côté UX).

Correctif : fermeture propre de l'objet `PEECH` avec `description: "Tarif partenaire + remise par palier"` puis `}` puis `,`. FIGMA, SODEXO et AGENCE remontés au niveau racine de `PARTNER_CODES`. Vérification top-level keys via regex Python : `['MORNING', 'SOLARIS', 'PEECH', 'FIGMA', 'SODEXO', 'AGENCE']` tous présents au bon niveau. Syntaxe JS du bloc `<script>` validée par `node --check` : OK.

### Nouvelle logique UI : masquage du bouton "Je suis une agence événementielle" quand un code partenaire est actif

Quand un code partenaire est entré (peu importe lequel : MORNING, SOLARIS, PEECH, FIGMA, SODEXO, AGENCE), le bouton `#agency-toggle` est masqué (`style.display = "none"`) car les remises partenaire et le mode agence sont mutuellement exclusifs commercialement.

Logique implémentée dans `updatePartnerDisplay()` (centralisateur déjà existant appelé par `applyPartnerCode()` et `removePartnerCode()`) :
- Quand un code est appliqué : `agencyBtn.style.display = "none"`. Si `state.isAgence === true` au moment de l'application (cas où l'utilisateur avait déjà coché agence puis a ensuite saisi un code), reset propre du state agence : `state.isAgence = false`, retrait des classes CSS actives, restauration du texte `#agency-text-main`, hidden field `h-is-agence` vidé, `setTechMode(false)`.
- Quand le code est retiré via `removePartnerCode()` : `agencyBtn.style.display = ""` (réaffichage).

### Note technique non corrigée (à traiter plus tard)

Les codes FIGMA, SODEXO et AGENCE ont actuellement `forceOptions: []` mais leur description (héritée d'un copier-coller depuis SOLARIS) dit "Repérage, mise en place J-1, 5G de secours + remise par palier" — ce qui est mensonger puisque rien n'est forcé. À corriger dans une prochaine session : descriptions à reformuler pour refléter exactement ce que chaque code fait (probablement juste "Tarif partenaire + remise par palier" comme PEECH).

### Fichier livré

- `tarifs.html` (timestamp DOCTYPE mis à jour `<!-- Last update: 2026-05-06 16:30 -->`)

### Process de déploiement

Drag-drop dans `G:\Mon Drive\NOMACAST\` → Apps Script v2 pousse sur GitHub `main` → Cloudflare Pages auto-deploy en ~30s.

### Tests à faire post-déploiement

- `https://nomacast.fr/tarifs.html?code=FIGMA` → message "Code FIGMA appliqué" + bouton agence masqué
- `https://nomacast.fr/tarifs.html?code=SODEXO` → idem
- `https://nomacast.fr/tarifs.html?code=AGENCE` → idem (note : ce code applique le mode agence via la mécanique partenaire, à valider que le rendu est cohérent)
- Vérifier qu'avec le bouton agence coché PUIS saisie d'un code, le state agence est bien reset (pas de double mode actif)

---
