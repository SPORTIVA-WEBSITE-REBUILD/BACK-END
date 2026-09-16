import Admin from '../models/Admin.js';
import ApiError from '../lib/ApiError.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../lib/tokens.js';
import { can, permissionsFor } from '../config/permissions.js';
import asyncHandler from '../lib/asyncHandler.js';

/**
 * Reads the access token from the httpOnly cookie. A Bearer header is accepted
 * as a documented fallback for deployments where the dashboard cannot share a
 * parent domain with the API.
 */
function extractToken(req) {
  if (req.cookies?.[ACCESS_COOKIE]) return req.cookies[ACCESS_COOKIE];
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthenticated();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthenticated('Session expired, please sign in again');
  }

  const admin = await Admin.findById(payload.sub);
  if (!admin) throw ApiError.unauthenticated();
  if (!admin.isActive) throw ApiError.forbidden('This account has been disabled');

  // A password change retires every token issued before it. JWT `iat` is in
  // whole seconds, so the comparison is made in seconds too — otherwise a token
  // minted in the same second as the change looks older than it and the admin
  // is signed out the moment their account is created.
  if (admin.passwordChangedAt) {
    const changedAtSeconds = Math.floor(admin.passwordChangedAt.getTime() / 1000);
    if (payload.iat < changedAtSeconds) {
      throw ApiError.unauthenticated('Credentials changed, please sign in again');
    }
  }

  req.admin = admin;
  req.permissions = permissionsFor(admin);
  next();
});

export function requirePermission(required) {
  return (req, res, next) => {
    if (!req.admin) return next(ApiError.unauthenticated());
    if (!can(req.admin, required)) {
      return next(ApiError.forbidden(`Missing permission: ${required}`));
    }
    return next();
  };
}

export function requireSuperAdmin(req, res, next) {
  if (!req.admin) return next(ApiError.unauthenticated());
  if (req.admin.role !== 'super_admin') {
    return next(ApiError.forbidden('This action is restricted to super administrators'));
  }
  return next();
}
