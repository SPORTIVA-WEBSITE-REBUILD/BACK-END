import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import env from '../config/env.js';
import { renderWebinarEmail } from './webinarTemplate.js';
import { buildWebinarIcs } from './ics.js';

/**
 * SMTP via Zoho (or any SMTP provider — nothing here is Zoho-specific).
 *
 * Zoho notes, since this is the provider in use for this project:
 *  - If the mailbox has two-step verification on, the normal account
 *    password will NOT work here. Generate an app-specific password under
 *    Zoho Mail > Settings > Security > App Passwords, and use that as
 *    SMTP_PASS instead.
 *  - The SMTP host depends on the Zoho data-centre the account was created
 *    in: smtp.zoho.com (global/US), smtp.zoho.eu (Europe), smtp.zoho.in
 *    (India), smtp.zoho.com.au (Australia), etc. Using the wrong region's
 *    host is a common cause of auth failures that look like a bad password.
 *  - Free and lower Zoho Mail plans restrict or disable SMTP access and cap
 *    the number of emails sent per day; a webinar with a large guest list
 *    may need a paid plan with a higher limit.
 */
// 15s, not the previous 8s: a live send just failed with "timeout" at 8s
// with no other detail, which could mean the SMTP host is genuinely slow to
// respond rather than unreachable — raising the ceiling here is how
// smtp-check (below) tells those two apart with an actual measurement
// instead of guessing from a bare "timeout" string. Still comfortably inside
// Netlify's function time limit.
export const TIMEOUT_MS = 15000;

export function buildTransport() {
  const { host, port, secure, user, pass } = env.mail;
  return nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
}

const DRY_RUN_DIR = path.resolve(process.cwd(), 'tmp');

async function writeDryRunPreview({ html, text, subject }) {
  await fs.mkdir(DRY_RUN_DIR, { recursive: true });
  const target = path.join(DRY_RUN_DIR, 'email-preview.html');
  await fs.writeFile(target, html, 'utf8');
  await fs.writeFile(path.join(DRY_RUN_DIR, 'email-preview.txt'), text, 'utf8');
  return target;
}

/**
 * Sends one webinar email (confirmation or a reminder) to one registrant.
 * Never throws: the caller (the registration route, or the reminder job)
 * must be able to record a FAILED status and move on rather than crash.
 *
 * EMAIL_DRY_RUN=true writes the rendered output to ./tmp/email-preview.html
 * and sends nothing — used by `npm run email:preview` and safe to leave on
 * in any environment that should never actually deliver mail.
 */
export async function sendWebinarEmail({ webinar, registrant, kind = 'confirmation' }) {
  const { html, text, subject } = renderWebinarEmail(webinar, registrant, kind);

  if (env.mail.dryRun) {
    const target = await writeDryRunPreview({ html, text, subject });
    return { ok: true, dryRun: true, previewPath: target };
  }

  if (!env.mail.host || !env.mail.user || !env.mail.pass) {
    return { ok: false, error: 'SMTP not configured' };
  }

  const attachments = [];
  if (kind === 'confirmation' && webinar.startsAt) {
    const ics = buildWebinarIcs({
      uid: `webinar-${registrant.email}@pcnsportivalp.com`,
      title: webinar.title || 'Webinar',
      description: webinar.description || '',
      location: webinar.meetUrl || 'Google Meet',
      startsAt: webinar.startsAt,
      endsAt: webinar.endsAt || webinar.startsAt,
      organiserName: webinar.organiserName || 'PCN Sportiva LP',
      organiserEmail: env.mail.replyTo,
    });
    attachments.push({ filename: 'webinar.ics', content: ics, contentType: 'text/calendar; charset=utf-8; method=PUBLISH' });
  }

  try {
    const transport = buildTransport();
    await transport.sendMail({
      from: `${env.mail.fromName} <${env.mail.fromAddress}>`,
      to: registrant.email,
      replyTo: env.mail.replyTo,
      subject,
      html,
      text,
      attachments,
    });
    return { ok: true };
  } catch (err) {
    // The CODE (ETIMEDOUT, ECONNREFUSED, ENOTFOUND, EAUTH…), not the
    // message: a code is short, never contains connection details or
    // secrets, and — unlike a free-text message — is something smtp-check
    // (webinarAdmin.js) and this same catch block can be compared directly,
    // so a stored emailError and a live diagnostic run mean the same thing.
    const code = err?.code || err?.responseCode || 'UNKNOWN';
    console.error('[webinar-mail] send failed', code);
    return { ok: false, error: String(code).slice(0, 60) };
  }
}
