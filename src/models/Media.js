import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Metadata only. The bytes live in Cloudinary and are delivered from its CDN —
 * Mongo never stores a binary (CLAUDE.md sections 3 and 15).
 */
const MediaSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true, index: true },
    url: { type: String, required: true },
    secureUrl: { type: String, required: true },
    format: { type: String },
    resourceType: { type: String, default: 'image' },
    width: { type: Number },
    height: { type: Number },
    bytes: { type: Number },
    alt: { type: String, trim: true, maxlength: 200, default: '' },
    caption: { type: String, trim: true, maxlength: 300, default: '' },
    folder: { type: String, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true },
);

MediaSchema.index({ createdAt: -1 });

export default mongoose.models.Media || mongoose.model('Media', MediaSchema);
