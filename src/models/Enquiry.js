import mongoose from 'mongoose';

const { Schema } = mongoose;

const EnquirySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    subject: { type: String, trim: true, maxlength: 200, default: '' },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    status: {
      type: String,
      enum: ['new', 'read', 'replied', 'spam'],
      default: 'new',
    },
    // The raw IP is never stored — only a salted hash, which is enough to spot
    // repeat submissions without retaining personal data unnecessarily.
    ipHash: { type: String },
    userAgent: { type: String, maxlength: 400 },
    readAt: { type: Date },
  },
  { timestamps: true },
);

EnquirySchema.index({ status: 1, createdAt: -1 });
EnquirySchema.index({ createdAt: -1 });

export default mongoose.models.Enquiry || mongoose.model('Enquiry', EnquirySchema);
