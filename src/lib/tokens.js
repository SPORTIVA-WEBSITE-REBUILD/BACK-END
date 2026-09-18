import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

// Pinned explicitly rather than left to the library's default, so a future
// dependency change cannot widen what is accepted — algorithm confusion is the
// classic way a symmetric-key JWT setup gets broken.
const ALGORITHM = 'HS256';

export function signAccessToken(admin) {
  return jwt.sign(
    { sub: String(admin._id), role: admin.role },
    env.accessSecret,
    { expiresIn: env.accessTtl, algorithm: ALGORITHM },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.accessSecret, { algorithms: [ALGORITHM] });
}

/**
 * Refresh tokens are opaque random bytes, not JWTs: they must be revocable.
 * Only a hash is persisted, so a database leak does not yield usable sessions.
 */
export function issueRefreshToken() {
  const raw = crypto.randomBytes(48).toString('hex');
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export const ACCESS_COOKIE = 'pcn_at';
export const REFRESH_COOKIE = 'pcn_rt';

/*
 * `lax` is the safer default and is right whenever the dashboard and the API
 * share a registrable domain — set COOKIE_DOMAIN and it applies.
 *
 * Without a shared domain they are cross-site, and a lax cookie is simply not
 * sent on the dashboard's requests, so nobody can sign in. On *.netlify.app
 * that is the normal case: netlify.app is on the Public Suffix List, so two
 * subdomains of it are two different sites and cannot share a cookie domain.
 *
 * `none` is only honoured over HTTPS, which is why it is tied to isProd.
 */
function baseCookie() {
  const crossSite = env.isProd && !env.cookieDomain;
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: crossSite ? 'none' : 'lax',
    domain: env.cookieDomain,
    path: '/',
  };
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookie(),
    maxAge: 15 * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookie(),
    maxAge: env.refreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res) {
  const opts = { ...baseCookie(), maxAge: 0 };
  res.cookie(ACCESS_COOKIE, '', opts);
  res.cookie(REFRESH_COOKIE, '', opts);
}
