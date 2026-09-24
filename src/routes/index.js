import { Router } from 'express';

import Page from '../models/Page.js';
import Service from '../models/Service.js';
import CaseModel from '../models/Case.js';
import Article from '../models/Article.js';
import Category from '../models/Category.js';
import Lawyer from '../models/Lawyer.js';
import Vacancy from '../models/Vacancy.js';
import GalleryItem from '../models/GalleryItem.js';
import Testimonial from '../models/Testimonial.js';

import { readingMinutes, toPlainText } from '../lib/sanitize.js';
import { ok } from '../lib/respond.js';
import { PAGE_BLUEPRINTS } from '../config/pageBlueprints.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

import authRoutes from './auth.js';
import publicRoutes from './public.js';
import adminRoutes from './admins.js';
import mediaRoutes from './media.js';
import settingsRoutes from './settings.js';
import enquiryRoutes from './enquiries.js';
import subscriberRoutes from './subscribers.js';
import commentRoutes from './comments.js';
import resourceRouter from './resource.js';

import {
  pageSchema, serviceSchema, caseSchema,
  articleSchema, categorySchema, lawyerSchema, vacancySchema, galleryItemSchema, testimonialSchema,
} from '../validators/schemas.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/public', publicRoutes);
router.use('/admins', adminRoutes);
router.use('/media', mediaRoutes);
router.use('/enquiries', enquiryRoutes);
router.use('/subscribers', subscriberRoutes);
router.use('/comments', commentRoutes);
router.use('/', settingsRoutes);

// Which sections each built-in page has, and what its fields are called. The
// dashboard builds its page forms from this. Registered before the pages
// router so "blueprints" is never treated as a page id.
router.get('/pages/blueprints', requireAuth, requirePermission('pages:read'), (req, res) => {
  ok(res, PAGE_BLUEPRINTS);
});

router.use('/pages', resourceRouter({
  name: 'pages',
  Model: Page,
  schema: pageSchema,
  // Section bodies are rendered as HTML on the public site, so they must be
  // sanitised on write like any other rich text field.
  htmlFields: ['sections.body', 'sections.items.text'],
  slugFrom: 'title',
  searchFields: ['title', 'slug'],
  listProjection: 'title slug status updatedAt',
  defaultSort: 'title',
}));

router.use('/services', resourceRouter({
  name: 'services',
  Model: Service,
  schema: serviceSchema,
  htmlFields: ['body'],
  slugFrom: 'title',
  searchFields: ['title', 'summary'],
  listProjection: 'title slug icon summary order status updatedAt',
  defaultSort: 'order',
}));

router.use('/cases', resourceRouter({
  name: 'cases',
  Model: CaseModel,
  schema: caseSchema,
  htmlFields: ['body'],
  slugFrom: 'title',
  searchFields: ['title', 'summary', 'forum'],
  listProjection: 'title slug forum year partyRepresented outcome anonymised status publishedAt updatedAt',
  defaultSort: '-year -updatedAt',
}));

router.use('/articles', resourceRouter({
  name: 'articles',
  Model: Article,
  schema: articleSchema,
  htmlFields: ['body'],
  slugFrom: 'title',
  searchFields: ['title', 'excerpt'],
  populate: [{ path: 'author', select: 'name slug' }, { path: 'authors', select: 'name slug' }, { path: 'category', select: 'name slug' }],
  listProjection: 'title slug excerpt status publishedAt author authors category updatedAt',
  defaultSort: '-updatedAt',
  // Derived fields are computed server-side so every article is consistent
  // regardless of which client created it.
  beforeSave: (payload) => {
    if (Array.isArray(payload.authors)) payload.author = payload.authors[0] || null;
    if (typeof payload.body === 'string') {
      payload.readingMinutes = readingMinutes(payload.body);
      if (!payload.excerpt) {
        payload.excerpt = toPlainText(payload.body).slice(0, 220);
      }
    }
  },
}));

router.use('/vacancies', resourceRouter({
  name: 'vacancies',
  Model: Vacancy,
  schema: vacancySchema,
  htmlFields: ['description'],
  slugFrom: 'title',
  searchFields: ['title', 'summary', 'location', 'department'],
  listProjection: 'title slug location employmentType department closingDate order status publishedAt updatedAt',
  defaultSort: 'order -publishedAt',
}));

router.use('/gallery', resourceRouter({
  name: 'gallery',
  Model: GalleryItem,
  schema: galleryItemSchema,
  searchFields: ['title', 'description', 'location'],
  populate: [{ path: 'image', select: 'secureUrl width height alt' }],
  defaultSort: 'order -createdAt',
}));

router.use('/testimonials', resourceRouter({
  name: 'testimonials',
  Model: Testimonial,
  schema: testimonialSchema,
  searchFields: ['name', 'position', 'quote'],
  populate: [{ path: 'photo', select: 'secureUrl width height alt' }],
  defaultSort: 'order -createdAt',
}));

router.use('/categories', resourceRouter({
  name: 'categories',
  Model: Category,
  schema: categorySchema,
  slugFrom: 'name',
  searchFields: ['name'],
  supportsStatus: false,
  defaultSort: 'name',
}));

router.use('/lawyers', resourceRouter({
  name: 'lawyers',
  Model: Lawyer,
  schema: lawyerSchema,
  htmlFields: ['bio'],
  slugFrom: 'name',
  searchFields: ['name', 'role'],
  listProjection: 'name slug role photo order status updatedAt',
  defaultSort: 'order',
}));

export default router;
