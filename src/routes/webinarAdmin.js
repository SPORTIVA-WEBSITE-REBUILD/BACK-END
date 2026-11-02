import { Router } from 'express';
import net from 'node:net';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import Webinar from '../models/Webinar.js';
import WebinarRegistration from '../models/WebinarRegistration.js';
import ApiError from '../lib/ApiError.js';
import asyncHandler from '../lib/asyncHandler.js';
import { ok, noStore } from '../lib/respond.js';
import validate from '../middleware/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { webinarAdminSchema, testEmailSchema, sendReminderSchema } from '../validators/webinar.js';
import { sendWebinarEmail, describeMailerError } from '../lib/webinarMailer.js';
import { isRateLimited } from '../lib/mongoRateLimit.js';
import { sendReminderBatch } from '../lib/webinarReminders.js';
import { parseSmtpSecure } from '../lib/smtpSecure.js';

const router = Router();
router.use(requireAuth);

async function getSingleton() {
  let doc = await Webinar.findOne();
  if (!doc) doc = await Webinar.create({});
  return doc;
}

function makeReference(id) {
  return `WEB-${String(id).slice(-6).toUpperCase()}`;
}

// ---------------------------------------------------------------- settings

router.get('/', requirePermission('webinar:read'), asyncHandler(async (req, res) => {
  const webinar = await getSingleton();
  noStore(res);
  return ok(res, webinar);
}));

router.put('/', requirePermission('webinar:write'), validate(webinarAdminSchema), asyncHandler(async (req, res) => {
  const webinar = await getSingleton();
  webinar.set(req.body);
  await webinar.save();
  noStore(res);
  return ok(res, webinar);
}));

// -------------------------------------------------------------- smtp-check

/**
 * A single raw TCP connect attempt to host:port — proves or disproves
 * reachability at the network level, before nodemailer, SMTP greetings or
 * auth even enter the picture. Resolves on connect, on error, or on its own
 * timeout, whichever comes first; the socket is always destroyed afterwards.
 */
function tcpProbe(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;
    const finish = (reachable, code) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ port, reachable, ms: Date.now() - start, code: code || null });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true, null));
    socket.once('timeout', () => finish(false, 'ETIMEDOUT'));
    socket.once('error', (err) => finish(false, err.code || 'UNKNOWN'));
    socket.connect(port, host);
  });
}

/**
 * Admin-only diagnostic: measures the SMTP path with real numbers instead
 * of guessing from a bare "timeout" string. Never returns SMTP_PASS or any
 * other secret value — only variable NAMES (present/absent) for those, and
 * the genuinely non-secret values (host, port, secure, the two addresses).
 */
// The only three variables with no sensible default — see env.js, which
// already falls back for port (465), fromName, fromAddress and replyTo.
// EMAIL_DRY_RUN and SMTP_SECURE are genuinely optional, not "missing".
const REQUIRED_VARS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];

router.post('/smtp-check', requirePermission('webinar:write'), asyncHandler(async (req, res) => {
  // Read process.env directly, not the cached env.mail object: env.js
  // captures its values once at module load, which is accurate after a
  // real cold start but is exactly the kind of staleness this diagnostic
  // exists to rule out — this always reflects the config this invocation
  // is actually running with, right now.
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 465;
  const rawSecure = process.env.SMTP_SECURE;
  const { secure, rule: secureRule } = parseSmtpSecure(rawSecure, port);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const fromAddress = process.env.MAIL_FROM_ADDRESS || user;

  const tcp = host
    ? await Promise.all([465, 587].map((p) => tcpProbe(host, p, 15000)))
    : [{ port: 465, reachable: false, ms: 0, code: 'NO_HOST_CONFIGURED' }, { port: 587, reachable: false, ms: 0, code: 'NO_HOST_CONFIGURED' }];

  let verify = { ok: false, code: 'NOT_ATTEMPTED', ms: 0 };
  if (host && user && pass) {
    const start = Date.now();
    const transport = nodemailer.createTransport({
      host, port, secure,
      auth: { user, pass },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000,
    });
    try {
      await transport.verify();
      verify = { ok: true, code: null, ms: Date.now() - start };
    } catch (err) {
      verify = {
        ok: false,
        code: describeMailerError(err),
        smtpResponseCode: err.responseCode || null,
        command: err.command || null,
        ms: Date.now() - start,
      };
    }
  } else {
    verify.code = 'MISSING_HOST_OR_CREDENTIALS';
  }

  const namesPresent = {
    SMTP_HOST: Boolean(process.env.SMTP_HOST),
    SMTP_PORT: Boolean(process.env.SMTP_PORT),
    SMTP_SECURE: process.env.SMTP_SECURE !== undefined,
    SMTP_USER: Boolean(process.env.SMTP_USER),
    SMTP_PASS: Boolean(process.env.SMTP_PASS),
    MAIL_FROM_NAME: Boolean(process.env.MAIL_FROM_NAME),
    MAIL_FROM_ADDRESS: Boolean(process.env.MAIL_FROM_ADDRESS),
    MAIL_REPLY_TO: Boolean(process.env.MAIL_REPLY_TO),
    EMAIL_DRY_RUN: Boolean(process.env.EMAIL_DRY_RUN),
  };

  noStore(res);
  return ok(res, {
    tcp,
    verify,
    config: {
      // Presence only for the things that could be secret-shaped; real
      // values only for what is genuinely safe to show.
      namesPresent,
      required: REQUIRED_VARS,
      missingRequired: REQUIRED_VARS.filter((name) => !namesPresent[name]),
      host: host || null,
      port: port || null,
      secure,
      secureRaw: rawSecure !== undefined ? rawSecure : null,
      secureRule,
      user: user || null,
      fromAddress: fromAddress || null,
    },
  });
}));

