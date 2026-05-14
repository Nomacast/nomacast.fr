// functions/api/admin/events/[id]/messages/[msgId].js
// PATCH  /api/admin/events/:id/messages/:msgId  → modifie le status (approved/rejected/pending)
// DELETE /api/admin/events/:id/messages/:msgId  → suppression définitive
//
// Auth : middleware Basic Auth admin (hérité).
// Utilisé par la page de régie /admin/live.html.

// ============================================================
// PATCH — change le status d'un message
// ============================================================
export const onRequestPatch = async ({ params, request, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  let data;
  try { data = await request.json(); }
  catch (e) { return jsonResponse({ error: 'JSON invalide' }, 400); }

  if (!data.status || !['approved', 'rejected', 'pending'].includes(data.status)) {
    return jsonResponse({ error: 'status requis (approved/rejected/pending)' }, 400);
  }

  const now = new Date().toISOString();
  // approved_at fixé seulement lors de la 1ère approbation ; on garde l'historique sinon
  const approvedAt = data.status === 'approved' ? now : null;

  try {
    const result = await env.DB.prepare(`
      UPDATE chat_messages
         SET status = ?, approved_at = COALESCE(?, approved_at)
       WHERE id = ? AND event_id = ?
    `).bind(data.status, approvedAt, params.msgId, params.id).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ error: 'Message introuvable' }, 404);
    }

    const updated = await env.DB.prepare(`
      SELECT id, event_id, invitee_id, author_name, author_kind, content,
             kind, status, created_at, approved_at
        FROM chat_messages WHERE id = ?
    `).bind(params.msgId).first();

    return jsonResponse({ message: updated });
  } catch (err) {
    console.error('[admin/messages PATCH]', err);
    return jsonResponse({ error: err.message }, 500);
  }
};

// ============================================================
// DELETE — suppression définitive d'un message
// ============================================================
export const onRequestDelete = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  try {
    const result = await env.DB.prepare(
      'DELETE FROM chat_messages WHERE id = ? AND event_id = ?'
    ).bind(params.msgId, params.id).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ error: 'Message introuvable' }, 404);
    }

    return jsonResponse({ success: true, deleted_id: params.msgId });
  } catch (err) {
    console.error('[admin/messages DELETE]', err);
    return jsonResponse({ error: err.message }, 500);
  }
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
