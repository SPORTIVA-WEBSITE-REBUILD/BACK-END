import mongoose from 'mongoose';
import { SeoSchema, STATUS, withSlugHistory } from './shared.js';

const { Schema } = mongoose;

const ServiceSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    icon: { type: String, trim: true, default: '' },
    summary: { type: String, trim: true, maxlength: 400, default: '' },
    body: { type: String, default: '' },
    image: { type: Schema.Types.ObjectId, ref: 'Media' },
    order: { type: Number, default: 0 },
    status: { type: String, enum: STATUS, default: 'draft' },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  { timestamps: true },
);

withSlugHistory(ServiceSchema);
ServiceSchema.index({ status: 1, order: 1 });

export default mongoose.models.Service || mongoose.model('Service', ServiceSchema);
