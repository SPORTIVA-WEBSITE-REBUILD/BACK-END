import { googleCalendarUrl } from './ics.js';

/**
 * The confirmation/reminder email HTML, built from plain data (no DB or
 * network calls here) so it can be unit tested and used by the
 * email:preview script without touching Mongo or SMTP.
 *
 * Design: table-layout, inline CSS only, no JavaScript — the constraints of
 * email clients, not a stylistic choice. Colours come from the site's own
 * design tokens (FRONT-END/src/styles/app.css): --navy #124b89, --blue
 * #047dd6, --ink-1 #0f172a, --ink-2 #666, --surface #f8f9fa, --line #e6e6e6.
 */
const NAVY = '#124b89';
const ACCENT = '#047dd6';
const INK_1 = '#0f172a';
const INK_2 = '#666666';
const SURFACE = '#f8f9fa';
const LINE = '#e6e6e6';

function escapeHtml(v = '') {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Turns *bold phrases* in admin-entered FAQ answers into <strong>, after
 *  escaping — so the escape can never be reopened by the markup it adds. */
function boldStars(escaped) {
  return escaped.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
}

function formatDateTimeWat(date, timezone = 'Africa/Lagos') {
  if (!date) return '';
  // Intl inserts a comma after a short weekday ("Fri, 6 Nov 2026"); stripped
  // to match the brief's literal format ("Fri 6 Nov 2026").
  const datePart = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: timezone,
  }).format(date).replace(',', '');
  const timePart = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
  }).format(date);
  return `${datePart}, ${timePart}`;
}

function formatRangeWat(startsAt, endsAt, timezone = 'Africa/Lagos') {
  if (!startsAt) return '';
  // Same comma strip as formatDateTimeWat above.
  const datePart = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: timezone,
  }).format(startsAt).replace(',', '');
  const startTime = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
  }).format(startsAt);
  const endTime = endsAt
    ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(endsAt)
    : '';
  const zoneAbbr = timezone === 'Africa/Lagos' ? 'WAT' : timezone;
  return endTime
    ? `${datePart}, ${startTime} to ${endTime} ${zoneAbbr}`
    : `${datePart}, ${startTime} ${zoneAbbr}`;
}

function speakerBlock(speaker) {
  const lines = (speaker.titleLines || []).filter(Boolean);
  const photo = speaker.photoUrl
    ? `<img src="${escapeHtml(speaker.photoUrl)}" width="64" height="64" alt="${escapeHtml(speaker.name)}" style="display:block;width:64px;height:64px;border-radius:50%;object-fit:cover" />`
    : '';
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">
      <tr>
        ${photo ? `<td width="64" valign="top" style="padding-right:14px">${photo}</td>` : ''}
        <td valign="top">
          <div style="font-size:15px;font-weight:700;color:${INK_1}">${escapeHtml(speaker.name)}</div>
          <div style="font-size:12px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:${ACCENT};margin-top:2px">${escapeHtml(speaker.role)}</div>
          ${lines.map((l) => `<div style="font-size:13px;color:${INK_2};margin-top:2px">${escapeHtml(l)}</div>`).join('')}
          ${speaker.bio ? `<div style="font-size:13px;color:${INK_2};margin-top:6px;line-height:1.5">${escapeHtml(speaker.bio)}</div>` : ''}
        </td>
      </tr>
    </table>`;
}

function faqCard(item) {
  if (!item.answer || !item.answer.trim()) return ''; // skip empty answers, per brief
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${LINE};border-radius:12px;margin-bottom:10px">
      <tr><td style="padding:14px 16px">
        <div style="font-size:14px;font-weight:700;color:${ACCENT};margin-bottom:4px">${escapeHtml(item.question)}</div>
        <div style="font-size:13px;color:${INK_2};line-height:1.5">${boldStars(escapeHtml(item.answer))}</div>
      </td></tr>
    </table>`;
}

/**
 * @param {object} webinar  the Webinar document (plain object), INCLUDING
 *   meetUrl — this function is only ever called server-side, right before
 *   sending; the public API route that strips meetUrl never touches it.
 * @param {object} registrant  { name, email, reference }
 * @param {'confirmation'|'reminderDay'|'reminderHour'} kind
 */
