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
import { PAGE_BLUEPRINTS } from '../src/config/pageBlueprints.js';

// Every built-in page, with the section KEYS its blueprint lists and no invented
// wording. The keys are the contract between the React pages and the content;
// the words are the firm's. Seeding placeholder prose here would also block
// `seed:content`, which fills empty fields and never overwrites existing ones.
const PAGES = PAGE_BLUEPRINTS.map((b) => ({
  slug: b.slug,
  title: b.title,
  status: 'published',
  sections: b.sections.map((section) => ({ key: section.key })),
}));

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

/**
 * Record and Insights used to share one page, `record-insights`, whose single
 * introduction served both. They are now separate pages. Carry the old intro
 * text and image across to whichever new page has not been written yet, so no
 * edited content is lost. The old page is left in place for an administrator
 * to delete once they are happy.
 */
async function splitRecordInsights() {
  const legacy = await Page.findOne({ slug: 'record-insights' }).lean();
  const intro = legacy?.sections?.find((s) => s.key === 'intro');
  if (!intro) return;

  for (const slug of ['record', 'insights']) {
    const page = await Page.findOne({ slug });
    if (!page) continue;
    const target = page.sections.find((s) => s.key === 'intro');
    const banner = page.sections.find((s) => s.key === 'hero');
    let touched = false;
    if (target && !target.body && intro.body) { target.body = intro.body; touched = true; }
    if (banner && !banner.image && intro.image) { banner.image = intro.image; touched = true; }
    if (touched) await page.save();
  }
}

/**
 * Business hours and the copyright line used to be site settings. The footer
 * now takes them from the layout page. Copy them across once, only where the
 * layout is still empty, so later edits are never overwritten. A year in the
 * old copyright line becomes the {year} token so it stays current.
 */
async function moveFooterSettings() {
  const settings = await SiteSettings.getSingleton();
  const layout = await Page.findOne({ slug: 'layout' });
  if (!layout) return;
  let touched = false;

  const oldHours = settings.contact?.businessHours || [];
  const hours = layout.sections.find((s) => s.key === 'hours');
  if (hours && !hours.items?.length && oldHours.length) {
    hours.items = oldHours.map((h) => ({ title: h.label, text: h.value }));
    touched = true;
  }

  const footer = layout.sections.find((s) => s.key === 'footer');
  if (footer && settings.copyrightText && !footer.labels?.get('copyright')) {
    footer.labels = footer.labels || new Map();
    footer.labels.set('copyright', settings.copyrightText.replace(/\b(19|20)\d{2}\b/, '{year}'));
    touched = true;
  }

  if (touched) await layout.save();
}

async function main() {
  await connectDB();
  let createdPages = 0;

  let addedSections = 0;

  for (const page of PAGES) {
    const result = await Page.updateOne(
      { slug: page.slug },
      { $setOnInsert: page },
      { upsert: true },
    );
    if (result.upsertedCount) {
      createdPages += 1;
      continue;
    }
    // An existing page gains any section added to its blueprint since it was
    // created. Sections already present, and their content, are left alone.
    const existing = await Page.findOne({ slug: page.slug }).select('sections.key').lean();
    const have = new Set(existing.sections.map((s) => s.key));
    const missing = page.sections.filter((s) => !have.has(s.key));
    if (missing.length) {
      await Page.updateOne({ slug: page.slug }, { $push: { sections: { $each: missing } } });
      addedSections += missing.length;
    }
  }

  await splitRecordInsights();
  await moveFooterSettings();

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

  console.log(`  Seed complete. ${createdPages} page(s) created, ${addedSections} section(s) added, navigation and categories ensured.`);
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
