## 2026-05-07, Ajout add-on Photographe événementiel dans le simulateur tarifs

### Contexte

Ajout d'une troisième prestation post-événement dans la Step 04 du configurateur, aux côtés du Best-of monté et des Interviews post-événement. Cible les clients souhaitant compléter la captation vidéo par une couverture photo professionnelle livrée rapidement.

### Modification appliquée

Nouvel add-on `photographe` dans `tarifs.html` :

- **Card HTML** ajoutée dans la grille `.addons-grid` de la Step 04 (après la card Interviews).
- **State** : `state.addons.photographe = false` ajouté à l'objet d'état initial.
- **Tarif** : grille par durée dans `ADDON_PRICES.photographe` = `{ half: 1150, full: 1150, "2days": 1750, "3days": 2350 }`. Logique : 1 150 €/jour, +600 € par jour additionnel. Pas de tarif spécifique demi-journée (aligné sur Best-of : `half = full`).
- **Vue technique** (`ADDON_MATERIEL.photographe`) : `1× Canon EOS 5D Mark IV ou équivalent`, `3× objectifs`, `Édition`, `Livraison J+1/J+2 via weblink de 100+ photographies`. Visible uniquement quand l'add-on est coché ET la Vue technique active (même comportement que les deux autres add-ons).
- **Compute** : nouvelle branche dans `compute()` pour ajouter le prix au total après la mécanique partenaire (pas de remise sur cette ligne, comme pour les autres add-ons).
- **buildAddons()** : photographe ajouté dans le `forEach`. Le tracking GA4 a été refactoré en map `addonLabels` + lookup générique sur `ADDON_PRICES` pour éviter d'empiler des ternaires à chaque nouvel add-on.
- **render()** : mise à jour dynamique du prix affiché dans la card selon la durée sélectionnée (même mécanique que Best-of).

### Décisions techniques actées

- Add-ons post-événement : trois prestations distinctes (Best-of monté, Interviews post-événement, Photographe événementiel). Chaque add-on est calculé en dehors de la mécanique partenaire (pas de remise grille A, pas de charm, pas d'absorption). Tarif fixe ajouté au total final.
- Tarif photographe : 1 150 €/jour, +600 €/jour additionnel. Le tarif demi-journée n'est pas distinct du tarif jour entier (aligné sur la logique Best-of, parce que la prestation et le livrable sont les mêmes : 100+ photos éditées, livraison J+1/J+2).
- Refactor du tracking GA4 dans `buildAddons()` : map `addonLabels` + lookup `ADDON_PRICES[addonId]` au lieu de ternaires en cascade. À reproduire pour tout futur add-on (4ème, 5ème, etc.) sans toucher à la structure.

### Fichier livré

- `tarifs.html` (timestamp DOCTYPE `<!-- Last update: 2026-05-07 17:00 -->`)

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
