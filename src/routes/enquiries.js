import { Router } from 'express';
import Enquiry from '../models/Enquiry.js';
import ApiError from '../lib/ApiError.js';
import asyncHandler from '../lib/asyncHandler.js';
import { ok, noContent, noStore } from '../lib/respond.js';
import validate from '../middleware/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { z } from 'zod';
import { enquiryStatusSchema } from '../validators/schemas.js';

const router = Router();
router.use(requireAuth);

// Enquiries have their own statuses. The generic list query only accepts
// draft/published, which rejected every status filter the dashboard sent.
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.enum(['new', 'read', 'replied', 'spam']).optional(),
  source: z.enum(['contact', 'consultation']).optional(),
});

router.get('/', requirePermission('enquiries:read'), validate(listQuery, 'query'), asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.source) filter.source = q.source;
  if (q.q) {
    const safe = q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ name: rx }, { email: rx }, { subject: rx }, { message: rx }];
  }

  const [items, total] = await Promise.all([
    Enquiry.find(filter).sort('-createdAt')
      .skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Enquiry.countDocuments(filter),
  ]);

  noStore(res);
  return ok(res, items, {
    page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) || 1,
  });
}));

router.get('/:id', requirePermission('enquiries:read'), asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) throw ApiError.notFound('Enquiry not found');

  // Opening an enquiry marks it read — administrators should not have to.
  if (enquiry.status === 'new') {
    enquiry.status = 'read';
    enquiry.readAt = new Date();
    await enquiry.save();
  }

  noStore(res);
  return ok(res, enquiry);
}));

router.patch('/:id/status', requirePermission('enquiries:update'), validate(enquiryStatusSchema), asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.findByIdAndUpdate(
    req.params.id, { status: req.body.status }, { new: true },
  );
  if (!enquiry) throw ApiError.notFound('Enquiry not found');
  noStore(res);
  return ok(res, enquiry);
}));

router.delete('/:id', requirePermission('enquiries:delete'), asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.findByIdAndDelete(req.params.id);
  if (!enquiry) throw ApiError.notFound('Enquiry not found');
  return noContent(res);
}));

export default router;
