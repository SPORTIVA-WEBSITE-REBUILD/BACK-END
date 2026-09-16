import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/publicController.js';
import validate from '../middleware/validate.js';
import { enquiryLimiter } from '../middleware/rateLimit.js';
import { enquirySchema } from '../validators/schemas.js';

const router = Router();

const caseQuery = z.object({
  forum: z.string().max(120).optional(),
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  party: z.string().max(40).optional(),
  outcome: z.string().max(40).optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

const articleQuery = z.object({
  category: z.string().max(120).optional(),
  tag: z.string().max(40).optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(9),
});

router.get('/settings', ctrl.getSettings);
router.get('/sitemap', ctrl.sitemapData);
// Served as real XML/text so the public site can rewrite /sitemap.xml and
// /robots.txt straight through — a newly published article appears without a
// frontend redeploy.
router.get('/sitemap.xml', ctrl.sitemapXml);
router.get('/robots.txt', ctrl.robotsTxt);

router.get('/pages/:slug', ctrl.getPage);

router.get('/services', ctrl.listServices);
router.get('/services/:slug', ctrl.getService);

// Declared before /cases/:slug so "filters" is never read as a slug.
router.get('/cases/filters', ctrl.caseFilters);
router.get('/cases', validate(caseQuery, 'query'), ctrl.listCases);
router.get('/cases/:slug', ctrl.getCase);

router.get('/articles', validate(articleQuery, 'query'), ctrl.listArticles);
router.get('/articles/:slug', ctrl.getArticle);

router.get('/gallery', ctrl.listGallery);

router.get('/vacancies', ctrl.listVacancies);
router.get('/vacancies/:slug', ctrl.getVacancy);

router.get('/lawyers', ctrl.listLawyers);
router.get('/lawyers/:slug', ctrl.getLawyer);

router.post('/enquiries', enquiryLimiter, validate(enquirySchema), ctrl.createEnquiry);

export default router;