// ------------------------------------------------------------ registrations

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.enum(['PENDING', 'SENT', 'FAILED']).optional(),
});

function buildFilter({ q, status }) {
  const filter = {};
  if (status) filter.emailStatus = status;
  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  return filter;
}

router.get('/registrations', requirePermission('webinar:read'), validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const { page, limit, q, status } = req.validatedQuery;
  const filter = buildFilter({ q, status });
  const skip = (page - 1) * limit;

  const [items, total, sent, failed, pending] = await Promise.all([
    WebinarRegistration.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(),
    WebinarRegistration.countDocuments(filter),
    WebinarRegistration.countDocuments({ emailStatus: 'SENT' }),
    WebinarRegistration.countDocuments({ emailStatus: 'FAILED' }),
    WebinarRegistration.countDocuments({ emailStatus: 'PENDING' }),
  ]);

  noStore(res);
  return ok(res, items, {
    page, limit, total, pages: Math.ceil(total / limit) || 1,
    counts: { total: sent + failed + pending, sent, failed, pending },
  });
}));

/** A cell starting with =, +, - or @ can be interpreted as a formula by
 *  Excel/Sheets when the CSV is opened — prefixing it with a tab character
 *  (invisible, and Excel does not treat a tab-prefixed cell as a formula)
 *  neutralises it without altering the visible value. */
