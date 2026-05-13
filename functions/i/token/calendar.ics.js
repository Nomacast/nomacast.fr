// functions/i/[token]/calendar.ics.js
// GET /i/:token/calendar.ics
// Renvoie un fichier .ics basé sur le token de l'invité (URL opaque, pas de slug).

export const onRequestGet = async ({ params, env, request }) => {
  if (!env.DB) return new Response('Database error', { status: 500 });

  const row = await env.DB.prepare(`
    SELECT
      e.id, e.slug, e.title, e.client_name, e.scheduled_at, e.duration_minutes
    FROM invitees i
    JOIN events e ON i.event_id = e.id
    WHERE i.magic_token = ?
  `).bind(params.token).first();

  if (!row) return new Response('Invitation introuvable', { status: 404 });
  if (!row.scheduled_at) return new Response('Date d\'événement non définie', { status: 400 });

  const url = new URL(request.url);
  const chatLink = `${url.origin}/i/${params.token}`;

  const ics = buildIcs(row, chatLink);

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${row.slug}.ics"`,
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
};

function buildIcs(event, chatLink) {
  const dtStart = toIcsDate(event.scheduled_at);
  const dtEnd = toIcsDate(addMinutes(event.scheduled_at, event.duration_minutes || 90));
  const dtStamp = toIcsDate(new Date().toISOString());
  const uid = `${event.id}@nomacast.fr`;

  const title = icsEscape(event.title);
  const orgLine = event.client_name ? ` (${event.client_name})` : '';
  const summary = title + (orgLine ? icsEscape(orgLine) : '');
  const description = icsEscape(
    `Chat live de l'événement « ${event.title} »${event.client_name ? `, organisé par ${event.client_name}` : ''}.\n\n` +
    `Pour rejoindre le chat le jour J :\n${chatLink}\n\n` +
    `Propulsé par Nomacast — https://nomacast.fr`
  );
  const location = icsEscape(chatLink);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nomacast//Chat Live//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `URL:${chatLink}`,
    `LOCATION:${location}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

function toIcsDate(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function addMinutes(iso, mins) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + (mins || 0));
  return d.toISOString();
}

function icsEscape(s) {
  if (!s) return '';
  return String(s)
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
