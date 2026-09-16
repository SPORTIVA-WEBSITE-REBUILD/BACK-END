import mongoose from 'mongoose';
import { SeoSchema, STATUS, withSlugHistory } from './shared.js';

const { Schema } = mongoose;

export const PARTIES = ['athlete', 'club', 'federation', 'agent', 'sponsor', 'other'];
export const OUTCOMES = ['won', 'settled', 'dismissed', 'ongoing', 'withdrawn'];

/** The filterable case record — the firm's outcomes by forum, year and party. */
const CaseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    forum: { type: String, required: true, trim: true },
    year: { type: Number, required: true, min: 1900, max: 2200 },
    partyRepresented: { type: String, enum: PARTIES, required: true },
    outcome: { type: String, enum: OUTCOMES, required: true },
    summary: { type: String, required: true, trim: true, maxlength: 600 },
    body: { type: String, default: '' },
    // Defaults to true so an unreviewed matter can never publish party names by
    // accident. The dashboard warns explicitly before this is turned off.
    anonymised: { type: Boolean, default: true },
    practiceArea: { type: Schema.Types.ObjectId, ref: 'Service' },
    featuredImage: { type: Schema.Types.ObjectId, ref: 'Media' },
    publishedAt: { type: Date },
    status: { type: String, enum: STATUS, default: 'draft' },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  { timestamps: true },
);

withSlugHistory(CaseSchema);
CaseSchema.index({ status: 1, year: -1 });
CaseSchema.index({ status: 1, forum: 1, year: -1 });
CaseSchema.index({ status: 1, partyRepresented: 1, year: -1 });
CaseSchema.index({ title: 'text', summary: 'text' });

export default mongoose.models.Case || mongoose.model('Case', CaseSchema);
