import mongoose from 'mongoose';
import { SeoSchema, STATUS, withSlugHistory } from './shared.js';

const { Schema } = mongoose;

/**
 * A section carries CONTENT keyed by a stable `key`. React decides which
 * component renders each key, and owns all layout, styling and animation
 * (CLAUDE.md section 8 / Rule 7). The database never describes a component.
 */
const SectionSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    heading: { type: String, trim: true, default: '' },
    subheading: { type: String, trim: true, default: '' },
    body: { type: String, default: '' },
    image: { type: Schema.Types.ObjectId, ref: 'Media' },
    video: { type: String, trim: true, default: '' },
    value: { type: String, trim: true, default: '' },
    // Interface text the section needs beyond its heading and body: form
    // placeholders, button names, widget titles. The page's blueprint names
    // the keys and supplies the template's wording as the default.
    labels: { type: Map, of: String, default: undefined },
    cta: {
      label: { type: String, trim: true, default: '' },
      href: { type: String, trim: true, default: '' },
    },
    items: {
      type: [
        {
          title: String,
          text: String,
          icon: String,
          value: String,
          href: String,
          image: { type: Schema.Types.ObjectId, ref: 'Media' },
          _id: false,
        },
      ],
      default: [],
    },
  },
  { _id: false },
);

const PageSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true },
    sections: { type: [SectionSchema], default: [] },
    seo: { type: SeoSchema, default: () => ({}) },
    status: { type: String, enum: STATUS, default: 'draft', index: true },
  },
  { timestamps: true },
);

withSlugHistory(PageSchema);
PageSchema.index({ status: 1, slug: 1 });

export default mongoose.models.Page || mongoose.model('Page', PageSchema);
