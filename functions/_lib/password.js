// functions/_lib/password.js
// Helpers PBKDF2 (hashing) + générateur de password aléatoire.
// Le préfixe `_` exclut ce fichier du routing Cloudflare Pages Functions.
//
// Format de stockage : "pbkdf2:<salt_b64url>:<hash_b64url>"
// - salt 16 bytes random
// - PBKDF2-SHA256, 100 000 itérations
// - 256 bits de sortie (32 bytes)
//
// nomacast-client-credentials-v1

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const HASH_LENGTH = 32;

// Charset volontairement réduit pour éviter les ambiguïtés visuelles (I/l/1, O/0).
// 12 caractères dans ce charset = ~67 bits d'entropie, largement suffisant.
const PASSWORD_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Génère un mot de passe aléatoire de N caractères sans ambiguïté visuelle.
 * Par défaut 12 caractères ≈ 67 bits d'entropie.
 */
export function generatePassword(length = 12) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const charsetLen = PASSWORD_CHARSET.length;
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PASSWORD_CHARSET[bytes[i] % charsetLen];
  }
  return out;
}

/**
 * Hash un mot de passe avec PBKDF2-SHA256, 100k itérations.
 * Retourne une chaîne "pbkdf2:<salt>:<hash>" prête à stocker en DB.
 */
export async function hashPassword(password) {
  const salt = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(salt);
  const hash = await derivePbkdf2(password, salt);
  return 'pbkdf2:' + b64urlEncode(salt) + ':' + b64urlEncode(hash);
}

/**
 * Vérifie un password contre un hash stocké.
 * Retourne true ssi match. Utilise une comparaison constante en temps.
 */
export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  if (!stored.startsWith('pbkdf2:')) return false;
  const parts = stored.split(':');
  if (parts.length !== 3) return false;
  let salt, expected;
  try {
    salt = b64urlDecode(parts[1]);
    expected = b64urlDecode(parts[2]);
  } catch (e) {
    return false;
  }
  if (salt.length !== SALT_LENGTH || expected.length !== HASH_LENGTH) return false;
  const actual = await derivePbkdf2(password, salt);
  return constantTimeEqual(actual, expected);
}

// --- Internes ---

async function derivePbkdf2(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password),
    { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key, HASH_LENGTH * 8
  );
  return new Uint8Array(bits);
}

function b64urlEncode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str) {
  // Restaurer le padding
  const pad = str.length % 4;
  const padded = pad ? str + '='.repeat(4 - pad) : str;
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
