# Changelog Nomacast.fr

Historique des modifications du site. Format : sessions chronologiques, plus récente en haut.

---

## 🏛️ Décisions techniques actées

> Cette section consigne les **choix produit/architecture/tooling** validés. Elle existe pour éviter de remettre en question ces décisions à chaque session.  
> Format : décision · contexte · date d'arbitrage. À enrichir au fil du temps.

### Tracking & analytics

- **Microsoft Clarity : NON UTILISÉ, décision définitive.** Installé puis désinstallé après réflexion ROI. Décision arbitrée : on n'utilisera pas Clarity, sujet clos. Ne pas le reproposer. Project ID historique (au cas où) : `wjpyepvasc`. (2026-04-30, confirmé 2026-05-01)

- **GA4 + GTM = stack analytics suffisante** pour la phase actuelle (acquisition Google Ads + suivi conversions de base). GTM ID : `GTM-M99NLF45`. (2026-04-30)

- **Cloudflare Turnstile** = uniquement protection anti-bot du formulaire de contact `envoyer.php` (CAPTCHA invisible). N'est PAS un CDN, pas de proxy global. À mentionner dans la politique de confidentialité comme sous-traitant (TODO Sprint 3). (2026-04-30)

### RGPD & consentement

- **Axeptio = solution de gestion du consentement.** Project ID : `69eb3efc348236c610906397`. Chargé via GTM. (2026-04-30)

- **Axeptio masqué uniquement sur tarifs.html mobile** (chevauchait le total HT du simulateur). Conformité RGPD partielle assumée pour cette page mobile uniquement. À régulariser quand la politique de confidentialité sera mise à jour avec mention Axeptio + Cloudflare. (2026-05-01)

- **Pas de bandeau cookie technique custom** : on s'appuie 100% sur Axeptio même quand il a des erreurs SDK ("Could not save consent"). Pas de fallback maison. (2026-05-01)

### Identité & branding

- **Nomacast** est une entité (en cours de création en SASU) **distincte et sans lien juridique** avec MatLiveProd EURL. Ce sont deux entreprises séparées. Le site nomacast.fr ne fait référence qu'à Nomacast. (contexte en cours)

- **RÈGLE ABSOLUE. Aucune mention de "MatLiveProd" dans le site nomacast.fr ni les fichiers techniques livrés.** Justification : MatLiveProd EURL et Nomacast sont deux entités distinctes sans aucun lien juridique. Aucune confusion à entretenir entre les deux. Périmètre concerné : HTML, CSS, JS, .htaccess, robots.txt, llms.txt, sitemap, schemas JSON-LD, meta tags, commentaires de code, et tout fichier déployé sur le serveur nomacast.fr. **Seule exception : ce CHANGELOG.md** (fichier privé, bloqué par `robots.txt`) qui peut le mentionner pour documenter la règle. À chaque livraison, vérifier `grep -ri matliveprod` sur tous les fichiers publiés. (2026-05-01)

- **MatLiveProd retiré de la politique de confidentialité** (ligne 228) sur demande du fondateur. Nomacast et MatLiveProd étant deux entités distinctes, il n'y a pas lieu de mentionner MatLiveProd sur le site Nomacast. La SASU Nomacast (en cours de création) sera mentionnée comme responsable du traitement à terme. (2026-05-01)

- **Positionnement éditorial : SOLO (JE / MES)** systématique. Pas de "nous", "notre équipe", "nos collaborateurs". Cohérence avec le pitch d'interlocuteur unique. (baseline)


### Identité visuelle

**Couleurs.** Bleu nuit principal `#0b1929` (var `--navy` et `--ink`), bleu/cyan accent `#5A98D6` (var `--cyan`, hover `#407DB8`), cyan light pour fonds `#EAF2FA` (var `--cyan-light`). Blancs et gris déclinés : `--white` `#ffffff`, `--off-white` `#f3f6fa`, `--ink-mid` `#1e3a5f`, `--ink-muted` `#4d6b8a`, `--ink-faint` `#a3bcd4`. Bordures : `--border` `#dae4f0`, `--border-light` `#eef3f9`.

**Typographie.** Outfit pour les titres (var `--font-head`), Plus Jakarta Sans pour le corps (var `--font-body`). Les deux chargées via Google Fonts. System UI en fallback.

**Layout.** Largeur max contenu : `1180px` (var `--max`). Padding horizontal responsive : `clamp(24px, 5vw, 64px)` (var `--h-pad`). Padding vertical sections : `clamp(80px, 10vw, 140px)` (var `--pad`).

**Composants récurrents.** Boutons `.btn-primary` (cyan) et `.btn-ghost` (border, fond transparent). Section CTA `.cta-section` sur fond `--off-white`. Cartes `.related-card` blanches avec bordure et hover cyan. Encarts pédagogiques `.fix-block` sur fond vert pâle pour les solutions techniques dans le blog.

**Règles éditoriales pour les eyebrows et labels.** Texte court en MAJUSCULES, letter-spacing 0.08em, couleur cyan. Pas d'emoji devant. Exemples valides : "TARIFS", "À PROPOS", "GUIDE TECHNIQUE". Exemples à proscrire : "💰 COMBIEN ÇA COÛTE ?", "🎯 POURQUOI ME CONFIER".

**Règle générale.** Aucun emoji décoratif dans le contenu produit (CTA, eyebrows, titres, paragraphes). Les coches `✓` à la Mailchimp sont également proscrites. Les listes de réassurance sont écrites en prose avec virgules, pas avec des puces ou des coches.

### SEO & AEO

- **Titles ≤ 60 caractères** sur toutes les pages indexées (limite Bing). Format : `Sujet · Nomacast` ou `Sujet | Nomacast`. (2026-04-30)

- **Meta descriptions ≤ 160 caractères** (limite SERP Google). (2026-05-01)

- **llms.txt à la racine** pour orienter les LLM crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.). 17 LLM autorisés explicitement, 15 SEO scrapers bloqués (AhrefsBot, SemrushBot, MJ12bot, etc.). (2026-04-30)

- **IndexNow activé** pour notification instantanée Google + Bing à chaque modif. Clé : `2438d00ec5944f38979efedc262f1dc0`. (2026-04-30)

- **Pages devis-* = landing pages Google Ads dédiées.** Caractéristiques volontaires : `noindex,follow`, exclues du sitemap.xml, **pas de menu nav** (focus conversion : un seul CTA = formulaire de devis), pas de footer riche. Ne pas standardiser avec le reste du site. (2026-05-01)

### Performance & infrastructure

> ⚠️ **Note 2026-05-06** : la migration de l'hébergement de LWS vers Cloudflare Pages rend une partie des éléments ci-dessous **obsolètes ou à reconfigurer** (la stack Cloudflare ne lit pas `.htaccess`). Voir la section "Migration LWS → Cloudflare Pages" (session 2026-05-06) pour le détail des points qui restent à traiter (WebP serving, headers de sécurité, pages d'erreur custom, formulaire de contact `envoyer.php`).

- **WebP transparent activé** via `.htaccess` : si `.png.webp` existe, le serveur le sert au lieu du PNG aux navigateurs compatibles. Conversion via `cwebp -q 85` dans Termux. (2026-04-30) — **OBSOLÈTE post-bascule** : Cloudflare Pages ne lit pas `.htaccess`. Pour conserver le serving WebP, deux options : (a) plan Cloudflare Pro pour activer Polish (auto-conversion images), (b) servir directement les `.webp` dans le HTML via `<picture><source srcset>`.

- **Compression Gzip + Brotli** activée. Cache 1 an sur images, 1 mois sur CSS/JS. (2026-04-30) — **Géré par Cloudflare post-bascule** : compression et caching sont automatiques sur Cloudflare Pages, pas besoin de configuration manuelle. Pour tuner les TTLs spécifiques : Cloudflare → Caching → Configuration.

- **Headers de sécurité** : HSTS, X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Permissions-Policy. CSP **NON activé** intentionnellement (casse GTM, GA4, Cloudflare Turnstile). (2026-04-30) — **À migrer post-bascule** : les directives `Header set` du `.htaccess` ne s'appliquent plus. Solutions Cloudflare Pages : (a) fichier `_headers` à la racine du repo (syntaxe Cloudflare Pages, équivalent direct), (b) Cloudflare Rules → Transform Rules → Modify Response Header. À traiter en priorité moyenne. HSTS reste actif via le toggle "Always Use HTTPS" + Cloudflare HSTS settings (SSL/TLS → Edge Certificates).

- **Fichier `default_index.html`** recréé automatiquement par LWS quand on le supprime. Contournement : `Redirect 301 /default_index.html → /` dans `.htaccess`. (2026-05-01) — **CADUC post-bascule** : Cloudflare Pages ne génère pas ce fichier parasite. Si une copie traîne dans le repo, elle peut être supprimée. La règle `_redirects` n'est plus nécessaire pour ça.

- **Page 404 personnalisée** : design Nomacast natif (pas de page LWS générique). Routée via `ErrorDocument 404 /404.html` dans `.htaccess` (idem 403 et 500 pour cohérence). (2026-05-01) — **À VÉRIFIER post-bascule** : Cloudflare Pages sert automatiquement `404.html` à la racine du repo si la requête ne matche aucune route. Le fichier `404.html` doit donc être présent à la racine du repo (à confirmer). Pour 403 et 500, Cloudflare a son propre comportement par défaut (pages d'erreur Cloudflare-branded). Si custom 403/500 souhaitées : `_redirects` ne le permet pas, il faut Pages Functions.

- **Formulaire de contact sécurisé multi-couches** : Cloudflare Turnstile (CAPTCHA invisible), honeypot, vérification origin/referer, anti-flood (rate limiting), content filter (anti-spam), anti-injection (sanitization). Ne pas redébugger : c'est volontairement strict. **Implémentation actuelle (post-bascule 2026-05-06) : Cloudflare Pages Functions + Resend**, voir sous-section "Email & formulaire" plus bas. (logique métier 2026-04-28, port JS 2026-05-06)

### UX & design

- **Logos clients trust bar : opacité 100%** (retiré `opacity: 0.9` qui était sur `.client-logo-wrap` dans `index.html`). Tous les logos sont au contraste normal, pas atténués. **Contexte historique** : un bug d'affichage du logo Johnson & Johnson (apparaissait gris) a été initialement diagnostiqué côté CSS, mais la cause réelle était le **mode sombre forcé de Brave** qui assombrit les images blanches. Le retrait de l'opacity n'a pas réglé le problème côté Brave (c'est un problème navigateur), mais c'est une amélioration UX globale. (2026-05-01)

- **Bouton flottant `.float-call` en bas à droite** : couleur cyan, présent sur 13 pages (services + landing principales). Se masque automatiquement via IntersectionObserver quand le footer arrive à l'écran. (2026-05-01)

- **`overflow-x: hidden`** systématique sur `html` et `body` pour éliminer le scroll horizontal mobile. (2026-05-01)

- **Pages légales (mentions, plan-du-site, politique)** : nav simplifiée volontaire (logo + bouton "retour accueil"), pas de menu burger complet. Choix design assumé. (2026-04-30)

### Hosting & DNS

- **Hébergeur web : Cloudflare Pages** (gratuit, CDN global). Auto-deploy depuis `main` du repo `github.com/Nomacast/nomacast.fr`. Build settings : Framework=None, Build command vide, Output `/`. URL canonique : `nomacast.fr`, URL technique fallback : `nomacast-fr.pages.dev`. (2026-05-06, migration depuis LWS)

- **Stockage vidéos : Cloudflare R2** (free tier 10 GB + bande passante illimitée). Bucket `nomacast-videos`. Public Development URL : `https://pub-70a39fad29f24255bdbfb5f3574e51cc.r2.dev`. Les `<video><source>` dans les HTML pointent directement vers cette URL R2. **Ne jamais remettre les vidéos dans le repo GitHub** (Cloudflare Pages a une limite stricte 25 MB par fichier, donc le repo est rejeté à la première vidéo HD). (2026-05-06)

- **DNS gérés par Cloudflare**. Nameservers : `mark.ns.cloudflare.com` et `monroe.ns.cloudflare.com`. Registrar du domaine `nomacast.fr` : reste **LWS** (changement de NS uniquement, pas de transfert de domaine). (2026-05-06)

