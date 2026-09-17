import mongoose from 'mongoose';

const { Schema } = mongoose;

export const COMMENT_STATUS = ['pending', 'approved', 'spam'];

/**
 * A reader's comment on an article. Every new comment starts `pending` and
 * appears on the site only once an administrator approves it — a law firm's
 * site must not publish whatever a visitor types.
 */
const CommentSchema = new Schema(
  {
    article: { type: Schema.Types.ObjectId, ref: 'Article', required: true },
    // A reply points at the comment it answers; top-level comments have none.
    parent: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    website: { type: String, trim: true, maxlength: 300, default: '' },
    message: { type: String, required: true, trim: true, maxlength: 3000 },
    status: { type: String, enum: COMMENT_STATUS, default: 'pending' },
    ipHash: { type: String },
  },
  { timestamps: true },
);

CommentSchema.index({ article: 1, status: 1, createdAt: 1 });
CommentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.Comment || mongoose.model('Comment', CommentSchema);
