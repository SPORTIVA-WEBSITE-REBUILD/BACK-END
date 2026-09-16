import mongoose from 'mongoose';
import { SeoSchema, SocialSchema, STATUS, withSlugHistory } from './shared.js';

const { Schema } = mongoose;

const LawyerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    role: { type: String, trim: true, maxlength: 120, default: '' },
    bio: { type: String, default: '' },
    photo: { type: Schema.Types.ObjectId, ref: 'Media' },
    qualifications: { type: [String], default: [] },
    practiceAreas: [{ type: Schema.Types.ObjectId, ref: 'Service' }],
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    socials: { type: [SocialSchema], default: [] },
    order: { type: Number, default: 0 },
    status: { type: String, enum: STATUS, default: 'draft' },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  { timestamps: true },
);

withSlugHistory(LawyerSchema);
LawyerSchema.index({ status: 1, order: 1 });

export default mongoose.models.Lawyer || mongoose.model('Lawyer', LawyerSchema);
