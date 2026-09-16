import mongoose from 'mongoose';

const { Schema } = mongoose;

const NavItemSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    href: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    external: { type: Boolean, default: false },
    children: {
      type: [{ label: String, href: String, external: Boolean, _id: false }],
      default: [],
    },
  },
  { _id: false },
);

const NavigationSchema = new Schema(
  {
    location: {
      type: String,
      enum: ['header', 'footer'],
      required: true,
      unique: true,
    },
    items: { type: [NavItemSchema], default: [] },
  },
  { timestamps: true },
);

export default mongoose.models.Navigation
  || mongoose.model('Navigation', NavigationSchema);
