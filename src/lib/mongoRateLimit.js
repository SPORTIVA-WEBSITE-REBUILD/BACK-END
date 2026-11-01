import RateLimitHit from '../models/RateLimitHit.js';

/**
 * Atomic per-window counter, safe for concurrent serverless invocations.
 * Returns true if the request is OVER the limit (caller should reject it).
 *
 * Two steps rather than one upsert: MongoDB's TTL reaper runs on its own
 * ~60s cycle, so a document whose window has logically expired can still
 * exist when the next request arrives. Matching only {scope, key} on the
 * first attempt (ignoring expiresAt) and inspecting it ourselves avoids a
 * duplicate-key error from upserting against an unexpired unique index entry
 * that is merely stale.
 */
export async function isRateLimited({ scope, key, limit, windowMs }) {
  const now = Date.now();
  let doc = await RateLimitHit.findOne({ scope, key });

  if (!doc || doc.expiresAt.getTime() <= now) {
    // New window: reset to 1. upsert so a first-ever hit for this key also
    // works; $set (not $inc) so a stale expired doc is overwritten, not added to.
    try {
      doc = await RateLimitHit.findOneAndUpdate(
        { scope, key },
        { $set: { count: 1, expiresAt: new Date(now + windowMs) } },
        { upsert: true, new: true },
      );
    } catch (err) {
      // Lost a race to another concurrent request starting the same window —
      // fall through and count this request against whatever they just wrote.
      if (err.code !== 11000) throw err;
      doc = await RateLimitHit.findOneAndUpdate(
        { scope, key },
        { $inc: { count: 1 } },
        { new: true },
      );
    }
    return doc.count > limit;
  }

  doc = await RateLimitHit.findOneAndUpdate(
    { scope, key },
    { $inc: { count: 1 } },
    { new: true },
  );
  return doc.count > limit;
}
