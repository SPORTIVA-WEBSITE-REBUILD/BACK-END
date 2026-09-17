import { Router } from 'express';
import { z } from 'zod';
import Comment, { COMMENT_STATUS } from '../models/Comment.js';
import ApiError from '../lib/ApiError.js';
import asyncHandler from '../lib/asyncHandler.js';
import { ok, noContent, noStore } from '../lib/respond.js';
import validate from '../middleware/validate.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { objectId } from '../validators/common.js';
import { commentStatusSchema } from '../validators/schemas.js';

const router = Router();
router.use(requireAuth);

const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.enum(COMMENT_STATUS).optional(),
  article: objectId.optional(),
});

/** The moderation queue: newest first, with the article each belongs to. */
router.get('/', requirePermission('comments:read'), validate(query, 'query'), asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.article) filter.article = q.article;
  if (q.q) {
    const rx = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { message: rx }];
  }

  const [items, total] = await Promise.all([
    Comment.find(filter)
      .select('article parent name email website message status createdAt')
      .populate([
        { path: 'article', select: 'title slug' },
        { path: 'parent', select: 'name message' },
      ])
      .sort('-createdAt')
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Comment.countDocuments(filter),
  ]);

  noStore(res);
  return ok(res, items, { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) || 1 });
}));

router.patch('/:id/status', requirePermission('comments:update'), validate(commentStatusSchema), asyncHandler(async (req, res) => {
  const doc = await Comment.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!doc) throw ApiError.notFound('Comment not found');
  noStore(res);
  return ok(res, doc);
}));

/** Deleting a comment removes its replies too, so no reply is left orphaned. */
router.delete('/:id', requirePermission('comments:delete'), asyncHandler(async (req, res) => {
  const doc = await Comment.findById(req.params.id);
  if (!doc) throw ApiError.notFound('Comment not found');

  const doomed = [doc._id];
  for (let frontier = [doc._id]; frontier.length;) {
    // eslint-disable-next-line no-await-in-loop
    const children = await Comment.find({ parent: { $in: frontier } }).select('_id').lean();
    frontier = children.map((c) => c._id);
    doomed.push(...frontier);
  }
  await Comment.deleteMany({ _id: { $in: doomed } });
  return noContent(res);
}));

export default router;
