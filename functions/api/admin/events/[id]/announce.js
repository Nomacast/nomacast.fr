// functions/api/admin/events/[id]/announce.js
// POST /api/admin/events/:id/announce  →  Publie une annonce du modérateur.
//
// Les annonces sont des messages spéciaux :
//   - author_kind = 'admin' (diffusion à tous, même en mode lecture seule)
//   - status = 'approved' (pas de modération, publication directe)
//   - invitee_id = NULL
//   - author_name = 'Modérateur' par défaut (TODO : récupérer depuis CF Access JWT)
//
// Le polling chat côté participant les récupère naturellement comme un message normal,
// avec une CSS class distincte pour le rendre visuellement comme une annonce (côté UI).
//
// Auth : Cloudflare Access (même pattern que les autres endpoints admin).
//
// Marqueur : nomacast-admin-announce-v1

export const onRequestPost = async ({ request, params, env }) => {
  if (!env.DB) return json({ error: 'D1 binding DB manquant' }, 500);

  // 1. Vérifier que l'event existe
  const event = await env.DB.prepare(
    'SELECT id, status FROM events WHERE id = ?'
  ).bind(params.id).first();
  if (!event) return json({ error: 'Event introuvable' }, 404);

  // 2. Parser le body
  let data;
  try {
    data = await request.json();
  } catch (e) {
    return json({ error: 'JSON invalide' }, 400);
  }

  // 3. Valider le content
  const content = typeof data.content === 'string' ? data.content.trim() : '';
  if (!content) return json({ error: 'content requis' }, 400);
  if (content.length > 500) return json({ error: 'content trop long (max 500 caractères)' }, 400);

  // 4. Récupérer le nom de l'auteur depuis le JWT Cloudflare Access (si dispo)
  //    Sinon fallback sur 'Modérateur'
  const authorName = extractCfAccessEmail(request) || 'Modérateur';

  // 5. INSERT — on essaie d'abord avec `content`, fallback sur `body` si la colonne diffère
  const now = new Date().toISOString();
  const messageId = generateId();

  // Détection auto du nom de colonne contenu (résilience aux différents schémas)
  const contentCol = await detectContentColumn(env.DB);
  if (!contentCol) {
    return json({ error: 'Impossible de détecter la colonne content/body de chat_messages' }, 500);
  }

  try {
    await env.DB.prepare(`
      INSERT INTO chat_messages (id, event_id, invitee_id, author_name, ${contentCol}, status, author_kind, created_at)
      VALUES (?, ?, NULL, ?, ?, 'approved', 'admin', ?)
    `).bind(messageId, params.id, authorName, content, now).run();

    return json({
      success: true,
      message: {
        id: messageId,
        event_id: params.id,
        author_name: authorName,
        [contentCol]: content,
        status: 'approved',
        author_kind: 'admin',
        created_at: now
      }
    }, 201);
  } catch (err) {
    console.error('[admin/events/:id/announce]', err);
    return json({ error: err.message }, 500);
  }
};

// ============================================================
// Helpers
// ============================================================

// Détecte le nom de la colonne content (résilience aux variations de schéma)
async function detectContentColumn(db) {
  try {
    const res = await db.prepare('PRAGMA table_info(chat_messages)').all();
    const cols = (res.results || []).map(r => r.name);
    // Priorité : content > body > message > text
    if (cols.includes('content')) return 'content';
    if (cols.includes('body')) return 'body';
    if (cols.includes('message')) return 'message';
    if (cols.includes('text')) return 'text';
    return null;
  } catch (err) {
    console.warn('[announce detectContentColumn]', err.message);
    return null;
  }
}

// Récupère l'email de l'admin depuis CF Access JWT (header CF-Access-Authenticated-User-Email)
function extractCfAccessEmail(request) {
  try {
    const email = request.headers.get('CF-Access-Authenticated-User-Email');
    if (email) return email.split('@')[0]; // garde juste la partie locale (Nomacast standard)
  } catch (e) {}
  return null;
}

function generateId() {
  // UUID v4 simplifié — pattern commun aux autres endpoints
  return crypto.randomUUID();
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
