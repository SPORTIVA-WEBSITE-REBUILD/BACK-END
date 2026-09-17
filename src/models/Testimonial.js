import mongoose from 'mongoose';
import { STATUS } from './shared.js';

const { Schema } = mongoose;

/** A client quote, shown in the testimonial carousel. */
const TestimonialSchema = new Schema(
  {
    quote: { type: String, required: true, trim: true, maxlength: 800 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    position: { type: String, trim: true, maxlength: 120, default: '' },
    photo: { type: Schema.Types.ObjectId, ref: 'Media' },
    order: { type: Number, default: 0 },
    status: { type: String, enum: STATUS, default: 'draft' },
  },
  { timestamps: true },
);

TestimonialSchema.index({ status: 1, order: 1, createdAt: -1 });

export default mongoose.models.Testimonial || mongoose.model('Testimonial', TestimonialSchema);
