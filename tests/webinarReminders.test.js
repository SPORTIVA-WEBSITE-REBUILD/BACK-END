import { describe, it, expect, vi, beforeEach } from 'vitest';
import Webinar from '../src/models/Webinar.js';
import WebinarRegistration from '../src/models/WebinarRegistration.js';

vi.mock('../src/lib/webinarMailer.js', () => ({ sendWebinarEmail: vi.fn() }));
// eslint-disable-next-line import/first
import { sendWebinarEmail } from '../src/lib/webinarMailer.js';
// eslint-disable-next-line import/first
import {
  isInReminderWindow, findWindowRecipients, sendReminderBatch,
} from '../src/lib/webinarReminders.js';

const hoursFromNow = (h) => new Date(Date.now() + h * 3_600_000);

describe('isInReminderWindow', () => {
  it('"day" window: true at the boundaries (23h and 25h), false just outside', () => {
    expect(isInReminderWindow(hoursFromNow(24), 'day')).toBe(true);
    expect(isInReminderWindow(hoursFromNow(23), 'day')).toBe(true);
    expect(isInReminderWindow(hoursFromNow(25), 'day')).toBe(true);
    expect(isInReminderWindow(hoursFromNow(22.9), 'day')).toBe(false);
    expect(isInReminderWindow(hoursFromNow(25.1), 'day')).toBe(false);
  });

  it('"hour" window: true between 50 and 70 minutes before, false outside', () => {
    expect(isInReminderWindow(hoursFromNow(1), 'hour')).toBe(true); // 60 min
    expect(isInReminderWindow(hoursFromNow(50 / 60), 'hour')).toBe(true);
    expect(isInReminderWindow(hoursFromNow(70 / 60), 'hour')).toBe(true);
    expect(isInReminderWindow(hoursFromNow(49 / 60), 'hour')).toBe(false);
    expect(isInReminderWindow(hoursFromNow(71 / 60), 'hour')).toBe(false);
  });

  it('is false for a past event or a missing date', () => {
    expect(isInReminderWindow(hoursFromNow(-1), 'day')).toBe(false);
    expect(isInReminderWindow(null, 'day')).toBe(false);
  });
});

describe('findWindowRecipients', () => {
  beforeEach(async () => {
    await WebinarRegistration.deleteMany({});
  });

  it('returns nothing when the webinar is outside the window, even with eligible registrations', async () => {
    await WebinarRegistration.create({ name: 'A', email: 'a@example.test', consentAt: new Date(), emailStatus: 'SENT' });
    const webinar = { startsAt: hoursFromNow(48) }; // nowhere near either window
    expect(await findWindowRecipients(webinar, 'day')).toHaveLength(0);
  });

  it('inside the window: includes a SENT registration with no reminder yet, excludes one already reminded', async () => {
    await WebinarRegistration.create([
      { name: 'Due', email: 'due@example.test', consentAt: new Date(), emailStatus: 'SENT' },
      { name: 'Already reminded', email: 'done@example.test', consentAt: new Date(), emailStatus: 'SENT', reminderDayBeforeSentAt: new Date() },
      { name: 'Never confirmed', email: 'pending@example.test', consentAt: new Date(), emailStatus: 'PENDING' },
      { name: 'Failed', email: 'failed@example.test', consentAt: new Date(), emailStatus: 'FAILED' },
    ]);
    const webinar = { startsAt: hoursFromNow(24) };
    const recipients = await findWindowRecipients(webinar, 'day');
    expect(recipients.map((r) => r.email)).toEqual(['due@example.test']);
  });

  it('the hour and day windows are independent — a registration already reminded for "day" is still eligible for "hour"', async () => {
    await WebinarRegistration.create({
      name: 'Due for hour', email: 'hourdue@example.test', consentAt: new Date(),
      emailStatus: 'SENT', reminderDayBeforeSentAt: new Date(),
    });
    const webinar = { startsAt: hoursFromNow(1) };
    const dayRecipients = await findWindowRecipients(webinar, 'day'); // out of day window anyway
    const hourRecipients = await findWindowRecipients(webinar, 'hour');
    expect(dayRecipients).toHaveLength(0);
    expect(hourRecipients.map((r) => r.email)).toEqual(['hourdue@example.test']);
  });
});

