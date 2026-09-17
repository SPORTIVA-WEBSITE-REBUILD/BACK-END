import SiteSettings from '../models/SiteSettings.js';
import Navigation from '../models/Navigation.js';
import Page from '../models/Page.js';
import Service from '../models/Service.js';
import CaseModel from '../models/Case.js';
import Article from '../models/Article.js';
import Lawyer from '../models/Lawyer.js';
import Vacancy from '../models/Vacancy.js';
import GalleryItem from '../models/GalleryItem.js';
import Testimonial from '../models/Testimonial.js';
import Subscriber from '../models/Subscriber.js';
import Comment from '../models/Comment.js';
import Media from '../models/Media.js';
import Enquiry from '../models/Enquiry.js';
import ApiError from '../lib/ApiError.js';
import asyncHandler from '../lib/asyncHandler.js';
import { ok, noStore } from '../lib/respond.js';

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await SiteSettings.getSingleton();
  noStore(res);
  return ok(res, settings);
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await SiteSettings.getSingleton();
  settings.set(req.body);
  await settings.save();
  noStore(res);
  return ok(res, settings);
});

export const getNavigation = asyncHandler(async (req, res) => {
  const { location } = req.params;
  if (!['header', 'footer'].includes(location)) {
    throw ApiError.notFound('Unknown navigation location');
  }
  const nav = await Navigation.findOne({ location })
    || await Navigation.create({ location, items: [] });
  noStore(res);
  return ok(res, nav);
});

export const putNavigation = asyncHandler(async (req, res) => {
  const { location } = req.params;
  if (!['header', 'footer'].includes(location)) {
    throw ApiError.notFound('Unknown navigation location');
  }
  const nav = await Navigation.findOneAndUpdate(
    { location },
    { items: req.body.items },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  noStore(res);
  return ok(res, nav);
});

/** One parallel batch of counts rather than a query per card. */
export const stats = asyncHandler(async (req, res) => {
  const [
    pages, services, cases, casesDraft,
    articles, articlesDraft, lawyers, media, enquiriesNew, vacanciesOpen, galleryPublished,
    testimonials, commentsPending, subscribers,
    recentEnquiries, recentArticles,
  ] = await Promise.all([
    Page.countDocuments(),
    Service.countDocuments(),
    CaseModel.countDocuments({ status: 'published' }),
    CaseModel.countDocuments({ status: 'draft' }),
    Article.countDocuments({ status: 'published' }),
    Article.countDocuments({ status: 'draft' }),
    Lawyer.countDocuments(),
    Media.countDocuments(),
    Enquiry.countDocuments({ status: 'new' }),
    Vacancy.countDocuments({
      status: 'published',
      $or: [{ closingDate: { $exists: false } }, { closingDate: null }, { closingDate: { $gte: new Date() } }],
    }),
    GalleryItem.countDocuments({ status: 'published' }),
    Testimonial.countDocuments({ status: 'published' }),
    Comment.countDocuments({ status: 'pending' }),
    Subscriber.countDocuments({ status: 'subscribed' }),
    Enquiry.find().sort('-createdAt').limit(5).select('name email subject status createdAt').lean(),
    Article.find().sort('-updatedAt').limit(5).select('title slug status updatedAt').lean(),
  ]);

  noStore(res);
  return ok(res, {
    counts: {
      pages, services, cases, casesDraft,
      articles, articlesDraft, lawyers, media, enquiriesNew, vacanciesOpen, galleryPublished,
      testimonials, commentsPending, subscribers,
    },
    recentEnquiries,
    recentArticles,
  });
});
