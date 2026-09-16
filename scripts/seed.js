#!/usr/bin/env node
/**
 * Seeds the structural content the site needs to render: the fixed pages,
 * navigation and site settings, plus a small amount of representative content.
 *
 * Idempotent — existing documents are left alone, so this is safe to re-run and
 * will never overwrite an administrator's edits.
 *
 *   npm run seed
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import SiteSettings from '../src/models/SiteSettings.js';
import Navigation from '../src/models/Navigation.js';
import Page from '../src/models/Page.js';
import Category from '../src/models/Category.js';

const PAGES = [
  {
    slug: 'home',
    title: 'Home',
    status: 'published',
    sections: [
      // Section KEYS only, with no invented wording. The keys are the contract
      // between the React components and the content; the words are the firm's.
      // Seeding placeholder prose here would also block `seed:content`, which
      // fills empty fields and never overwrites existing ones.
      { key: 'hero' },
      { key: 'intro' },
      { key: 'services' },
      { key: 'record' },
      { key: 'gallery' },
      { key: 'insights' },
      { key: 'cta' },
    ],
  },
  { slug: 'services', title: 'Services', status: 'published', sections: [{ key: 'intro' }] },
  { slug: 'about', title: 'About', status: 'published', sections: [{ key: 'intro' }, { key: 'team' }] },
  { slug: 'contact', title: 'Contact', status: 'published', sections: [{ key: 'intro' }] },
  {
    slug: 'careers',
    title: 'Careers',
    status: 'published',
    sections: [{ key: 'intro' }],
  },
  { slug: 'privacy-policy', title: 'Privacy Policy', status: 'published', sections: [{ key: 'body' }] },
  { slug: 'record-insights', title: 'Record & Insights', status: 'published', sections: [{ key: 'intro' }] },
];

const HEADER_NAV = [
  { label: 'Home', href: '/', order: 0 },
  { label: 'Services', href: '/services', order: 1 },
  { label: 'Record', href: '/record', order: 2 },
  { label: 'Insights', href: '/insights', order: 3 },
  { label: 'About', href: '/about', order: 4 },
  { label: 'Careers', href: '/careers', order: 5 },
  { label: 'Contact', href: '/contact', order: 6 },
];

const FOOTER_NAV = [
  { label: 'Services', href: '/services', order: 0 },
  { label: 'Record', href: '/record', order: 1 },
  { label: 'Insights', href: '/insights', order: 2 },
  { label: 'About', href: '/about', order: 3 },
  { label: 'Careers', href: '/careers', order: 4 },
  { label: 'Contact', href: '/contact', order: 5 },
  { label: 'Privacy Policy', href: '/privacy-policy', order: 6 },
];

const CATEGORIES = [
  { name: 'Regulatory', slug: 'regulatory' },
  { name: 'Disputes', slug: 'disputes' },
  { name: 'Contracts', slug: 'contracts' },
  { name: 'Governance', slug: 'governance' },
];

async function main() {
  await connectDB();
  let createdPages = 0;

  for (const page of PAGES) {
    const result = await Page.updateOne(
      { slug: page.slug },
      { $setOnInsert: page },
      { upsert: true },
    );
    if (result.upsertedCount) createdPages += 1;
  }

  for (const location of ['header', 'footer']) {
    const items = location === 'header' ? HEADER_NAV : FOOTER_NAV;
    await Navigation.updateOne(
      { location },
      { $setOnInsert: { location, items } },
      { upsert: true },
    );
  }

  for (const cat of CATEGORIES) {
    await Category.updateOne({ slug: cat.slug }, { $setOnInsert: cat }, { upsert: true });
  }

  const settings = await SiteSettings.getSingleton();
  if (!settings.copyrightText) {
    settings.siteName = settings.siteName || 'PCN Sportiva LP';
    settings.copyrightText = `© ${new Date().getFullYear()} PCN Sportiva LP. All rights reserved.`;
    await settings.save();
  }

  console.log(`  Seed complete. ${createdPages} page(s) created, navigation and categories ensured.`);
  console.log('  Existing content was left untouched.');
}

main()
  .catch((err) => {
    console.error(`  Seed failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB();
    await mongoose.connection.close().catch(() => {});
    process.exit(process.exitCode || 0);
  });
