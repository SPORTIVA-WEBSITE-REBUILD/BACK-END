import { Router } from 'express';
import Webinar from '../models/Webinar.js';
import WebinarRegistration from '../models/WebinarRegistration.js';
import ApiError from '../lib/ApiError.js';
import asyncHandler from '../lib/asyncHandler.js';
import { created, ok, publicCache } from '../lib/respond.js';
import validate from '../middleware/validate.js';
import { webinarRegistrationSchema } from '../validators/webinar.js';
import { isRateLimited } from '../lib/mongoRateLimit.js';
import { clientIp } from '../lib/clientIp.js';
import { sendWebinarEmail } from '../lib/webinarMailer.js';
import env from '../config/env.js';

const router = Router();

async function getSingleton() {
  let doc = await Webinar.findOne();
  if (!doc) doc = await Webinar.create({});
  return doc;
}

/**
 * Public fields only — meetUrl is NEVER included here. The admin route
 * (adminWebinar.js, behind requireAuth) returns the full document.
 */
function publicFields(webinar) {
  const now = Date.now();
  const startsAt = webinar.startsAt?.getTime();
  const endsAt = webinar.endsAt?.getTime();
  const heroEndsAt = webinar.webinarHeroEndsAt?.getTime();

  return {
    title: webinar.title,
    subtitle: webinar.subtitle,
    description: webinar.description,
    startsAt: webinar.startsAt,
    endsAt: webinar.endsAt,
    timezone: webinar.timezone,
    supportEmail: webinar.supportEmail,
    organiserName: webinar.organiserName,
    bannerUrl: webinar.bannerUrl,
    shareImageUrl: webinar.shareImageUrl,
    speakers: [...(webinar.speakers || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
    faq: [...(webinar.faq || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
    social: webinar.social,
    recordingUrl: webinar.recordingUrl,
    // Computed flags, so the frontend never has to re-derive "now" logic
    // against a value it cannot fully trust (clock skew, cache lag).
    isHeroActive: Boolean(webinar.webinarHeroEnabled && heroEndsAt && now < heroEndsAt),
    registrationOpen: Boolean(webinar.registrationOpen && (!endsAt || now < endsAt)),
    hasEnded: Boolean(endsAt && now >= endsAt),
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const webinar = await getSingleton();
  publicCache(res, 180);
  return ok(res, publicFields(webinar));
}));

/** Verifies a Turnstile token server-side. Skipped entirely (returns true)
 *  when TURNSTILE_SECRET_KEY is not configured — Turnstile is optional per
 *  the brief, not a hard requirement. */
async function verifyTurnstile(token, remoteIp) {
  if (!env.turnstileSecretKey) return true;
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.turnstileSecretKey, response: token, remoteip: remoteIp || '' }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    // Turnstile's own outage should not take the registration form down with
    // it — fail open rather than blocking every registration.
    return true;
  }
}

function makeReference(id) {
  return `WEB-${String(id).slice(-6).toUpperCase()}`;
}

router.post('/register', validate(webinarRegistrationSchema), asyncHandler(async (req, res) => {
  const { name, email, website, turnstileToken } = req.body;

  // Honeypot: a real visitor never sees this field. Any value means a bot —
  // respond exactly as a human success would, so the bot learns nothing.
  if (website) {
    return created(res, { ok: true, message: 'Thanks — you are registered. A confirmation email will follow shortly.' });
  }

  const ip = clientIp(req);
  const limited = await isRateLimited({
    scope: 'webinar-register',
    key: ip,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (limited) throw ApiError.rateLimited('Too many registration attempts. Please try again shortly.');

  const verified = await verifyTurnstile(turnstileToken, ip);
  if (!verified) throw ApiError.badRequest('Verification failed. Please try again.');

  const webinar = await getSingleton();
  const fields = publicFields(webinar);
  if (!fields.registrationOpen) {
    return res.status(200).json({
      success: true,
      data: { ok: false, code: 'CLOSED', message: 'Registration for this webinar is now closed.' },
    });
  }

  let registration;
  try {
    const existing = await WebinarRegistration.findOne({ email });

    if (existing) {
      if (existing.emailStatus === 'SENT') {
        return res.status(200).json({
          success: true,
          data: { ok: true, code: 'ALREADY_REGISTERED', message: 'You are already registered. Check your inbox (and spam folder).' },
        });
      }
      // PENDING or FAILED: retry the email below rather than creating a duplicate.
      registration = existing;
    } else {
      registration = await WebinarRegistration.create({ name, email, consentAt: new Date() });
    }
  } catch (err) {
    console.error('[webinar-register] database write failed', err?.message);
    throw ApiError.server('Something went wrong. Please try again in a moment.');
  }

  // Database write has already succeeded at this point — the email is now a
  // best-effort step. Its own try/catch and timeout must never turn into an
  // error response to the visitor; they are already registered.
  try {
    const result = await Promise.race([
      sendWebinarEmail({
        webinar,
        registrant: { name: registration.name, email: registration.email, reference: makeReference(registration._id) },
        kind: 'confirmation',
      }),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'timeout' }), 8000)),
    ]);

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
  } catch (err) {
    console.error('[webinar-register] email step failed', err?.message);
    // Leave status as whatever it already was (PENDING on first failure) —
    // do not throw; the visitor's registration is saved either way.
  }

  return created(res, {
    ok: true,
    message: 'Thanks — you are registered. A confirmation email with the Google Meet link will follow shortly.',
  });
}));

export default router;
