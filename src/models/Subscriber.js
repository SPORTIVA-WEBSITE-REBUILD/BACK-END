import mongoose from 'mongoose';

const { Schema } = mongoose;

/** An address signed up through the newsletter band. Personal data: keep only what is needed. */
const SubscriberSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
    status: { type: String, enum: ['subscribed', 'unsubscribed'], default: 'subscribed' },
    // A salted hash, never the address itself — enough to spot abuse.
    ipHash: { type: String },
  },
  { timestamps: true },
);

SubscriberSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.Subscriber || mongoose.model('Subscriber', SubscriberSchema);
