#!/usr/bin/env node
/**
 * Populates the site with the firm's own content, recovered from the previous
 * pcnsportivalp.com build.
 *
 * The old site kept its articles in Firestore but hardcoded everything else —
 * the about copy, the service descriptions, the team — inside its JavaScript
 * bundle. Those strings are reproduced here so the new site launches with the
 * firm's real words rather than placeholder text.
 *
 *   npm run seed:content
 *
 * Idempotent, and it never overwrites an edit made in the dashboard: anything
 * that already exists is left exactly as it is. Run `npm run import:firebase`
 * for the articles.
 */
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import SiteSettings from '../src/models/SiteSettings.js';
import Page from '../src/models/Page.js';
import Media from '../src/models/Media.js';
import Service from '../src/models/Service.js';
import Lawyer from '../src/models/Lawyer.js';
import Category from '../src/models/Category.js';
import { slugify } from '../src/lib/slug.js';
import { cleanHtml } from '../src/lib/sanitize.js';

const publish = process.argv.includes('--publish');

/* ------------------------------ the firm -------------------------------- */

/*
 * Both of these were rewritten. The originals ran long, opened mid-thought
 * ("We also represent clients…" with nothing before it) and carried phrases the
 * firm had not agreed to — "masterful range of clients", "pushing the envelope
 * towards the pacific". The substance is unchanged; the length is roughly
 * halved. Pending the firm's sign-off — see FRONT-END/docs/firm-review-required.md.
 */

const ABOUT_INTRO = 'A boutique sports law practice. We act for players, coaches, clubs and '
  + 'federations across Africa, on every legal question the sports industry raises.';

const ABOUT_TEAM = 'Our lawyers work across all of the firm\'s practice areas, advising '
  + 'international federations, national associations, football and basketball clubs, licensed '
  + 'coaches, intermediaries and athletes.';

const ABOUT_REPRESENTATION = 'We act for players, coaches, clubs and federations from the first '
  + 'contract through to the tribunal, and we appear before the bodies that decide these '
  + 'matters rather than referring them out.';

const SERVICES_HEADING = 'We cover legal services in the area of sports law.';

const SERVICES = [
  {
    title: 'Sports Dispute Resolution',
    icon: 'flaticon-auction',
    summary: 'Representation before sports tribunals on overdue payables, training compensation, '
      + 'solidarity contribution, contractual disputes and disciplinary matters.',
    body: '<p>We represent our clients on matters relating to but not limited to overdue payables, '
      + 'training compensation, solidarity contribution, contractual disputes, disciplinary and '
      + 'ethical issues, before various sports dispute resolution bodies.</p>',
  },
  {
    title: 'Contracts and Transfers',
    icon: 'flaticon-handshake',
    summary: 'Drafting and negotiating employment contracts, player transfers, image rights and '
      + 'intermediary agreements.',
    body: '<p>Drafting contracts in the areas of employment law, transfer of players, image rights '
      + 'and intermediary activity.</p>',
  },
  {
    title: 'Sports Governance',
    icon: 'flaticon-shield',
    summary: 'Advising governing bodies on good governance, legal structure and the status of '
      + 'member associations under national law.',
    body: '<p>Advising sports governing bodies on good governance issues affecting resident member '
      + 'associations, including issues relating to the legal structure and status of member '
      + 'associations under national laws.</p>',
  },
  {
    title: 'Player Representation',
    icon: 'flaticon-lawyer',
    summary: 'Negotiating and concluding contracts on behalf of players, including under the FIBA '
      + 'Regulations Governing Players Agents.',
    body: '<p>Negotiating and concluding contracts on behalf of basketball players under Article '
      + '3-137 of the FIBA Regulations Governing Players Agents.</p>',
  },
  {
    title: 'Sports Infrastructure Advisory',
    icon: 'flaticon-house',
    summary: 'Investment advisory for academies, stadium and facility development, and related '
      + 'construction arrangements.',
    body: '<p>Football infrastructure investment advisory, including the setting-up of academies, '
      + 'football and construction projects.</p>',
  },
  {
    title: 'Data Protection and Technology',
    icon: 'flaticon-medal',
    summary: 'Cyber security and data protection policies, and intellectual property protection '
      + 'for sports software and applications.',
    body: '<p>Development of compliant cyber security and data protection policies. IP protection '
      + 'of sports software and apps, and development of the attendant transaction documents.</p>',
  },
];

