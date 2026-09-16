import mongoose from 'mongoose';
import { SeoSchema, STATUS, withSlugHistory } from './shared.js';

const { Schema } = mongoose;

const ArticleSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    excerpt: { type: String, trim: true, maxlength: 400, default: '' },
    body: { type: String, default: '' },
    author: { type: Schema.Types.ObjectId, ref: 'Lawyer' },
    category: { type: Schema.Types.ObjectId, ref: 'Category' },
    tags: { type: [String], default: [] },
    featuredImage: { type: Schema.Types.ObjectId, ref: 'Media' },
    status: { type: String, enum: STATUS, default: 'draft' },
    publishedAt: { type: Date },
    readingMinutes: { type: Number, default: 1 },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  { timestamps: true },
);

withSlugHistory(ArticleSchema);
ArticleSchema.index({ status: 1, publishedAt: -1 });
ArticleSchema.index({ category: 1, status: 1, publishedAt: -1 });
ArticleSchema.index({ tags: 1 });
ArticleSchema.index({ title: 'text', excerpt: 'text' });

export default mongoose.models.Article || mongoose.model('Article', ArticleSchema);
