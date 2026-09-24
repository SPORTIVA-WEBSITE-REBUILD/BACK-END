import crypto from 'node:crypto';
import SiteSettings from '../models/SiteSettings.js';
import Navigation from '../models/Navigation.js';
import Page from '../models/Page.js';
import Service from '../models/Service.js';
import CaseModel from '../models/Case.js';
import Article from '../models/Article.js';
import Lawyer from '../models/Lawyer.js';
import Vacancy from '../models/Vacancy.js';
import GalleryItem from '../models/GalleryItem.js';
import Enquiry from '../models/Enquiry.js';
import Category from '../models/Category.js';
import Testimonial from '../models/Testimonial.js';
import Subscriber from '../models/Subscriber.js';
import Comment from '../models/Comment.js';
import { blueprintFor, withDefaults } from '../config/pageBlueprints.js';
import ApiError from '../lib/ApiError.js';
import { toPlainText } from '../lib/sanitize.js';
import asyncHandler from '../lib/asyncHandler.js';
import { sendEnquiryEmail } from '../lib/mailer.js';
import { ok, created, publicCache } from '../lib/respond.js';
import env from '../config/env.js';

const PUBLISHED = { status: 'published' };
const MEDIA_FIELDS = 'secureUrl width height alt caption format';

/**
 * A slug the administrator has retired still resolves, but the client is told
 * the canonical one so it can issue a redirect instead of serving duplicate
 * URLs to search engines (CLAUDE.md section 18).
 */
function canonicalRedirect(doc, requested) {
  return doc.slug !== requested ? { redirectTo: doc.slug } : {};
}

/* --------------------------- shell / settings --------------------------- */

// One call for everything the layout needs, so the shell costs one round trip
// rather than three (CLAUDE.md section 11).
export const getSettings = asyncHandler(async (req, res) => {
  const [settings, navs, layout] = await Promise.all([
    SiteSettings.getSingleton().then((d) => d.populate([
      { path: 'logo', select: MEDIA_FIELDS },
      { path: 'favicon', select: MEDIA_FIELDS },
      { path: 'seoDefaults.ogImage', select: MEDIA_FIELDS },
    ])),
    Navigation.find().lean(),
    loadPage('layout'),
  ]);

  publicCache(res, 300);
  return ok(res, {
    settings,
    navigation: {
      header: navs.find((n) => n.location === 'header')?.items || [],
      footer: navs.find((n) => n.location === 'footer')?.items || [],
    },
    // Menu button, newsletter band, footer and shared interface text — the
    // chrome every page renders, in the same single request.
    layout,
  });
});

/**
 * A page as the site renders it: the stored, published content with every
 * empty field filled from its blueprint. A built-in page always resolves —
 * before anyone has saved it, or while it is a draft, the blueprint defaults
 * stand in, so the chrome never renders blank. A draft's own words are never
 * exposed.
 */
async function loadPage(slug) {
  const page = await Page.findBySlug(slug, PUBLISHED)
    .populate([
      { path: 'sections.image', select: MEDIA_FIELDS },
      { path: 'sections.items.image', select: MEDIA_FIELDS },
      { path: 'seo.ogImage', select: MEDIA_FIELDS },
    ])
    .lean();

  if (!page) return blueprintFor(slug) ? withDefaults(slug, null) : null;
  return withDefaults(page.slug, page);
}

/* --------------------------------- pages -------------------------------- */

export const getPage = asyncHandler(async (req, res) => {
  const page = await loadPage(req.params.slug);
  if (!page) throw ApiError.notFound('Page not found');

  publicCache(res, 300);
  return ok(res, page, page.slug ? canonicalRedirect(page, req.params.slug) : {});
});

/* ------------------------------- services ------------------------------- */

