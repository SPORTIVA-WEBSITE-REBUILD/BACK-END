import mongoose from 'mongoose';

const { Schema } = mongoose;

export const SeoSchema = new Schema(
  {
    metaTitle: { type: String, trim: true, maxlength: 70 },
    metaDescription: { type: String, trim: true, maxlength: 200 },
    canonicalUrl: { type: String, trim: true },
    ogImage: { type: Schema.Types.ObjectId, ref: 'Media' },
    noIndex: { type: Boolean, default: false },
  },
  { _id: false },
);

export const SocialSchema = new Schema(
  {
    platform: { type: String, trim: true, required: true },
    url: { type: String, trim: true, required: true },
  },
  { _id: false },
);

export const STATUS = ['draft', 'published'];

/** Applied to every slugged model so a renamed slug still resolves (301). */
export function withSlugHistory(schema) {
  schema.add({ previousSlugs: { type: [String], default: [], index: true } });

  // Remember the slug as loaded, so a rename can be detected on save.
  schema.post('init', function rememberSlug() {
    this.$locals.priorSlug = this.slug;
  });

  schema.pre('save', function retainOldSlug(next) {
    if (!this.isNew && this.isModified('slug')) {
      const prior = this.$locals.priorSlug;
      if (prior && prior !== this.slug && !this.previousSlugs.includes(prior)) {
        this.previousSlugs.push(prior);
      }
    }
    next();
  });

  /** Resolve by current slug, falling back to a retired one. */
  schema.statics.findBySlug = function findBySlug(slug, extra = {}) {
    return this.findOne({ $or: [{ slug }, { previousSlugs: slug }], ...extra });
  };
}
