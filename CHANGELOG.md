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