export const listServices = asyncHandler(async (req, res) => {
  const services = await Service.find(PUBLISHED)
    .select('title slug icon summary image order')
    .populate({ path: 'image', select: MEDIA_FIELDS })
    .sort('order title')
    .lean();

  /*
   * How many published cases sit behind each practice area. The site prints
   * this under the service card, so it is counted here rather than shipping the
   * whole case collection to the browser to be counted there.
   *
   * One grouped count for the page, not one query per card.
   */
  const counts = await CaseModel.aggregate([
    { $match: { ...PUBLISHED, practiceArea: { $ne: null } } },
    { $group: { _id: '$practiceArea', count: { $sum: 1 } } },
  ]);
  const byArea = new Map(counts.map((c) => [String(c._id), c.count]));
  for (const service of services) {
    service.caseCount = byArea.get(String(service._id)) || 0;
  }

  publicCache(res, 600);
  return ok(res, services);
});

export const getService = asyncHandler(async (req, res) => {
  const service = await Service.findBySlug(req.params.slug, PUBLISHED)
    .populate([
      { path: 'image', select: MEDIA_FIELDS },
      { path: 'seo.ogImage', select: MEDIA_FIELDS },
    ])
    .lean();
  if (!service) throw ApiError.notFound('Service not found');

  // "Our Legal Advisors": team members linked to this practice area, fetched
  // with the service so the page needs no second request.
  service.advisors = await Lawyer.find({ ...PUBLISHED, practiceAreas: service._id })
    .select('name slug role quote photo')
    .populate({ path: 'photo', select: MEDIA_FIELDS })
    .sort('order name')
    .lean();

  // Matters handled in this practice area, previewed below the advisors.
  service.cases = await CaseModel.find({ ...PUBLISHED, practiceArea: service._id })
    .select('title slug forum year partyRepresented outcome summary holding anonymised featuredImage practiceArea publishedAt')
    .populate([{ path: 'featuredImage', select: MEDIA_FIELDS }, { path: 'practiceArea', select: 'title slug' }])
    .sort('-publishedAt')
    .limit(4)
    .lean();

  publicCache(res, 600);
  return ok(res, service, canonicalRedirect(service, req.params.slug));
});

/* -------------------------------- cases --------------------------------- */

export const listCases = asyncHandler(async (req, res) => {
  const { forum, year, party, outcome, q, page = 1, limit = 12 } = req.validatedQuery || req.query;

  const filter = { ...PUBLISHED };
  if (forum) filter.forum = forum;
  if (year) filter.year = Number(year);
  if (party) filter.partyRepresented = party;
  if (outcome) filter.outcome = outcome;
  if (q) {
    const safe = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ title: rx }, { summary: rx }];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    CaseModel.find(filter)
      // Summary projection only — the body is never sent to a list view.
      // anonymised has to be here for the card to know whether it may show
      // the real title; it was missing before, which is exactly how an
      // anonymised case ended up showing its real title on the card.
      .select('title slug forum year partyRepresented opposingParty country outcome summary holding anonymised featuredImage practiceArea publishedAt')
      .populate([
        { path: 'featuredImage', select: MEDIA_FIELDS },
        // The template's case cards carry a category line under the title.
        { path: 'practiceArea', select: 'title slug' },
      ])
      .sort('-year -publishedAt')
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CaseModel.countDocuments(filter),
  ]);

  publicCache(res, 300);
  return ok(res, items, {
    page: Number(page),
    limit: Number(limit),
    total,
    pages: Math.ceil(total / Number(limit)) || 1,
  });
});

/** Powers the archive's filter controls without downloading the archive. */
export const caseFilters = asyncHandler(async (req, res) => {
  const [forums, years, parties, outcomes] = await Promise.all([
    CaseModel.distinct('forum', PUBLISHED),
    CaseModel.distinct('year', PUBLISHED),
    CaseModel.distinct('partyRepresented', PUBLISHED),
    CaseModel.distinct('outcome', PUBLISHED),
  ]);

  publicCache(res, 900);
  return ok(res, {
    forums: forums.sort(),
    years: years.sort((a, b) => b - a),
    parties: parties.sort(),
    outcomes: outcomes.sort(),
  });
});

