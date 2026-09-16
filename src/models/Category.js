import mongoose from 'mongoose';
import { withSlugHistory } from './shared.js';

const { Schema } = mongoose;

const CategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { timestamps: true },
);

withSlugHistory(CategorySchema);

export default mongoose.models.Category || mongoose.model('Category', CategorySchema);
