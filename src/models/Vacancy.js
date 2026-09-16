import mongoose from 'mongoose';
import { SeoSchema, STATUS, withSlugHistory } from './shared.js';

const { Schema } = mongoose;

/**
 * Employment types are stored in the firm's own vocabulary and mapped to
 * schema.org values when the JobPosting markup is emitted, so Google Jobs can
 * read a listing while the dashboard still says "Pupillage".
 */
export const EMPLOYMENT_TYPES = [
  'full_time', 'part_time', 'contract', 'internship', 'pupillage', 'nysc',
];

export const WORKPLACE_TYPES = ['on_site', 'hybrid', 'remote'];

const VacancySchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    department: { type: String, trim: true, maxlength: 120, default: '' },
    location: { type: String, required: true, trim: true, maxlength: 160 },
    workplaceType: { type: String, enum: WORKPLACE_TYPES, default: 'on_site' },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: true },
    summary: { type: String, required: true, trim: true, maxlength: 600 },
    description: { type: String, default: '' },
    responsibilities: { type: [String], default: [] },
    requirements: { type: [String], default: [] },
    // Optional: many firms prefer not to publish a figure.
    salaryRange: { type: String, trim: true, maxlength: 120, default: '' },
    // A closing date is what stops a stale advert sitting on the site forever.
    closingDate: { type: Date },
    applyEmail: { type: String, trim: true, lowercase: true, default: '' },
    applyUrl: { type: String, trim: true, default: '' },
    order: { type: Number, default: 0 },
    status: { type: String, enum: STATUS, default: 'draft' },
    publishedAt: { type: Date },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  { timestamps: true },
);

withSlugHistory(VacancySchema);
VacancySchema.index({ status: 1, closingDate: 1 });
VacancySchema.index({ status: 1, order: 1, publishedAt: -1 });
VacancySchema.index({ title: 'text', summary: 'text' });

/**
 * A closed vacancy stays published — its page keeps working and keeps its
 * search ranking — but it is filtered out of the listing and marked expired in
 * the structured data, which is what Google Jobs expects.
 */
VacancySchema.virtual('isClosed').get(function isClosed() {
  return Boolean(this.closingDate && this.closingDate.getTime() < Date.now());
});

VacancySchema.set('toJSON', { virtuals: true });
VacancySchema.set('toObject', { virtuals: true });

export default mongoose.models.Vacancy || mongoose.model('Vacancy', VacancySchema);