function csvCell(value) {
  const str = String(value ?? '');
  const guarded = /^[=+\-@]/.test(str) ? `\t${str}` : str;
  const escaped = guarded.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

router.get('/registrations.csv', requirePermission('webinar:read'), asyncHandler(async (req, res) => {
  const items = await WebinarRegistration.find({}).sort('-createdAt').lean();
  const header = ['Name', 'Email', 'Registered at', 'Email status', 'Reference'];
  const rows = items.map((r) => [
    r.name, r.email, r.createdAt?.toISOString() || '', r.emailStatus, makeReference(r._id),
  ].map(csvCell).join(','));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="webinar-registrations.csv"');
  noStore(res);
  res.send([header.join(','), ...rows].join('\r\n'));
}));

router.post('/registrations/:id/resend', requirePermission('webinar:write'), asyncHandler(async (req, res) => {
  const registration = await WebinarRegistration.findById(req.params.id);
  if (!registration) throw ApiError.notFound('Registration not found');

  const webinar = await getSingleton();
  const result = await sendWebinarEmail({
    webinar,
    registrant: { name: registration.name, email: registration.email, reference: makeReference(registration._id) },
    kind: 'confirmation',
  });

  registration.emailAttempts = (registration.emailAttempts || 0) + 1;
  if (result.ok) {
    registration.emailStatus = 'SENT';
    registration.emailSentAt = new Date();
    registration.emailError = '';
  } else {
    registration.emailStatus = 'FAILED';
    registration.emailError = String(result.error || 'send failed').slice(0, 180);
  }
  await registration.save();

  noStore(res);
  return ok(res, registration);
}));

/** Throttled: a careless double-click should not fire a second full batch
 *  send while the first is still in flight (or just finished). Keyed on the
 *  admin's own id, not the IP, so it does not interfere with the public
 *  registration limiter. */
router.post('/resend-failed', requirePermission('webinar:write'), asyncHandler(async (req, res) => {
  const limited = await isRateLimited({
    scope: 'webinar-resend-failed',
    key: String(req.admin._id),
    limit: 1,
    windowMs: 60 * 1000,
  });
  if (limited) throw ApiError.rateLimited('A resend batch was just started. Please wait a minute before trying again.');

  const webinar = await getSingleton();
  const failed = await WebinarRegistration.find({ emailStatus: 'FAILED' });

  let sent = 0;
  let stillFailed = 0;
  for (const registration of failed) {
    // eslint-disable-next-line no-await-in-loop
    const result = await sendWebinarEmail({
      webinar,
      registrant: { name: registration.name, email: registration.email, reference: makeReference(registration._id) },
      kind: 'confirmation',
    });
    registration.emailAttempts = (registration.emailAttempts || 0) + 1;
    if (result.ok) {
      registration.emailStatus = 'SENT';
      registration.emailSentAt = new Date();
      registration.emailError = '';
      sent += 1;
    } else {
      registration.emailError = String(result.error || 'send failed').slice(0, 180);
      stillFailed += 1;
    }
    // eslint-disable-next-line no-await-in-loop
    await registration.save();
  }

  noStore(res);
  return ok(res, { attempted: failed.length, sent, stillFailed });
}));

router.post('/test-email', requirePermission('webinar:write'), validate(testEmailSchema), asyncHandler(async (req, res) => {
  const webinar = await getSingleton();
  const result = await sendWebinarEmail({
    webinar,
    registrant: { name: 'Test Recipient', email: req.body.to, reference: 'WEB-TEST01' },
    kind: 'confirmation',
  });

  noStore(res);
  if (!result.ok) throw ApiError.server(result.error || 'The test email could not be sent');
  return ok(res, { sent: true, dryRun: Boolean(result.dryRun), previewPath: result.previewPath });
}));

// ----------------------------------------------------------------- reminders

/**
 * Also callable directly (not only from the scheduled function) so the
 * dashboard's "Send reminder" buttons work even on a deployment where
 * Netlify Scheduled Functions are unavailable — see the reminder logic
 * shared with netlify/functions/webinar-reminders.js via sendReminders().
 */
router.post('/send-reminder', requirePermission('webinar:write'), validate(sendReminderSchema), asyncHandler(async (req, res) => {
  const { type, dryRun } = req.body;
  const webinar = await getSingleton();
  if (!webinar.startsAt) throw ApiError.badRequest('Set the webinar start date and time first');

  // No time-window restriction here, unlike the scheduled cron job: an admin
  // clicking this button is explicitly asking for it to go out now, for
  // everyone eligible, not only those inside the automatic 23–25h/50–70min
  // window — see src/lib/webinarReminders.js.
  const field = type === 'day' ? 'reminderDayBeforeSentAt' : 'reminderHourBeforeSentAt';
  const recipients = await WebinarRegistration.find({ emailStatus: 'SENT', [field]: { $exists: false } });

  if (dryRun) {
    noStore(res);
    return ok(res, { dryRun: true, recipientCount: recipients.length });
  }

  const { sent } = await sendReminderBatch({ webinar, recipients, type });

  noStore(res);
  return ok(res, { dryRun: false, recipientCount: recipients.length, sent });
}));

// ------------------------------------------------------------- test cleanup

const cleanupQuery = z.object({
  // Required and explicit on purpose — no default, so a bare call can never
  // wipe every registration. The caller must name the exact domain to clear.
  domain: z.string().trim().toLowerCase().min(1).max(100)
    .regex(/^[a-z0-9.-]+$/, 'Enter a plain domain, e.g. example.test'),
});

/**
 * Deletes only WebinarRegistration documents whose email ends in
 * "@<domain>" — intended for clearing out registrations made with an
 * obviously-fake address (e.g. anything@example.test) while testing a
 * branch deploy against the live database. Touches no other collection,
 * and never touches a registration outside the named domain.
 */
router.delete('/registrations/test-cleanup', requirePermission('webinar:write'), validate(cleanupQuery, 'query'), asyncHandler(async (req, res) => {
  const { domain } = req.validatedQuery;
  // Escaped so "." matches a literal dot, not "any character" — the regex
  // allowlist above already blocks anything dangerous, but an unescaped dot
  // would also match e.g. "examplentest" instead of only "example.test".
  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = await WebinarRegistration.find({ email: { $regex: `@${escapedDomain}$`, $options: 'i' } }).select('_id');
  const result = await WebinarRegistration.deleteMany({ _id: { $in: matches.map((m) => m._id) } });

  noStore(res);
  return ok(res, { domain, deleted: result.deletedCount });
}));

export default router;
