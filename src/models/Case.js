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
    // The respondent's name and jurisdiction, as their own structured fields
    // rather than folded into prose — "Al Qasim" and "Iraq", not "Al Qasim
    // (Iraq)" inside a sentence. Neither is shown on the compact card; both
    // are here for the case detail page and for future filtering.
    opposingParty: { type: String, trim: true, maxlength: 200, default: '' },
    country: { type: String, trim: true, maxlength: 100, default: '' },
    outcome: { type: String, enum: OUTCOMES, required: true },
    summary: { type: String, required: true, trim: true, maxlength: 600 },
    // One plain sentence for the compact card — what the chamber actually
    // decided, not the press-release headline `summary`/`body` were written
    // as. Written without naming either party, so the same sentence is safe
    // to show whether or not the case is anonymised.
    holding: { type: String, trim: true, maxlength: 300, default: '' },
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
