import { z } from 'zod';
import { WEBINAR_ROLES } from '../models/WebinarRegistration.js';
import { isValidCountry } from '../lib/countries.js';

/**
 * Rejects a newline anywhere in a string — stops header injection via a
 * name or email that carries a bcc:/cc: line into a raw SMTP header.
 *
 * `.refine()`'s predicate must return a boolean: Zod only fails validation
 * on a literal `false`, and a returned string (even one meant as an error
 * message) is truthy and is treated as a PASS. The message has to go in the
 * second argument instead.
 */
const noNewlines = (v) => !/[\r\n]/.test(v);

export const webinarRegistrationSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80)
    .refine(noNewlines, 'Name cannot contain line breaks'),
  email: z.string().trim().toLowerCase().max(200).email('Enter a valid email address')
    .refine(noNewlines, 'Email cannot contain line breaks'),
  role: z.enum(WEBINAR_ROLES, { errorMap: () => ({ message: 'Select your role' }) }),
  roleOther: z.string().trim().max(100).optional().default('')
    .refine(noNewlines, 'This field cannot contain line breaks'),
  nationality: z.string().trim().max(100)
    .refine((v) => isValidCountry(v), 'Select a valid country'),
  // Optional, basic validation only: digits, spaces and the usual phone
  // punctuation, 7–20 characters — not a strict E.164 check.
  phone: z.string().trim().max(30).optional().default('')
    .refine((v) => v === '' || /^[0-9+()\-.\s]{7,30}$/.test(v), 'Enter a valid phone number'),
  consent: z.literal(true, { errorMap: () => ({ message: 'Please accept to continue' }) }),
  // Honeypot: a real visitor never sees or fills this field (hidden by CSS
  // off-screen, not display:none, which some bots skip). Any value here
  // means a bot filled every visible-looking field — silently succeed.
  website: z.string().optional(),
  // Present only when TURNSTILE_SECRET_KEY is configured; validated in the route.
  turnstileToken: z.string().optional(),
}).strict().superRefine((data, ctx) => {
  if (data.role === 'Other' && !data.roleOther.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['roleOther'], message: 'Tell us your role' });
  }
});

const speaker = z.object({
  name: z.string().trim().max(120).optional().default(''),
  role: z.string().trim().max(60).optional().default(''),
  titleLines: z.array(z.string().trim().max(160)).max(10).optional().default([]),
  shortBio: z.string().trim().max(600).optional().default(''),
  bio: z.string().trim().max(4000).optional().default(''),
  photoUrl: z.string().trim().max(500).optional().default(''),
  order: z.number().int().optional().default(0),
}).strict();

const faqItem = z.object({
  question: z.string().trim().max(300).optional().default(''),
  answer: z.string().trim().max(2000).optional().default(''),
  order: z.number().int().optional().default(0),
}).strict();

export const webinarAdminSchema = z.object({
  title: z.string().trim().max(300).optional().default(''),
  subtitle: z.string().trim().max(300).optional().default(''),
  description: z.string().trim().max(5000).optional().default(''),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  timezone: z.string().trim().max(60).optional().default('Africa/Lagos'),
  meetUrl: z.string().trim().max(500).optional().default(''),
  supportEmail: z.string().trim().toLowerCase().max(200)
    .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email address')
    .optional().default(''),
  organiserName: z.string().trim().max(160).optional().default('PCN Sportiva LP'),
  bannerUrl: z.string().trim().max(500).optional().default(''),
  collaborationLine: z.string().trim().max(200).optional().default(''),
  collaborationLogoUrl: z.string().trim().max(500).optional().default(''),
  shareImageUrl: z.string().trim().max(500).optional().default(''),
  speakers: z.array(speaker).max(20).optional().default([]),
  faq: z.array(faqItem).max(30).optional().default([]),
  social: z.object({
    instagram: z.string().trim().max(200).optional().default(''),
    x: z.string().trim().max(200).optional().default(''),
    linkedin: z.string().trim().max(200).optional().default(''),
  }).optional().default({}),
  recordingUrl: z.string().trim().max(500).optional().default(''),
  email: z.object({
    subject: z.string().trim().max(200).optional().default(''),
    introParagraph: z.string().trim().max(1000).optional().default(''),
    noteBoxText: z.string().trim().max(500).optional().default(''),
    footerText: z.string().trim().max(500).optional().default(''),
  }).optional().default({}),
  webinarHeroEnabled: z.boolean().optional().default(false),
  webinarHeroEndsAt: z.coerce.date().optional(),
  registrationOpen: z.boolean().optional().default(true),
}).strict();

export const testEmailSchema = z.object({
  to: z.string().trim().toLowerCase().email('Enter a valid email address'),
}).strict();

export const sendReminderSchema = z.object({
  type: z.enum(['day', 'hour']),
  dryRun: z.boolean().optional().default(true),
}).strict();
