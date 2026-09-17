import rateLimit from 'express-rate-limit';
import ApiError from '../lib/ApiError.js';

function handler(req, res, next) {
  next(ApiError.rateLimited());
}

const common = {
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  // Evaluated per request, so the suite can exercise the limiters in a
  // dedicated test while the rest of the tests are not throttled by them.
  skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
  // Vercel terminates TLS at the edge, so the client address arrives in
  // x-forwarded-for; `trust proxy` on the app makes req.ip resolve correctly.
  validate: { trustProxy: false },
};

export const globalLimiter = rateLimit({
  ...common, windowMs: 15 * 60 * 1000, limit: 300,
});

/** Keyed by IP *and* email so one attacker cannot lock out a real account. */
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
});

export const enquiryLimiter = rateLimit({
  ...common, windowMs: 60 * 60 * 1000, limit: 3,
});

/** Comments are moderated anyway; this only stops a flood of the queue. */
export const commentLimiter = rateLimit({
  ...common, windowMs: 60 * 60 * 1000, limit: 10,
});

export const subscribeLimiter = rateLimit({
  ...common, windowMs: 60 * 60 * 1000, limit: 5,
});

export const uploadLimiter = rateLimit({
  ...common, windowMs: 60 * 60 * 1000, limit: 100,
});
