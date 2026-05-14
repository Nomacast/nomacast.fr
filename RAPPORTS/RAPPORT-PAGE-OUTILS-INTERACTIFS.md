# Rapport : page Outils interactifs (pivot du chat interactif)

**Date** : 14 mai 2026
**Périmètre** : `outils-interactifs.html` (FR) + `chat-interactif.js`
**Statut** : prêt à déployer
**Remplace** : `chat-interactif.html`

---

## 1. Vue d'ensemble

Pivot stratégique : repositionnement de la prestation "Chat interactif personnalisé" (1 outil mis en avant) vers **"Outils interactifs"** (suite de 11 modes). L'angle commercial passe d'un produit unique vers une **suite d'engagement** pour justifier le tarif et capter une demande plus large (engagement, animation, ROI mesurable).

| Avant | Après |
|---|---|
| `chat-interactif.html` | `outils-interactifs.html` |
| Eyebrow : "Solution chat interactif" | "Outils interactifs" |
| H1 : "Chat personnalisé et interactif pour l'engagement…" | "Une suite d'outils pour des lives qui engagent vraiment." |
| 4 étapes wizard (Durée / Audience / Interaction / Personnalisation) | 4 étapes (Cadrage / Interaction / Personnalisation / Aperçu) |
| 6 modes d'interaction | 11 modes (10 inclus + 1 payant) |
| Pas de mention analytics distinctive | Ribbon analytics dans le hero + card dédiée + ligne récap |
| Pas de preuve sociale dans le body | Bandeau 6 logos clients entre hero et wizard |

---

## 2. URL et fichiers

| Élément | Valeur |
|---|---|
| URL canonique | `https://www.nomacast.fr/outils-interactifs.html` |
| Fichier HTML | `outils-interactifs.html` |
| Fichier JS | `chat-interactif.js` (conservé volontairement pour ne pas casser le `<script src>`) |
| Endpoint backend | `/chat-interactif` (Cloudflare Pages Function, inchangé volontairement) |
| Hreflang FR + x-default | `outils-interactifs.html` |
| Hreflang EN | `en/interactive-chat.html` ⚠️ à mettre à jour quand la version EN sera refaite |

**Décision** : ne renommer ni le JS ni l'endpoint backend dans cette session — pure migration HTML pour ne rien casser. Renommage du JS optionnel à terme pour cohérence.

---

## 3. Wording acté

### Hero
| Élément | Valeur |
|---|---|
| Breadcrumb | "Accueil / Outils interactifs" |
| Eyebrow | "Outils interactifs" |
| H1 | "Une suite d'outils pour des **lives** qui engagent vraiment." |
| Sous-titre | "Chat, Q&A, sondages, quiz, mur d'idées, citations partageables, sous-titrage… À partir de 290 € HT en complément de votre prestation de captation." |
| Bullets (4) | Suite intégrée à votre captation · Chat, Q&A, sondages, quiz, mur d'idées · Aux couleurs de votre marque · Chiffré TLS 1.3, hébergement Europe, RGPD |
| Ribbon analytics | "Reporting & analytics inclus" / "Watchtime · Connexions · Engagement · Top moments" |
| CTA primaire | "Configurer mes outils" → `#wizard` |
| CTA secondaire | "Voir un cas client" → `cas-clients.html` |

### Wizard
| Élément | Valeur |
|---|---|
| Eyebrow | "Configurateur" |
| H2 | "Configurez vos outils en trente secondes." (noir) + "Recevez votre devis sous 24h." (cyan) |

### Navigation
| Élément | Valeur |
|---|---|
| Cartouche nav desktop + mobile | "Outils interactifs" (classe `.nav-pill`) |
| Footer link colonne Prestations | "Outils interactifs →" |

