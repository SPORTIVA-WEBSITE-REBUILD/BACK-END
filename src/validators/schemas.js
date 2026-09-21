import { z } from 'zod';
import { ROLES } from '../config/permissions.js';
import { PARTIES, OUTCOMES } from '../models/Case.js';
import { EMPLOYMENT_TYPES, WORKPLACE_TYPES } from '../models/Vacancy.js';
import { objectId, optionalObjectId, seo, status } from './common.js';

/**
 * A link an administrator can type. Restricted at the point of STORAGE, so a
 * dangerous value never reaches the database and cannot be rendered by any
 * consumer later.
 *
 * Rejected: `javascript:` and `data:` (script execution), protocol-relative
 * `//host` and backslash forms like `/\evil.com` or `\\evil.com` (browsers and
 * some routers normalise these into an off-site redirect).
 */
const safeHref = z.string().trim().max(400)
  .refine((v) => !v.includes('\\'), 'Links cannot contain a backslash')
  .refine((v) => !/^\s*(javascript|data|vbscript):/i.test(v), 'That link scheme is not allowed')
  .refine((v) => !/^\/\//.test(v), 'Write the full https:// address for an external link')
  .refine(
    (v) => /^\/(?![/\\])/.test(v) || /^#/.test(v) || /^https?:\/\//i.test(v) || /^(mailto|tel):/i.test(v),
    'Use an internal path like /record, or a full https:// address',
  );

const slug = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens')
  .max(96);

/**
 * Platforms the public site can actually draw an icon for. Restricting this at
 * the point of storage means a social link can never be saved that the footer
 * would then have to render as a blank space.
 *
 * Keep in step with SUPPORTED_PLATFORMS in frontend/src/components/SocialIcon.jsx.
 */
export const SOCIAL_PLATFORMS = [
  'facebook', 'instagram', 'tiktok', 'linkedin', 'twitter', 'x', 'youtube', 'whatsapp',
];

/**
 * A social link. Entries with a blank URL are dropped rather than rejected —
 * an administrator adding a row and not filling it in should be able to save
 * the rest of the form, and an empty entry must never reach the footer.
 */
const socialLink = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  url: z.string().trim().url('Enter the full address, including https://'),
}).strict();

const socialLinks = z
  .array(z.object({
    platform: z.string().trim().toLowerCase(),
    url: z.string().trim(),
  }).passthrough())
  .max(12)
  .transform((rows) => rows.filter((r) => r.platform && r.url))
  .pipe(z.array(socialLink).max(12));

/* ------------------------------- auth ---------------------------------- */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
}).strict();

export const updateMeSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, 'Use at least 10 characters').max(200),
}).strict();

/* ------------------------------ admins --------------------------------- */

export const createAdminSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, 'Use at least 10 characters').max(200),
  role: z.enum(ROLES).default('editor'),
  permissions: z.array(z.string()).max(40).optional(),
}).strict();

export const updateAdminSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  role: z.enum(ROLES).optional(),
  permissions: z.array(z.string()).max(40).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(10).max(200).optional(),
}).strict();

/* ------------------------------ content -------------------------------- */

const sectionItem = z.object({
  title: z.string().max(200).optional(),
  text: z.string().max(2000).optional(),
  icon: z.string().max(80).optional(),
  value: z.string().max(80).optional(),
  href: safeHref.optional(),
  image: optionalObjectId,
}).strict();

const section = z.object({
  key: z.string().trim().min(1).max(60),
  heading: z.string().max(300).optional(),
  subheading: z.string().max(300).optional(),
  body: z.string().max(20000).optional(),
  image: optionalObjectId,
  // A video page link (YouTube/Vimeo), opened in a popup. Only https: a
  // section video is always an external embed.
  video: z.union([
    z.literal(''),
    safeHref.refine((v) => /^https:\/\//i.test(v), 'Use the full https:// address of the video'),
  ]).optional(),
  value: z.string().max(40).optional(),
  cta: z.object({
    label: z.string().max(80).optional(),
    href: safeHref.optional(),
  }).strict().optional(),
  items: z.array(sectionItem).max(40).optional(),
  // Named interface strings (placeholders, button names, widget titles). Keys
  // are simple identifiers; which keys a page uses is set by its blueprint.
  labels: z.record(
    z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/, 'Invalid label key'),
    z.string().max(300),
  ).refine((l) => Object.keys(l).length <= 40, 'A section holds at most 40 labels').optional(),
}).strict();

