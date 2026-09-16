import bcrypt from 'bcryptjs';
import Admin from '../models/Admin.js';
import ApiError from '../lib/ApiError.js';
import asyncHandler from '../lib/asyncHandler.js';
import { ok, noStore } from '../lib/respond.js';
import { permissionsFor } from '../config/permissions.js';
import {
  signAccessToken, issueRefreshToken, hashToken,
  setAuthCookies, clearAuthCookies, REFRESH_COOKIE,
} from '../lib/tokens.js';

/**
 * A bcrypt hash of a value nobody knows, compared against whenever the account
 * does not exist.
 *
 * Without it the endpoint answers an unknown email in ~2ms and a known one in
 * ~440ms, because only the known path runs bcrypt. That 170x gap enumerates
 * valid administrator addresses regardless of the identical error message, so
 * both paths must do the same work.
 */
const DUMMY_HASH = bcrypt.hashSync('a-value-that-is-never-a-real-password', 12);

async function startSession(res, admin) {
  const accessToken = signAccessToken(admin);
  const { raw, hash } = issueRefreshToken();
  admin.refreshTokenHash = hash;
  admin.lastLoginAt = new Date();
  await admin.save();
  setAuthCookies(res, { accessToken, refreshToken: raw });
  return accessToken;
}

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email }).select('+passwordHash +refreshTokenHash');

  // One message, one code path AND one amount of work for "no such account"
  // and "wrong password", so neither the response nor its timing reveals
  // whether an address is registered.
  const valid = admin
    ? await admin.verifyPassword(password)
    : await bcrypt.compare(password, DUMMY_HASH);

  if (!admin || !valid) throw ApiError.unauthenticated('Incorrect email or password');
  if (!admin.isActive) throw ApiError.forbidden('This account has been disabled');

  const accessToken = await startSession(res, admin);

  noStore(res);
  return ok(res, {
    admin: admin.toSafeJSON(),
    permissions: permissionsFor(admin),
    // Returned for the documented non-cookie fallback; the dashboard ignores it.
    accessToken,
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) throw ApiError.unauthenticated('No session to refresh');

  const admin = await Admin.findOne({ refreshTokenHash: hashToken(raw) })
    .select('+refreshTokenHash');
  if (!admin) {
    clearAuthCookies(res);
    throw ApiError.unauthenticated('Session is no longer valid');
  }
  if (!admin.isActive) throw ApiError.forbidden('This account has been disabled');

  // Rotation: the presented token is replaced on every use, so a stolen
  // refresh token is good for at most one request before it stops working.
  const accessToken = await startSession(res, admin);

  noStore(res);
  return ok(res, {
    admin: admin.toSafeJSON(),
    permissions: permissionsFor(admin),
    accessToken,
  });
});

export const logout = asyncHandler(async (req, res) => {
  if (req.admin) {
    req.admin.refreshTokenHash = undefined;
    await req.admin.save();
  }
  clearAuthCookies(res);
  noStore(res);
  return ok(res, { loggedOut: true });
});

export const me = asyncHandler(async (req, res) => {
  noStore(res);
  return ok(res, {
    admin: req.admin.toSafeJSON(),
    permissions: permissionsFor(req.admin),
  });
});

export const updateMe = asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  if (name) req.admin.name = name;
  if (email && email !== req.admin.email) {
    const taken = await Admin.exists({ email, _id: { $ne: req.admin._id } });
    if (taken) throw ApiError.conflict('That email is already in use');
    req.admin.email = email;
  }
  await req.admin.save();
  noStore(res);
  return ok(res, req.admin.toSafeJSON());
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = await Admin.findById(req.admin._id).select('+passwordHash +refreshTokenHash');

  const valid = await admin.verifyPassword(currentPassword);
  if (!valid) throw ApiError.unauthenticated('Your current password is incorrect');

  await admin.setPassword(newPassword);
  // Changing a password ends every other session, here and elsewhere.
  admin.refreshTokenHash = undefined;
  await admin.save();

  clearAuthCookies(res);
  noStore(res);
  return ok(res, { passwordChanged: true });
});
