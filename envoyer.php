<?php
// ============================================================
// NOMACAST — Traitement formulaire de contact
// Protections : Turnstile + Honeypot + Filtrage contenu + Anti-flood
// Routage : agences@nomacast.fr si is_agence=1, sinon evenement@nomacast.fr
// ============================================================

// ─── CONFIGURATION ───────────────────────────────────────────
// ⚠️  IMPORTANT : Remplace la valeur ci-dessous par TA NOUVELLE Secret Key
//     régénérée depuis le dashboard Cloudflare Turnstile.
//     Ne partage JAMAIS cette clé.
define('TURNSTILE_SECRET_KEY', '0x4AAAAAADFA3LT3MHdIcN_hMyyJCl-e0xM');

// Adresse email "perso" toujours en copie (pour archivage / suivi)
$copie_archivage = 'jerome.bouquillon@ik.me';

// Routage selon le type de demande
$email_general  = 'evenement@nomacast.fr';
$email_agences  = 'agences@nomacast.fr';

$page_merci   = 'merci.html';
$page_erreur  = 'index.html#contact';
$domaine      = 'nomacast.fr';

// ─── SÉCURITÉ : refuser tout sauf POST ──────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.html');
    exit;
}

// ─── 1. HONEYPOT — premier filtre, gratuit ──────────────────
if (!empty($_POST['website'])) {
    // Un bot a rempli le champ caché → on jette en silence
    // (on simule un succès pour ne pas révéler le honeypot)
    header('Location: ' . $page_merci);
    exit;
}

// ─── 2. ORIGIN CHECK ────────────────────────────────────────
$allowed_origins = ['https://www.nomacast.fr', 'https://nomacast.fr'];
$origin = $_SERVER['HTTP_REFERER'] ?? '';
$valid_origin = false;
foreach ($allowed_origins as $ao) {
    if (strpos($origin, $ao) === 0) {
        $valid_origin = true;
        break;
    }
}
if (!$valid_origin) {
    header('Location: ' . $page_erreur);
    exit;
}

// ─── 3. TURNSTILE — vérification côté serveur ──────────────
$turnstile_token = $_POST['cf-turnstile-response'] ?? '';

if (empty($turnstile_token)) {
    header('Location: ' . $page_erreur . '?error=captcha');
    exit;
}

$verify_url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
$verify_data = [
    'secret'   => TURNSTILE_SECRET_KEY,
    'response' => $turnstile_token,
    'remoteip' => $_SERVER['REMOTE_ADDR'] ?? '',
];

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $verify_url);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($verify_data));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
$response = curl_exec($ch);
$curl_error = curl_error($ch);
curl_close($ch);

if ($curl_error) {
    error_log("[Nomacast] Erreur cURL Turnstile : $curl_error");
    header('Location: ' . $page_erreur . '?error=verify');
    exit;
}

$verification = json_decode($response, true);

if (empty($verification['success'])) {
    // Turnstile a refusé → bot détecté
    $codes = $verification['error-codes'] ?? ['unknown'];
    error_log("[Nomacast] Turnstile refusé : " . implode(',', $codes));
    header('Location: ' . $page_erreur . '?error=captcha');
    exit;
}

// ─── 4. ANTI-FLOOD — 1 soumission par session toutes les 30s ─
session_start();
$now = time();
if (isset($_SESSION['last_submit']) && ($now - $_SESSION['last_submit']) < 30) {
    header('Location: ' . $page_erreur . '?error=flood');
    exit;
}
$_SESSION['last_submit'] = $now;

// ─── 5. NETTOYAGE DES DONNÉES ──────────────────────────────
function clean($str) {
    return htmlspecialchars(strip_tags(trim($str)), ENT_QUOTES, 'UTF-8');
}

$nom       = clean($_POST['nom']       ?? '');
$societe   = clean($_POST['societe']   ?? '');
$email     = filter_var(trim($_POST['email'] ?? ''), FILTER_VALIDATE_EMAIL);
$telephone = clean($_POST['telephone'] ?? '');
$type      = clean($_POST['type']      ?? '');
$date_evt  = clean($_POST['date_evt']  ?? '');
$lieu      = clean($_POST['lieu']      ?? '');
$audience  = clean($_POST['audience']  ?? '');
$message   = clean($_POST['message']   ?? '');
$is_agence = !empty($_POST['is_agence']);
$source    = clean($_POST['source']    ?? '');  // ← AJOUTÉ : provenance LP

// ─── 6. VALIDATION ──────────────────────────────────────────
if (!$email || empty($telephone)) {
    header('Location: ' . $page_erreur . '?error=email');
    exit;
}

// Limites de taille (anti-payload énorme)
if (mb_strlen($message) > 5000 || mb_strlen($nom) > 200 || mb_strlen($societe) > 200) {
    header('Location: ' . $page_erreur . '?error=length');
    exit;
}

// ─── 7. FILTRAGE ANTI-SPAM — analyse du contenu ───────────
$texte_complet = $nom . ' ' . $societe . ' ' . $message . ' ' . $lieu;

// 7a. Trop de liens dans le message → spam quasi-certain
$nb_liens = preg_match_all('/https?:\/\//i', $message);
if ($nb_liens >= 3) {
    error_log("[Nomacast] Spam (liens multiples) - Email: $email");
    header('Location: ' . $page_merci); // simule succès pour ne rien révéler
    exit;
}