- **HTTPS** : automatique via Cloudflare. Réglages activés : "Always Use HTTPS", "Automatic HTTPS Rewrites", Encryption mode "Full", TLS minimum 1.2. Plus de directive HTTPS dans `.htaccess` (le `.htaccess` ne s'applique plus de toute façon, Cloudflare Pages ne fait pas tourner Apache). (2026-05-06)

- **Records DNS critiques préservés à la bascule** :
  - MX : `SMTP.GOOGLE.COM` (Google Workspace, intact)
  - TXT SPF, DKIM (`dkim._domainkey`, `google._domainkey`), DMARC, vérification Google
  - A `mail` → IP serveur LWS, et CNAMEs `imap`/`pop`/`smtp` → `mail.nomacast.fr` : conservés en **DNS only** (gris, pas de proxy Cloudflare) pour les clients mail tiers type Thunderbird qui utiliseraient encore les protocoles LWS
  - CNAME `ftp` → `nomacast.fr` : DNS only (FTP non proxiable)
  - A `nomacast.fr` et CNAME `www` : Proxied (orange) → pointent vers Cloudflare Pages

- **Email pro : Google Workspace direct.** Boîtes : `evenement@nomacast.fr`, `agences@nomacast.fr`. **Pas de forwarding LWS** : le MX pointe directement vers Google Workspace, les emails arrivent en direct sans transit par LWS. (correction 2026-05-06, le CHANGELOG d'avant indiquait à tort un forwarding LWS → Gmail)

### Email & formulaire (backend serverless)

> Stack actée pour le traitement du formulaire de contact post-migration. Aucune dépendance LWS dans cette chaîne.

- **Cloudflare Pages Functions = backend serverless du formulaire.** Fichier `functions/envoyer.php.js` à la racine du repo. Le **filename mappe directement à l'URL** chez Cloudflare Pages : ce fichier intercepte `https://nomacast.fr/envoyer.php`. L'extension `.php.js` est un choix volontaire pour préserver la rétrocompatibilité avec les `<form action="envoyer.php">` (relatif) sans avoir à modifier les HTML. Le fichier exporte `onRequestGet` (refuse les GET, redirige vers homepage) et `onRequestPost` (traitement complet du form). (2026-05-06)

- **Resend = service d'envoi d'emails transactionnels** depuis le formulaire (à la place du `mail()` PHP/SMTP LWS). Free tier : 3 000 emails/mois, 100/jour. Domaine `nomacast.fr` vérifié via 3 records DNS auto-créés par l'intégration Resend↔Cloudflare : MX `send` → `feedback-smtp.eu-west-1.amazonses.com`, TXT `resend._domainkey` (DKIM), TXT `send` (SPF `v=spf1 include:amazonses.com ~all`). **Le SPF est appliqué uniquement au sous-domaine `send.nomacast.fr`**, le SPF Google Workspace du domaine racine reste intact (pas de conflit). Sender utilisé dans le code : `noreply@nomacast.fr`. (2026-05-06)

- **Cloudflare KV pour anti-flood.** Namespace `RATE_LIMIT` (créé sur Cloudflare → Workers & Pages → KV), bindé dans Pages Functions avec variable name `RATE_LIMIT` (Pages → Settings → Functions → KV namespace bindings). Clé `flood:{ip}`, TTL 60s (minimum Cloudflare KV, le PHP avait 30s côté `$_SESSION` mais 60s est OK). Si le binding est absent côté Cloudflare, le code détecte et skippe l'anti-flood sans crash. (2026-05-06)

- **Variables d'environnement Cloudflare Pages requises** (Settings → Variables and Secrets, type **Secret** chiffré) :
  - `RESEND_API_KEY` : clé API Resend `re_xxx...`, scope "Sending access" pour `nomacast.fr`
  - `TURNSTILE_SECRET_KEY` : Secret Key Cloudflare Turnstile (pas la Site Key qui est publique dans le HTML)
  - **Ces deux secrets sont obligatoires** pour que le formulaire fonctionne. Si l'un manque, le code rate sa redirection avec `?error=verify` ou `?error=send`. (2026-05-06)

- **Mapping URL ↔ fichier Pages Functions** (référence rapide) :

  | Fichier dans le repo | URL exposée |
  | --- | --- |
  | `functions/envoyer.php.js` | `https://nomacast.fr/envoyer.php` |
  | `functions/api/contact.js` (si créé un jour) | `https://nomacast.fr/api/contact` |
  | `functions/[id].js` (route dynamique) | `https://nomacast.fr/{anything}` |

- **Routage email** (logique conservée du PHP) :
  - Si `is_agence` coché dans le form → envoi vers `agences@nomacast.fr`
  - Sinon → envoi vers `evenement@nomacast.fr`
  - Dans les deux cas, copie d'archivage automatique sur `jerome.bouquillon@ik.me`
  - Sujet du mail : `Demande de devis - [AGENCE] [source] {societe ou nom} [nomacast.fr]` (les tags `[AGENCE]` et `[source]` n'apparaissent que s'ils sont pertinents)
  - Reply-To : email du visiteur (permet de répondre directement depuis Gmail)

- **Anti-spam (4 filtres séquentiels)** : 3+ liens dans le message, mots-clés blacklist (crypto, bitcoin, viagra, seo services, etc.), > 30% de caractères non-latins (cyrillique/chinois/arabe) sur message > 20 chars, header injection (`\r\n`, `bcc:`, `cc:`, `to:`, `content-type:`). Sur les filtres soft (liens/mots-clés/non-latins), redirection vers `merci.html` (simulate success) pour ne pas révéler le filtrage aux bots. Sur le filtre header injection (sécurité critique), redirection vers `index.html#contact?error=invalid`. (2026-05-06)

- **Sécurité Turnstile** : la **Secret Key** Turnstile DOIT être stockée uniquement dans la variable d'env `TURNSTILE_SECRET_KEY` côté Cloudflare Pages, jamais hardcodée dans le code source du repo. La **Site Key** (publique) reste dans le HTML, pas de problème. En cas d'exposition accidentelle de la Secret Key (commit, partage), la régénérer immédiatement via Cloudflare → Turnstile → site → Rotate Secret Key, puis mettre à jour la variable d'env. (2026-05-06)

- **Plus aucune dépendance LWS pour le formulaire.** Plus de FTP envoyer.php, plus de sous-domaine `form.nomacast.fr`, plus d'hébergement web LWS requis pour faire tourner du PHP. La formule LWS "Perso" peut être descendue à "Domaine" 0 € HT au prochain renouvellement (09/04/2027) si plus aucun autre service LWS n'est utilisé. Conservation de LWS comme registrar du domaine (changement de registrar non prévu). (2026-05-06)

### Documentation & process

- **Commentaire `<!-- Last update: YYYY-MM-DD HH:MM -->`** en tête de chaque fichier HTML modifié (juste après le DOCTYPE). Permet de repérer en un coup d'œil quand un fichier a été touché. (2026-05-01)

- **`CHANGELOG.md` à la racine** : historique chronologique par session + section "Décisions techniques actées" (cette section) pour ne pas remettre en question les choix actés. **Bloqué de l'indexation** via `Disallow: /CHANGELOG.md` dans `robots.txt`. (2026-05-01)

- **À chaque livraison** : vérifier `grep -ri matliveprod` sur tous les fichiers livrés (sauf CHANGELOG.md). (2026-05-01)

### Workflow & déploiement

- **Architecture Drive → GitHub → Cloudflare Pages, auto-deploy direct sur prod.** Source de vérité éditoriale : `G:\Mon Drive\NOMACAST\` (atelier, Claude lit/écrit via le connecteur Google Drive). Drag-drop ou modif d'un fichier dans Drive → push automatique sur `main` de `github.com/Nomacast/nomacast.fr` via Apps Script (trigger toutes les 1 min) → Cloudflare Pages détecte le push et déploie sur `nomacast.fr` en ~30 s. **Pas de preview/merge intermédiaire** : choix assumé, mode auto-deploy direct. Filet de sécurité = bouton Rollback Cloudflare en 1 clic dans Deployments en cas de pépin. (2026-05-06, refonte de l'architecture du 2026-05-05)

- **Apps Script "Nomacast Drive Sync"** sur `script.google.com`, lié au compte Google Workspace `production@matliveprod.com`. Fonction principale `syncDriveToGitHub` qui scanne récursivement le folder Drive racine (`functions/` et autres sous-dossiers inclus), détecte les modifs via comparaison du **state per-file** (modifiedTime + size par fichier, stocké dans la Script Property `FILE_STATES`), pousse chaque fichier modifié sur `main` via l'API GitHub `PUT /repos/{owner}/{repo}/contents/{path}`. Trigger time-driven every 1 minute. **Détection robuste** : un fichier dont le `modifiedTime` change dans n'importe quel sens (incluant un sens "vers le passé") ou dont la taille change est détecté comme modifié → résout le bug d'upload Drive Desktop avec timestamp local préservé. Reset complet possible via `setupInitialSync()` qui vide le state et re-pousse tous les fichiers au run suivant. Auth via Personal Access Token GitHub (scope `repo`) stocké dans le code (script perso non partagé). (v2 2026-05-06, refonte de la v1 du matin qui utilisait un timestamp global LAST_SYNC fragile)

- **Exclusions du sync Drive → GitHub** : `videos/` (servies par R2, pas par Pages), `files/` (héritage du robocopy initial qui peut traîner), fichiers système (`.DS_Store`, `Thumbs.db`, `desktop.ini`), dossier `.git`. Tout le reste à la racine de `NOMACAST/` est synchronisé. (2026-05-06)

- **`_redirects` à la racine du repo** pour les redirections 301 (remplace les `Redirect 301` de l'ancien `.htaccess`). Format Cloudflare Pages : une ligne par règle `<source> <destination> <code>`. Règles actuelles : `/cas-client-ag-maif.html → /cas-clients.html 301` et `/cas-client-pret-a-manger.html → /cas-clients.html 301`. Toute future redirection se fait dans ce fichier. (2026-05-06)

- **GitHub repo privé.** Repo `Nomacast/nomacast.fr` en visibilité privée. Compte GitHub `Nomacast` avec 2FA activée. **Plus de Git local en miroir** : le dossier `C:\Users\Hallelujah\Desktop\NOMACAST\files\` est obsolète et peut être supprimé. Plus de `deploy.sh`, plus de robocopy, plus d'édition Git Bash côté Jérôme. Tout passe par Drive. (2026-05-06, simplification depuis l'archi du 2026-05-05)

- **`.gitignore` à la racine du repo** : exclut systèmes (`.DS_Store`, `Thumbs.db`, `desktop.ini`), Sublime (`*.sublime-workspace`), backups (`*.bak`, `*.tmp`, `*~`, `.~lock.*`), logs (`*.log`), variables d'env (`.env`, `.env.local`). Pas de `node_modules` puisqu'il n'y a pas de build front. (2026-05-05)

### Logique commerciale du simulateur tarifs

Règles métier en place dans `tarifs.html` qui ne doivent pas être remises en question (validées par expérience commerciale) :

**Bundle son ↔ duplex** : les options Pack sonorisation et Intervenant à distance sont liées commercialement. L'ordre d'activation détermine le pricing.
- Si `son` est coché seul : `duplex` est affiché en anticipation comme "Offert" pour inciter au bundle.
- Si `duplex` est coché seul : `son` est affiché barré (750 → 500 €) pour montrer la remise à venir.
- Si les deux sont cochés et `son` a été coché en premier : son 750 € + duplex offert (bundle classique, le client a anticipé son besoin son et duplex est cadeau).
- Si les deux sont cochés et `duplex` a été coché en premier : duplex 250 € + son réduit à 500 € (remise pour mutualisation, le client gagne 250 € sur son).
- Logique implémentée via `state.activationOrder` qui mémorise l'ordre des cases cochées.
- **Le total facturé est identique dans les deux cas** : seule la répartition affichée diffère. C'est pour cette raison que `duplex` est exclu du calcul de la grille A (en plus de `son`), pour neutraliser l'effet de l'ordre sur la remise.

**Calcul des paliers de remise partenaire** : le total HT pris en compte pour atteindre un palier exclut Pack sonorisation (`son`), Intervenant à distance (`duplex`) et Cadreur HF (`cadreur_hf`). Les remises sont concentrées sur les options à coût marginal nul (stream, rushs 4K, écran de retour, etc.) et non sur les packs à fort coût de sous-traitance ni sur les options hors mécanique partenaire.

**Grille de paliers** : 1500 → 150 €, 2000 → 200 € (requiresMarginOption), 2250 → 250 €, 2500 → 350 €, 2750 → 450 €, 3000 → 550 €, 3250 → 700 €, 3500 → 800 €, 4000 → 1000 €, 5000 → 1200 €, 6000 → 1400 €. **Pas de palier intermédiaire à 1750** : le palier 1500 (entrée) couvre toute la zone jusqu'à 2000, pour que la remise au démarrage (journée seule) et sur les paniers très légers (demi-j + 1 option à 250 €) reste à 150 €. Au-delà, la grille passe directement au palier 2000 qui demande Pack son ou Pack lumière.

**Palier 1500 accessible sans option payante** : le palier d'entrée (1500 → 150 €) s'applique dès que `htHorsExclus >= 1500`, même sans option payante cochée. Permet d'offrir 150 € de remise au démarrage sur journée et 2 jours (où la base atteint déjà ce seuil). Sur demi-journée et 3 jours+, le plancher de marge (égal à la base) ramène la remise à 0 € en pratique, ce qui est le comportement voulu.

**Palier `requiresMarginOption`** : à 2000 € (palier 200 €), la remise ne s'applique que si `son` ou `lumiere` est coché. Logique : sans pack à marge, pas d'incitation supplémentaire.

**Multiplicateur de remise par durée** : le montant de remise issu de la grille A est multiplié par un coefficient qui reflète le delta entre tarif "plein" (1750 €/jour) et base réelle. Demi-journée et journée : ×1.0 (pas de delta). 2 jours : ×1.556 (1750×2 / 2250). 3 jours+ : ×1.75 (1750×3 / 3000). Effet exponentiel voulu : plus le client engage de jours, plus la remise est généreuse.

**Charm pricing monotone** : le bonus charm ramène le total apparent à une valeur en "950" (1 950, 2 950, 3 950, 4 950, 5 950) tant que le seuil correspondant est atteint. Bonus plafonné à 250 € par franchissement. Bypass plancher : 50 € autorisés sous le plancher au seuil 2 000 (ex. demi-j + Pack lumière → 1 950), 250 € autorisés au seuil 4 000 (ex. 3 jours+ + Pack lumière → 3 950, accepté comme micro-sacrifice marge sur les paniers minimaux 3 jours+).

**Plafond strict 2 950 € sur demi-journée et journée pour MORNING/SOLARIS** : la remise comptable absorbe le surplus. AGENCE n'est PAS soumis à ce plafond. Cadreur HF et contenus additionnels (Best-of, Interviews) s'ajoutent APRÈS le plafond et ne sont pas absorbés (ce sont des prestations à coût direct non offrables).

**Bonus options** : +50 € de remise par option payante cochée à partir de la 2e, sans condition de seuil. Comptage : toutes les options payantes (= !isForcedByPartner && !outsidePartner), y compris son et duplex chacun pour 1.

**Comptage des options payantes** : pour le calcul du palier (`nbOptionsPayantes`) et du bonus options (`nbPayantesEffective`), on inclut TOUTES les options cochées hors options forcées par le code partenaire et hors cadreur HF. Cela inclut son, duplex, et duplex offert par bundle son+duplex (qui est cochée par le client même si affichée comme "Inclus"). Garantit que cocher son ou duplex en 1ère option déclenche bien le cap 150 €. Le prix de son et duplex reste exclu de `htHorsExclus` (calcul de seuil de palier) pour neutraliser l'ordre du bundle.

**Cap 150 € absolu sur la 1ère option payante (sauf Pack lumière)** : quand `nbPayantesEffective === 1` ET que le Pack lumière n'est PAS coché, la remise totale (grille A + bonus + charm) est plafonnée à 150 €. Empêche le charm pricing d'absorber entièrement les petites options (cam_sup, stream, rush4k, ecran, duplex, son) sur 2 jours et 3 jours+. Exception Pack lumière : conserve les effets psychologiques 1 950 € et 3 950 €.

**Floor 2 950 € sur MORNING/SOLARIS demi-j et journée** : si `totalAvantRemise > 3 000 €` ET le total après remise+charm descend sous 2 950 €, le total est remonté à 2 950 € en réduisant la remise. Garantit l'effet plafond commercial sur les paniers conséquents. Conséquence : sur certains parcours, la remise peut localement baisser quand on franchit le seuil et active le floor.

**Stricte croissance abandonnée** : la priorité est donnée aux paliers psychologiques et au floor 2 950 €. La remise affichée peut localement baisser entre deux paniers consécutifs quand un palier psy est franchi. Le total client reste cohérent (chemin-indépendance préservée).

**Delta dégressif visible dans le bandeau remise** : la générosité du tarif multi-jours est rendue visible au client comme une remise additionnelle dans le bandeau "Remise tarif partenaire". Calcul : `DEGRESSIF_SAVINGS[duration] = 1750 × jours - base réelle`. Soit 0 € (demi-j et journée), 1 250 € (2 jours), 2 250 € (3 jours+). Affiché uniquement quand un code partenaire est actif. Effet purement d'affichage : n'impacte pas le total facturé.

**Remise non-décroissante (enveloppe monotone)** : la remise affichée ne baisse JAMAIS quand le client ajoute une option. Implémenté via une enveloppe monotone : pour un panier P, la remise effective est le maximum entre `remise_naive(P)` et `remise(P\{O})` pour toute option O dans P (récursif avec mémoïsation). Garantit deux propriétés simultanées : (1) la remise monte ou stagne quand le client ajoute, jamais ne baisse, (2) le calcul est déterministe et chemin-indépendant (le total final ne dépend pas de l'ordre d'activation des options). Remplace l'ancien système avec mémoire d'état (`_lastBrut`, `_lastDiscount`, `_lastTotal`, `_lastAbsorbableSet`) qui créait du bug chemin-dépendant.

(2026-05-04, règles existantes documentées rétrospectivement, refonte du moteur de calcul le 2026-05-04 soir)

### Coûts internes (sous-traitance)

Coûts variables que je paie à mes sous-traitants quand l'option est cochée. Sert à calculer ma marge réelle (vs marge commerciale brute) et à déterminer mon plancher de rentabilité par configuration.

- **Pack sonorisation** (`son`) : coût TOTAL selon la durée (pas additif jour par jour, c'est le coût complet de la prestation son sur la durée). Demi-journée et journée = 550 € HT. 2 jours = 825 € HT (550 × 1,5). 3 jours = 1 237,50 € HT (825 × 1,5). Multiplicateur ×1,5 cumulatif sur le total précédent. Inclut technicien son freelance + matériel son. Facturé client : 750 € HT (×dayMult standard du simulateur). (2026-05-03, précision 2026-05-04)
- **Pack lumière** (`lumiere`) : 400 € HT par jour (linéaire, pas de multiplicateur). Inclut technicien lumière freelance + projecteurs + habillage scène. Facturé client : 750 € HT (×dayMult standard). (2026-05-03)
- **Cadreur HF** (`cadreur_hf`) : 600 € HT par jour (linéaire pur, pas de multiplicateur). Inclut cadreur freelance senior + caméra Blackmagic 4K (ou équivalent) + émetteur/récepteur HF HDMI/SDI + trépied vidéo. Facturé client : 850 € HT/jour linéaire. Marge brute 250 €/jour. Cette option est **hors mécanique partenaire** : elle ne génère pas de remise grille A, n'est pas absorbée par le plafond 2 950 €, et son prix s'ajoute systématiquement après le total partenaire. Justification : marge brute trop fine pour être offerte. (2026-05-04)

À compléter au fil du temps avec les autres options qui ont un coût variable réel (caméra sup avec cadreur, montage par chapitres avec monteur freelance, etc.).

### Plancher de rentabilité personnel

Montant minimum que je dois encaisser sur une opération pour que ce soit rentable (couvre ma journée de travail, l'amortissement matériel, les déplacements moyens, les charges proratisées). C'est le seuil en dessous duquel je perds de l'argent.

À ne pas confondre avec le plancher partenaire AGENCE/MORNING/SOLARIS du simulateur, qui est un paramètre commercial de calcul des remises.

- Demi-journée : 1 500 € HT
- Journée : 1 500 € HT
- 2 jours : 2 000 € HT
- 3 jours : 3 000 € HT

Ces valeurs sont aussi codées dans `tarifs.html` (constante `MARGE_MIN` dans `getPartnerDiscount()`) pour calculer le plancher de marge utilisé par le simulateur. Quand `son` ou `lumiere` est coché, le plancher est augmenté du coût interne correspondant.

À utiliser comme référence pour calculer mon bénéfice net réel sur une opération : `bénéfice net = total facturé - plancher de rentabilité - coûts internes (son, lumière, etc.) - cadeau commercial éventuel`. (2026-05-04, alignement code/CHANGELOG le 2026-05-04)

### Moteur de calcul du simulateur (`tarifs.html`)

Règles du moteur **dans l'ordre de priorité** (les règles hautes priment toujours sur les basses). État acté au 2026-05-05.

**Règles métier (priorité absolue)**

1. **Plancher de marge minimum.** 1 500 € (demi-j et journée), 2 000 € (2 jours), 3 000 € (3 jours+) + coûts packs (lumière, son). Aucune remise ne peut faire descendre le total sous ce plancher.

2. **Pas de remise sans option payante.** Si `nbOptionsPayantes === 0`, remise = 0 €. S'applique à toutes les durées et tous les codes partenaires.

3. **Le total ne peut JAMAIS baisser quand on coche une option.** Pour toute option payante O ajoutée à un panier P : `total(P+O) ≥ total(P)`. Équivalent : `remise(P+O) ≤ remise(P) + prix(O)`. Cocher une option ne peut jamais faire descendre le total facturé. Implémentée dans l'enveloppe monotone via le calcul de `upperBoundDeltaTotal = min over O: (sub.remise + prix(O))`. Prime sur toutes les règles enveloppe (règles 5, 6, 14).

4. **Cap 150 € absolu sur la 1ère option payante.** Quand `nbPayantesEffective === 1`, remise = 150 € exactement, peu importe la nature de l'option (Pack lumière inclus). Override les règles 5 et 7. Engagement commercial fixe : "150 € de remise dès la 1ère option cochée".

5. **Cap remise 50 % du prix de chaque option ajoutée.** Pour toute option payante O ajoutée à un panier P : `delta_remise(O) ≤ 50 % × prix(O)`. Le client paie au minimum 50 % du prix de chaque option qu'il ajoute. Implémentée dans l'enveloppe via `upperBoundCap50PerOpt = min over O: (sub.remise + 0.5 × prix(O))`. Cette règle est appliquée même sur palier psy pour éviter les stagnations apparentes côté client (option qui semble offerte). Conséquence : sur certains paniers où le palier psy 1 950 € serait atteint par charm, le total atterrit légèrement au-dessus pour respecter le cap 50 % par option ajoutée.

6. **Non-décroissance stricte de la remise.** Pour toute option payante O ajoutée à un panier P : `delta_remise ≥ 0`. La remise affichée ne baisse pas quand on coche une option supplémentaire. Implémentée par `bestRemiseRaw = max(naïf, max sub.remise)`. Cède devant les règles 3 et 5 en cas de conflit mathématique.

7. **Charm pricing monotone vers paliers psy** (1 950 / 2 950 / 3 950 / 4 950 / 5 950 €). `CHARM_MAX_BONUS = 250 €`. Bypass plancher de 50 € au seuil 2 000, de 250 € au seuil 4 000 (pour permettre la descente 4 200 → 3 950 sur 3 jours+ + lumière).

8. **Plafond strict 2 950 €** sur MORNING/SOLARIS demi-j et journée uniquement. AGENCE et multi-jours non concernés. Au-delà du plafond, la remise est augmentée pour ramener le total à 2 950 €.

**Calcul de palier et bundle**

9. **`htHorsExclus`** (HT pris en compte pour atteindre un palier de la grille A) : exclut son, duplex, cadreur HF. Concentre la remise sur les options à coût marginal nul et neutralise l'ordre du bundle son↔duplex.

10. **Bundle son+duplex.** Ordre détermine l'affichage uniquement, total facturé identique. Si son first → duplex offert (price = 0). Si duplex first → son passe à 500 € (ligne barrée 750 → 500).

**Mécaniques complémentaires**

11. **Floor 2 950 €** : si `totalAvantRemise > 3 000 €` ET le total après remise descend sous 2 950 € sur MORNING/SOLARIS demi-j et journée, on remonte le total à 2 950 €.

12. **Comptage des options payantes.** `nbOptionsPayantes` et `nbPayantesEffective` incluent toutes les options cochées hors options forcées par le code partenaire et hors cadreur HF. Inclut son, duplex, et duplex offert par bundle.

**Garanties de l'enveloppe monotone (chemin-indépendance)**

13. **Architecture deux étages : `computeNaive` (calcul brut, pure) + `computeWithEnvelope` (enveloppe monotone récursive avec mémoïsation).** L'enveloppe explore tous les sous-paniers pour garantir la chemin-indépendance et appliquer les règles 3, 5, 6.

14. **Delta total +50 € minimum par option payante ajoutée** (sauf palier psy). Cède devant règles 3, 5, 6 en cas de conflit.

**Calibration et données de calcul**

15. **Multiplicateur durée sur la grille A** : ×1.0 (demi-j et journée), ×1.556 (2 jours), ×1.75 (3 jours+). Arrondi à la tranche de 5 € supérieure (`Math.ceil(x / 5) * 5`).

16. **Base HT par durée** : 1 500 € (demi-j), 1 750 € (journée), 3 000 € (2 jours), 4 000 € (3 jours et plus, par tranche de 3 jours).

17. **5G** : prix linéaire dégressif 350 / 350 / 500 / 650 € selon durée.

18. **Best-of** : prix par durée 1 150 / 1 150 / 1 650 / 2 150 €.

**Cas particulier**

19. **Cadreur HF** : `outsidePartner: true`. Hors mécanique partenaire (pas de remise, pas pris en compte dans plafond/floor). Ajouté en supplément au total facturé après tous les calculs. 850 €/jour client (1 700 € sur 2 jours, 2 550 € sur 3 jours+).

**Affichage**

20. **Récap : ordre Options → Contenus post-événement → Remise tarif partenaire → Total**. La ligne "Remise tarif partenaire" est placée en bas du récap, sous toutes les options et contenus additionnels, juste avant le total.

21. **Delta dégressif visible dans le bandeau remise** : 0 € (demi-j et journée), 1 250 € (2 jours), 2 250 € (3 jours+). Affiché uniquement avec un code partenaire actif. Effet purement visuel (n'impacte pas le total facturé).

22. **Bundle savings** : ajouté à la remise affichée dans le bandeau quand son first et duplex offert (effet wow). Quand duplex first, le savings est déjà visible sur la ligne son barrée.

(Liste actée 2026-05-05)

### Décisions reportées (à trancher plus tard)

- **Politique de confidentialité** : à compléter avec mentions Axeptio + Cloudflare Turnstile (Sprint 3, après création SASU Nomacast).
- **Réactivation Axeptio sur tarifs.html mobile** : quand politique de confidentialité conforme.
- **Pages devis-*** : conversion PNG → WebP (60 images, Sprint 4).
- **Blog** : décider si on produit du contenu régulier ou si on désactive `blog.html` (1 seul article actuellement).
- **og-image.jpg** : vérifier qu'elle fait bien 1200x630 px (5 Ko, suspect).
- **`.wpsql_nomacast.fr.sqlite`** : suppression manuelle prévue par le fondateur (reliquat WordPress).
- **Backlinks clients** : demander à Louvre, Figma, Comédie-Française, Johnson & Johnson, GL Events, EBG, Morning Coworking de mentionner Nomacast sur leurs pages partenaires/prestataires audiovisuels. Plus gros levier SEO long terme. (priorisé pour Sprint dédié backlinks)
- **Google Business Profile** : à créer (15 min). Gros impact SEO local Paris + apparition Maps + réceptacle pour avis clients (qui pourront alimenter Schema `aggregateRating` ensuite).

---

## 2026-05-06 (suite), Migration formulaire vers Cloudflare Pages Functions + Resend

### Contexte / motivation

Suite à la bascule DNS de la nuit (LWS → Cloudflare Pages, session précédente), le formulaire `envoyer.php` était cassé en prod : Cloudflare Pages ne fait pas tourner PHP. Premier patch tenté : sous-domaine `form.nomacast.fr` qui restait sur LWS via Multi-Domaines alias (DNS only sur Cloudflare). Workaround fonctionnel mais conservait une dépendance LWS coûteuse (formule "Perso" 47.88 €/an obligatoire pour conserver l'hébergement web). 

Décision actée : migrer définitivement vers Cloudflare Pages Functions + Resend pour l'envoi mail. Bénéfices : (1) plus aucune dépendance LWS pour le traitement du formulaire, (2) possibilité de descendre la formule LWS à "Domaine" 0 € HT au renouvellement (09/04/2027), (3) tout le code dans le repo Drive→GitHub→Pages, plus de FTP, (4) backend serverless qui scale tout seul.

### Architecture finale

```
Visiteur (browser)
    │
    │ POST sur https://nomacast.fr/envoyer.php
    ▼
Cloudflare edge (DNS + CDN + Pages routing)
    │
    │ Pages Functions intercepte /envoyer.php → functions/envoyer.php.js
    ▼
functions/envoyer.php.js (JavaScript serverless)
    │
    ├──► Turnstile siteverify API (validation captcha)
    ├──► Cloudflare KV namespace "RATE_LIMIT" (anti-flood, TTL 60s)
    ├──► Resend API (envoi mail via SES eu-west-1)
    │       │
    │       └──► Boîtes Google Workspace
    │            evenement@nomacast.fr / agences@nomacast.fr
    │            + copie jerome.bouquillon@ik.me
    │
    └──► Redirect 302 vers https://nomacast.fr/merci.html?type=devis|agence
```

### Setup Cloudflare réalisé

- **Compte Resend créé** sur `resend.com`, sign-in Google. Domaine `nomacast.fr` ajouté et vérifié via l'intégration native Resend↔Cloudflare (3 records DNS auto-créés sur la zone Cloudflare). Verification status : **Verified**.
- **API Key Resend** créée avec scope "Sending access" pour `nomacast.fr`. Stockée dans la variable d'env Cloudflare `RESEND_API_KEY` (Secret chiffré). Format `re_xxx...`.
- **Records DNS Resend ajoutés automatiquement** dans la zone Cloudflare (DNS only, gris) :
  - `MX send 10 → feedback-smtp.eu-west-1.amazonses.com` (réception bounces/complaints)
  - `TXT resend._domainkey → p=MIGfMA0...` (DKIM, signature des emails)
  - `TXT send → "v=spf1 include:amazonses.com ~all"` (SPF appliqué uniquement au sous-domaine `send.nomacast.fr`)
- **Le SPF Google Workspace du domaine racine reste intact** (les records Resend sont sur le sous-domaine `send`). Aucun conflit avec les emails reçus sur `evenement@` / `agences@`.
- **KV namespace `RATE_LIMIT`** créé sur Cloudflare → Workers & Pages → KV → Create namespace.
- **Binding KV** configuré dans Pages → projet `nomacast-fr` → Settings → Functions → KV namespace bindings → Variable name `RATE_LIMIT` lié au namespace `RATE_LIMIT`.
- **Variables d'environnement** ajoutées dans Pages → Settings → Variables and Secrets (type Secret chiffré) :
  - `RESEND_API_KEY` = clé Resend
  - `TURNSTILE_SECRET_KEY` = Secret Key Turnstile (régénérée pour invalider l'ancienne qui était hardcodée dans le PHP)

### Code livré

- **`functions/envoyer.php.js`** (nouveau, ~250 lignes JavaScript) : port fidèle de la logique `envoyer.php` en Pages Functions. Fonctions exportées :
  - `onRequestGet()` : refuse les GET, redirige vers `https://nomacast.fr/`.
  - `onRequestPost(context)` : traitement complet en 11 étapes :
    1. Parse `formData` (multipart ou x-www-form-urlencoded)
    2. **Honeypot** : champ `website` doit être vide, sinon simule succès silencieusement
    3. **Origin check** : `referer` doit commencer par `https://www.nomacast.fr` ou `https://nomacast.fr`
    4. **Turnstile siteverify** : POST vers `https://challenges.cloudflare.com/turnstile/v0/siteverify` avec `secret` (env), `response` (token form), `remoteip` (CF-Connecting-IP)
    5. **Anti-flood KV** : lookup `flood:{ip}` ; si présent → 302 `?error=flood`. Sinon `put('flood:{ip}', '1', { expirationTtl: 60 })`
    6. **Cleanup** : équivalent `htmlspecialchars` + `strip_tags` + `trim` sur tous les champs
    7. **Validation** : email regex + telephone obligatoire, message ≤ 5000, nom/société ≤ 200
    8. **Anti-spam (4 filtres)** : 3+ liens, mots-clés blacklist, > 30% caractères non-latins, header injection
    9. **Routage** : `agences@nomacast.fr` si `is_agence` coché, sinon `evenement@nomacast.fr`. Copie systématique sur `jerome.bouquillon@ik.me`.
    10. **Construction du mail** : sujet avec tags `[AGENCE]` et `[source]`, corps texte avec séparateurs `─`, métadonnées IP/Referer/Date Paris en pied
    11. **Envoi via Resend API** : `POST https://api.resend.com/emails`, Bearer auth, JSON. Sender `Formulaire Nomacast <noreply@nomacast.fr>`, `reply_to` = email du visiteur, destinataires = array `to`. En cas d'erreur Resend (status non-2xx), redirect `?error=send`.
    12. **Redirection succès** : 302 vers `https://nomacast.fr/merci.html?type=agence` ou `?type=devis` (utilisé par GA4 pour différencier les conversions)

- **21 HTML modifiés** : `action="envoyer.php"` (relatif) **PRÉSERVÉ tel qu'à l'origine**. C'est le revert volontaire de la modif `https://form.nomacast.fr/envoyer.php` poussée à 02:10 cette nuit. Le filename `envoyer.php.js` côté Pages Functions intercepte automatiquement les POST sur `nomacast.fr/envoyer.php`, donc l'action relative `envoyer.php` continue de fonctionner sans modif des HTML. Timestamp `<!-- Last update: 2026-05-06 10:57 -->` mis à jour. Liste : `agences-partenaires`, `captation-4k`, `captation-conference-seminaire`, `captation-evenement-entreprise`, `captation-interview-table-ronde`, `captation-video-corporate`, `captation-video-evenement`, `devis-captation-4k`, `devis-captation-conference-seminaire`, `devis-captation-evenement`, `devis-captation-table-ronde`, `devis-emission-live-corporate`, `devis-live-streaming-evenement`, `devis-live-streaming-paris`, `emission-live-corporate`, `index`, `live-streaming-evenement`, `prestataire-captation-evenement`, `streaming-multi-plateformes`, `streaming-multiplex-multi-sites`, `tarifs`.

- **Apps Script `Nomacast Drive Sync` modifié** pour parcourir récursivement le sous-dossier `functions/` dans Drive et préserver le path complet (`functions/envoyer.php.js`) côté GitHub. Point de vigilance : sans cette modif, le `envoyer.php.js` resterait à la racine du repo et Cloudflare ne le routerait pas.

### Process de déploiement (workflow opérationnel)

1. Créer le sous-dossier `G:\Mon Drive\NOMACAST\functions\` (s'il n'existe pas).
2. Drop `envoyer.php.js` dans `G:\Mon Drive\NOMACAST\functions\`.
3. Drop les 21 HTML modifiés dans `G:\Mon Drive\NOMACAST\` (à la racine, écrase les versions précédentes qui contenaient `https://form.nomacast.fr/envoyer.php`).
4. Apps Script trigger 1 min pousse l'ensemble sur GitHub `main`.
5. Cloudflare Pages auto-deploy en ~30 s (visible dans Pages → Deployments).
6. Variables d'env (`RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`) et KV binding (`RATE_LIMIT`) déjà configurés au préalable, le code les trouve au runtime.

**Plus jamais de manipulation FTP** : tout passe par Drive comme le reste du site.

### Validations à faire post-déploiement

- Test 4G fenêtre privée sur `https://nomacast.fr/tarifs.html` → submit → mail reçu sur `evenement@nomacast.fr` + copie `jerome.bouquillon@ik.me`, redirection vers `https://nomacast.fr/merci.html?type=devis`
- Test cas agence sur `agences-partenaires.html` (case `is_agence` cochée par le form) → mail vers `agences@nomacast.fr`, redirect `?type=agence`
- Test Turnstile : décocher manuellement le widget côté browser → submit doit échouer avec redirect `?error=captcha`
- Test anti-flood : 2 soumissions du même formulaire en moins de 60s depuis la même IP → la 2ème doit retourner `?error=flood`
- Vérifier que GA4 enregistre les conversions séparément selon le paramètre `type` dans `merci.html`

### Cleanup post-validation

À faire **après** que les tests bout-en-bout sont passés (ne pas couper les ponts trop tôt) :

1. Cloudflare DNS → suppression du record A `form` (83.229.19.73)
2. LWS Panel → Multi Domaines → suppression de l'alias `form.nomacast.fr`
3. Drive : suppression de `envoyer.php` à la racine NOMACAST (Apps Script poussera la suppression sur GitHub, Cloudflare Pages déploie sans le fichier)
4. LWS via FTP : suppression de `envoyer.php` (optionnel, plus utilisé par personne)
5. Mémoire à mettre à jour : retirer la mention `form.nomacast.fr` de l'archi
6. Politique de confidentialité (`politique-de-confidentialite.html`) : retirer LWS comme sous-traitant pour le formulaire (LWS reste registrar uniquement). Ajouter Resend comme sous-traitant pour envoi mail (transferts hors UE encadrés par CCT, AWS SES eu-west-1). Maintenir Cloudflare comme sous-traitant principal (Pages + R2 + DNS + KV).

### Sécurité (point d'attention)

⚠️ **Régénérer la Secret Key Turnstile** avant la mise en prod (action recommandée même si le repo est privé). L'ancienne Secret Key (`0x4AAAAAAD...`) était hardcodée dans `envoyer.php` qui est synchronisé sur GitHub via Drive. Bonne pratique : aucun secret en clair dans le code source. Action : Cloudflare Dashboard → Turnstile → site `nomacast.fr` → Rotate Secret Key. Mettre la nouvelle valeur dans `TURNSTILE_SECRET_KEY` côté Pages env vars. **La Site Key (publique, dans le HTML) reste la même**, pas besoin de modifier les HTML.

### Coût

- **Resend free tier** : 3 000 emails/mois, 100/jour, 1 domaine vérifié. Volume actuel < 5 mails/jour, marge énorme.
- **Cloudflare Pages Functions** : 100 000 invocations/jour gratuites. Volume estimé < 100 invocations/jour (anti-bot rejette la majorité avant Resend).
- **Cloudflare KV** : 100 000 reads/jour, 1 000 writes/jour, 1 GB storage gratuits. Anti-flood ne stocke qu'un timestamp éphémère TTL 60s par IP, volume négligeable.
- **Total surcoût** : 0 €/an. Économie attendue à terme : ~48 €/an de formule LWS au renouvellement 2027.

### Bug fix : URLs vidéo LWS au lieu de R2 (corrigé en cours de session)

Lors de la rédaction des 21 HTML modifiés, les fichiers source utilisés (uploads dans le chat) étaient des versions PRÉ-migration R2 du matin. Conséquence : 11 HTML sortaient avec `https://nomacast.fr/videos/mashup.mp4` au lieu de `https://pub-70a39fad29f24255bdbfb5f3574e51cc.r2.dev/mashup.mp4` (le hero vidéo `mashup.mp4` est partagé entre `index.html` et 10 pages services). Si poussées en l'état, ces pages auraient eu un hero vidéo cassé en prod (Cloudflare Pages ne contient plus le dossier `videos/`).

Détection : J a noté que les URLs vidéo avaient été remplacées (par erreur). Correction immédiate via `sed` sur les 11 fichiers concernés. Tous les `mashup.mp4` repointent vers R2.

**Leçon procédurale (intégrée à la mémoire)** : pour toute modification multi-fichiers sur Nomacast, lire les versions actuelles via le connecteur Drive plutôt que de partir des uploads chat. Drive est la source de vérité, le disque local de J peut être obsolète par rapport à des modifs faites directement dans Drive.

Fichiers re-livrés (correctifs URLs vidéo R2) : `index.html`, `captation-4k.html`, `captation-conference-seminaire.html`, `captation-interview-table-ronde.html`, `captation-video-evenement.html`, `devis-live-streaming-paris.html`, `emission-live-corporate.html`, `live-streaming-evenement.html`, `prestataire-captation-evenement.html`, `streaming-multi-plateformes.html`, `streaming-multiplex-multi-sites.html`.

### Validation production — formulaire opérationnel

Test bout-en-bout réussi. Le formulaire envoie correctement les emails via Resend, redirige vers `merci.html`, l'anti-flood KV est opérationnel, le hero vidéo charge depuis R2. Validations confirmées :

- Test 4G fenêtre privée sur `https://nomacast.fr/tarifs.html` → submit → email reçu sur `evenement@nomacast.fr` + copie sur `jerome.bouquillon@ik.me`, redirection vers `https://nomacast.fr/merci.html?type=devis`
- Test desktop fenêtre privée → mêmes validations
- Pages Function `functions/envoyer.php.js` bien détectée et exécutée par Cloudflare (intercepte `/envoyer.php`)
- Resend API répond correctement avec la clé en variable d'env, livraison Gmail sans délai notable
- Variables d'env Cloudflare Pages (`RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`) et binding KV (`RATE_LIMIT`) tous fonctionnels

La migration Pages Functions + Resend est en **production effective**. Plus aucune dépendance LWS pour le traitement du formulaire.

### Apps Script v2 — détection robuste des modifications (refonte LAST_SYNC → state per-file)

**Bug découvert sur la v1** : le script utilisait un timestamp global `LAST_SYNC` (Script Property) et comparait `file.getLastUpdated() > LAST_SYNC` pour détecter les modifications. Faille : Drive Desktop préserve le `modifiedTime` du fichier source local lors de l'upload, donc un fichier déposé dans Drive peut avoir un timestamp ANTÉRIEUR à `LAST_SYNC`. Conséquence : Apps Script ne le détecte pas et ne le pousse pas. C'est arrivé sur `envoyer.php.js` (modifiedTime `2026-05-06 06:59 UTC` alors que LAST_SYNC était postérieur, donc pas poussé sans intervention manuelle de J).

Workaround manuel évoqué (forcer le timestamp via éditeur ou clic droit → copier/renommer dans Drive) jugé non viable à long terme par J.

**Refonte v2** : remplacement de `LAST_SYNC` (un seul timestamp global) par un **state per-file** stocké en JSON dans la Script Property `FILE_STATES`. Pour chaque fichier suivi, on stocke `{modifiedTime, size}` lors du dernier push réussi. Au prochain scan :

- Si le fichier n'est pas dans le state → considéré comme nouveau, poussé
- Si `modifiedTime` actuel ≠ celui du state (dans n'importe quel sens) → considéré comme modifié, poussé
- Si `size` actuel ≠ celle du state → considéré comme modifié, poussé
- Sinon → skip

Plus aucune dépendance à un timestamp global. Robuste à tous les scénarios d'upload Drive Desktop (timestamp préservé, modif en bypass, copie de fichier).

**Migration** : J colle le nouveau `Code.gs` dans `script.google.com` → projet `Nomacast Drive Sync` (écrase l'ancien). Exécute manuellement `setupInitialSync()` une fois pour vider le state. Au prochain trigger, TOUS les fichiers présents dans Drive sont repoussés sur GitHub (~30 fichiers, ~1 min de runtime), puis le fonctionnement redevient incrémental.

Code livré : voir `Code.gs` dans les outputs de cette session (à coller dans Apps Script).

### Fichiers créés ou modifiés

- `functions/envoyer.php.js` (nouveau, dans `Drive/NOMACAST/functions/`) : Pages Function ~250 lignes
- 21 HTML à la racine `Drive/NOMACAST/` : `action="envoyer.php"` relatif restauré, timestamp updated
- 11 HTML correctifs URLs vidéo R2 (recouvrement avec les 21 ci-dessus pour `index.html` et 10 pages services)
- `Code.gs` (Apps Script v2 state per-file) : à coller dans `script.google.com` → projet `Nomacast Drive Sync` (écrase l'ancien)
- `CHANGELOG.md` : nouvelle session + nouvelle sous-section "Email & formulaire" dans Décisions techniques actées + maj du bullet Apps Script
- Cloudflare Pages : variables d'env `RESEND_API_KEY` et `TURNSTILE_SECRET_KEY`, KV binding `RATE_LIMIT`
- Cloudflare DNS : 3 records auto-créés par Resend (MX `send`, TXT `resend._domainkey`, TXT `send`)
- Cloudflare KV : namespace `RATE_LIMIT` créé

---

## 2026-05-06, Migration complète vers Cloudflare Pages + R2 + auto-deploy Apps Script

### Infrastructure / Workflow

Finalisation et refonte de l'architecture de déploiement entamée le 2026-05-05. Le workflow Git local + `deploy.sh` + branches preview est abandonné au profit d'un setup beaucoup plus simple : drag-drop dans Drive → push automatique sur GitHub `main` → auto-deploy Cloudflare Pages sur prod en ~1 min total. La bascule DNS de LWS vers Cloudflare est faite, le site est désormais 100% servi par Cloudflare avec vidéos sur R2.

**Étapes réalisées :**

- **Phase 1 — Connexion Cloudflare Pages au repo GitHub.** Création du projet `nomacast` (slug technique `nomacast-fr`), Framework=None, Build command vide, Output `/`. URL preview : `nomacast-fr.pages.dev`. Premier build a échoué car le dossier `videos/` du repo contenait des fichiers > 25 MB (limite stricte Cloudflare Pages). Suppression du dossier `videos/` du repo via interface web GitHub, second build réussi.

- **R2 setup pour vidéos.** Bucket `nomacast-videos` créé (Standard, location auto). Public Development URL activé : `https://pub-70a39fad29f24255bdbfb5f3574e51cc.r2.dev`. 6 vidéos uploadées (~30 Mo chacune, ~180 Mo total = 1.8% du free tier 10 GB) : `cas-client-comedie-francaise.mp4`, `cas-client-digital-benchmark-berlin.mp4`, `cas-client-gl-events.mp4`, `cas-client-louvre-lahorde.mp4`, `cas-client-morning.mp4`, `mashup.mp4` (hero `index.html`).

- **Modification des 7 HTML qui référencent une vidéo.** Remplacement systématique `<source src="https://nomacast.fr/videos/XXX.mp4">` par `<source src="https://pub-70a39fad29f24255bdbfb5f3574e51cc.r2.dev/XXX.mp4">`. Fichiers touchés : `index.html`, `cas-client-comedie-francaise.html`, `cas-client-digital-benchmark-berlin.html`, `cas-client-figma-conference.html`, `cas-client-gl-events.html`, `cas-client-louvre-lahorde.html`, `cas-client-morning.html`. Note : `cas-client-figma-conference.mp4` n'est pas (encore) dans R2 (vidéo pas tournée), la page figma aura un hero vidéo cassé jusqu'à upload.

- **Phase 3 — Apps Script Drive → GitHub.** Création projet `Nomacast Drive Sync` sur `script.google.com` lié au compte `production@matliveprod.com`. Personal Access Token GitHub généré (scope `repo`) et embarqué dans le code (acceptable pour script perso non partagé). Folder Drive racine `1U5BM9a9wjxtoR8PXAOrgqLI2xw7RhcR-`. Trigger time-driven every 1 minute. Mode auto-deploy direct sur `main` (pas de branche preview, pas de PR à merger). Plus d'email de notification (Apps Script vers email custom domaine LWS filtré silencieusement, point clos).

- **Phase 2 — Bascule DNS LWS → Cloudflare.** Domain `nomacast.fr` ajouté à Cloudflare Free, scan automatique des DNS LWS, validation des records importés (notamment MX `SMTP.GOOGLE.COM` confirmant que l'email était déjà sur Google Workspace direct, contrairement à ce que la mémoire indiquait). Désactivation du DNSSEC chez LWS, remplacement des nameservers `ns21-24.lwsdns.com` par `mark.ns.cloudflare.com` et `monroe.ns.cloudflare.com`. Activation détectée par Cloudflare en moins d'1 h. Records mail-related (`mail` A, `imap`/`pop`/`smtp` CNAME, `ftp` CNAME) passés en DNS only (gris) avant activation, pour ne pas casser les protocoles non-HTTP. Custom domain `nomacast.fr` + `www.nomacast.fr` connectés au projet Pages, certificat SSL provisionné automatiquement.

- **`_redirects` créé à la racine du repo** pour les 2 redirections 301 héritées du `.htaccess` : `/cas-client-ag-maif.html` → `/cas-clients.html` et `/cas-client-pret-a-manger.html` → `/cas-clients.html`.

- **Réglages SSL/TLS Cloudflare** : Encryption mode "Full", Always Use HTTPS ON, Automatic HTTPS Rewrites ON, TLS minimum 1.2.

### Fichiers créés ou modifiés

- 7 HTML mis à jour avec URLs R2 (commentaire `<!-- Last update: 2026-05-05 22:15 -->`)
- `_redirects` à la racine du repo (nouveau)
- `CHANGELOG.md` (cette session + maj sections Hosting & DNS, Workflow & déploiement, annotations sur les éléments .htaccess obsolètes dans Performance & infrastructure)
- Apps Script `Nomacast Drive Sync` (hors repo, hébergé sur `script.google.com`)
- DNS records sur Cloudflare (importés depuis LWS)
- Custom domains `nomacast.fr` et `www.nomacast.fr` ajoutés au projet Cloudflare Pages

### Validations

- `nomacast.fr` répond avec le site Cloudflare Pages, certificat valide
- Vidéo hero d'`index.html` charge bien depuis R2 (`pub-70a39fad29f24255bdbfb5f3574e51cc.r2.dev/mashup.mp4`)
- Cas-clients chargent les vidéos depuis R2 (sauf figma, normal)
- Email `evenement@nomacast.fr` continue de recevoir (Google Workspace intact)
- Apps Script trigger every 1 min fonctionne : modif d'un fichier dans Drive → propagation sur GitHub puis Cloudflare en ~1-2 min
- Redirection `/cas-client-ag-maif.html` → `/cas-clients.html` testable une fois `_redirects` poussé

### ⚠️ Points critiques à traiter (TODO post-migration)

1. **`envoyer.php` (formulaire de contact)** : Cloudflare Pages ne fait PAS tourner PHP. Si le formulaire pointe encore vers `https://nomacast.fr/envoyer.php`, il est cassé en prod. **À tester en priorité absolue** avant de communiquer / lancer des campagnes Ads. Solutions : sous-domaine LWS, Cloudflare Pages Functions, ou service tiers.

2. **Mise à jour `politique-de-confidentialite.html`** : mentions actuelles "LWS hébergement" et "données stockées en France (LWS)" sont obsolètes. À refondre : sous-traitant Cloudflare Inc. (hébergement web Pages + storage R2 + DNS, transferts hors UE encadrés par CCT), conservation logs Cloudflare, etc. Bloqué jusqu'à clarification du point #1 (LWS reste-t-il sous-traitant pour le formulaire ?).

3. **Headers de sécurité** (HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy) : à migrer du `.htaccess` vers un fichier `_headers` à la racine du repo (syntaxe Cloudflare Pages) ou vers Cloudflare Rules. Priorité moyenne.

4. **WebP serving automatique** : la règle `.htaccess` qui servait `.png.webp` au lieu du `.png` ne s'applique plus. Soit upgrade Cloudflare Pro pour Polish, soit refonte des `<img>` en `<picture><source srcset="X.webp"><img src="X.png"></picture>` dans le HTML.

5. **Vidéo `cas-client-figma-conference.mp4`** à tourner et uploader sur R2 (la page figma a un hero vidéo cassé en attendant).

### Cleanup possible (non urgent)

- Supprimer le dossier local obsolète `C:\Users\Hallelujah\Desktop\NOMACAST\` (Git local + `deploy.sh` plus utilisés)
- Supprimer le sous-dossier `files/` dupliqué dans `G:\Mon Drive\NOMACAST\` (vide depuis le déplacement des fichiers à la racine)
- Résilier l'**hébergement web** LWS si plus aucun service hébergé là-bas (à confirmer après résolution du point #1 sur `envoyer.php`). **Conserver le domaine** `nomacast.fr` chez LWS comme registrar (juste les nameservers ont changé, le domaine reste là). **Conserver Google Workspace** (pas lié à LWS).

---

## 2026-05-05 (suite), Mise en place du workflow Git + Cloudflare Pages

### Infrastructure / Workflow

Bascule complète du déploiement vers une chaîne Git + Cloudflare Pages pour éliminer les risques d'erreurs lors des modifications du site. Avant : édition locale puis upload FTP direct sur LWS, sans historique ni preview, risque d'écraser des modifs récentes en travaillant depuis le téléphone et le desktop. Après : édition dans Drive, déploiement via script qui passe par une branche Git, preview Cloudflare avant merge, rollback en 1 clic via l'historique Git.

**Étapes réalisées :**

- Création du compte GitHub `Nomacast` (2FA activée) et du repo privé `nomacast.fr`
- Installation de Git for Windows et configuration `user.name` et `user.email`
- Init du repo local dans `C:\Users\Hallelujah\Desktop\NOMACAST\files\` (`.gitignore` + premier commit du site complet)
- Push initial vers `github.com/Nomacast/nomacast.fr` (auth via Git Credential Manager OAuth)
- Copie initiale Git vers Drive via `MSYS_NO_PATHCONV=1 robocopy "C:\...\files" "G:\Mon Drive\NOMACAST" /E /XD .git`
- Création du `deploy.sh` à la racine de `NOMACAST\` (hors repo)
- Fix du bug bracketed paste de Git Bash via `echo "set enable-bracketed-paste off" >> ~/.inputrc`

**Connexion Cloudflare Pages au repo :** à finaliser dans une prochaine session (création du projet Pages, build settings Framework=None / output `/` / branche `main`, validation du déploiement temporaire `*.pages.dev`, puis bascule du domaine `nomacast.fr` sur Cloudflare avec préservation des MX LWS pour l'email).

### Fichiers créés ou modifiés

- `C:\Users\Hallelujah\Desktop\NOMACAST\files\.gitignore` : nouveau, à la racine du repo
- `C:\Users\Hallelujah\Desktop\NOMACAST\deploy.sh` : nouveau, hors repo (script de déploiement)
- `~/.inputrc` (Git Bash) : ajout de `set enable-bracketed-paste off`

Aucune modification de contenu HTML, CSS ou JS lors de cette session, uniquement infrastructure.

### Validations

- `git status` propre après commit initial, repo clean
- Premier push réussi vers GitHub, fichiers visibles sur `github.com/Nomacast/nomacast.fr`
- Robocopy Git vers Drive : 0 FAILED
- `deploy.sh` testé à blanc, détection correcte des chemins et sortie propre

### Décisions reportées (à finaliser ensuite)

- **Connexion Cloudflare Pages effective** au repo GitHub (prochaine session)
- **Bascule DNS `nomacast.fr` vers Cloudflare** (après validation du deploy temporaire `*.pages.dev`), avec préservation des MX records LWS pour l'email pro
- **Checks automatiques pré-commit** à mettre en place ensuite : refus du commit si "MatLiveProd" présent dans les fichiers de prod (hors `CHANGELOG.md`), si `CHANGELOG.md` n'a pas été modifié, si le timestamp `<!-- Last update: -->` n'a pas été actualisé sur les HTML touchés
- **Workflow mobile** : appli GitHub à installer sur le téléphone pour les retouches en déplacement (édition + création de PR depuis l'interface web GitHub, preview Cloudflare automatique sur la branche)
- **Nettoyage du dossier `files/` dupliqué dans Drive** : créé par erreur lors du robocopy initial. À supprimer pour ne garder que les fichiers à la racine de `G:\Mon Drive\NOMACAST\`

---

## 2026-05-05 (suite), Refonte des inline-cta sur les 7 cas-clients (variante navy premium)

### 🧹 UI / Conversion

Refonte complète du composant `.inline-cta` placé en milieu de page sur les cas-clients. La version précédente (encart navy avec liseré cyan vertical, icône carrée, bullets fléchés, un seul bouton cyan plein) était jugée trop chargée. La nouvelle version retient le navy mais en version épurée et premium.

**Direction visuelle retenue : navy premium.** Fond `var(--navy)` (`#0b1929`), border-radius 16px, padding 40px 36px 36px. Halo cyan radial diffus en haut à droite (radial-gradient `rgba(90,152,214,.18)` à `0` sur 320px de diamètre, déporté `right:-120px;top:-120px`) qui apporte du caractère sans surcharger. Aucun liseré, aucune icône carrée, aucun bullet : la hiérarchie typographique porte tout le poids visuel.

**Hiérarchie typographique.** Eyebrow "PROJET SIMILAIRE" en cyan MAJUSCULES letter-spacing 0.08em (cohérent avec la règle eyebrows actée). Titre Outfit 28px blanc, line-height 1.18, letter-spacing -0.02em. Sous-titre Plus Jakarta 15.5px à 70% d'opacité blanche. Tous les éléments en `position:relative;z-index:1` pour passer au-dessus du halo radial.

**Passage à 3 boutons d'action** au lieu d'un seul. Justification : offrir au prospect le choix de la voie de contact selon ses préférences plutôt qu'imposer le simulateur.
- **Bouton primaire (cyan plein) → `tarifs.html`** : "Calculer mon estimation" (icône document)
- **Bouton ghost (bordure blanche translucide) → `index.html#contact`** : "Me contacter" (icône enveloppe)
- **Bouton ghost → `tel:+33660541732`** : "06 60 54 17 32" (icône téléphone)

Conforme à la décision actée "les cas-clients ne renvoient JAMAIS vers les pages devis-* (réservées au trafic Google Ads)". Les 3 destinations sont les seules valides pour une CTA cas-client.

**Hover boutons.** Primary : passage à `--cyan-hover` + `translateY(-1px)`. Ghost : bordure blanche passe de 22% à 45% d'opacité + `translateY(-1px)`. Pas de fond plein au hover sur les ghosts (la sobriété navy est préservée).

**Contenu uniforme sur les 7 pages.** Titre "Parlons de votre événement" et sous-titre "Estimation chiffrée en ligne, échange écrit ou appel direct, à vous de choisir." identiques partout pour faciliter la maintenance et garantir une expérience cohérente.

**Ajout sur Louvre/La Horde.** La page `cas-client-louvre-lahorde.html` n'avait pas de inline-cta. Insertion entre la section "Le contexte" et "Les contraintes". CSS injecté juste avant le bloc `/* CTA */` existant.

**Responsive mobile (< 640px).** Padding réduit à 28px 24px 26px. Font-size titre passe de 28px à 22px. Halo radial réduit à 220px et déporté `right:-80px;top:-80px`. Boutons en stack vertical pleine largeur.

### 🐛 Bug de spécificité CSS résolu (itération 3)

Première mise en ligne : le rendu navy était cassé. Le titre apparaissait en gris ardoise sur navy (quasi illisible) et le sous-titre tout aussi délavé. Cause : la règle parente `.content p { color:#3a5570; font-weight:300; line-height:1.8; margin-bottom:16px }` (spécificité `0,1,1`) écrasait mes règles `.inline-cta-title` et `.inline-cta-sub` (spécificité `0,1,0`) parce que les paragraphes du composant sont des `<p>` placés dans `.content`.

**Correctif acté.** Tous les sélecteurs enfants du `.inline-cta` ont été préfixés par `.inline-cta` lui-même pour passer en spécificité `0,2,0` et battre `.content p`. Concrètement, `.inline-cta-title` devient `.inline-cta .inline-cta-title`, etc. Préfixe appliqué sur les 14 sélecteurs enfants (10 desktop + 4 mobile). Règle générale à retenir pour tout futur composant placé dans la zone narrative `.content` : forcer la spécificité `0,2,0` minimum sur les sélecteurs enfants pour ne pas se faire écraser par les règles globales `.content p`, `.content li`, etc.

### 🎨 Itération de design

Une première proposition en card blanche sobre (style `.case-card`, fond `#fff`, bordure `--border` 1px) a été préparée puis rejetée visuellement comme trop fade. La direction navy premium ci-dessus a été retenue après comparaison de 3 maquettes (card blanche avec accent latéral, navy premium avec halo, split éditorial avec stat).

### 📁 Fichiers modifiés

- `cas-client-comedie-francaise.html`
- `cas-client-digital-benchmark-berlin.html`
- `cas-client-figma-conference.html`
- `cas-client-gl-events.html`
- `cas-client-johnson-johnson.html`
- `cas-client-louvre-lahorde.html` (CSS ajouté + bloc HTML inséré)
- `cas-client-morning.html`

7 fichiers au total. Tous mis à jour avec `<!-- Last update: 2026-05-05 22:35 -->`.

### ✅ Validations

- Hash MD5 du bloc CSS `.inline-cta` identique sur les 7 pages (uniformité garantie).
- 14 occurrences du préfixe `.inline-cta .inline-cta-` par fichier (10 desktop + 4 mobile).
- `grep -ri matliveprod cas-client-*.html` : 0 occurrence (règle absolue respectée).
- Aucun tiret cadratin, aucun emoji décoratif, aucune coche Mailchimp dans le contenu produit (règles éditoriales respectées).
- Toutes les anciennes classes legacy (`.inline-cta-icon`, `.inline-cta-body`, `.inline-cta-list`, `.inline-cta-link`) supprimées : 0 occurrence dans les 7 fichiers.
- Sur Louvre, le bloc est bien positionné entre `<h2>Le contexte</h2>` et `<h2>Les contraintes</h2>`.

(2026-05-05, soirée, 3 itérations : card blanche rejetée → navy premium → fix spécificité)

---

## 2026-05-05 (suite), Retrait des 5 étoiles sur les cartes témoignages + logos en couleur

### 🧹 UI

- **Étoiles retirées des cartes témoignages** sur `index.html`. Décision : les 5 étoiles SVG cyan en bas de chaque carte donnaient un rendu "cheap" type avis Trustpilot et n'apportaient rien à des témoignages B2B nominatifs avec photo et logo entreprise. La crédibilité tient au nom, au rôle et au logo, pas à 5 étoiles auto-attribuées non vérifiables.
- Nettoyage complet : suppression du template HTML (`<div class="temo-stars">`), des variables JS `starSvg` et `stars` dans `renderTemoignages()`, et du CSS orphelin `.temo-stars` / `.temo-star`.
- **Logos entreprise des témoignages remis en couleur et agrandis.** Avant : `height: 18px`, `max-width: 72px`, `opacity: 0.45`, `filter: grayscale(1)` qui rendaient les logos quasi invisibles. Après : `height: 22px`, `max-width: 90px`, opacité pleine, plus de grayscale. Gain de visibilité significatif sans dominer la carte.
- Ajout du commentaire `<!-- Last update: 2026-05-05 -->` après le DOCTYPE (manquait sur ce fichier).

---

## 2026-05-05 (suite), Cap 50 % par option, règle "total ne baisse pas", audit complet

Suite de la refonte des règles de remise après tests utilisateur exhaustifs sur demi-journée et journée. Trois changements majeurs.

**Ajout d'une règle priorité 3 : "Le total ne peut JAMAIS baisser quand on coche une option".**

Pour toute option payante O ajoutée à un panier P : `total(P+O) ≥ total(P)`. Équivalent : `remise(P+O) ≤ remise(P\O) + prix(O)`. Implémentée dans l'enveloppe monotone via le calcul de `upperBoundDeltaTotal = min over O: (sub.remise + prix(O))`. Cette règle prime sur toutes les règles enveloppe (cap 50 % par option, non-décroissance remise, delta total +50 minimum). Audit : 0 violation sur 21 000 ajouts d'options testés.

**Passage du cap 50 % global au cap 50 % PAR OPTION individuelle.**

L'audit utilisateur a révélé 437 cas (sur 1 536 paniers) où une option ajoutée donnait l'impression d'être offerte (ΔT = 0) ou quasi offerte (0 < ΔT < 50). Cause : le cap 50 % était calculé sur la SOMME des prix (cap global). Quand un sous-panier atteignait un palier psy avec une grosse remise, la remise pouvait absorber entièrement l'option ajoutée tant que la nouvelle somme respectait encore le cap 50 % global.

Refonte : la règle s'applique désormais option par option. Pour chaque sous-panier, on calcule `upperBoundCap50PerOpt = min over O: (sub.remise + 0.5 × prix(O))`. Garantie : le client paie au minimum 50 % du prix de chaque option qu'il coche. Plus aucune quasi-stagnation (0 cas après refonte). Stagnations restantes : 200 cas (au lieu de 437), toutes dues au plafond strict 2 950 € (effet commercial voulu) ou au cap 150 € absolu sur 1ère option (écran 150 € intégralement remisé).

L'exception palier psy a été retirée du cap 50 % par option : la règle s'applique même sur palier psy. Conséquence : sur certains paniers, le palier 1 950 € atteint par charm est cassé pour respecter le cap 50 % par option. Cohérent avec la priorité utilisateur "pas de stagnation" sur la priorité "atteindre paliers psy".

**Réorganisation finale des priorités (1-22).**

Liste actée dans la section "Moteur de calcul du simulateur" des Décisions techniques actées. Ordre :

1. Plancher de marge minimum
2. Pas de remise sans option payante
3. Le total ne peut JAMAIS baisser
4. Cap 150 € absolu sur 1ère option
5. Cap 50 % par option ajoutée (ex-cap 50 % global)
6. Non-décroissance stricte de la remise (cède devant 3 et 5)
7. Charm pricing
8. Plafond strict 2 950 €
... (voir liste complète dans Décisions actées)

**Audit final (1 536 paniers statiques, 21 000 ajouts d'options) :**

- Règles 1, 2, 3, 4, 5, 8, 10 : 100 % respectées (0 violation).
- Règle 6 (non-décroissance remise) : violations ponctuelles assumées (cède devant règles 3 et 5).
- Règle 14 (delta total +50 min) : violations nombreuses assumées (cède devant règles 3, 5, 6).

**Stagnations restantes (option apparemment offerte) :**

200 cas au total. Décomposition :
- AGENCE : 2 cas (écran 1ère option, cap absolu 150 €).
- MORNING / SOLARIS : ~99 % des stagnations dues au plafond 2 950 € (paniers déjà plafonnés où ajouter une option ne fait plus monter le total).

Validation utilisateur (option A) : on garde tout en l'état. Les stagnations sont des effets commerciaux voulus (plafond 2 950 € + engagement 1ère option = 150 €).

**Affichage : ligne "Remise tarif partenaire" en bas du récap.**

Repositionnement de la ligne "Remise tarif partenaire" dans le récap du devis : désormais placée sous toutes les options et sous les contenus post-événement (Best-of, Interviews), juste avant le total. Plus lisible : le client voit ses options, ses contenus additionnels, puis la remise globale appliquée.

(2026-05-05, suite et fin de cette série d'itérations)

---

## 2026-05-05, Refonte des règles de cap sur la remise (cap 50 % + cap 150 absolu prioritaire)

Itérations finales sur les règles métier du moteur de calcul après tests utilisateur. État acté de la liste des règles par priorité dans la section "Décisions techniques actées" → "Moteur de calcul du simulateur".

**Suppression du cap 150 absolu sauf lumière → cap 150 absolu pour TOUTES les options**

Le cap 150 € sur la 1ère option payante s'applique désormais à toutes les options, **y compris Pack lumière**. Conséquence assumée : perte des effets psychologiques 1 950 € (demi-j + lumière seule) et 3 950 € (3 jours+ + lumière seule). Justification : règle "1ère option = 150 € de remise" doit être prévisible et uniforme, peu importe la nature de l'option cochée. Les paliers psy 1 950 / 3 950 restent atteignables sur les paniers à 2+ options par effet du charm pricing. Le palier 2 950 € (plafond commercial MORNING/SOLARIS demi-j et journée) reste préservé sur les paniers chargés.

**Cap remise 50 % de la somme des prix des options payantes (au lieu de 60 %, puis 40 %)**

Quand `nbPayantesEffective ≥ 2`, la remise totale ne peut excéder 50 % de la somme des prix des options payantes cochées. Le client paie au minimum 50 % du prix de chaque option. Cap relâché sur palier psy pour préserver l'effet plafond commercial. Itération précédente : 40 % (jugé trop sévère, plus de 100 € sur petites options). Cible finale : 50 %.

**Priorité absolue du cap 150 € sur la règle 50 %**

Le cap 150 € sur la 1ère option override la règle 50 %. Concrètement, sur cam_sup à 250 € en 1ère option : remise = 150 € (cap absolu) et non 125 € (= 50 % × 250). Le cap 150 € est un engagement commercial fixe qui prime sur le calibrage proportionnel.

**Suppression du bonus options +50 €**

Le bonus de stimulation +50 € par option payante cochée à partir de la 2e est supprimé. La progression de la remise est désormais portée uniquement par la grille A (paliers basés sur `htHorsExclus`), le charm pricing, et l'enveloppe monotone. Justification : simplification du moteur, le bonus ajoutait une couche de complexité qui interagissait mal avec les caps 50 % et 150 €.

**Garantie "le total monte toujours" via l'enveloppe**

La règle absolue "on ne peut pas ajouter une option gratuitement" est portée par la contrainte `delta total ≥ 50 €` dans l'enveloppe monotone, sauf quand le naïf tombe sur un palier psy (1 950 / 2 950 / 3 950 / 4 950 / 5 950 €). Sur palier psy, le total peut stagner pour préserver l'effet commercial.

**Conflit mathématique résiduel sur certains parcours**

Sur quelques parcours spécifiques (exemple : AGENCE demi-j stream → duplex → veille → son), il est mathématiquement impossible de garantir simultanément `delta_total ≥ 50` ET `delta_remise ≥ 0` quand le sub_max d'un sous-panier produit déjà une remise élevée. L'enveloppe priorise alors la croissance du total sur la croissance de la remise (la remise raw peut localement baisser de 25-50 €). Conséquence acceptée : le client voit toujours son total monter, et la remise affichée (avec bundle savings) reste cohérente.

(2026-05-05)

---

## 2026-05-04 (suite finale), Refonte du moteur de calcul du simulateur tarifs

Refonte complète du moteur de calcul de `tarifs.html` après audit qui a révélé un bug chemin-dépendant : pour le même panier final, le total facturé pouvait varier jusqu'à 400 € selon l'ordre dans lequel le client cochait les options. Cause racine : le système de mémoire d'état (`_lastBrut`, `_lastDiscount`, `_lastTotal`, `_lastAbsorbableSet`) utilisé pour garantir une remise non-décroissante créait des incohérences quand le calcul "frais" donnait moins de remise que la valeur précédemment mémorisée.

### Architecture du nouveau moteur

Remplacement du système à mémoire d'état par une architecture en deux étages :

1. `computeNaive(stateOverride)` : calcul "brut" pour un panier donné, fonction pure. Pas de mémoire d'état, déterministe et chemin-indépendant.
2. `computeWithEnvelope(state)` : enveloppe monotone par-dessus `computeNaive`. Pour un panier P, calcule la remise pour P et tous ses sous-paniers (récursif avec mémoïsation), prend le maximum. Garantit que ajouter une option ne fait JAMAIS baisser la remise affichée.

Cette architecture cumule les deux propriétés voulues : non-décroissance de la remise ET indépendance au chemin d'activation. Mathématiquement vérifié sur l'ensemble des combinaisons d'options pour MORNING, SOLARIS et AGENCE sur les 4 durées.

### Modifications algorithmiques

- **Suppression de toute la mémoire d'état** : `_lastBrut`, `_lastDiscount`, `_lastTotal`, `_lastAbsorbableSet` retirés du `state` et de la logique de `compute()`. Plus aucun reset de ces variables dans les listeners (durée, partenaire, options).
- **Charm pricing rendu monotone** : remplacement de la logique par fenêtre `[seuil, seuil+200]` (qui pouvait perdre le bonus en sortant de la fenêtre) par une logique "collante" qui prend le seuil le plus haut atteint et applique le bonus tant qu'on dépasse. `CHARM_MAX_BONUS` passé de 200 € à 250 €.
- **Bypass plancher au seuil 4 000** : autorisation de descendre 250 € sous le plancher de marge au seuil charm 4 000, pour permettre l'effet psychologique 4 200 → 3 950 sur les paniers MORNING 3 jours+ avec lumière. Micro-sacrifice marge accepté (250 €) sur ces paniers spécifiques.
- **Exclusion de `duplex` du calcul grille A** : en plus de `son`, `duplex` est désormais exclu du calcul `htHorsExclus` et `nbOptionsPayantes`. Neutralise l'effet de l'ordre du bundle son↔duplex sur la remise (le bundle reste ordre-dépendant pour l'affichage uniquement).
- **Mécanique d'absorption simplifiée** : suppression de la mécanique d'absorption rétroactive (qui utilisait `_lastAbsorbableSet`). Plus de `line.absorbed = true` ; le plafond 2 950 € fait désormais simplement grimper la remise comptable. Le teasing prospectif "OFFERT" sur les options non cochées est conservé.

### Multiplicateur de remise par durée

Ajout d'une constante `REMISE_MULT` qui multiplie le montant de la grille A selon la durée :
- Demi-journée et journée : ×1.0 (pas de delta)
- 2 jours : ×1.556 (1 750×2 / 2 250)
- 3 jours+ : ×1.75 (1 750×3 / 3 000)

Effet exponentiel voulu : la remise est plus généreuse sur les multi-jours, en ligne avec la générosité du tarif dégressif déjà offerte sur la base.

### Bonus options

Le bonus de stimulation (+€ par option payante cochée à partir de la 3e, si total > 2 000 €) passe de **25 € à 50 €**. Comptage exclut désormais `son`, `duplex` et `cadreur_hf` (cohérent avec les exclusions grille A).

### Nouvelle option : Cadreur HF

Ajout de l'option "Caméra avec cadreur (liaison sans fil)" (id: `cadreur_hf`). Tarif client : 850 €/jour linéaire pur (850 / 850 / 1 700 / 2 550). Coût interne : 600 €/jour. Détail technique vue technique : cadreur freelance senior + caméra Blackmagic 4K (ou équivalent) + émetteur/récepteur HF HDMI/SDI + trépied vidéo. **Hors mécanique partenaire** : `outsidePartner: true`. Le prix s'ajoute après le plafond 2 950 €, ne génère pas de remise grille A, n'est pas absorbé. Cohérent avec sa marge brute fine (250 €/jour). Voir aussi section "Coûts internes (sous-traitance)".

### Ajustements tarifaires options

- **5G de secours** : passage de `dayMultiplied: true` (350/350/560/735) à grille linéaire dégressive `PRICE_5G_BY_DUR` (350/350/500/650). Plus juste vis-à-vis du coût réel (forfait data prorata, pas dégressivité agressive).
- **Best-of monté** (add-on Step 04) : prix sur 2 jours abaissé de 1 750 € à **1 650 €**, et sur 3 jours+ de 2 350 € à **2 150 €**. Demi-journée et journée inchangés à 1 150 €. Aligne sur la structure de coût réelle (cadreur 400 €/jour de tournage + 1 jour de montage à 400 €).
- **Installation la veille** : tarif inchangé (650 €) mais description enrichie pour préciser "Tarif Île-de-France, province et international au devis", évitant les malentendus sur les déplacements longue distance.

### Impact mesuré sur les paniers types

Validation par simulation Python exhaustive (2^11 sous-paniers couverts par durée et par code partenaire). Aucun creux de remise détecté sur l'ensemble des combinaisons. Aucune chemin-dépendance détectée sur 15 ordres aléatoires testés sur les paniers maximums.

Quelques paniers tombent désormais à 3 950 € grâce au charm monotone et au multiplicateur par durée :
- AGENCE demi-journée panier max
- AGENCE journée panier max  
- MORNING 2 jours panier max
- MORNING 3 jours+ + lumière (avec bypass plancher 250 €)
- MORNING 3 jours+ + lumière + stream + rushs (avec bypass plancher 250 €)

Sur les paniers MORNING/SOLARIS demi-journée et journée, le plafond 2 950 € reste actif (panier maximum 4 400 € HT addons compris, 5 250 € avec cadreur HF + addons).

### Ajustements finaux après itérations utilisateur

Refonte complète de la logique de remise après plusieurs aller-retour. État final acté :

**Suppression du palier 1 750 € → 175 €** dans MORNING, SOLARIS, AGENCE. La grille passe directement de 1 500 → 150 à 2 000 → 200 (qui n'a plus la condition `requiresMarginOption`).

**Cap 150 € absolu sur la 1ère option payante (sauf Pack lumière)** : quand `nbPayantesEffective === 1` ET que le Pack lumière n'est pas l'option cochée, la remise totale (grille A + bonus + charm) est plafonnée à 150 €. Empêche le charm pricing d'absorber entièrement les petites options (cam_sup, stream, rush4k, ecran) sur 2 jours et 3 jours+. **Exception Pack lumière** : Pack lumière seul conserve les effets psychologiques 1 950 € (demi-j et journée) et 3 950 € (3 jours+) car c'est un pack volumineux où la "grosse remise" reste perçue comme proportionnée.

**Pas de remise si aucune option payante** : la condition s'applique à TOUS les paliers de la grille (pas seulement le palier d'entrée). Si `nbOptionsPayantes === 0`, la fonction renvoie immédiatement amount=0, charmAllowed=false. Vrai sur toutes les durées et tous les codes partenaires. Sur 2 jours et 3 jours+, la base seule reste à 2 250 € et 3 000 € respectivement, sans aucune remise effective (mais le delta dégressif reste affiché dans le bandeau).

**Bonus options à partir de la 2e** : +50 € par option payante cochée à partir de la 2e (au lieu de la 3e), sans condition de seuil 2 000 € (supprimée). Garantit la croissance de la remise à chaque option ajoutée tant que le plancher de marge ne bloque pas.

**Bundle son+duplex compte +250 € et +1 option** dans le calcul de la grille A et du bonus options, mais uniquement quand les DEUX sont cochés (= bundle activé). Quand un seul des deux est coché, il reste exclu (cohérent avec la neutralité d'ordre du bundle pour le total facturé).

**Floor 2 950 € sur MORNING et SOLARIS demi-j et journée** : si `totalAvantRemise > 3 000 €` ET le total après remise+charm descend sous 2 950 €, on remonte le total à 2 950 € en réduisant la remise. Garantit que les paniers conséquents atterrissent sur le palier psy 2 950 € et non en-dessous (effet plafond commercial). Conséquence acceptée : sur certains parcours, la remise peut localement baisser quand l'ajout d'une option fait franchir le seuil et active le floor (exemple : passage de 2 000 € à 2 950 € après ajout du Pack lumière sur demi-j chargée).

**Stricte croissance abandonnée** : la priorité est donnée aux paliers psychologiques (1 950 / 2 950 / 3 950) et au floor 2 950 €. La remise affichée peut localement baisser entre deux paniers consécutifs quand un palier psy est franchi vers le haut. Le total client, lui, reste cohérent avec le panier (chemin-indépendance préservée).

**Multiplicateur de remise par durée + arrondi tranche de 5 €** : la valeur de la grille A est multipliée par `REMISE_MULT[duration]` (1.0 / 1.0 / 1.556 / 1.75) puis arrondie au-dessus à la tranche de 5 € la plus proche (`Math.ceil(x / 5) * 5`). Exemple : 150 × 1.556 = 233,4 → 235 €.

**Suppression du cap 60 % de htOptions** : ce cap a été testé puis retiré car il bloquait la progression naturelle de la remise sur certains parcours.

**Suppression de la garantie +50 €/option dans l'enveloppe monotone** : la garantie de stricte croissance par +50 € forcé sur chaque option ajoutée a été retirée (cf. règle "stricte croissance abandonnée"). L'enveloppe monotone garantit toujours la non-décroissance large et la chemin-indépendance.

**Cap enveloppe au plafond 2 950 €** : l'enveloppe monotone respecte le total naïf comme borne inférieure. Quand l'enveloppe trouve un sous-panier qui produit plus de remise que le naïf et que cette remise descendrait le total sous le plafond, on cape pour rester à 2 950 €.

**Économie dégressive visible dans le bandeau remise** : 1 250 € (2 jours), 2 250 € (3 jours+). Affichée uniquement avec un code partenaire actif. Effet purement visuel.

### Effets vérifiés sur les paniers types (validation finale)

| Panier MORNING | Total |
|---|---|
| demi-j sans option | 1 500 € |
| journée sans option | 1 750 € |
| 2 jours sans option | 2 250 € |
| 3 jours+ sans option | 3 000 € |
| demi-j + cam_sup | 1 600 € |
| journée + cam_sup | 1 850 € |
| 2 jours + cam_sup | 2 500 € |
| 3 jours+ + cam_sup | 3 375 € |
| demi-j + Pack lumière | 1 950 € |
| journée + Pack lumière | 1 950 € |
| 3 jours+ + Pack lumière | 3 950 € |
| demi-j panier max | 2 950 € |
| journée panier max | 2 950 € |
| AGENCE demi-j panier max | 3 650 € |
| AGENCE 3 jours+ panier max | 6 290 € |

Chemin-indépendance vérifiée sur 5 ordres aléatoires de cochage pour le panier 2 jours complet : tous les ordres convergent vers le même total (3 730 €).

(2026-05-04, fin de soirée)



- `tarifs.html` : refonte complète du bloc moteur de calcul (lignes ~1390-1690 environ). Ajout de l'option `cadreur_hf` dans `OPTIONS`, `OPTION_MATERIEL`, `PRICE_CADREUR_HF_BY_DUR`. Constantes ajoutées : `REMISE_MULT`, `PRICE_5G_BY_DUR`, `PRICE_CADREUR_HF_BY_DUR`, `ABSORBABLE_BASE_IDS`. Fonctions ajoutées : `computeNaive`, `computeWithEnvelope`, `getDurPriceFor`, `getSonDuplexLogicFor`, `getPartnerDiscountFor`. Fonction `compute()` désormais simple wrapper sur `computeWithEnvelope(state)`.
- `CHANGELOG.md` : enrichissement de la section "Logique commerciale du simulateur tarifs" avec les règles actées (multiplicateur durée, charm monotone, plafond, bonus, enveloppe monotone). Ajout du coût interne Cadreur HF dans la section "Coûts internes (sous-traitance)".

(2026-05-04, refonte fin de journée)

---

## 2026-05-04, Alignement code tarifs.html sur le CHANGELOG

### AGENCE : suppression du plafond 2 950 €

Avant : tous les codes partenaires (MORNING, SOLARIS, AGENCE) étaient soumis au plafond strict de 2 950 € sur demi-journée et journée. Au-delà, la remise comptable était augmentée pour ramener le total à 2 950 €.

Après : MORNING et SOLARIS conservent ce plafond (validé par expérience commerciale). AGENCE en est exclu : la remise reste celle de la grille A et le total peut grimper librement quand le client coche son + lumière + nombreuses options.

Concrètement, la règle 1 dans `compute()` ajoute désormais la condition `state.partnerCode !== "AGENCE"` avant le plafonnement. Idem pour le teasing charm sur seuils (règle 2) qui ne s'applique plus à AGENCE. (2026-05-04)

### Bundle son↔duplex : consolidation visuelle dans la remise

Quand les 2 options son et duplex sont cochées avec un code partenaire actif, la mécanique du bundle applique -250 € sur les prix individuels. La consolidation dans la ligne "Remise tarif partenaire" dépend du cas pour éviter un double affichage perçu :

- **Cas A** : son coché en premier puis duplex. Duplex est marqué "Inclus" (pas de prix barré). On ajoute les 250 € à la ligne "Remise tarif partenaire" pour le wow effect.
- **Cas B** : duplex coché en premier puis son. Son est affiché barré (750 → 500), la réduction de 250 € est déjà visible sur la ligne. On N'ajoute PAS les 250 € à la remise (sinon double affichage = -500 € perçu au lieu de -250 €).

Implementation : variable `bundleSavings` dans `compute()`, conditionnée sur `sonDuplex.duplexFree === true` (donc uniquement cas A). Ajoutée à `partnerDiscount` au moment du return. Le total facturé reste identique. Pur effet d'affichage. (2026-05-04, corrigé après détection du double affichage en cas B)

### Fix : bloc estimation sticky cassé sur tarifs.html

Le bloc `.summary` (estimation à droite) ne suivait plus le scroll. Cause : la règle `html{overflow-x:hidden}` ajoutée le 2026-05-01 (Sprint 1, pour corriger le scroll horizontal mobile) cassait le contexte de `position: sticky`. Solution : remplacé par `html{overflow-x:clip}`. Clip empêche le débordement horizontal sans créer de nouveau contexte de scroll, donc le sticky refonctionne. (2026-05-04)

À retenir : sur les autres pages où on a `html{overflow-x:hidden}`, si un élément `position: sticky` doit fonctionner, utiliser `clip` au lieu de `hidden`. Compatibilité : Chrome 90+, Safari 16+, Firefox 81+, fallback gracieux sur Safari < 16.

### Constantes plancher et coûts internes

Modification de `tarifs.html`, fonction `getPartnerDiscount()`, pour aligner les chiffres codés sur les valeurs définies dans le CHANGELOG. Les chiffres précédemment codés (`MARGE_MIN.half = 1600`, `COSTS.son["2days"] = 850`, `COSTS.son["3days"] = 1000`) étaient erronés. Maintenant alignés sur les vrais coûts et planchers de rentabilité.

Avant :
```
MARGE_MIN: { half: 1600, full: 1600, "2days": 2000, "3days": 3000 }
COSTS.son: { half: 550, full: 550, "2days": 850, "3days": 1000 }
```

Après :
```
MARGE_MIN: { half: 1500, full: 1500, "2days": 2000, "3days": 3000 }
COSTS.son: { half: 550, full: 550, "2days": 825, "3days": 1237.5 }
```

Impact : les calculs de plancher de marge utilisés par MORNING, SOLARIS et AGENCE sont désormais corrects. La grille de remise et les options forcées de chaque code partenaire restent inchangées. (2026-05-04)

### Documentation

Ajout au CHANGELOG d'une nouvelle sous-section "Logique commerciale du simulateur tarifs" qui acte les règles métier déjà en place dans le code (bundle son↔duplex avec ordre d'activation, calcul des paliers excluant le Pack son, palier minimum requérant 1 option payante, palier `requiresMarginOption`). Ces règles existaient mais n'étaient pas documentées : maintenant elles le sont pour ne plus risquer d'être remises en question par erreur.

---

## 2026-05-01 (suite), Optimisation CTA blog SEO

### 🟠 SEO / Conversion

- **`blog-ag-mixte-presentiel-distanciel.html`** : ajout de 5 améliorations CTA pour transformer le trafic SEO en leads.
  - **Author bio** en haut de l'article (Jérôme + crédibilité Johnson, Figma, Comédie-Française), gain E-E-A-T Google.
  - **CTA soft** introductif avant le sommaire ("Pas envie de tout lire ? Contactez-moi").
  - **CTA mid-article** (après erreur n°4, avant erreur n°5) : encart "Vous reconnaissez ces erreurs ? Discutons-en. 15 min gratuit."
  - **CTA final renforcé** : 3 boutons (Appeler / Devis / Lire cas client) + garantie "Réponse sous 24h".
  - **Section "À lire aussi"** enrichie de 2 à 4 cartes (ajout `tarifs.html` et `prestataire-captation-evenement.html`).
- **CSS responsive** ajouté pour ces nouveaux blocs (mobile : boutons en colonne, encart CTA optimisé).

### 📊 Stats CTA après modif

| Type | Avant | Après |
|---|---|---|
| Liens `tel:` | 2 | 4 |
| Liens vers `tarifs.html` | 0 | 4 (dont related) |
| Liens vers `index.html#contact` | 1 | 5 |
| Cartes "À lire aussi" | 2 | 4 |
| CTA visuels (encarts) | 1 (final) | 3 (soft + mid + final) |

---

## 2026-05-01, Sprint corrections critiques + SEO

### 🔴 Corrections critiques mobile

- **Bouton flottant `.float-call`** : ajout d'un IntersectionObserver qui masque le bouton tel cyan en bas de page quand le footer arrive à l'écran (animation fade-out 250ms). Plus de chevauchement avec les liens légaux.
  - Pages : `index`, `captation-4k`, `captation-conference-seminaire`, `captation-evenement-entreprise`, `captation-interview-table-ronde`, `captation-video-corporate`, `captation-video-evenement`, `devis-live-streaming-paris`, `emission-live-corporate`, `live-streaming-evenement`, `prestataire-captation-evenement`, `streaming-multi-plateformes`, `streaming-multiplex-multi-sites` (13 pages)

- **Overflow horizontal mobile** : ajout de `overflow-x: hidden` sur `html` et `body` pour éliminer le scroll latéral parasite.
  - Pages : `404`, `agences-partenaires`, `blog`, `blog-ag-mixte`, 7 cas-clients, `cas-clients`, `mentions-legales`, `merci`, `plan-du-site`, `politique-de-confidentialite`, `tarifs` (17 pages)

### 🟠 SEO

- **Meta descriptions raccourcies** : 21 pages ramenées à ≤ 160 caractères. Avant : moy 224 car., max 289. Après : moy 145 car., max 156.

- **Twitter Cards** : ajout des 4 balises sur 22 pages. Total : 31/37.

- **og:url** : ajout sur 7 pages cas-clients.

- **OG/Twitter alignés** : 27 pages mises à jour pour cohérence avec les nouvelles meta descriptions.

### 🟢 RGPD / UX

- **Footer enrichi** sur `mentions-legales.html` et `politique-de-confidentialite.html` (cross-linking 3 pages légales).

- **MatLiveProd retiré** de `politique-de-confidentialite.html` (Nomacast et MatLiveProd sont 2 entités distinctes ; aucune mention de MatLiveProd ne doit apparaître sur le site Nomacast).

- **Axeptio masqué** sur `tarifs.html` mobile uniquement.

### ⚙️ Infrastructure

- **`.htaccess`** :
  - Ajout `ErrorDocument 404 /404.html` (+ 403 et 500).
  - Ajout `Redirect 301 /default_index.html https://www.nomacast.fr/`.

### 🧹 UI

- **Logo Johnson & Johnson** : suppression de `opacity: 0.9` sur `.client-logo-wrap` dans `index.html`.

### ⚙️ Système de suivi mis en place

- Commentaire `<!-- Last update: YYYY-MM-DD HH:MM -->` ajouté sur tous les fichiers HTML modifiés.
- Création de ce `CHANGELOG.md` à la racine.
- `Disallow: /CHANGELOG.md` dans robots.txt pour empêcher l'indexation Google.

### 📊 Stats finales

| Métrique | Avant | Après |
|---|---|---|
| Pages avec Twitter Cards | 1/37 | 31/37 |
| Pages avec og:url | ~22/37 | 29/37 |
| Pages avec overflow-x:hidden | 19/37 | 36/37 |
| IntersectionObserver bouton flottant | 0/13 | 13/13 |
| Meta descriptions > 160 car. | 21 | **0** |

### ✅ Validations techniques

- JS valide : 107/107
- JSON-LD valide : 60/60

---

## 2026-04-30, Audit + déploiement initial SEO/AEO

- 23 titles raccourcis (Bing-compliant ≤ 60 caractères)
- 24 fichiers HTML modifiés (titles + OG/Twitter alignés)
- Microsoft Clarity installé puis désinstallé après réflexion ROI
- WebP transparent activé via `.htaccess`
- Conversion images PNG → WebP (~85-90% de réduction de taille)
- llms.txt créé (7.3 Ko, identité Nomacast pour LLM crawlers)
- robots.txt optimisé (17 LLM allowed, 15 SEO scrapers blocked)
- Sitemap soumis Google + Bing
- IndexNow ping setup (clé `2438d00ec5944f38979efedc262f1dc0`)
- 16 URLs pingées avec succès (202 Accepted)
- Indexation manuelle Google Search Console (10 URLs prioritaires)

**Résultats PageSpeed après déploiement :**
- Mobile : Performance 90, Accessibilité 88, Bonnes pratiques 96, SEO 100
- Desktop : Performance 95, Accessibilité 92, Bonnes pratiques 96, SEO 100

---

## Conventions

- Sessions triées par date décroissante.
- Format date : `YYYY-MM-DD`.
- Décisions techniques actées : section persistante en haut du fichier, à enrichir au fil du temps.
- Commentaire `<!-- Last update: YYYY-MM-DD HH:MM -->` en tête de chaque fichier HTML pour tracking individuel.
- Catégories : 🔴 Critique / 🟠 Important / 🟢 RGPD-UX / ⚙️ Infrastructure / 🧹 UI / 📊 Stats / ✅ Validations.
