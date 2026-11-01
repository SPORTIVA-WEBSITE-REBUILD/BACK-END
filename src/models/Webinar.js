import mongoose from 'mongoose';
import { SeoSchema } from './shared.js';

const { Schema } = mongoose;

/**
 * Singleton: the site has one webinar "slot" live at a time. Modelled as a
 * document rather than a settings blob so it gets its own admin screen,
 * its own validation, and a clean place to add a second webinar later
 * (rename to a collection with a slug) without touching SiteSettings.
 */
const SpeakerSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 120, default: '' },
    role: { type: String, trim: true, maxlength: 60, default: '' }, // "Moderator/Speaker" | "Speaker"
    titleLines: { type: [String], default: [] },
    // shortBio: used on the website speaker cards and the link-preview copy
    // (short space, must fit without truncation). bio: the fuller paragraph
    // used in the confirmation email's "Meet your speakers" section.
    shortBio: { type: String, trim: true, maxlength: 600, default: '' },
    bio: { type: String, trim: true, maxlength: 4000, default: '' },
    photoUrl: { type: String, trim: true, default: '' },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const FaqSchema = new Schema(
  {
    question: { type: String, trim: true, maxlength: 300, default: '' },
    answer: { type: String, trim: true, maxlength: 2000, default: '' },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const SocialLinksSchema = new Schema(
  {
    instagram: { type: String, trim: true, default: '' },
    x: { type: String, trim: true, default: '' },
    linkedin: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const EmailSettingsSchema = new Schema(
  {
    subject: { type: String, trim: true, maxlength: 200, default: '' },
    introParagraph: { type: String, trim: true, maxlength: 1000, default: '' },
    noteBoxText: { type: String, trim: true, maxlength: 500, default: '' },
    footerText: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: false },
);

const WebinarSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 300, default: '' },
    subtitle: { type: String, trim: true, maxlength: 300, default: '' },
    description: { type: String, trim: true, maxlength: 5000, default: '' },

    startsAt: { type: Date },
    endsAt: { type: Date },
    // IANA zone for display/ICS; the stored Date fields are always UTC instants.
    timezone: { type: String, trim: true, default: 'Africa/Lagos' },

    // Never served by the public GET /api/webinar route.
    meetUrl: { type: String, trim: true, default: '' },

    supportEmail: { type: String, trim: true, lowercase: true, default: '' },
    organiserName: { type: String, trim: true, maxlength: 160, default: 'PCN Sportiva LP' },
    bannerUrl: { type: String, trim: true, default: '' },
    // 1200x630 link-preview image for WhatsApp/LinkedIn/X/Facebook. Falls
    // back to the server-generated one (scripts/generate-share-image.js)
    // until an administrator uploads a replacement via Cloudinary.
    shareImageUrl: { type: String, trim: true, default: '' },

    speakers: { type: [SpeakerSchema], default: [] },
    faq: { type: [FaqSchema], default: [] },
    social: { type: SocialLinksSchema, default: () => ({}) },

    recordingUrl: { type: String, trim: true, default: '' },

    email: { type: EmailSettingsSchema, default: () => ({}) },

    webinarHeroEnabled: { type: Boolean, default: false },
    // Default per brief: end of 7 Nov 2026 in WAT, expressed as the UTC instant.
    webinarHeroEndsAt: { type: Date, default: () => new Date('2026-11-07T22:59:00Z') },
    registrationOpen: { type: Boolean, default: true },

    seo: { type: SeoSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export default mongoose.models.Webinar || mongoose.model('Webinar', WebinarSchema);