const TEAM = [
  {
    name: 'Pius Ndubuokwu',
    role: 'Managing Partner',
    bio: `<p>${ABOUT_TEAM}</p><p>Pius leads the firm's practice across dispute resolution, `
      + 'governance and player representation, appearing before domestic and international '
      + 'sporting tribunals.</p>',
    order: 0,
  },
  {
    name: 'Chijioke Okpanku',
    role: 'Partner',
    bio: '<p>Chijioke advises clubs, athletes and intermediaries on contractual and regulatory '
      + 'matters, and writes regularly on developments in football regulation.</p>',
    order: 1,
  },
];

const CATEGORIES = [
  { name: 'News', slug: 'news', description: 'Firm announcements, transfers and mandates.' },
  { name: 'Analysis', slug: 'analysis', description: 'Long-form commentary on sports law and regulation.' },
];

/* --------------------------------- run ---------------------------------- */

const report = { created: [], skipped: [] };

async function ensure(Model, query, build, label) {
  const existing = await Model.findOne(query);
  if (existing) {
    report.skipped.push(label);
    return existing;
  }
  const doc = await Model.create(build());
  report.created.push(label);
  return doc;
}

async function main() {
  await connectDB();
  const status = publish ? 'published' : 'draft';

  /* --- site settings: only fill blanks, never overwrite --- */
  const settings = await SiteSettings.getSingleton();
  const before = JSON.stringify(settings.toObject());
  settings.siteName = settings.siteName || 'PCN Sportiva LP';
  if (!settings.tagline) settings.tagline = 'Sports Law';
  if (!settings.seoDefaults?.metaDescription) {
    settings.seoDefaults = {
      ...settings.seoDefaults,
      metaDescription: ABOUT_INTRO.slice(0, 195),
    };
  }
  if (!settings.copyrightText) {
    settings.copyrightText = `© ${new Date().getFullYear()} PCN Sportiva LP. All rights reserved.`;
  }
  if (JSON.stringify(settings.toObject()) !== before) {
    await settings.save();
    report.created.push('site settings');
  } else {
    report.skipped.push('site settings');
  }

  /* --- categories --- */
  for (const cat of CATEGORIES) {
    await ensure(Category, { slug: cat.slug }, () => cat, `category: ${cat.name}`);
  }

  /* --- services --- */
  for (const [i, s] of SERVICES.entries()) {
    const slug = slugify(s.title);
    await ensure(Service, { slug }, () => ({
      ...s, slug, body: cleanHtml(s.body), order: i, status,
    }), `service: ${s.title}`);
  }

  /* --- team --- */
  for (const member of TEAM) {
    const slug = slugify(member.name);
    await ensure(Lawyer, { slug }, () => ({
      ...member, slug, bio: cleanHtml(member.bio), status,
    }), `team: ${member.name}`);
  }

  /* --- page copy: fill only sections the firm has not written yet --- */
  const pageCopy = {
    home: {
      hero: {
        subheading: 'PCN Sportiva LP',
        heading: 'Sports law, across Africa and beyond.',
        body: ABOUT_INTRO,
        cta: { label: 'Speak to us', href: '/contact' },
      },
      // The mission-statement paragraph was cut; the About block carries the
      // firm's own words without restating them as a mission.
      intro: { heading: 'Our mission', body: ABOUT_TEAM },
      services: { subheading: 'Services', heading: SERVICES_HEADING, body: ABOUT_REPRESENTATION },
      record: { subheading: 'Outcomes', heading: 'Our record' },
      gallery: { subheading: 'The firm at work', heading: 'Gallery' },
      insights: { subheading: 'Latest writing', heading: 'News & Insights' },
      cta: {
        heading: 'Discuss a matter',
        body: 'Feel free to reach out for professional representation, or to leave feedback.',
        cta: { label: 'Contact the firm', href: '/contact' },
      },
    },
    about: {
      intro: { subheading: 'About', heading: 'About the firm', body: ABOUT_INTRO },
      team: { subheading: 'Our people', heading: 'The team', body: ABOUT_TEAM },
    },
    services: { intro: { heading: 'Services', body: ABOUT_REPRESENTATION } },
    contact: {
      intro: {
        heading: 'Contact us',
        body: 'Feel free to reach out for professional representation, or to leave feedback.',
      },
    },
    careers: {
      intro: {
        heading: 'Careers',
        body: 'Our team of experienced lawyers is committed to providing exceptional sports law '
          + 'services. Think you can be one of us?',
      },
    },
    'record-insights': {
      intro: {
        heading: 'Record & Insights',
        body: 'A record of the matters we have handled, and our commentary on the regulation of sport.',
      },
    },
  };

  for (const [slug, sections] of Object.entries(pageCopy)) {
    const page = await Page.findOne({ slug });
    if (!page) { report.skipped.push(`page: ${slug} (not seeded)`); continue; }

    let touched = false;
    for (const [key, copy] of Object.entries(sections)) {
      let section = page.sections.find((s) => s.key === key);
      if (!section) {
        page.sections.push({ key });
        section = page.sections[page.sections.length - 1];
      }
      // Only fill what is still empty — an administrator's wording always wins.
      for (const field of ['heading', 'subheading', 'body']) {
        if (copy[field] && !section[field]) { section[field] = copy[field]; touched = true; }
      }
      if (copy.cta && !section.cta?.label) { section.cta = copy.cta; touched = true; }
    }
    if (publish && page.status !== 'published') { page.status = 'published'; touched = true; }
    if (touched) { await page.save(); report.created.push(`page: ${slug}`); }
    else report.skipped.push(`page: ${slug}`);
  }

  /* --- rewritten copy: replace the old seeded wording, nothing else --- */

  /*
   * The blocks above only ever fill blanks, so a field already holding the old
   * text would keep it forever. These replace that text — and only that text.
   * If an administrator has since edited the field, the stored value will not
   * match and the rewrite is skipped, so their wording still wins.
   */
  const REWRITES = [
    {
      slug: 'home',
      key: 'services',
      field: 'body',
      from: 'We also represent clients before relevant international sports tribunals and '
        + 'decision making bodies on matters relating to our service areas. Our team members '
        + 'lead the development of Sports law practice in Africa, pushing the envelope towards '
        + 'the pacific and Europe.',
      to: ABOUT_REPRESENTATION,
    },
    {
      // The firm's own wording, replacing the interim rewrite. Dropping the
      // "Four practice areas" opener also settles the count question raised in
      // firm-review-required.md: the sentence no longer claims a number.
      slug: 'home',
      key: 'services',
      field: 'body',
      from: 'Four practice areas, one firm. We act for players, coaches, clubs and federations '
        + 'from the first contract through to the tribunal, and we appear before the bodies '
        + 'that decide these matters rather than referring them out.',
      to: ABOUT_REPRESENTATION,
    },
    {
      slug: 'home',
      key: 'services',
      field: 'heading',
      from: 'What we do',
      to: SERVICES_HEADING,
    },
    {
      slug: 'home',
      key: 'services',
      field: 'heading',
      from: 'Protecting Your Rights With Expertise,',
      to: SERVICES_HEADING,
    },
    {
      slug: 'home',
      key: 'intro',
      field: 'body',
      from: "PCN SPORTIVA LP's ultimate mission is to provide comprehensive and integrated "
        + 'sports legal advice and representation to clients, who want optimal levels of skill '
        + 'and expertise to match their resources.',
      to: ABOUT_TEAM,
    },
    {
      slug: 'home',
      key: 'hero',
      field: 'body',
      from: 'We operate a boutique Sports Law practice and provide a comprehensive range of '
        + 'legal services throughout the African region, covering all areas relevant to the '
        + 'sports industry.',
      to: ABOUT_INTRO,
    },
    {
      slug: 'about',
      key: 'intro',
      field: 'body',
      from: 'We operate a boutique Sports Law practice and provide a comprehensive range of '
        + 'legal services throughout the African region, covering all areas relevant to the '
        + 'sports industry.',
      to: ABOUT_INTRO,
    },
    {
      slug: 'about',
      key: 'team',
      field: 'body',
      from: "We are a team of experienced Lawyers who work across the Firm's service areas. We "
        + 'provide specialized and custom-tailored sports law advice to international sports '
        + 'federations, national associations, football clubs, basketball clubs, licensed '
        + 'coaches, licensed intermediaries, athletes and public agencies.',
      to: ABOUT_TEAM,
    },
  ];

  for (const r of REWRITES) {
    const doc = await Page.findOne({ slug: r.slug });
    const sec = doc?.sections.find((s) => s.key === r.key);
    const label = `copy: ${r.slug}.${r.key}.${r.field}`;
    if (!sec) { report.skipped.push(`${label} (no section)`); continue; }
    if (sec[r.field] === r.to) { report.skipped.push(`${label} (already rewritten)`); continue; }
    if (sec[r.field] !== r.from) { report.skipped.push(`${label} (edited in the dashboard)`); continue; }
    sec[r.field] = r.to;
    await doc.save();
    report.created.push(label);
  }

  /*
   * The About block's "Our Mission" tab restated in forty words what the intro
   * already says, so it goes. "Who We Advise" and "Our Record" remain, both of
   * them concrete. Removed only while it still holds the seeded wording.
   */
  const aboutPage = await Page.findOne({ slug: 'about' });
  const aboutIntro = aboutPage?.sections.find((s) => s.key === 'intro');
  const missionItem = aboutIntro?.items?.find((i) => i.title === 'Our Mission');
  if (!missionItem) {
    report.skipped.push('copy: about.intro "Our Mission" (already removed)');
  } else if (!/ultimate mission is to provide comprehensive and integrated/.test(missionItem.text || '')) {
    report.skipped.push('copy: about.intro "Our Mission" (edited in the dashboard)');
  } else {
    aboutIntro.items = aboutIntro.items.filter((i) => i.title !== 'Our Mission');
    await aboutPage.save();
    report.created.push('copy: about.intro "Our Mission" removed');
  }

  /* --- hero slides: the drawn map, then the two photographs --- */

  /*
   * Three slides behind one fixed heading. The first carries no image on
   * purpose — an item with no media is the front end's cue to draw its inline
   * SVG map instead of painting a background.
   *
   * The photographs are local files under FRONT-END/public/hero, so their URLs
   * have no /upload/ segment; thumb() and preview() pass those through
   * untouched, which means this runs without a Cloudinary account.
   */
  const heroMedia = [
    {
      publicId: 'hero-forum',
      secureUrl: '/hero/hero-forum.jpg',
      resourceType: 'image',
      width: 1920,
      height: 1080,
      alt: 'Pius Ndubuokwu speaking to Nigerian broadcast media at the Football Law Annual Moot.',
    },
    {
      publicId: 'hero-gift',
      secureUrl: '/hero/hero-gift.jpg',
      resourceType: 'image',
      width: 1920,
      height: 1080,
      alt: 'A certificate of appreciation presented at the Football Law Annual Moot.',
    },
  ];

  const heroMediaIds = {};
  for (const m of heroMedia) {
    // Keyed on publicId, which is unique — re-running cannot duplicate them.
    const doc = await ensure(
      Media,
      { publicId: m.publicId },
      () => ({ ...m, url: m.secureUrl, format: 'jpg', folder: 'hero' }),
      `media: ${m.publicId}`,
    );
    heroMediaIds[m.publicId] = doc._id;
  }

  /*
   * The map slide is the firm's own artwork, not a drawing made in code. The
   * concentric rings over Nigeria are painted into the image, which is why they
   * hold their position on the landmass and never change size: the motion is
   * the hero's own drift and parallax moving the whole layer.
   */
  const mapMedia = await Media.findOne({ publicId: 'pcn-sportiva/hero-beyond' });
  if (!mapMedia) report.skipped.push('media: pcn-sportiva/hero-beyond (missing)');

  const heroSlides = [
    { title: 'the continent', image: mapMedia?._id ?? null },
    { title: 'every forum', image: heroMediaIds['hero-forum'] },
    { title: 'every border', image: heroMediaIds['hero-gift'] },
  ];

  const home = await Page.findOne({ slug: 'home' });
  const heroSection = home?.sections.find((s) => s.key === 'hero');
  if (heroSection) {
    // Title *and* image: comparing titles alone would miss a slide that keeps
    // its phrase but points at a different photograph.
    const key = (i) => `${i.title}:${i.image ? String(i.image._id || i.image) : ''}`;
    const current = (heroSection.items || []).map(key).join('|');
    const wanted = heroSlides.map(key).join('|');
    // So a second run is a no-op rather than an append.
    if (current === wanted) {
      report.skipped.push('page: home hero slides');
    } else {
      heroSection.items = heroSlides;
      await home.save();
      report.created.push('page: home hero slides');
    }
  } else {
    report.skipped.push('page: home hero slides (no hero section)');
  }

  console.log(`\n  Seeded the firm's content${publish ? ' (published)' : ' (as drafts)'}\n`);
  if (report.created.length) {
    console.log('  Added or filled:');
    for (const r of report.created) console.log(`    + ${r}`);
  }
  if (report.skipped.length) {
    console.log(`\n  Left untouched (already present): ${report.skipped.length} item(s)`);
  }
  console.log('\n  Next: npm run import:firebase -- <export.json> for the articles.\n');
}

main()
  .catch((err) => { console.error(`\n  Failed: ${err.message}\n`); process.exitCode = 1; })
  .finally(async () => {
    await disconnectDB();
    await mongoose.connection.close().catch(() => {});
    process.exit(process.exitCode || 0);
  });