export const getCase = asyncHandler(async (req, res) => {
  const found = await CaseModel.findBySlug(req.params.slug, PUBLISHED)
    .populate([
      { path: 'featuredImage', select: MEDIA_FIELDS },
      { path: 'practiceArea', select: 'title slug' },
      { path: 'authors', select: 'name slug role photo', populate: { path: 'photo', select: MEDIA_FIELDS } },
      { path: 'seo.ogImage', select: MEDIA_FIELDS },
    ])
    .lean();
  if (!found) throw ApiError.notFound('Case not found');

  publicCache(res, 600);
  return ok(res, found, canonicalRedirect(found, req.params.slug));
});

/* ------------------------------- articles ------------------------------- */

export const listArticles = asyncHandler(async (req, res) => {
  const { category, tag, q, page = 1, limit = 9 } = req.validatedQuery || req.query;

  const filter = { ...PUBLISHED };
  if (tag) filter.tags = tag;
  if (q) {
    const safe = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ title: rx }, { excerpt: rx }];
  }
  if (category) {
    const { default: Category } = await import('../models/Category.js');
    const cat = await Category.findOne({ slug: category }).select('_id').lean();
    if (!cat) return ok(res, [], { page: 1, limit: Number(limit), total: 0, pages: 1 });
    filter.category = cat._id;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Article.find(filter)
      .select('title slug excerpt featuredImage author authors category tags publishedAt readingMinutes')
      .populate([
        { path: 'featuredImage', select: MEDIA_FIELDS },
        { path: 'author', select: 'name slug role photo', populate: { path: 'photo', select: MEDIA_FIELDS } },
        { path: 'authors', select: 'name slug role photo', populate: { path: 'photo', select: MEDIA_FIELDS } },
        { path: 'category', select: 'name slug' },
      ])
      .sort('-publishedAt')
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Article.countDocuments(filter),
  ]);

  // The sidebar's recent-article list shows a comment count. One grouped
  // query for the whole page of results, not one per article.
  const counts = await commentCounts(items.map((a) => a._id));
  for (const item of items) item.commentCount = counts.get(String(item._id)) || 0;

  publicCache(res, 300);
  return ok(res, items, {
    page: Number(page),
    limit: Number(limit),
    total,
    pages: Math.ceil(total / Number(limit)) || 1,
  });
});

export const getArticle = asyncHandler(async (req, res) => {
  const article = await Article.findBySlug(req.params.slug, PUBLISHED)
    .populate([
      { path: 'featuredImage', select: MEDIA_FIELDS },
      { path: 'author', select: 'name slug role photo bio', populate: { path: 'photo', select: MEDIA_FIELDS } },
      { path: 'authors', select: 'name slug role photo bio', populate: { path: 'photo', select: MEDIA_FIELDS } },
      { path: 'category', select: 'name slug' },
      { path: 'seo.ogImage', select: MEDIA_FIELDS },
    ])
    .lean();
  if (!article) throw ApiError.notFound('Article not found');

  // Three light related articles, fetched in the same request rather than
  // leaving the client to make a second round trip.
  const related = await Article.find({
    ...PUBLISHED,
    _id: { $ne: article._id },
    ...(article.category ? { category: article.category._id } : {}),
  })
    .select('title slug excerpt featuredImage publishedAt')
    .populate({ path: 'featuredImage', select: MEDIA_FIELDS })
    .sort('-publishedAt')
    .limit(3)
    .lean();

  publicCache(res, 600);
  return ok(res, { ...article, related }, canonicalRedirect(article, req.params.slug));
});

/* -------------------------------- lawyers ------------------------------- */

/** The first `max` characters of rich text, as plain text, ending on a word. */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

function preview(html, max = 220) {
  // Plain text for React to escape itself, so entities are decoded here.
  const text = toPlainText(html || '').replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e) => ENTITIES[e]);
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

