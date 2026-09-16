import Media from '../models/Media.js';
import ApiError from '../lib/ApiError.js';
import asyncHandler from '../lib/asyncHandler.js';
import { ok, created, noContent, noStore } from '../lib/respond.js';
import { signUpload, destroyAsset, isOwnCloudinaryUrl, UPLOAD_POLICY } from '../lib/cloudinary.js';
import env from '../config/env.js';

/**
 * Mints a short-lived signature for a direct browser upload. The file itself
 * never passes through this server (CLAUDE.md section 9), and because the
 * signature covers server-chosen parameters, the client cannot widen the
 * folder, the allowed formats or the size cap.
 */
export const sign = asyncHandler(async (req, res) => {
  if (!env.cloudinary.apiSecret) {
    throw ApiError.server('Media uploads are not configured on this environment');
  }
  noStore(res);
  return ok(res, signUpload());
});

export const persist = asyncHandler(async (req, res) => {
  const payload = req.body;

  if (payload.bytes && payload.bytes > UPLOAD_POLICY.maxBytes) {
    throw ApiError.badRequest('That file exceeds the 10 MB limit');
  }
  if (payload.format && !UPLOAD_POLICY.allowedFormats.includes(payload.format.toLowerCase())) {
    throw ApiError.badRequest(`Unsupported file type: ${payload.format}`);
  }
  // Both URLs must genuinely be ours. Checking only secureUrl would leave `url`
  // free to point anywhere, and it is the one some consumers read.
  if (!isOwnCloudinaryUrl(payload.secureUrl) || !isOwnCloudinaryUrl(payload.url)) {
    throw ApiError.badRequest('Media must be uploaded through the dashboard');
  }

  // publicId is used to address the asset for deletion; keep it to the shape
  // Cloudinary actually issues so it cannot escape the configured folder.
  if (!/^[A-Za-z0-9_\-./]{1,300}$/.test(payload.publicId) || payload.publicId.includes('..')) {
    throw ApiError.badRequest('Invalid media identifier');
  }

  const existing = await Media.findOne({ publicId: payload.publicId });
  if (existing) return ok(res, existing);

  const media = await Media.create({ ...payload, uploadedBy: req.admin._id });
  return created(res, media);
});

export const list = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const page = Number(q.page) || 1;
  const limit = Math.min(Number(q.limit) || 24, 100);

  const filter = {};
  if (q.q) {
    const safe = String(q.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ alt: rx }, { caption: rx }, { publicId: rx }];
  }

  const [items, total] = await Promise.all([
    Media.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit).lean(),
    Media.countDocuments(filter),
  ]);

  noStore(res);
  return ok(res, items, { page, limit, total, pages: Math.ceil(total / limit) || 1 });
});

export const update = asyncHandler(async (req, res) => {
  const media = await Media.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!media) throw ApiError.notFound('Media not found');
  noStore(res);
  return ok(res, media);
});

export const remove = asyncHandler(async (req, res) => {
  const media = await Media.findById(req.params.id);
  if (!media) throw ApiError.notFound('Media not found');

  // Remove the remote asset first; if that fails the record stays, so the
  // library never points at something that is only half-deleted.
  try {
    await destroyAsset(media.publicId, media.resourceType);
  } catch (err) {
    console.error('[media] cloudinary destroy failed', err?.message);
  }

  await media.deleteOne();
  return noContent(res);
});
