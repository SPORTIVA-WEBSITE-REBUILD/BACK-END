import Admin from '../models/Admin.js';
import ApiError from '../lib/ApiError.js';
import asyncHandler from '../lib/asyncHandler.js';
import { ok, created, noContent, noStore } from '../lib/respond.js';

/**
 * Three invariants are enforced here rather than in the dashboard, because the
 * dashboard is not a trust boundary:
 *   1. the last active super admin cannot be deleted, demoted or disabled
 *   2. nobody can change their own role (no self-escalation)
 *   3. nobody can delete their own account
 */
async function assertNotLastSuperAdmin(target, change) {
  if (target.role !== 'super_admin' || !target.isActive) return;

  const losingSuperAdmin = change === 'remove'
    || (change.role && change.role !== 'super_admin')
    || change.isActive === false;
  if (!losingSuperAdmin) return;

  const remaining = await Admin.countActiveSuperAdmins(target._id);
  if (remaining === 0) {
    throw ApiError.forbidden(
      'This is the last active super administrator. Promote another account first.',
    );
  }
}

export const list = asyncHandler(async (req, res) => {
  const admins = await Admin.find().sort('name').lean();
  noStore(res);
  return ok(res, admins.map(({ passwordHash, refreshTokenHash, ...a }) => a));
});

export const create = asyncHandler(async (req, res) => {
  const { name, email, password, role, permissions } = req.body;

  if (await Admin.exists({ email })) {
    throw ApiError.conflict('An administrator with that email already exists');
  }

  const admin = new Admin({ name, email, role, permissions });
  await admin.setPassword(password);
  await admin.save();

  return created(res, admin.toSafeJSON());
});

export const update = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.params.id).select('+passwordHash');
  if (!admin) throw ApiError.notFound('Administrator not found');

  const isSelf = String(admin._id) === String(req.admin._id);
  if (isSelf && req.body.role && req.body.role !== admin.role) {
    throw ApiError.forbidden('You cannot change your own role');
  }
  if (isSelf && req.body.isActive === false) {
    throw ApiError.forbidden('You cannot disable your own account');
  }

  await assertNotLastSuperAdmin(admin, req.body);

  const { password, email, ...rest } = req.body;
  if (email && email !== admin.email) {
    if (await Admin.exists({ email, _id: { $ne: admin._id } })) {
      throw ApiError.conflict('That email is already in use');
    }
    admin.email = email;
  }
  admin.set(rest);

  if (password) {
    await admin.setPassword(password);
    // Force the affected administrator to sign in again.
    admin.refreshTokenHash = undefined;
  }

  await admin.save();
  noStore(res);
  return ok(res, admin.toSafeJSON());
});

export const remove = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.params.id);
  if (!admin) throw ApiError.notFound('Administrator not found');

  if (String(admin._id) === String(req.admin._id)) {
    throw ApiError.forbidden('You cannot delete your own account');
  }
  await assertNotLastSuperAdmin(admin, 'remove');

  await admin.deleteOne();
  return noContent(res);
});