export const listLawyers = asyncHandler(async (req, res) => {
  const lawyers = await Lawyer.find(PUBLISHED)
    .select('name slug role quote photo order socials bio')
    .populate({ path: 'photo', select: MEDIA_FIELDS })
    .sort('order name')
    .lean();

  // Cards show a short plain-text preview; the full rich-text bio stays on
  // the profile page, so the list payload stays small.
  const items = lawyers.map(({ bio, ...lawyer }) => ({ ...lawyer, bioPreview: preview(bio) }));

  publicCache(res, 600);
  return ok(res, items);
});

export const getLawyer = asyncHandler(async (req, res) => {
  const lawyer = await Lawyer.findBySlug(req.params.slug, PUBLISHED)
    .populate([
      { path: 'photo', select: MEDIA_FIELDS },
      { path: 'practiceAreas', select: 'title slug' },
      { path: 'seo.ogImage', select: MEDIA_FIELDS },
    ])
    .lean();
  if (!lawyer) throw ApiError.notFound('Lawyer not found');

  // Their most recent writing, previewed at the foot of the profile.
  lawyer.articles = await Article.find({ ...PUBLISHED, $or: [{ authors: lawyer._id }, { author: lawyer._id }] })
    .select('title slug excerpt featuredImage category publishedAt readingMinutes')
    .populate([{ path: 'featuredImage', select: MEDIA_FIELDS }, { path: 'category', select: 'name slug' }])
    .sort('-publishedAt')
    .limit(3)
    .lean();

  publicCache(res, 600);
  return ok(res, lawyer, canonicalRedirect(lawyer, req.params.slug));
});

/* ------------------------------- gallery -------------------------------- */

export const listGallery = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 24, 60);

  const items = await GalleryItem.find(PUBLISHED)
    .select('title description image location takenAt order')
    .populate({ path: 'image', select: MEDIA_FIELDS })
    .sort('order -createdAt')
    .limit(limit)
    .lean();

  // An entry whose image was deleted from the library would render an empty
  // tile, so it is dropped rather than shown.
  publicCache(res, 300);
  return ok(res, items.filter((item) => item.image));
});

/* ------------------------------- careers -------------------------------- */

export const listVacancies = asyncHandler(async (req, res) => {
  // A vacancy past its closing date drops out of the listing but keeps its own
  // page working, so links already shared do not break.
  const open = {
    ...PUBLISHED,
    $or: [{ closingDate: { $exists: false } }, { closingDate: null }, { closingDate: { $gte: new Date() } }],
  };

  const vacancies = await Vacancy.find(open)
    .select('title slug department location workplaceType employmentType summary salaryRange closingDate order publishedAt')
    .sort('order -publishedAt')
    .lean();

  publicCache(res, 300);
  return ok(res, vacancies);
});

export const getVacancy = asyncHandler(async (req, res) => {
  const vacancy = await Vacancy.findBySlug(req.params.slug, PUBLISHED)
    .populate({ path: 'seo.ogImage', select: MEDIA_FIELDS })
    .lean({ virtuals: true });
  if (!vacancy) throw ApiError.notFound('Vacancy not found');

  // The virtual does not survive .lean(), so it is derived here for the client.
  const isClosed = Boolean(vacancy.closingDate && new Date(vacancy.closingDate).getTime() < Date.now());

  publicCache(res, 300);
  return ok(res, { ...vacancy, isClosed }, canonicalRedirect(vacancy, req.params.slug));
});

/* ----------------------------- testimonials ----------------------------- */

export const listTestimonials = asyncHandler(async (req, res) => {
  const items = await Testimonial.find(PUBLISHED)
    .select('quote name position photo order')
    .populate({ path: 'photo', select: MEDIA_FIELDS })
    .sort('order -createdAt')
    .limit(30)
    .lean();

  publicCache(res, 600);
  return ok(res, items);
});

/* --------------------------- blog taxonomy ------------------------------ */

/** Categories that actually have published articles, for the sidebar. */
export const listCategories = asyncHandler(async (req, res) => {
  const used = await Article.distinct('category', PUBLISHED);
  const categories = await Category.find({ _id: { $in: used } })
    .select('name slug')
    .sort('name')
    .lean();

  publicCache(res, 900);
  return ok(res, categories);
});