export function renderWebinarEmail(webinar, registrant, kind = 'confirmation') {
  const title = webinar.title || 'Webinar';
  const timezone = webinar.timezone || 'Africa/Lagos';
  const whenShort = formatRangeWat(webinar.startsAt, webinar.endsAt, timezone);
  const calendarUrl = webinar.startsAt
    ? googleCalendarUrl({
      title,
      description: webinar.description || '',
      location: webinar.meetUrl || 'Google Meet',
      startsAt: webinar.startsAt,
      endsAt: webinar.endsAt || webinar.startsAt,
    })
    : '';

  const speakers = [...(webinar.speakers || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const faqs = [...(webinar.faq || [])].sort((a, b) => (a.order || 0) - (b.order || 0));

  const isReminder = kind !== 'confirmation';
  const heading = isReminder
    ? `Reminder: ${title} starts ${kind === 'reminderHour' ? 'soon' : 'tomorrow'}`
    : `You're registered: ${title}`;
  const preheader = isReminder
    ? `${whenShort} — join on Google Meet using the button below.`
    : `You're confirmed for ${title} on ${whenShort}.`;

  const social = webinar.social || {};
  const socialLinks = [
    social.instagram ? `<a href="${escapeHtml(social.instagram)}" style="color:#ffffff;text-decoration:underline;margin:0 6px">Instagram</a>` : '',
    social.x ? `<a href="${escapeHtml(social.x)}" style="color:#ffffff;text-decoration:underline;margin:0 6px">X</a>` : '',
    social.linkedin ? `<a href="${escapeHtml(social.linkedin)}" style="color:#ffffff;text-decoration:underline;margin:0 6px">LinkedIn</a>` : '',
  ].filter(Boolean).join('');

  // The full body is only rendered for the confirmation email; reminders are
  // intentionally short (brief: "a short email with the Meet link, date,
  // time and the calendar link"), reusing the same brand header/footer.
  const body = isReminder
    ? `
      <tr><td style="padding:28px 32px 8px">
        <div style="font-size:13px;color:${ACCENT};font-weight:700">${isReminder && kind === 'reminderDay' ? 'STARTING TOMORROW' : 'STARTING SOON'}</div>
        <h1 style="margin:6px 0 10px;font-size:22px;line-height:1.3;color:${INK_1};font-family:Roboto,Arial,Helvetica,sans-serif">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 20px;font-size:14px;color:${INK_2};line-height:1.6">Hello ${escapeHtml(registrant.name)}, this is a reminder for <strong>${escapeHtml(title)}</strong> — ${escapeHtml(whenShort)}.</p>
      </td></tr>
      <tr><td style="padding:0 32px 24px" align="center">
        <a href="${escapeHtml(webinar.meetUrl || '#')}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:999px">Join on Google Meet</a>
        <div style="margin-top:10px;font-size:12px;color:${INK_2};word-break:break-all">${escapeHtml(webinar.meetUrl || '')}</div>
        ${calendarUrl ? `<div style="margin-top:8px"><a href="${escapeHtml(calendarUrl)}" style="font-size:13px;color:${ACCENT}">Add to calendar</a></div>` : ''}
      </td></tr>`
    : `
      <tr><td style="padding:28px 32px 4px">
        <div style="font-size:14px;font-weight:700;color:${ACCENT}">Hello ${escapeHtml(registrant.name)},</div>
        <h1 style="margin:8px 0 10px;font-size:22px;line-height:1.3;color:${INK_1};font-family:Roboto,Arial,Helvetica,sans-serif">You're registered: ${escapeHtml(title)}</h1>
        ${webinar.email?.introParagraph ? `<p style="margin:0 0 20px;font-size:14px;color:${INK_2};line-height:1.6">${escapeHtml(webinar.email.introParagraph)}</p>` : ''}
      </td></tr>
      <tr><td style="padding:0 32px 8px" align="center">
        <a href="${escapeHtml(webinar.meetUrl || '#')}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:999px">Join on Google Meet</a>
        <div style="margin-top:10px;font-size:12px;color:${INK_2};word-break:break-all">${escapeHtml(webinar.meetUrl || '')}</div>
        ${calendarUrl ? `<div style="margin-top:8px"><a href="${escapeHtml(calendarUrl)}" style="font-size:13px;color:${ACCENT}">Add to calendar</a></div>` : ''}
      </td></tr>
      <tr><td style="padding:20px 32px 4px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};border-radius:12px">
          <tr><td style="padding:16px 18px">
            <div style="font-size:11px;font-weight:700;letter-spacing:.05em;color:${ACCENT};margin-bottom:8px">YOUR REGISTRATION</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:${INK_1}">
              <tr><td style="padding:3px 0;color:${INK_2};width:120px">Name</td><td style="padding:3px 0;font-weight:600">${escapeHtml(registrant.name)}</td></tr>
              <tr><td style="padding:3px 0;color:${INK_2}">Email</td><td style="padding:3px 0;font-weight:600">${escapeHtml(registrant.email)}</td></tr>
              <tr><td style="padding:3px 0;color:${INK_2}">Webinar</td><td style="padding:3px 0;font-weight:600">${escapeHtml(title)}</td></tr>
              <tr><td style="padding:3px 0;color:${INK_2}">Date and time</td><td style="padding:3px 0;font-weight:600">${escapeHtml(whenShort)}</td></tr>
              <tr><td style="padding:3px 0;color:${INK_2}">Reference</td><td style="padding:3px 0;font-weight:600">${escapeHtml(registrant.reference || '')}</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 32px 4px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY};border-radius:12px">
          <tr><td style="padding:20px 22px" align="center">
            <div style="color:#ffffff;font-size:17px;font-weight:700;font-family:Roboto,Arial,Helvetica,sans-serif">${escapeHtml(title)}</div>
            <div style="color:#cfe2f7;font-size:13px;margin-top:6px">${escapeHtml(whenShort)}</div>
          </td></tr>
        </table>
      </td></tr>
      ${webinar.description ? `
      <tr><td style="padding:24px 32px 4px">
        <div style="font-size:15px;font-weight:700;color:${INK_1};margin-bottom:8px">About this webinar</div>
        <div style="font-size:14px;color:${INK_2};line-height:1.6">${escapeHtml(webinar.description)}</div>
      </td></tr>` : ''}
      ${speakers.length ? `
      <tr><td style="padding:24px 32px 4px">
        <div style="font-size:15px;font-weight:700;color:${INK_1};margin-bottom:14px">Meet your speakers</div>
        ${speakers.map(speakerBlock).join('')}
      </td></tr>` : ''}
      ${faqs.some((f) => f.answer) ? `
      <tr><td style="padding:10px 32px 4px">
        <div style="font-size:15px;font-weight:700;color:${INK_1};margin-bottom:12px">Frequently asked questions</div>
        ${faqs.map(faqCard).join('')}
      </td></tr>` : ''}
      <tr><td style="padding:20px 32px 4px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef6ff;border-radius:10px">
          <tr><td style="padding:14px 16px;font-size:13px;color:${INK_1};line-height:1.5">${escapeHtml(webinar.email?.noteBoxText || 'Please keep this email. Use the link above at the start time.')}</td></tr>
        </table>
      </td></tr>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f3f5;font-family:Roboto,Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f5">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden">
        ${webinar.bannerUrl ? `
        <tr><td>
          <img src="${escapeHtml(webinar.bannerUrl)}" width="640" alt="${escapeHtml(title)}" style="display:block;width:100%;height:auto;border:0" />
        </td></tr>` : ''}
        ${body}
        <tr><td style="padding:28px 32px 32px" align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK_1};border-radius:12px">
            <tr><td style="padding:22px 24px" align="center">
              <div style="color:#ffffff;font-size:13px;font-weight:700">${escapeHtml(webinar.organiserName || 'PCN Sportiva LP')}</div>
              <div style="color:#c9d2de;font-size:12px;margin-top:4px">${escapeHtml(title)}</div>
              <div style="color:#c9d2de;font-size:12px;margin-top:2px">${escapeHtml(whenShort)}</div>
              ${socialLinks ? `<div style="margin-top:12px;font-size:12px">${socialLinks}</div>` : ''}
              ${webinar.email?.footerText ? `<div style="color:#8fa0b8;font-size:11px;margin-top:12px">${escapeHtml(webinar.email.footerText)}</div>` : ''}
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textLines = [
    heading,
    '',
    `Hello ${registrant.name},`,
    '',
    isReminder
      ? `This is a reminder for ${title} — ${whenShort}.`
      : (webinar.email?.introParagraph || `You're confirmed for ${title}.`),
    '',
    `Join on Google Meet: ${webinar.meetUrl || ''}`,
    calendarUrl ? `Add to calendar: ${calendarUrl}` : '',
    '',
    !isReminder ? 'YOUR REGISTRATION' : '',
    !isReminder ? `Name: ${registrant.name}` : '',
    !isReminder ? `Email: ${registrant.email}` : '',
    !isReminder ? `Webinar: ${title}` : '',
    !isReminder ? `Date and time: ${whenShort}` : '',
    !isReminder ? `Reference: ${registrant.reference || ''}` : '',
    '',
    !isReminder && webinar.description ? `About this webinar\n${webinar.description}` : '',
    !isReminder && speakers.length ? `Speakers\n${speakers.map((s) => `- ${s.name} (${s.role})`).join('\n')}` : '',
    '',
    webinar.email?.footerText || '',
  ].filter((l) => l !== '');

  return { html, text: textLines.join('\n'), subject: isReminder ? heading : (webinar.email?.subject || heading) };
}
