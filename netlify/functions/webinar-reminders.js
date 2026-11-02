/**
 * Netlify Scheduled Function — runs every 10 minutes (see the schedule in
 * netlify.toml). Sends the "day before" reminder in the 23–25 hour window
 * before startsAt, and the "hour before" reminder in the 50–70 minute
 * window, to registrations whose confirmation email was SENT and who have
 * not already received that specific reminder — idempotent via the
 * reminder*SentAt fields, so a second run inside the same window (or a
 * retry after a timeout) sends nothing twice.
 *
 * A standalone function, not a route behind the Express app in api.js: a
 * scheduled invocation carries no admin session to authenticate, and this
 * needs no HTTP request/response shape at all.
 */
import { connectDB } from '../../src/lib/db.js';
import Webinar from '../../src/models/Webinar.js';
import { sendReminderBatch, findWindowRecipients, isInReminderWindow } from '../../src/lib/webinarReminders.js';

export const handler = async () => {
  await connectDB();

  const webinar = await Webinar.findOne();
  if (!webinar || !webinar.startsAt) {
    return { statusCode: 200, body: 'No webinar configured with a start time — nothing to do.' };
  }

  const results = {};
  for (const type of ['day', 'hour']) {
    // Reported separately from the recipient count: zero recipients can mean
    // either "not in the window yet" or "in the window, but everyone
    // eligible was already reminded" — collapsing those into one boolean
    // would make the function's own logs misleading when debugging why a
    // reminder did or didn't go out.
    const inWindow = isInReminderWindow(webinar.startsAt, type);
    // eslint-disable-next-line no-await-in-loop
    const recipients = inWindow ? await findWindowRecipients(webinar, type) : [];
    // eslint-disable-next-line no-await-in-loop
    const { attempted, sent } = await sendReminderBatch({ webinar, recipients, type });
    results[type] = { inWindow, attempted, sent };
  }

  console.log('[webinar-reminders]', JSON.stringify(results));
  return { statusCode: 200, body: JSON.stringify(results) };
};
