import WebinarRegistration from '../models/WebinarRegistration.js';
import { sendWebinarEmail } from './webinarMailer.js';

export function reminderReference(id) {
  return `WEB-${String(id).slice(-6).toUpperCase()}`;
}

/**
 * Sends one reminder kind to a given set of registrations, marking each one
 * sent as it succeeds. Shared by the scheduled function (which picks
 * recipients by the 23–25h / 50–70min time window, idempotent via the
 * reminder*SentAt field) and the admin "Send reminder" button (which sends
 * to everyone eligible right now, no time window — an admin explicitly
 * asking for it now is not throttled by a window built for the unattended
 * cron job).
 */
export async function sendReminderBatch({ webinar, recipients, type }) {
  const field = type === 'day' ? 'reminderDayBeforeSentAt' : 'reminderHourBeforeSentAt';
  const kind = type === 'day' ? 'reminderDay' : 'reminderHour';

  let sent = 0;
  for (const registration of recipients) {
    // eslint-disable-next-line no-await-in-loop
    const result = await sendWebinarEmail({
      webinar,
      registrant: { name: registration.name, email: registration.email, reference: reminderReference(registration._id) },
      kind,
    });
    if (result.ok) {
      registration[field] = new Date();
      sent += 1;
      // eslint-disable-next-line no-await-in-loop
      await registration.save();
    } else {
      console.error('[webinar-reminder] send failed', registration.email, result.error);
    }
  }
  return { attempted: recipients.length, sent };
}

/**
 * Recipients for the automatic cron job: SENT confirmations, not yet
 * reminded for this kind, whose startsAt falls inside the matching window.
 * The window check happens in JS against `now`/`startsAt`, not as a Mongo
 * date-range query, because both windows are small, fixed offsets from a
 * single startsAt shared by every registration (there is only ever one
 * webinar) — simpler to compute once than to express as a query.
 */
export function isInReminderWindow(startsAt, type, now = new Date()) {
  if (!startsAt) return false;
  const hoursUntil = (new Date(startsAt).getTime() - now.getTime()) / 3_600_000;
  if (type === 'day') return hoursUntil <= 25 && hoursUntil >= 23;
  return hoursUntil <= (70 / 60) && hoursUntil >= (50 / 60);
}

export async function findWindowRecipients(webinar, type) {
  const field = type === 'day' ? 'reminderDayBeforeSentAt' : 'reminderHourBeforeSentAt';
  if (!isInReminderWindow(webinar.startsAt, type)) return [];
  return WebinarRegistration.find({ emailStatus: 'SENT', [field]: { $exists: false } });
}