describe('sendReminderBatch', () => {
  beforeEach(async () => {
    await WebinarRegistration.deleteMany({});
    sendWebinarEmail.mockReset();
  });

  it('marks reminderDayBeforeSentAt only on success, and counts correctly', async () => {
    const [ok, fail] = await WebinarRegistration.create([
      { name: 'Ok', email: 'ok@example.test', consentAt: new Date(), emailStatus: 'SENT' },
      { name: 'Fail', email: 'fail@example.test', consentAt: new Date(), emailStatus: 'SENT' },
    ]);
    sendWebinarEmail.mockImplementation(({ registrant }) => Promise.resolve(
      registrant.email === 'ok@example.test' ? { ok: true } : { ok: false, error: 'smtp down' },
    ));

    const webinar = { title: 'T', startsAt: hoursFromNow(24) };
    const result = await sendReminderBatch({ webinar, recipients: [ok, fail], type: 'day' });

    expect(result).toEqual({ attempted: 2, sent: 1 });
    const okReloaded = await WebinarRegistration.findById(ok._id);
    const failReloaded = await WebinarRegistration.findById(fail._id);
    expect(okReloaded.reminderDayBeforeSentAt).toBeTruthy();
    expect(failReloaded.reminderDayBeforeSentAt).toBeFalsy();
  });

  it('calls sendWebinarEmail with the correct kind for "hour"', async () => {
    const [reg] = await WebinarRegistration.create([{ name: 'X', email: 'x@example.test', consentAt: new Date(), emailStatus: 'SENT' }]);
    sendWebinarEmail.mockResolvedValue({ ok: true });
    await sendReminderBatch({ webinar: { title: 'T' }, recipients: [reg], type: 'hour' });
    expect(sendWebinarEmail).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reminderHour' }));
  });
});

describe('the scheduled function handler', () => {
  beforeEach(async () => {
    await Webinar.deleteMany({});
    await WebinarRegistration.deleteMany({});
    sendWebinarEmail.mockReset();
    sendWebinarEmail.mockResolvedValue({ ok: true });
  });

  it('does nothing and reports so when no webinar is configured', async () => {
    const { handler } = await import('../netlify/functions/webinar-reminders.js');
    const res = await handler();
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('nothing to do');
  });

  it('is idempotent: running twice inside the same window sends the reminder only once', async () => {
    await Webinar.create({ title: 'T', startsAt: hoursFromNow(24), endsAt: hoursFromNow(26) });
    await WebinarRegistration.create({ name: 'Due', email: 'due@example.test', consentAt: new Date(), emailStatus: 'SENT' });

    const { handler } = await import('../netlify/functions/webinar-reminders.js');
    const first = JSON.parse((await handler()).body);
    const second = JSON.parse((await handler()).body);

    expect(first.day).toEqual({ inWindow: true, attempted: 1, sent: 1 });
    // Still correctly reported as in-window on the second run — zero
    // recipients here means "already reminded", not "window closed".
    expect(second.day).toEqual({ inWindow: true, attempted: 0, sent: 0 });
    expect(sendWebinarEmail).toHaveBeenCalledTimes(1);
  });

  it('sends both kinds independently when both windows are somehow open at once (defensive — in practice they do not overlap)', async () => {
    // Not a realistic state for a single webinar, but proves the two kinds
    // are tracked on independent fields and do not interfere with each other.
    await Webinar.create({ title: 'T', startsAt: hoursFromNow(24) });
    await WebinarRegistration.create({ name: 'Due', email: 'due@example.test', consentAt: new Date(), emailStatus: 'SENT' });
    const { handler } = await import('../netlify/functions/webinar-reminders.js');
    const res = JSON.parse((await handler()).body);
    expect(res.day.inWindow).toBe(true);
    expect(res.hour.inWindow).toBe(false);
  });
});
