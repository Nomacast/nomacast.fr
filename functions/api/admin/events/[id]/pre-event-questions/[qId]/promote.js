// functions/api/admin/events/[id]/pre-event-questions/[qId]/promote.js
// POST /api/admin/events/<id>/pre-event-questions/<qId>/promote
//
// Diffuse une pre-event question dans le chat live :
// 1. INSERT dans chat_messages (kind='question', status='approved', author_kind='guest')
// 2. UPDATE pre_event_questions SET status='promoted', promoted_at, promoted_message_id

export const onRequestPost = async ({ params, env }) => {
  try {
    if (!env.DB) return json({ error: 'D1' }, 500);

    const q = await env.DB.prepare(`
      SELECT id, event_id, author_name, content, status, promoted_message_id
      FROM pre_event_questions
      WHERE id = ? AND event_id = ?
    `).bind(params.qId, params.id).first();

    if (!q) return json({ error: 'Question introuvable' }, 404);
    if (q.status === 'promoted') {
      return json({ error: 'Question déjà diffusée', message_id: q.promoted_message_id }, 409);
    }

    const ev = await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(params.id).first();
    if (!ev) return json({ error: 'Event introuvable' }, 404);

    const msgId = crypto.randomUUID();
    const now = new Date().toISOString();
    const prefixedContent = '[Pré-event] ' + q.content;

    await env.DB.prepare(`
      INSERT INTO chat_messages
        (id, event_id, invitee_id, author_name, author_kind, content, kind, status, created_at, approved_at)
      VALUES (?, ?, NULL, ?, 'guest', ?, 'question', 'approved', ?, ?)
    `).bind(msgId, ev.id, q.author_name, prefixedContent, now, now).run();

    await env.DB.prepare(`
      UPDATE pre_event_questions
      SET status = 'promoted', promoted_at = ?, promoted_message_id = ?
      WHERE id = ?
    `).bind(now, msgId, q.id).run();

    return json({ success: true, message_id: msgId });
  } catch (err) {
    console.error('[promote pre-event]', err);
    return json({ error: err.message }, 500);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
