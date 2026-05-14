// functions/api/chat/[slug]/report-issue.js
// POST /api/chat/<slug>/report-issue
// Body : { type: 'audio' | 'video' | 'both', invitee_id?: string }
//
// 1. INSERT dans technical_alerts (pour affichage feed vMix)
// 2. Envoie un email d'alerte à evenement@nomacast.fr via Resend (pour archive)

const TYPE_LABEL = {
  audio: 'Problème de son uniquement',
  video: 'Problème d\'image uniquement',
  both:  'Problème d\'image ET de son'
};

const TYPE_BADGE = {
  audio: '#f59e0b',
  video: '#3b82f6',
  both:  '#ef4444'
};

export const onRequestPost = async ({ params, request, env }) => {
  try {
    if (!env.DB) return jsonResponse({ error: 'D1 binding manquant' }, 500);

    let data;
    try { data = await request.json(); }
    catch (e) { return jsonResponse({ error: 'JSON invalide' }, 400); }

    const type = (data.type || '').toString();
    if (!TYPE_LABEL[type]) return jsonResponse({ error: 'Type invalide (audio|video|both)' }, 400);

    // SELECT minimal (colonnes safe garanties)
    let ev;
    try {
      ev = await env.DB.prepare(`
        SELECT id, title, slug, status
        FROM events WHERE slug = ?
      `).bind(params.slug).first();
    } catch (sqlErr) {
      console.error('[report-issue SQL events]', sqlErr);
      return jsonResponse({ error: 'SQL events: ' + (sqlErr.message || 'unknown') }, 500);
    }
    if (!ev) return jsonResponse({ error: 'Event introuvable (slug: ' + params.slug + ')' }, 404);

    // Identité éventuelle (invité privé)
    const inviteeId = (data.invitee_id || '').toString().trim() || null;
    let invitee = null;
    if (inviteeId) {
      try {
        invitee = await env.DB.prepare(`
          SELECT id, first_name, last_name, email, organization, role
          FROM invitees WHERE id = ? AND event_id = ?
        `).bind(inviteeId, ev.id).first();
      } catch (sqlErr) {
        console.error('[report-issue SQL invitees]', sqlErr);
        invitee = null;
      }
    }

    const userAgent = request.headers.get('User-Agent') || '—';
    const referer = request.headers.get('Referer') || '—';
    const country = request.headers.get('CF-IPCountry') || '—';
    const now = new Date();
    const nowIso = now.toISOString();
    const nowFr = now.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

    // Label auteur (pré-calculé pour éviter de joindre à chaque lecture du feed)
    const authorLabel = invitee
      ? (((invitee.first_name || '') + ' ' + (invitee.last_name || '')).trim() || invitee.email || 'Invité')
      : 'Anonyme';

    // 1. INSERT dans technical_alerts — l'alerte sera visible dans le feed vMix
    const alertId = crypto.randomUUID();
    try {
      await env.DB.prepare(`
        INSERT INTO technical_alerts
          (id, event_id, type, invitee_id, author_label, country, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(alertId, ev.id, type, inviteeId, authorLabel, country, userAgent, nowIso).run();
    } catch (insertErr) {
      console.error('[report-issue INSERT alert]', insertErr);
      // On ne bloque pas l'email pour autant — l'admin sera notifié par mail
    }

    // 2. Envoi email (si RESEND_API_KEY configurée). Pas bloquant : si pas de clé,
    // on continue (l'alerte est dans la DB et visible dans le feed vMix).
    if (env.RESEND_API_KEY) {
      const eventStatusLabel = {
        draft: 'Brouillon', scheduled: 'Programmé', live: 'EN DIRECT',
        ended: 'Terminé', cancelled: 'Annulé'
      }[ev.status] || ev.status;

      const inviteeBlock = invitee
        ? `
          <h3 style="margin:24px 0 8px;color:#0f172a;font-size:14px;">Participant identifié</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr><td style="padding:4px 0;color:#64748b;width:120px;">Nom</td><td style="padding:4px 0;color:#0f172a;">${escapeHtml(authorLabel)}</td></tr>
            <tr><td style="padding:4px 0;color:#64748b;">Email</td><td style="padding:4px 0;color:#0f172a;">${escapeHtml(invitee.email || '—')}</td></tr>
            <tr><td style="padding:4px 0;color:#64748b;">Organisation</td><td style="padding:4px 0;color:#0f172a;">${escapeHtml(invitee.organization || '—')}</td></tr>
            <tr><td style="padding:4px 0;color:#64748b;">Rôle</td><td style="padding:4px 0;color:#0f172a;">${escapeHtml(invitee.role || '—')}</td></tr>
          </table>`
        : `
          <h3 style="margin:24px 0 8px;color:#0f172a;font-size:14px;">Participant anonyme</h3>
          <p style="margin:0;font-size:13px;color:#64748b;">Chat public, identité inconnue.</p>`;

      const subject = `[ALERTE] ${TYPE_LABEL[type]} — ${ev.title}`;
      const html = `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="background:${TYPE_BADGE[type]};color:#ffffff;padding:16px 20px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.5px;opacity:0.9;">ALERTE TECHNIQUE PARTICIPANT</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;">${TYPE_LABEL[type]}</div>
    </div>
    <div style="padding:20px;">
      <h3 style="margin:0 0 8px;color:#0f172a;font-size:14px;">Événement</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:4px 0;color:#64748b;width:120px;">Titre</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${escapeHtml(ev.title)}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;">Statut</td><td style="padding:4px 0;color:#0f172a;font-weight:600;">${eventStatusLabel}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;">Slug</td><td style="padding:4px 0;"><a href="https://nomacast.fr/chat/${escapeHtml(ev.slug)}" style="color:#5A98D6;">/chat/${escapeHtml(ev.slug)}</a></td></tr>
      </table>
      ${inviteeBlock}
      <h3 style="margin:24px 0 8px;color:#0f172a;font-size:14px;">Contexte technique</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:4px 0;color:#64748b;width:120px;vertical-align:top;">Reçu</td><td style="padding:4px 0;color:#0f172a;">${escapeHtml(nowFr)} (Paris)</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;vertical-align:top;">Pays</td><td style="padding:4px 0;color:#0f172a;">${escapeHtml(country)}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;vertical-align:top;">User-Agent</td><td style="padding:4px 0;color:#475569;font-family:monospace;font-size:11px;word-break:break-all;">${escapeHtml(userAgent)}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;vertical-align:top;">Page</td><td style="padding:4px 0;color:#475569;font-size:11px;word-break:break-all;">${escapeHtml(referer)}</td></tr>
      </table>
    </div>
  </div>
</body></html>`;

      const text = [
        `ALERTE : ${TYPE_LABEL[type]}`, ``,
        `Événement : ${ev.title}`,
        `Statut : ${eventStatusLabel}`,
        `URL : https://nomacast.fr/chat/${ev.slug}`, ``,
        invitee
          ? `Participant : ${authorLabel} <${invitee.email || '—'}> (${invitee.organization || '—'})`
          : `Participant anonyme`, ``,
        `Reçu : ${nowFr}`,
        `Pays : ${country}`,
        `User-Agent : ${userAgent}`,
        `Page : ${referer}`
      ].join('\n');

      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Alertes Nomacast <noreply@nomacast.fr>',
            to: ['evenement@nomacast.fr'],
            subject, html, text
          })
        });
        if (!r.ok) {
          const rText = await r.text().catch(() => '');
          console.error('[report-issue Resend not ok]', r.status, rText);
          // Pas d'erreur retournée au client : l'INSERT a réussi, c'est l'essentiel
        }
      } catch (fetchErr) {
        console.error('[report-issue fetch Resend]', fetchErr);
      }
    }

    return jsonResponse({ success: true, alert_id: alertId });
  } catch (err) {
    console.error('[report-issue FATAL]', err && err.stack || err);
    return jsonResponse({
      error: 'Exception serveur: ' + (err && err.message ? err.message : 'unknown')
    }, 500);
  }
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
