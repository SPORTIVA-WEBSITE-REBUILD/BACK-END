import env from '../config/env.js';
import ApiError from '../lib/ApiError.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Defence in depth against CSRF. SameSite=Lax already blocks cross-site form
 * posts, but browsers differ and the cookie is shared across subdomains, so
 * state-changing requests must also carry an Origin we recognise.
 */
export default function originCheck(req, res, next) {
  if (!UNSAFE.has(req.method)) return next();
  if (!env.isProd) return next();

  const origin = req.get('origin');
  // Same-origin form posts may omit Origin; a missing header with no Referer
  // cannot be a cross-site browser request in modern engines.
  if (!origin) return next();

  const normalised = origin.replace(/\/$/, '');
  if (env.corsOrigins.includes(normalised)) return next();

  return next(ApiError.forbidden('Request origin not allowed'));
}
