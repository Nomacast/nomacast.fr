// functions/api/admin/events/[id]/announce.js
// POST /api/admin/events/:id/announce  → crée un message broadcast (author_kind='admin')
//
// Auth : middleware Basic Auth admin (hérité).
// Body : { content: string, author_name?: string }
//
// Le message est inséré dans chat_messages avec status='approved' (pas de modération).
// Il apparaît dans le chat de tous les participants (lecture seule ou non).

export const onRequestPost = async ({ params, request, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  let data;
  try { data = await request.json(); }
  catch (e) { return jsonResponse({ error: 'JSON invalide' }, 400); }

  const content = (data.content || '').toString().trim();
  if (!content) return jsonResponse({ error: 'Contenu requis' }, 400);
  if (content.length > 500) return jsonResponse({ error: 'Trop long (500 caractères max)' }, 400);

  const authorName = (data.author_name || 'Modérateur').toString().trim().slice(0, 60) || 'Modérateur';

  // Vérifier event existe
  const event = await env.DB.prepare('SELECT id, status FROM events WHERE id = ?').bind(params.id).first();
  if (!event) return jsonResponse({ error: 'Event introuvable' }, 404);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(`
      INSERT INTO chat_messages
        (id, event_id, invitee_id, author_name, author_kind, content, kind, status, created_at, approved_at)
      VALUES (?, ?, NULL, ?, 'admin', ?, 'message', 'approved', ?, ?)
    `).bind(id, event.id, authorName, content, now, now).run();
  } catch (err) {
    console.error('[announce POST]', err);
    return jsonResponse({ error: err.message }, 500);
  }

  return jsonResponse({
    success: true,
    message: {
      id, event_id: event.id, author_name: authorName, author_kind: 'admin',
      content, kind: 'message', status: 'approved',
      created_at: now, approved_at: now
    }
  });
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