### Section CTA bottom
| Élément | Valeur |
|---|---|
| CTA secondaire | "Formulaire de contact" (remplace l'ancien "Parler à un humain") |

---

## 4. Wizard 4 étapes

| # | Step | Contenu | id HTML |
|---|---|---|---|
| 01 | **Cadrage** | Fusion Durée + Audience en 2 sous-groupes (`.wizard-subgroup`) | `step-1` |
| 02 | **Interaction et accès** | Sélection des modes + mode d'accès | `step-2` |
| 03 | **Personnalisation** | Couleur + logo + toggle marque blanche | `step-3` |
| 04 | **Aperçu** | Section preview avec carrousel des modes | `step-4` (anciennement `id="preview"`) |

- La section preview a été renommée `id="step-4"` (ancien `id="preview"`)
- Le lien `<a href="#preview" class="summary-preview-link">` dans l'aside récap a été mis à jour en `href="#step-4"`

---

## 5. Stepper sticky

| Propriété | Valeur |
|---|---|
| Marqueur idempotent | `wizard-stepper-v1` + variante `v2` |
| Position | `sticky; top: 64px` (sous la nav) |
| Hauteur ~ | 65px |
| Items | 4 dots numérotés + labels (Cadrage / Interaction / Personnalisation / Aperçu) |
| Barre de progression | masquée desktop (≥721px), visible mobile (les labels disparaissent et la barre prend le relais) |
| Label dynamique mobile | "Étape N sur 4 · {titre dynamique}" via IntersectionObserver |
| Smooth scroll au clic | offset = nav 64px + stepper height + 16px |

**Conséquence** : récap aside `top: 137px` (64 nav + 65 stepper + 8 air), `max-height: calc(100vh - 153px)`. Marqueur `sticky-recap-under-stepper-v1`.

---

## 6. Modes d'interaction (11)

| # | Nom | Input `name` | Value | Coût |
|---|---|---|---|---|
| 1 | Q&A modéré | `mode-qa` | `qa` | Inclus |
| 2 | Questions en pré-événement | `mode-preqa` | `questions-preevent` | Inclus |
| 3 | Chat libre modéré | `mode-libre` | `chat-libre` | Inclus |
| 4 | Sondages live | `mode-sondages` | `sondages` | Inclus |
| 5 | Réactions rapides | `mode-reactions` | `reactions` | Inclus |
| 6 | Nuage de mots-clés | `mode-nuage` | `nuage` | Inclus |
| 7 | Quiz interactif | `mode-quiz` | `quiz` | Inclus |
| 8 | Mur d'idées | `mode-brainstorming` | `brainstorming` | Inclus |
| 9 | Lecture seule | `mode-lecture` | `lecture-seule` | Inclus |
| 10 | Citations à retenir | `mode-citations` | `citations` | Inclus |
| 11 | Sous-titrage en direct | `mode-subtitles` | `subtitles` | **+200 € HT** |

---

## 7. Preview interactive (carrousel des modes)

Chaque mode coché ajoute un slide dans le carrousel de la section preview. Les 3 modes ajoutés dans cette session ont reçu :

### Pré-Q&A (`renderPreQA`)
- Pattern visuel : variante du Q&A normal
- Badge orange "PRÉ-ÉVÉNEMENT" (classe `.pm-badge-preqa`)
- Timestamps longs ("soumise hier", "il y a 2 jours")
- Votes élevés (42, 31, 28) pour refléter le temps accumulé

### Mur d'idées (`renderBrainstorm`)
- Pattern visuel : grille 2×3 de post-its
- 4 couleurs cycliques (jaune `#FFF3B0`, rose `#FFD3DA`, bleu `#CFE4FF`, vert `#CFEDD0`)
- Rotation légère (±0.4-0.5deg) pour effet papier collé, hover réinitialise
- Question commune en haut, auteur sous chaque idée

### Citation à retenir (`renderCitation`)
- Pattern visuel : carte type LinkedIn-ready
- Guillemets typographiques cyan décoratifs (`\u201C`)
- Texte italique, attribution stylée (nom + rôle)
- Footer cyan : "CARTE PRÊTE À PARTAGER SUR LINKEDIN ↗"

### Architecture JS
```
PREVIEW_TEMPLATES (objet)
  ├── qa, libre, sondage, quiz, cloud, reactions  (existaient)
  └── preqa, brainstorm, citation                  (ajoutés)

renderQA, renderLibre, renderSondage, renderQuiz, renderCloud, renderReactions  (existaient)
renderPreQA, renderBrainstorm, renderCitation                                    (ajoutés)

Compose slides : hasPreQA, hasBrainstorm, hasCitations  (3 nouveaux checks)
```

---

## 8. Section "Toujours inclus" — 6 cards

| # | Card | Description courte |
|---|---|---|
| 1 | **Suite d'outils complète** (nouveau) | Chat modéré, Q&A, pré-Q&A, sondages, quiz, mur d'idées, citations, réactions, nuage de mots, lecture seule |
| 2 | Liens d'accès nominatifs | inchangé |
| 3 | **Modération multi-niveaux** (fusion) | Interface validation/épingle + filtres automatiques |
| 4 | Branding personnalisé | inchangé |
| 5 | Intégration iframe | inchangé |
| 6 | **Reporting & analytics** (renommé) | Watchtime, courbe de connexions, engagement par outil, top moments. **Export CSV pour vos KPIs**. Conservation 90 jours. |

Grille 3 colonnes × 2 lignes desktop, 1 colonne mobile.

---

## 9. Aside récap (sticky)

Lignes (dans l'ordre) :
1. Durée — `data-recap="duration"`
2. Audience — `data-recap="audience"`
3. Modes d'interaction — `data-recap="modes"`
4. Mode d'accès — `data-recap="access-mode"`
5. **Reporting analytique : Inclus** (en cyan accent, classe `.summary-line-val-included`) — **nouveau**
6. Marque blanche — `data-recap="white-label"`

Note récap : "Tarif plancher en complément de votre prestation de captation Nomacast. **À réserver au moins 7 jours avant l'événement.** Devis final ajusté sous 24h."

Lien aperçu : "Voir l'aperçu en direct ↓" → `#step-4`

---

## 10. Section preuve sociale (nouvelle)

Insérée entre le hero et le wizard.

| Élément | Valeur |
|---|---|
| Position | Entre `</section>` du hero et `<section class="wizard-section">` |
| Eyebrow | "ILS ONT ENGAGÉ LEUR AUDIENCE AVEC NOMACAST" |
| Logos affichés | Comédie-Française · Figma · Louvre × LA HORDE · Johnson & Johnson · GL Events · EBG Digital Benchmark |
| Style | Niveau de gris + opacité 55% par défaut, hover en couleur pleine + léger translateY |
| Liens | Vers les pages cas-clients correspondantes |
| Marqueur idempotent | `social-proof-v1` |

**Espacement** : padding-bottom réduit + sélecteur adjacent `.social-proof + .wizard-section` pour réduire le padding-top du wizard à `clamp(20px, 3vw, 40px)` (au lieu du `clamp(72px, 9vw, 120px)` normal).

### Paths d'images attendus (à vérifier côté repo)
```
images/logos/comedie-francaise.webp
images/logos/figma.webp
images/logos/louvre.webp           ← à vérifier
images/logos/johnson-johnson.jpg    (exception JPG conservée)
images/logos/gl-events.webp
images/logos/ebg.webp               ← à vérifier (peut-être ebg-berlin.webp)
```

---

## 11. SEO

### Méta

| Élément | Valeur |
|---|---|
| `<title>` (53 chars) | "Outils interactifs pour engager vos lives \| Nomacast" |
| Meta description (187 chars) | "Chat, Q&A, sondages, quiz, mur d'idées, sous-titrage… Une suite d'outils intégrée à votre captation Nomacast pour engager vos audiences en live. Dès 290 € HT, devis 24h." |
| Meta keywords | outils interactifs événement, engagement audience live, Q&A live entreprise, sondages live conférence, quiz interactif corporate, mur d'idées brainstorming live, animation live B2B, chat live événement, modération en direct |
| Canonical | `https://www.nomacast.fr/outils-interactifs.html` |
| og:image / twitter:image | `og-image.webp` (générique) |

### Schema.org JSON-LD (3 blocs)

1. **Service** : `name` à jour ("Outils interactifs pour engager votre audience en live"), `serviceType` ajouté, `description` enrichie avec liste des outils + mention analytics
2. **BreadcrumbList** : nouveau — Accueil → Outils interactifs
3. **FAQPage** : existait déjà, conservé

---

## 12. Architecture CSS — marqueurs idempotents

Markers actifs sur la page pour patches ré-exécutables :

```
nav-pill-v1                            (cartouche nav)
wizard-stepper-v1, v2                  (stepper + barre desktop masquée)
sticky-recap-under-stepper-v1          (top 137px)
wizard-cards-v1                        (cards cliquables durée/audience)
chat-numeric-compact-v2                (alignement bulles inputs)
chat-pricing-options-v1                (fix options indépendantes)
analytics-ribbon-v1                    (ribbon hero)
analytics-ribbon-match-width-v1        (wrapper .hero-bottom)
social-proof-v1                        (bandeau logos)
chat-preview-v1 à v11                  (composants preview existants)
```

---

## 13. Liste exhaustive des changements éditoriaux

| Zone | Avant | Après |
|---|---|---|
| `<title>` | "Chat interactif personnalisé pour événements en direct \| Nomacast" | "Outils interactifs pour engager vos lives \| Nomacast" |
| Eyebrow hero | "Solution chat interactif" | "Outils interactifs" |
| H1 hero | "Chat personnalisé et interactif pour l'engagement de votre audience." | "Une suite d'outils pour des lives qui engagent vraiment." |
| Sous-titre hero | (description longue d'un chat) | "Chat, Q&A, sondages, quiz, mur d'idées, citations partageables, sous-titrage… À partir de 290 € HT en complément de votre prestation de captation." |
| Bullet 1 hero | "Aux couleurs de votre marque" | "Suite intégrée à votre captation" |
| Bullet 2 hero | "Q&A modéré et sondages live" | "Chat, Q&A, sondages, quiz, mur d'idées" |
| CTA primaire hero | "Configurer mon chat" | "Configurer mes outils" |
| CTA secondaire hero | "Voir la tarification" | "Voir un cas client" |
| H2 wizard | "Configurez votre chat en 30 secondes, pas deux minutes." | "Configurez vos outils en trente secondes. Recevez votre devis sous 24h." (cyan) |
| Step 1 wizard | "01 Durée prévue" | "01 Cadrage" (sous-groupes : Durée prévue + Audience attendue) |
| Section preview H2 | "Voici à quoi ressemblera votre chat." | "Voici à quoi ressembleront vos outils interactifs." |
| Section About H2 | "À propos du chat interactif." | "À propos des outils interactifs." |
| FAQ Q1 | "Comment mes participants accèdent-ils au chat ?" | "Comment mes participants accèdent-ils aux outils ?" |
| FAQ Q2 | "Le chat peut-il être intégré directement sur notre site ?" | "Les outils peuvent-ils être intégrés directement sur notre site ?" |
| FAQ Q3 | "À partir de quand le chat est-il accessible ?" | "À partir de quand les outils sont-ils accessibles ?" |
| FAQ Q4 | "Que devient le contenu du chat après l'événement ?" | "Que devient le contenu des échanges après l'événement ?" (réponse enrichie : rapport analytique complet) |
| FAQ Q5 | "Quelle est la latence entre la vidéo et le chat ?" | "Quelle est la latence entre la vidéo et les outils interactifs ?" |
| Nav cartouche | "Engagement live" | "Outils interactifs" |
| Footer link | "Solution chat interactif →" | "Outils interactifs →" |
| Section CTA bottom | "Parler à un humain" (lien ghost) | "Formulaire de contact" |

---

## 14. Pending pour le déploiement

### Bloquant
- [ ] Renommer le fichier dans le repo : `chat-interactif.html` → `outils-interactifs.html`
- [ ] Ajouter dans `_redirects` Cloudflare Pages :
  ```
  /chat-interactif.html /outils-interactifs.html 301
  /chat-interactif      /outils-interactifs.html 301
  ```
- [ ] Mettre à jour `sitemap.xml` (remplacer URL + lastmod 2026-05-14)
- [ ] Vérifier les paths d'images de la section social-proof (peut nécessiter ajustement des slugs réels dans `images/logos/`)
- [ ] Vérifier que le fichier `chat-interactif.js` à jour est bien déployé (taille ~47 KB, contient `renderPreQA` / `renderBrainstorm` / `renderCitation`)

### Important
- [ ] Mettre à jour les autres pages du site qui contiennent encore des liens vers `chat-interactif.html` (notamment le footer commun, page index, pages prestations)
- [ ] Re-soumettre `sitemap.xml` à Google Search Console après déploiement
- [ ] LinkedIn Post Inspector + Facebook Debug : forcer refresh og:image et meta après déploiement

### À faire à terme
- [ ] Refondre la version EN (`en/interactive-chat.html`) avec même pivot : renommer en `en/interactive-tools.html` + traduire wording (suite of tools, social proof, etc.) + JS partagé compatible
- [ ] Optionnel : renommer `chat-interactif.js` → `outils-interactifs.js` (et mettre à jour la `<script src>` dans le HTML)
- [ ] Optionnel : renommer endpoint backend `/chat-interactif` → `/outils-interactifs` (impact `functions/` Cloudflare Pages)

---

## 15. Pistes B2B à explorer plus tard

- **Section comparative concurrents** (Slido / Vevox / Mentimeter) — efficace en B2B mais lourd à produire
- **Mini-section "Outils utilisés sur ces événements"** qui marierait social proof + use cases concrets (par exemple : "Comédie-Française : Q&A + sondages pour 380 spectateurs")
- **Témoignages courts** dans le wizard ou sous la grille tarifaire
- **Section "Mesurez l'impact"** dédiée aux analytics avec mockup de dashboard
- **Renforcer le levier d'urgence** sur le délai de réservation (passer de "7 jours" à un message plus engageant : "Réservez votre date avant qu'elle ne soit prise")

---

## 16. Décisions structurantes actées dans cette session

| Décision | Justification |
|---|---|
| Pivot "chat interactif" → "outils interactifs" | Reflète mieux la richesse de l'offre (11 modes), justifie le tarif, capte un volet de demande plus large (engagement, animation, ROI) |
| Renommage URL `chat-interactif.html` → `outils-interactifs.html` | URL cohérente avec le mot-clé SEO cible, SEO encore jeune donc coût modéré |
| Garder `chat-interactif.js` + endpoint `/chat-interactif` | Éviter de casser le déploiement, le renommage des artefacts internes est optionnel |
| Fusion Durée + Audience → étape unique "Cadrage" | Réduit la friction du wizard, fait sens éditorial (cadre du projet) |
| Section preview devient `id="step-4"` (Aperçu) | Intègre la preview dans le parcours wizard de manière cohérente avec le stepper |
| Stepper desktop sans barre de progression | Les dots numérotés + labels suffisent visuellement sur desktop, gain de lisibilité |
| Ribbon analytics dans le hero | Argument différenciant fort qui sous-vendait avant |
| Card "Reporting & analytics" en place de "Export post-événement" | Met en avant la valeur stratégique des données (vs un simple export technique) |
| Fusion "Modération client" + "Modération automatique" en "Modération multi-niveaux" | Libère une slot de card pour "Suite d'outils complète" sans casser la grille |
| Width du ribbon analytics calé sur la largeur des 2 boutons CTA | Cohérence visuelle, équilibre du hero |
| CTA secondaire "Voir un cas client" (vs "Voir la tarification") | Plus engageant, oriente vers la preuve sociale |
| Bandeau preuve sociale entre hero et wizard | Indispensable sur page B2B premium à 290-1290 € HT |
| Délai de réservation explicite ("7 jours") | Crée urgence + fixe les attentes opérationnelles |
| Pas de slide preview pour `mode-lecture` (lecture seule) | Le mode masque l'input du chat (état) plutôt que d'ajouter un slide spécifique |
| Sous-titrage payant (+200 € HT) | Coût technique réel (transcription temps réel) + différenciateur premium |
| Ne pas modifier `chat-interactif.html` côté fichier source | Sera remplacé par `outils-interactifs.html` au déploiement |

---

*État de référence pour la page Outils interactifs au 14 mai 2026. Session de pivot stratégique complète.*