export const pageSchema = z.object({
  slug: slug.optional(),
  title: z.string().trim().min(1).max(200),
  sections: z.array(section).max(30).optional(),
  seo,
  status: status.optional(),
}).strict();

export const serviceSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: slug.optional(),
  icon: z.string().max(80).optional(),
  summary: z.string().max(400).optional(),
  body: z.string().max(60000).optional(),
  image: optionalObjectId,
  order: z.number().int().min(0).max(999).optional(),
  status: status.optional(),
  seo,
}).strict();

export const caseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: slug.optional(),
  forum: z.string().trim().min(1).max(120),
  year: z.coerce.number().int().min(1900).max(2200),
  partyRepresented: z.enum(PARTIES),
  outcome: z.enum(OUTCOMES),
  summary: z.string().trim().min(1).max(600),
  body: z.string().max(80000).optional(),
  anonymised: z.boolean().optional(),
  practiceArea: optionalObjectId,
  featuredImage: optionalObjectId,
  publishedAt: z.coerce.date().optional(),
  status: status.optional(),
  seo,
}).strict();

export const articleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: slug.optional(),
  excerpt: z.string().max(400).optional(),
  body: z.string().max(200000).optional(),
  author: optionalObjectId,
  category: optionalObjectId,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  featuredImage: optionalObjectId,
  publishedAt: z.coerce.date().optional(),
  status: status.optional(),
  seo,
}).strict();

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slug.optional(),
  description: z.string().max(300).optional(),
}).strict();

export const lawyerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slug.optional(),
  role: z.string().max(120).optional(),
  bio: z.string().max(60000).optional(),
  quote: z.string().max(400).optional(),
  photo: optionalObjectId,
  qualifications: z.array(z.string().max(160)).max(20).optional(),
  practiceAreas: z.array(objectId).max(20).optional(),
  email: z.string().trim().toLowerCase().email().or(z.literal('')).optional(),
  phone: z.string().max(40).optional(),
  socials: socialLinks.optional(),
  order: z.number().int().min(0).max(999).optional(),
  status: status.optional(),
  seo,
}).strict();

export const vacancySchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: slug.optional(),
  department: z.string().max(120).optional(),
  location: z.string().trim().min(1).max(160),
  workplaceType: z.enum(WORKPLACE_TYPES).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  summary: z.string().trim().min(1).max(600),
  description: z.string().max(60000).optional(),
  responsibilities: z.array(z.string().trim().min(1).max(400)).max(30).optional(),
  requirements: z.array(z.string().trim().min(1).max(400)).max(30).optional(),
  salaryRange: z.string().max(120).optional(),
  closingDate: z.coerce.date().optional().nullable(),
  applyEmail: z.string().trim().toLowerCase().email().or(z.literal('')).optional(),
  applyUrl: safeHref.or(z.literal('')).optional(),
  order: z.number().int().min(0).max(999).optional(),
  publishedAt: z.coerce.date().optional(),
  status: status.optional(),
  seo,
}).strict();

export const galleryItemSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(600).optional(),
  // An image is the whole point of a gallery entry, so it is required rather
  // than optional — an entry without one would render an empty tile.
  image: objectId,
  location: z.string().max(160).optional(),
  takenAt: z.coerce.date().optional().nullable(),
  order: z.number().int().min(0).max(999).optional(),
  status: status.optional(),
}).strict();

/* ------------------------------ settings ------------------------------- */

