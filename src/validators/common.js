import { z } from 'zod';

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
export const optionalObjectId = z.union([objectId, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v === null ? undefined : v));

export const status = z.enum(['draft', 'published']);

export const seo = z.object({
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(200).optional(),
  canonicalUrl: z.string().url().or(z.literal('')).optional(),
  ogImage: optionalObjectId,
  noIndex: z.boolean().optional(),
}).strict().optional();

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: status.optional(),
  sort: z.string().max(60).optional(),
}).passthrough();

export const slugParam = z.object({
  slug: z.string().trim().min(1).max(120),
});

export const idParam = z.object({ id: objectId });
