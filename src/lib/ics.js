/** Folds a line to the 75-octet limit RFC 5545 requires, continuation lines
 *  indented with a single space, as most calendar clients expect. */
function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const take = i === 0 ? 75 : 74;
    out.push(bytes.subarray(i, i + take).toString('utf8'));
    i += take;
  }
  return out.join('\r\n ');
}

function escapeIcsText(v = '') {
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function toUtcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * A minimal, widely-compatible VCALENDAR with one VEVENT and two VALARMs
 * (1 day and 30 minutes before), attached to the confirmation email.
 * startsAt/endsAt must be real UTC Date instants — the DTSTART/DTEND lines
 * below are written in UTC (trailing Z), so every calendar app resolves the
 * correct local time regardless of its own timezone database.
 */
export function buildWebinarIcs({ uid, title, description, location, startsAt, endsAt, organiserName, organiserEmail }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PCN Sportiva LP//Webinar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${toUtcStamp(startsAt)}`,
    `DTEND:${toUtcStamp(endsAt)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    organiserEmail ? `ORGANIZER;CN=${escapeIcsText(organiserName)}:mailto:${organiserEmail}` : null,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'TRIGGER:-P1D',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'TRIGGER:-PT30M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Google Calendar "add event" template URL — no API call, no auth needed. */
export function googleCalendarUrl({ title, description, location, startsAt, endsAt }) {
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(startsAt)}/${fmt(endsAt)}`,
    details: description,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
