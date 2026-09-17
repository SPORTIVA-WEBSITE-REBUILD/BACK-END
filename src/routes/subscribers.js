import { Router } from 'express';
import { z } from 'zod';
import Subscriber from '../models/Subscriber.js';
import ApiError from '../lib/ApiError.js';
import asyncHandler from '../lib/asyncHandler.js';
import { ok, noContent, noStore } from '../lib/respond.js';
import validate from '../middleware/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { subscriberStatusSchema } from '../validators/schemas.js';

const router = Router();
router.use(requireAuth);

const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(120).optional(),
  status: z.enum(['subscribed', 'unsubscribed']).optional(),
});

const escape = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function filterFrom(q) {
  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.q) filter.email = new RegExp(escape(q.q), 'i');
  return filter;
}

router.get('/', requirePermission('subscribers:read'), validate(query, 'query'), asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const filter = filterFrom(q);
  const [items, total] = await Promise.all([
    Subscriber.find(filter).select('email status createdAt').sort('-createdAt')
      .skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Subscriber.countDocuments(filter),
  ]);
  noStore(res);
  return ok(res, items, { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) || 1 });
}));

/**
 * The whole list as CSV, for importing into a mailing tool. Values are quoted,
 * and a leading =, +, - or @ is neutralised so a spreadsheet never treats an
 * address as a formula.
 */
router.get('/export', requirePermission('subscribers:read'), validate(query.partial(), 'query'), asyncHandler(async (req, res) => {
  const rows = await Subscriber.find(filterFrom(req.validatedQuery || {}))
    .select('email status createdAt').sort('-createdAt').limit(50000).lean();

  const cell = (v) => {
    let text = String(v ?? '');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = ['email,status,subscribed_at', ...rows.map((r) => [r.email, r.status, r.createdAt.toISOString()].map(cell).join(','))].join('\n');

  noStore(res);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="subscribers.csv"');
  return res.send(csv);
}));

router.patch('/:id/status', requirePermission('subscribers:update'), validate(subscriberStatusSchema), asyncHandler(async (req, res) => {
  const doc = await Subscriber.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!doc) throw ApiError.notFound('Subscriber not found');
  noStore(res);
  return ok(res, doc);
}));

router.delete('/:id', requirePermission('subscribers:delete'), asyncHandler(async (req, res) => {
  const doc = await Subscriber.findByIdAndDelete(req.params.id);
  if (!doc) throw ApiError.notFound('Subscriber not found');
  return noContent(res);
}));

export default router;
