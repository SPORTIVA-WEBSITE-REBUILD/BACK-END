import mongoose from 'mongoose';
import { STATUS } from './shared.js';

const { Schema } = mongoose;

/**
 * A single image in the site gallery.
 *
 * Deliberately not slugged: gallery images are shown as a set on the home page
 * and opened in a lightbox, never at their own URL, so there is no slug to keep
 * unique or to redirect when it changes.
 */
const GalleryItemSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 600, default: '' },
    image: { type: Schema.Types.ObjectId, ref: 'Media', required: true },
    // Optional context the firm may want under a photograph.
    location: { type: String, trim: true, maxlength: 160, default: '' },
    takenAt: { type: Date },
    order: { type: Number, default: 0 },
    status: { type: String, enum: STATUS, default: 'draft' },
    publishedAt: { type: Date },
  },
  { timestamps: true },
);

GalleryItemSchema.index({ status: 1, order: 1, createdAt: -1 });
GalleryItemSchema.index({ title: 'text', description: 'text' });

export default mongoose.models.GalleryItem
  || mongoose.model('GalleryItem', GalleryItemSchema);