// 7b. Mots-clés de spam classique
$mots_spam = [
    'crypto', 'bitcoin', 'forex', 'casino', 'viagra', 'loan',
    'seo services', 'rank your website', 'guest post', 'backlink',
    'cheap nfl', 'replica watches', 'cialis', 'pharmacy',
    'web design services', 'increase your ranking',
];
foreach ($mots_spam as $mot) {
    if (stripos($texte_complet, $mot) !== false) {
        error_log("[Nomacast] Spam (mot-clé '$mot') - Email: $email");
        header('Location: ' . $page_merci);
        exit;
    }
}

// 7c. Caractères non latins majoritaires (cyrillique, chinois, arabe)
$nb_caracteres_exotiques = preg_match_all(
    '/[\x{0400}-\x{04FF}\x{4E00}-\x{9FFF}\x{0600}-\x{06FF}]/u',
    $message
);
$nb_total = mb_strlen($message);
if ($nb_total > 20 && $nb_caracteres_exotiques > $nb_total * 0.3) {
    error_log("[Nomacast] Spam (caractères non-latins) - Email: $email");
    header('Location: ' . $page_merci);
    exit;
}

// 7d. Header injection (sécurité critique)
foreach ([$nom, $societe, $email, $telephone] as $field) {
    if (preg_match('/[\r\n]|content-type:|bcc:|cc:|to:/i', $field)) {
        error_log("[Nomacast] Tentative injection headers - Email: $email");
        header('Location: ' . $page_erreur . '?error=invalid');
        exit;
    }
}

// ─── 8. ROUTAGE EMAIL (option A) ──────────────────────────
// Si is_agence : envoi vers agences@nomacast.fr UNIQUEMENT
// Sinon : envoi vers evenement@nomacast.fr
// Dans les deux cas, copie d'archivage vers ton ik.me
if ($is_agence) {
    $destinataires = [$email_agences, $copie_archivage];
} else {
    $destinataires = [$email_general, $copie_archivage];
}

// ─── 9. CONSTRUCTION DU MAIL ──────────────────────────────
$tag_agence = $is_agence ? "[AGENCE] " : "";
// ← AJOUTÉ : tag de provenance dans le sujet pour repérer les LPs ads en un coup d'œil
$tag_source = $source ? "[" . $source . "] " : "";
$sujet = "Demande de devis - " . $tag_agence . $tag_source . ($societe ?: ($nom ?: "Contact")) . " [nomacast.fr]";

$corps  = "Nouvelle demande de devis reçue depuis nomacast.fr\n";
if ($is_agence) {
    $corps .= "ATTENTION : DEMANDE AGENCE (marque blanche)\n";
}
// ← AJOUTÉ : provenance LP en haut du corps
if ($source) {
    $corps .= "Provenance : " . $source . "\n";
}
$corps .= str_repeat("─", 50) . "\n\n";
$corps .= "Nom & prénom  : " . ($nom ?: '—') . "\n";
$corps .= "Société       : " . ($societe ?: '—') . "\n";
$corps .= "Email         : " . $email . "\n";
$corps .= "Téléphone     : " . $telephone . "\n";
$corps .= "Type événement: " . ($type ?: '—') . "\n";
$corps .= "Date estimée  : " . ($date_evt ?: '—') . "\n";
$corps .= "Lieu          : " . ($lieu ?: '—') . "\n";
$corps .= "Audience      : " . ($audience ?: '—') . "\n\n";
$corps .= "Message :\n" . ($message ?: '—') . "\n\n";
$corps .= str_repeat("─", 50) . "\n";
$corps .= "Métadonnées :\n";
$corps .= "  IP        : " . ($_SERVER['REMOTE_ADDR'] ?? 'N/A') . "\n";
$corps .= "  Provenance: " . ($_SERVER['HTTP_REFERER'] ?? 'N/A') . "\n";
$corps .= "  Date      : " . date('d/m/Y à H:i') . "\n";

// Génération d'un Message-ID unique conforme RFC 5322
$message_id = sprintf('<%s.%s@%s>', date('YmdHis'), bin2hex(random_bytes(8)), $domaine);

$headers  = "From: Formulaire Nomacast <noreply@" . $domaine . ">\r\n";
$headers .= "Sender: noreply@" . $domaine . "\r\n";
$headers .= "Reply-To: " . $email . "\r\n";
$headers .= "Message-ID: " . $message_id . "\r\n";
$headers .= "Date: " . date('r') . "\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
$headers .= "Content-Transfer-Encoding: 8bit\r\n";
$headers .= "X-Mailer: Nomacast Form 1.0";

// ─── 10. ENVOI ─────────────────────────────────────────────
$succes = true;
foreach ($destinataires as $dest) {
    if (!mail($dest, $sujet, $corps, $headers)) {
        $succes = false;
        error_log("[Nomacast] Échec mail() vers : $dest");
    }
}

// ─── 11. REDIRECTION ──────────────────────────────────────
if ($succes) {
    // Paramètre "type" pour tracker les conversions séparément dans GA4
    $type_conv = $is_agence ? 'agence' : 'devis';
    header('Location: ' . $page_merci . '?type=' . $type_conv);
} else {
    header('Location: ' . $page_erreur . '?error=send');
}
exit;
?>
