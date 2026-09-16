import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '../config/permissions.js';

const { Schema } = mongoose;

const AdminSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'editor', required: true },
    permissions: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    refreshTokenHash: { type: String, select: false },
    passwordChangedAt: { type: Date },
  },
  { timestamps: true },
);

AdminSchema.index({ role: 1, isActive: 1 });

AdminSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
  this.passwordChangedAt = new Date();
};

AdminSchema.methods.verifyPassword = function verifyPassword(plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plain, this.passwordHash);
};

AdminSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    permissions: this.permissions,
    isActive: this.isActive,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

/** Guard for the "never orphan the firm from its own site" invariant. */
AdminSchema.statics.countActiveSuperAdmins = function countActiveSuperAdmins(excludeId) {
  const q = { role: 'super_admin', isActive: true };
  if (excludeId) q._id = { $ne: excludeId };
  return this.countDocuments(q);
};

export default mongoose.models.Admin || mongoose.model('Admin', AdminSchema);
