import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A Mongo-backed rate limit, used only where an in-memory limiter is unsafe:
 * on a serverless function each invocation can be a cold process, so
 * express-rate-limit's in-memory store (used everywhere else in this app)
 * silently resets and never actually throttles. Keyed by {scope, key}, e.g.
 * scope="webinar-register", key=<ip>.
 *
 * `expiresAt` is a TTL index: MongoDB removes the document itself once the
 * window passes, so this collection never needs manual cleanup.
 */
const RateLimitHitSchema = new Schema(
  {
    scope: { type: String, required: true },
    key: { type: String, required: true },
    count: { type: Number, default: 1 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

RateLimitHitSchema.index({ scope: 1, key: 1 }, { unique: true });
RateLimitHitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.RateLimitHit || mongoose.model('RateLimitHit', RateLimitHitSchema);