export const settingsSchema = z.object({
  siteName: z.string().trim().min(1).max(120).optional(),
  tagline: z.string().max(200).optional(),
  logo: optionalObjectId,
  favicon: optionalObjectId,
  contact: z.object({
    address: z.string().max(300).optional(),
    phone: z.string().max(60).optional(),
    phone2: z.string().max(60).optional(),
    email: z.string().trim().toLowerCase().email().or(z.literal('')).optional(),
    mapUrl: z.string().max(600).optional(),
    website: z.string().trim().max(300).optional(),
    businessHours: z.array(z.object({
      label: z.string().max(80),
      value: z.string().max(120),
    }).strict()).max(10).optional(),
  }).strict().optional(),
  socials: socialLinks.optional(),
  copyrightText: z.string().max(300).optional(),
  seoDefaults: seo,
  enquiryRecipient: z.string().trim().toLowerCase().email().or(z.literal('')).optional(),
  careersEmail: z.string().trim().toLowerCase().email().or(z.literal('')).optional(),
  showCaseFilters: z.boolean().optional(),
}).strict();

const navItem = z.object({
  label: z.string().trim().min(1).max(80),
  href: safeHref,
  order: z.number().int().min(0).max(999).optional(),
  external: z.boolean().optional(),
  children: z.array(z.object({
    label: z.string().min(1).max(80),
    href: safeHref,
    external: z.boolean().optional(),
  }).strict()).max(20).optional(),
}).strict();

export const navigationSchema = z.object({
  items: z.array(navItem).max(30),
}).strict();

/* ------------------------------- media --------------------------------- */

export const mediaCreateSchema = z.object({
  publicId: z.string().min(1).max(300),
  url: z.string().url(),
  secureUrl: z.string().url(),
  format: z.string().max(20).optional(),
  resourceType: z.string().max(20).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  bytes: z.number().int().positive().optional(),
  alt: z.string().max(200).optional(),
  caption: z.string().max(300).optional(),
  folder: z.string().max(200).optional(),
}).strict();

export const mediaUpdateSchema = z.object({
  alt: z.string().max(200).optional(),
  caption: z.string().max(300).optional(),
}).strict();

/* ----------------------------- enquiries ------------------------------- */

export const enquirySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().max(40).optional(),
  subject: z.string().max(200).optional(),
  message: z.string().trim().min(10, 'Please give us a little more detail').max(5000),
  source: z.enum(['contact', 'consultation']).optional(),
  // Honeypot: a real visitor never fills a hidden field.
  website: z.string().max(0).optional(),
}).strict();

/* ---------------------------- testimonials ----------------------------- */

export const testimonialSchema = z.object({
  quote: z.string().trim().min(1).max(800),
  name: z.string().trim().min(1).max(120),
  position: z.string().max(120).optional(),
  photo: optionalObjectId,
  order: z.number().int().min(0).max(999).optional(),
  status: status.optional(),
}).strict();

/* ----------------------------- newsletter ------------------------------ */

export const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  // Honeypot, as on the enquiry form.
  company: z.string().max(0).optional(),
}).strict();

export const subscriberStatusSchema = z.object({
  status: z.enum(['subscribed', 'unsubscribed']),
}).strict();

/* ------------------------------ comments ------------------------------- */

export const commentSchema = z.object({
  name: z.string().trim().min(2, 'Please tell us your name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  // Optional, and only ever a real web address — it becomes a link.
  website: z.union([z.literal(''), z.string().trim().url().max(300).refine((v) => /^https?:\/\//i.test(v), 'Use a full http(s) address')]).optional(),
  message: z.string().trim().min(3, 'Please write a comment').max(3000),
  parent: optionalObjectId,
  // Honeypot.
  phone: z.string().max(0).optional(),
}).strict();

export const commentStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'spam']),
}).strict();

export const enquiryStatusSchema = z.object({
  status: z.enum(['new', 'read', 'replied', 'spam']),
}).strict();

export const statusUpdateSchema = z.object({ status }).strict();
