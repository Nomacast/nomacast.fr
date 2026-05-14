// functions/api/admin/events/[id]/polls.js
// GET  /api/admin/events/:id/polls          → Liste tous les sondages d'un event
// POST /api/admin/events/:id/polls          → Crée un nouveau sondage (status='draft')
//
// Auth : middleware Basic Auth admin (hérité de /api/admin/*)

// ============================================================
// GET — liste tous les sondages de l'event (avec compteurs)
// ============================================================
export const onRequestGet = async ({ params, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  try {
    const polls = await env.DB.prepare(`
      SELECT p.id, p.event_id, p.question, p.type, p.status,
             p.results_visibility, p.created_at, p.launched_at, p.closed_at,
             (SELECT COUNT(*) FROM poll_options o WHERE o.poll_id = p.id) AS options_count,
             (SELECT COUNT(*) FROM poll_votes v WHERE v.poll_id = p.id) AS votes_count
        FROM polls p
       WHERE p.event_id = ?
       ORDER BY p.created_at DESC
    `).bind(params.id).all();

    return jsonResponse({ polls: polls.results || [] });
  } catch (err) {
    console.error('[admin/polls GET]', err);
    return jsonResponse({ error: err.message }, 500);
  }
};

// ============================================================
// POST — crée un nouveau sondage (draft)
// Body : { question: string, options: string[], type?: 'single', results_visibility?: 'live'|'after-vote'|'after-close' }
// ============================================================
export const onRequestPost = async ({ params, request, env }) => {
  if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

  let data;
  try { data = await request.json(); }
  catch (e) { return jsonResponse({ error: 'JSON invalide' }, 400); }

  // Vérifier event existe
  const event = await env.DB.prepare(
    'SELECT id FROM events WHERE id = ?'
  ).bind(params.id).first();
  if (!event) return jsonResponse({ error: 'Event introuvable' }, 404);

  // Validation question
  const question = (data.question || '').toString().trim();
  if (!question) return jsonResponse({ error: 'Question requise' }, 400);
  if (question.length < 3) return jsonResponse({ error: 'Question trop courte (3 caractères min)' }, 400);
  if (question.length > 300) return jsonResponse({ error: 'Question trop longue (300 caractères max)' }, 400);

  // Validation options
  if (!Array.isArray(data.options)) {
    return jsonResponse({ error: 'options doit être un tableau' }, 400);
  }
  const options = data.options
    .map(o => (o || '').toString().trim())
    .filter(o => o.length > 0);
  if (options.length < 2) return jsonResponse({ error: 'Minimum 2 options' }, 400);
  if (options.length > 8) return jsonResponse({ error: 'Maximum 8 options' }, 400);
  for (const opt of options) {
    if (opt.length > 100) return jsonResponse({ error: 'Option trop longue (100 caractères max)' }, 400);
  }

  // Type (MVP : single uniquement)
  const type = data.type === 'multi' ? 'multi' : 'single';
  if (type === 'multi') {
    return jsonResponse({ error: 'Type "multi" pas encore supporté (MVP : single uniquement)' }, 400);
  }

  // Results visibility
  const validVisibilities = ['live', 'after-vote', 'after-close'];
  const resultsVisibility = validVisibilities.includes(data.results_visibility)
    ? data.results_visibility
    : 'live';

  const pollId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    // INSERT poll
    await env.DB.prepare(`
      INSERT INTO polls (id, event_id, question, type, status, results_visibility, created_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?)
    `).bind(pollId, params.id, question, type, resultsVisibility, now).run();

    // INSERT options (batch)
    const stmts = options.map((label, idx) =>
      env.DB.prepare(`
        INSERT INTO poll_options (id, poll_id, label, position)
        VALUES (?, ?, ?, ?)
      `).bind(crypto.randomUUID(), pollId, label, idx)
    );
    await env.DB.batch(stmts);

    // Récupérer le poll complet pour le retour
    const created = await env.DB.prepare(`
      SELECT id, event_id, question, type, status, results_visibility,
             created_at, launched_at, closed_at
        FROM polls WHERE id = ?
    `).bind(pollId).first();

    const createdOptions = await env.DB.prepare(`
      SELECT id, poll_id, label, position
        FROM poll_options WHERE poll_id = ?
        ORDER BY position ASC
    `).bind(pollId).all();

    return jsonResponse({
      poll: { ...created, options: createdOptions.results || [] }
    }, 201);
  } catch (err) {
    console.error('[admin/polls POST]', err);
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