/** Distinct tags on published articles, for the tag cloud. */
export const listTags = asyncHandler(async (req, res) => {
  const tags = await Article.distinct('tags', PUBLISHED);
  publicCache(res, 900);
  return ok(res, tags.filter(Boolean).sort((a, b) => a.localeCompare(b)).slice(0, 40));
});

/* ------------------------------ newsletter ------------------------------ */

const hashIp = (ip) => crypto.createHash('sha256').update(`${ip}:${env.accessSecret}`).digest('hex');

export const subscribe = asyncHandler(async (req, res) => {
  const { email, company } = req.body;

  // Honeypot: answer exactly as for a real sign-up so a bot learns nothing.
  if (company) return created(res, { subscribed: true });

  // Signing up twice is not an error, and re-subscribing someone who left is
  // what they asked for. Either way the response is the same, so the form
  // cannot be used to find out whether an address is already on the list.
  await Subscriber.updateOne(
    { email },
    { $set: { status: 'subscribed', ipHash: hashIp(req.ip) } },
    { upsert: true },
  );

  return created(res, { subscribed: true });
});

/* ------------------------------- comments ------------------------------- */

async function commentCounts(articleIds) {
  if (!articleIds.length) return new Map();
  const rows = await Comment.aggregate([
    { $match: { article: { $in: articleIds }, status: 'approved' } },
    { $group: { _id: '$article', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

async function findPublishedArticle(slug) {
  const article = await Article.findBySlug(slug, PUBLISHED).select('_id slug').lean();
  if (!article) throw ApiError.notFound('Article not found');
  return article;
}

/**
 * Approved comments, oldest first, with replies nested under their parent —
 * the shape the template's threaded comment list renders.
 * Email addresses are personal data and are never returned.
 */
export const listComments = asyncHandler(async (req, res) => {
  const article = await findPublishedArticle(req.params.slug);

  const rows = await Comment.find({ article: article._id, status: 'approved' })
    .select('parent name website message createdAt')
    .sort('createdAt')
    .limit(500)
    .lean();

  const byId = new Map(rows.map((c) => [String(c._id), { ...c, replies: [] }]));
  const roots = [];
  for (const comment of byId.values()) {
    const parent = comment.parent && byId.get(String(comment.parent));
    if (parent) parent.replies.push(comment);
    else roots.push(comment);
  }

  // Comments change as they are approved; keep the edge cache short.
  publicCache(res, 60);
  return ok(res, roots, { total: rows.length });
});

export const createComment = asyncHandler(async (req, res) => {
  const { phone, parent, ...payload } = req.body;
  const article = await findPublishedArticle(req.params.slug);

  // Honeypot: indistinguishable from a real submission.
  if (phone) return created(res, { received: true, status: 'pending' });

  // A reply must answer an approved comment on this same article.
  if (parent) {
    const exists = await Comment.exists({ _id: parent, article: article._id, status: 'approved' });
    if (!exists) throw ApiError.badRequest('That comment cannot be replied to');
  }

  await Comment.create({
    ...payload,
    article: article._id,
    parent: parent || null,
    status: 'pending',
    ipHash: hashIp(req.ip),
  });

  return created(res, { received: true, status: 'pending' });
});

/* ------------------------------- enquiries ------------------------------ */

export const createEnquiry = asyncHandler(async (req, res) => {
  const { website, ...payload } = req.body;

  // Honeypot. Respond exactly as for a success so a bot learns nothing.
  if (website) return created(res, { received: true });

  const enquiry = await Enquiry.create({
    ...payload,
    ipHash: crypto
      .createHash('sha256')
      .update(`${req.ip}:${env.accessSecret}`)
      .digest('hex'),
    userAgent: (req.get('user-agent') || '').slice(0, 400),
  });

  // Notify the firm. Awaited because a serverless function can be frozen as
  // soon as it responds; it never throws, so the visitor still gets a success.
  const settings = await SiteSettings.getSingleton();
  await sendEnquiryEmail({
    to: settings.enquiryRecipient || settings.contact?.email,
    enquiry,
  });

  return created(res, { received: true });
});

/* -------------------------------- sitemap ------------------------------- */

const SITEMAP_SECTIONS = [
  ['services', '/services', 0.7],
  ['cases', '/record', 0.8],
  ['articles', '/articles', 0.8],
  ['lawyers', '/lawyers', 0.6],
  ['vacancies', '/careers', 0.6],
];

const SITEMAP_STATIC = [
  ['/', 1.0, 'weekly'],
  ['/services', 0.9, 'monthly'],
  ['/record', 0.9, 'weekly'],
  ['/articles', 0.9, 'weekly'],
  ['/about', 0.7, 'monthly'],
  ['/lawyers', 0.6, 'monthly'],
  ['/careers', 0.6, 'weekly'],
  ['/contact', 0.7, 'yearly'],
  ['/privacy-policy', 0.3, 'yearly'],
];

function xmlEscape(value = '') {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Serves sitemap.xml directly, so publishing an article updates it within the
 * cache window instead of waiting for the next frontend deploy. The public site
 * rewrites /sitemap.xml here.
 */
export const sitemapXml = asyncHandler(async (req, res) => {
  const site = (process.env.PUBLIC_SITE_URL || env.publicSiteUrl).replace(/\/$/, '');

  const [services, cases, articles, lawyers, vacancies] = await Promise.all([
    Service.find(PUBLISHED).select('slug updatedAt').lean(),
    CaseModel.find(PUBLISHED).select('slug updatedAt').lean(),
    Article.find(PUBLISHED).select('slug updatedAt').lean(),
    Lawyer.find(PUBLISHED).select('slug updatedAt').lean(),
    // A closed role is not a page worth submitting for crawling.
    Vacancy.find({
      ...PUBLISHED,
      $or: [{ closingDate: { $exists: false } }, { closingDate: null }, { closingDate: { $gte: new Date() } }],
    }).select('slug updatedAt').lean(),
  ]);
  const bySection = { services, cases, articles, lawyers, vacancies };

  const entry = (loc, { lastmod, priority, changefreq }) => [
    '  <url>',
    `    <loc>${xmlEscape(site + loc)}</loc>`,
    lastmod ? `    <lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n');

  const urls = [
    ...SITEMAP_STATIC.map(([loc, priority, changefreq]) => entry(loc, { priority, changefreq })),
    ...SITEMAP_SECTIONS.flatMap(([key, prefix, priority]) => (bySection[key] || [])
      .map((doc) => entry(`${prefix}/${doc.slug}`, { lastmod: doc.updatedAt, priority, changefreq: 'monthly' }))),
  ];

  publicCache(res, 900);
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
  );
});

/** robots.txt, pointing at the sitemap on the public domain. */
export const robotsTxt = asyncHandler(async (req, res) => {
  const site = (process.env.PUBLIC_SITE_URL || env.publicSiteUrl).replace(/\/$/, '');
  publicCache(res, 3600);
  res.type('text/plain').send(`User-agent: *
Allow: /

Sitemap: ${site}/sitemap.xml
`);
});

export const sitemapData = asyncHandler(async (req, res) => {
  const [services, cases, articles, lawyers, pages, vacancies] = await Promise.all([
    Service.find(PUBLISHED).select('slug updatedAt').lean(),
    CaseModel.find(PUBLISHED).select('slug updatedAt').lean(),
    Article.find(PUBLISHED).select('slug updatedAt').lean(),
    Lawyer.find(PUBLISHED).select('slug updatedAt').lean(),
    Page.find(PUBLISHED).select('slug updatedAt').lean(),
    Vacancy.find(PUBLISHED).select('slug updatedAt').lean(),
  ]);

  publicCache(res, 3600);
  return ok(res, { pages, services, cases, articles, lawyers, vacancies });
});
