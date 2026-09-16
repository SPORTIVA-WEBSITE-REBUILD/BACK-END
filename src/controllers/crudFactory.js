import ApiError from '../lib/ApiError.js';
import asyncHandler from '../lib/asyncHandler.js';
import { ok, created, noContent, noStore } from '../lib/respond.js';
import { uniqueSlug } from '../lib/slug.js';
import { cleanHtml } from '../lib/sanitize.js';

/**
 * Ten resources share the same admin-side shape: paginated list, read, create,
 * update, delete, publish/unpublish. Generating them from one description keeps
 * the behaviour (and the security posture) identical everywhere, instead of ten
 * near-copies drifting apart (CLAUDE.md Rule 9).
 */
export default function crudFactory({
  Model,
  // Fields that hold rich text and must be sanitised before storage. Dotted
  // paths reach into arrays, e.g. 'sections.body' sanitises every section.
  htmlFields = [],
  // Source field for slug generation; omit for models without slugs.
  slugFrom = null,
  searchFields = [],
  populate = [],
  listProjection = null,
  defaultSort = '-createdAt',
  beforeSave = null,
}) {
  /**
   * Walks a dotted path, mapping over arrays on the way, and sanitises every
   * string it lands on. Rich text nested inside an array (a page's sections,
   * for instance) would otherwise be stored raw and rendered verbatim — a
   * stored XSS on the public site.
   */
  function sanitisePath(node, segments) {
    if (node === null || node === undefined) return;
    const [head, ...rest] = segments;

    if (Array.isArray(node)) {
      for (const entry of node) sanitisePath(entry, segments);
      return;
    }
    if (typeof node !== 'object') return;

    if (rest.length === 0) {
      if (typeof node[head] === 'string') node[head] = cleanHtml(node[head]);
      else if (Array.isArray(node[head])) {
        node[head] = node[head].map((v) => (typeof v === 'string' ? cleanHtml(v) : v));
      }
      return;
    }
    sanitisePath(node[head], rest);
  }

  function applyHtml(payload) {
    for (const field of htmlFields) {
      sanitisePath(payload, field.split('.'));
    }
    return payload;
  }

  function buildFilter(query) {
    const filter = {};
    if (query.status) filter.status = query.status;
    if (query.q && searchFields.length) {
      // Escaped so a user's search string can never act as a regex.
      const safe = String(query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      filter.$or = searchFields.map((f) => ({ [f]: rx }));
    }
    return filter;
  }

  const list = asyncHandler(async (req, res) => {
    const q = req.validatedQuery || req.query;
    const page = Number(q.page) || 1;
    const limit = Math.min(Number(q.limit) || 20, 100);
    const filter = buildFilter(q);

    let cursor = Model.find(filter)
      .sort(q.sort || defaultSort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    if (listProjection) cursor = cursor.select(listProjection);
    for (const p of populate) cursor = cursor.populate(p);

    const [items, total] = await Promise.all([
      cursor.exec(),
      Model.countDocuments(filter),
    ]);

    noStore(res);
    return ok(res, items, { page, limit, total, pages: Math.ceil(total / limit) || 1 });
  });

  const read = asyncHandler(async (req, res) => {
    let cursor = Model.findById(req.params.id);
    for (const p of populate) cursor = cursor.populate(p);
    const doc = await cursor.exec();
    if (!doc) throw ApiError.notFound();
    noStore(res);
    return ok(res, doc);
  });

  const create = asyncHandler(async (req, res) => {
    const payload = applyHtml({ ...req.body });

    if (slugFrom) {
      payload.slug = await uniqueSlug(Model, payload.slug || payload[slugFrom]);
    }
    if (beforeSave) await beforeSave(payload, { req, isNew: true });

    const doc = await Model.create(payload);
    return created(res, doc);
  });

  const update = asyncHandler(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw ApiError.notFound();

    const payload = applyHtml({ ...req.body });

    if (slugFrom && payload.slug && payload.slug !== doc.slug) {
      payload.slug = await uniqueSlug(Model, payload.slug, doc._id);
    }
    if (beforeSave) await beforeSave(payload, { req, isNew: false, doc });

    doc.set(payload);
    await doc.save();
    return ok(res, doc);
  });

  const remove = asyncHandler(async (req, res) => {
    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) throw ApiError.notFound();
    return noContent(res);
  });

  const setStatus = asyncHandler(async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) throw ApiError.notFound();

    doc.status = req.body.status;
    // Stamp the first publication date only once, so unpublishing and
    // republishing does not silently reorder the archive.
    if (doc.status === 'published' && 'publishedAt' in doc && !doc.publishedAt) {
      doc.publishedAt = new Date();
    }
    await doc.save();
    return ok(res, doc);
  });

  return { list, read, create, update, remove, setStatus };
}
