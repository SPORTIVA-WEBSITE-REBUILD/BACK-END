import mongoose from 'mongoose';
import { SeoSchema, SocialSchema } from './shared.js';

const { Schema } = mongoose;

const SiteSettingsSchema = new Schema(
  {
    key: { type: String, default: 'global', unique: true, immutable: true },
    siteName: { type: String, default: 'PCN Sportiva LP', trim: true },
    tagline: { type: String, trim: true, default: '' },
    logo: { type: Schema.Types.ObjectId, ref: 'Media' },
    favicon: { type: Schema.Types.ObjectId, ref: 'Media' },
    contact: {
      address: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, lowercase: true, default: '' },
      mapUrl: { type: String, trim: true, default: '' },
      website: { type: String, trim: true, default: '' },
      businessHours: {
        type: [{ label: String, value: String, _id: false }],
        default: [],
      },
    },
    socials: { type: [SocialSchema], default: [] },
    copyrightText: { type: String, trim: true, default: '' },
    seoDefaults: { type: SeoSchema, default: () => ({}) },
    enquiryRecipient: { type: String, trim: true, lowercase: true, default: '' },
    // Applications go here unless a vacancy overrides it.
    careersEmail: { type: String, trim: true, lowercase: true, default: '' },
    // The template is CC BY 3.0: its footer credit must stay unless a licence
    // is bought, so it is on unless someone deliberately turns it off.
    // Schedule 1 contracts a filterable case archive; the template's case page
    // has no filter bar. On by default, removable for a pure template look.
    showCaseFilters: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** There is exactly one settings document; create it lazily on first read. */
SiteSettingsSchema.statics.getSingleton = async function getSingleton() {
  const existing = await this.findOne({ key: 'global' });
  if (existing) return existing;
  return this.create({ key: 'global' });
};

export default mongoose.models.SiteSettings
  || mongoose.model('SiteSettings', SiteSettingsSchema);
