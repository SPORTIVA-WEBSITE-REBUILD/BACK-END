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
import CaseModel from '../src/models/Case.js';
import Navigation from '../src/models/Navigation.js';
import { slugify } from '../src/lib/slug.js';
import { cleanHtml } from '../src/lib/sanitize.js';

const publish = process.argv.includes('--publish');
// Placeholder colleagues are seeded by default; pass --no-demo-team to skip.
const demoTeam = !process.argv.includes('--no-demo-team');

/* ------------------------------ the firm -------------------------------- */

/*
 * Both of these were rewritten. The originals ran long, opened mid-thought
 * ("We also represent clients…" with nothing before it) and carried phrases the
 * firm had not agreed to — "masterful range of clients", "pushing the envelope
 * towards the pacific". The substance is unchanged; the length is roughly
 * halved. Pending the firm's sign-off — see FRONT-END/docs/firm-review-required.md.
 */

const OLD_ABOUT_INTRO = 'A boutique sports law practice. We act for players, coaches, clubs and '
  + 'federations across Africa, on every legal question the sports industry raises.';

const ABOUT_INTRO = 'A boutique sports law practice. We act for players, coaches, clubs, agencies, and '
  + 'federations across Africa and beyond on every legal question the sports industry raises.';

const ABOUT_TEAM = 'Our lawyers work across all of the firm\'s practice areas, advising '
  + 'international federations, national associations, football and basketball clubs, licensed '
  + 'coaches, intermediaries and athletes.';

const ABOUT_REPRESENTATION = 'We act for players, coaches, clubs and federations from the first '
  + 'contract through to the tribunal, and we appear before the bodies that decide these '
  + 'matters rather than referring them out.';

const SERVICES_HEADING = 'We cover legal services in the area of sports law.';

/*
 * The record tab. It names the forums the firm appears before and who it acts
 * for, and counts nothing — the front end appends a live figure taken from the
 * published cases, so the only number shown can be checked against the archive.
 */
const RECORD_TAB_TEXT = 'Counsel before the FIFA Football Tribunal, the FIFA Dispute Resolution '
  + 'Chamber and the Court of Arbitration for Sport, acting for players, coaches, clubs and '
  + 'federations across Africa and Europe.';

/*
 * The mission tab. The line it replaces spent thirty words saying the firm
 * wants to do a good job at an unspecified "optimal level" — a sentence that
 * could sit on any firm's site unedited. This says what the firm actually does
 * differently, and stays clear of the Record tab's own territory (the forums,
 * the geography): continuity of representation, not where the work happens.
 */
const MISSION_TAB_TEXT = 'We work a matter end to end, from the first contract to a tribunal '
  + 'hearing, so the firm advising you throughout is the same firm representing you when it '
  + 'counts.';

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
  {
    title: 'Anti-Doping',
    icon: 'flaticon-shield',
    summary: 'Advising athletes, clubs, and federations on anti-doping rules, disciplinary '
      + 'proceedings, and regulatory compliance.',
    body: '<p>Advising athletes, clubs, and federations on anti-doping rules, disciplinary '
      + 'proceedings, and regulatory compliance.</p>',
  },
  {
    title: 'Football Law',
    icon: 'football-law',
    summary: 'PCN Sportiva LP provides specialist legal and strategic counsel to football clubs, '
      + 'players, coaches, agents, academies, federations and other stakeholders across the '
      + 'global football industry.',
    body: '<p>PCN Sportiva LP provides specialist legal and strategic counsel to football clubs, '
      + 'players, coaches, agents, academies, federations and other stakeholders across the '
      + 'global football industry.</p>'
      + '<p>Our Football Law practice advises on the full spectrum of legal, regulatory and '
      + 'commercial matters arising in the game, including player and coach contracts, '
      + 'international transfers, registration matters, football agency, training compensation '
      + 'and solidarity contributions, club governance, disciplinary proceedings, regulatory '
      + 'compliance and commercial transactions.</p>'
      + '<p>We also represent clients in complex domestic and international football disputes, '
      + 'including proceedings before national and international football bodies, the FIFA '
      + 'Football Tribunal and the Court of Arbitration for Sport (CAS).</p>'
      + '<p>Combining industry knowledge with a practical understanding of the football '
      + 'ecosystem, we help our clients structure transactions, protect their rights, resolve '
      + 'disputes and navigate the increasingly complex regulatory framework governing modern '
      + 'football.</p>',
  },
  {
    title: 'Gaming, Betting & Esports',
    icon: 'gaming-betting-esports',
    summary: 'PCN Sportiva LP provides specialised legal and regulatory services across the '
      + 'gaming, betting, lottery, casino, interactive gaming, and esports industries.',
    body: '<p>PCN Sportiva LP provides specialised legal and regulatory services across the '
      + 'gaming, betting, lottery, casino, interactive gaming, and esports industries. We advise '
      + 'operators, esports organisations, teams, players, coaches, tournament organisers, '
      + 'publishers, and commercial partners on the legal and commercial issues shaping these '
      + 'rapidly evolving sectors.</p>'
      + '<p>Our services cover gaming licences and regulatory compliance; state licensing and '
      + 'interstate operations; corporate structuring and regulatory due diligence; esports '
      + 'contracts and player representation; dispute resolution and arbitration; intellectual '
      + 'property and brand protection; tournament and league advisory; sponsorship and '
      + 'commercial agreements; data protection and technology law; taxation; governance; and '
      + 'ongoing corporate compliance.</p>'
      + '<p>We help clients enter and operate within regulated markets, obtain and maintain '
      + 'necessary approvals, structure their businesses, protect their intellectual property, '
      + 'manage regulatory and commercial risks, resolve disputes, and build legally sound and '
      + 'sustainable ventures.</p>'
      + '<p>Building, expanding, or operating in gaming, betting or esports? Let PCN Sportiva LP '
      + 'provide the legal expertise to help you navigate the industry with confidence.</p>',
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

/*
 * Placeholder colleagues, so the team grid can be judged with more than two
 * people in it. These are not real people. Every one of them is marked three
 * ways — a `demo-` slug, a quote that says so, and a bio that opens by saying
 * so — so none can quietly pass as one of the firm's lawyers.
 *
 * Drop them all with:
 *   npm run seed:content -- --no-demo-team   (skips creating them)
 *   node -e "..."                            (see README) to delete existing
 * or simply delete them from the dashboard: they sort last and are labelled.
 */
const DEMO_TEAM = [
  { name: 'Adaeze Nwosu', slug: 'demo-adaeze-nwosu', role: 'Senior Associate', practice: 'sports-dispute-resolution', order: 10 },
  { name: 'Tunde Bakare', slug: 'demo-tunde-bakare', role: 'Associate', practice: 'contracts-and-transfers', order: 11 },
  { name: 'Amara Eze', slug: 'demo-amara-eze', role: 'Associate', practice: 'sports-governance', order: 12 },
];

const DEMO_QUOTE = 'Placeholder profile, replace or remove before launch.';
const DEMO_BIO = '<p><strong>Placeholder profile.</strong> Dummy content, seeded so the team '
  + 'page could be laid out before the firm supplied its own. It does not describe a real '
  + 'person and must be replaced or removed before launch.</p>';

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
  // The firm's numbers: replaces the old single seeded number only while it is
  // still there, so a number an administrator has since typed is left alone.
  if (settings.contact?.phone === '+234 704 482 2774') {
    settings.contact.phone = '+1 (740) 819-2004';
    settings.contact.phone2 = '+234 704 995 4119';
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

  /* --- placeholder colleagues, so the grid is not half empty --- */
  if (demoTeam) {
    const svc = await Service.find().select('slug').lean();
    const byArea = new Map(svc.map((s) => [s.slug, s._id]));
    for (const member of DEMO_TEAM) {
      await ensure(Lawyer, { slug: member.slug }, () => ({
        name: member.name,
        slug: member.slug,
        role: member.role,
        quote: DEMO_QUOTE,
        bio: cleanHtml(DEMO_BIO),
        practiceAreas: byArea.has(member.practice) ? [byArea.get(member.practice)] : [],
        order: member.order,
        // Published regardless of --publish: they exist to be looked at.
        status: 'published',
      }), `demo team: ${member.name}`);
    }

    // ensure() only creates a missing document; it never updates one that
    // already exists. The three above were seeded once already with an
    // em-dash in the quote — this project's copy does not use dashes —
    // so that needs its own guarded fix-up rather than relying on ensure().
    const staleDash = 'Placeholder profile — replace or remove before launch.';
    const { modifiedCount } = await Lawyer.updateMany(
      { slug: { $in: DEMO_TEAM.map((m) => m.slug) }, quote: staleDash },
      { $set: { quote: DEMO_QUOTE } },
    );
    if (modifiedCount) report.created.push(`fixed the dash in ${modifiedCount} placeholder quote(s)`);
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
      // The eyebrow above "Why the firm", so it reads as a sibling of the
      // Services and Outcomes sections rather than a heading on its own.
      intro: { subheading: 'About', heading: 'Our mission', body: ABOUT_TEAM },
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
    { slug: 'home', key: 'hero', field: 'body', from: OLD_ABOUT_INTRO, to: ABOUT_INTRO },
    { slug: 'about', key: 'intro', field: 'body', from: OLD_ABOUT_INTRO, to: ABOUT_INTRO },
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
    // The consultation panel's old template wording ("Free Consultation" /
    // "Booking an Appointment"), replaced now that the section carries real
    // copy of its own — see "Free consultation" in design-direction.md.
    { slug: 'home', key: 'consultation', field: 'heading', from: 'Free Consultation', to: 'Reliable Solutions for Your Legal Matters' },
    { slug: 'home', key: 'consultation', field: 'subheading', from: 'Booking an Appointment', to: 'GET IN TOUCH' },
    { slug: 'about', key: 'consultation', field: 'heading', from: 'Free Consultation', to: 'Reliable Solutions for Your Legal Matters' },
    { slug: 'about', key: 'consultation', field: 'subheading', from: 'Booking an Appointment', to: 'GET IN TOUCH' },
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

  /*
   * The consultation panel's submit button. A "Become a Client" draft was
   * tried and reverted back to "Send Message" — REWRITES above only
   * replaces plain string fields, and cta is a {label, href} object, so it
   * needs its own guarded block.
   */
  for (const slug of ['home', 'about']) {
    const page = await Page.findOne({ slug });
    const sec = page?.sections.find((s) => s.key === 'consultation');
    const label = `copy: ${slug}.consultation.cta.label`;
    if (!sec) { report.skipped.push(`${label} (no section)`); continue; }
    if (sec.cta?.label === 'Send Message') { report.skipped.push(`${label} (already rewritten)`); continue; }
    if (sec.cta?.label !== 'Become a Client') { report.skipped.push(`${label} (edited in the dashboard)`); continue; }
    sec.cta.label = 'Send Message';
    await page.save();
    report.created.push(label);
  }

  /*
   * The home page's record tab claimed "over 50 clubs, academies and players"
   * and "over 150 disputes" — figures carried over from the old site with
   * nothing behind them. The replacement describes the work rather than
   * counting it, and the front end appends a live count taken from the
   * published cases, so the only number on the tab is one the archive can be
   * checked against. See FRONT-END/docs/firm-review-required.md.
   *
   * Replaced only while the tab still holds the old wording.
   */
  const homeForTab = await Page.findOne({ slug: 'home' });
  const homeIntroTabs = homeForTab?.sections.find((s) => s.key === 'intro');
  const recordTab = homeIntroTabs?.items?.find((i) => i.title === 'Our Record');
  if (!recordTab) {
    report.skipped.push('copy: home.intro "Our Record" (no such tab)');
  } else if (recordTab.text === RECORD_TAB_TEXT) {
    report.skipped.push('copy: home.intro "Our Record" (already rewritten)');
  } else if (!/over 50 clubs|over 150 disputes/.test(recordTab.text || '')) {
    report.skipped.push('copy: home.intro "Our Record" (edited in the dashboard)');
  } else {
    recordTab.text = RECORD_TAB_TEXT;
    await homeForTab.save();
    report.created.push('copy: home.intro "Our Record"');
  }

  /*
   * The same tab set's mission tab: thirty words that said nothing concrete.
   * Same guard — replaced only while it still holds the old sentence.
   */
  const missionTab = homeIntroTabs?.items?.find((i) => i.title === 'Our Mission');
  if (!missionTab) {
    report.skipped.push('copy: home.intro "Our Mission" (no such tab)');
  } else if (missionTab.text === MISSION_TAB_TEXT) {
    report.skipped.push('copy: home.intro "Our Mission" (already rewritten)');
  } else if (
    // Matches both the original text and the brief run this went through
    // with em dashes, since replaced with commas — this project's copy does
    // not use dashes. "We work a matter end to end" is the invariant part of
    // that second version.
    !/ultimate mission is to provide comprehensive and integrated/.test(missionTab.text || '')
    && !/We work a matter end to end/.test(missionTab.text || '')
  ) {
    report.skipped.push('copy: home.intro "Our Mission" (edited in the dashboard)');
  } else {
    missionTab.text = MISSION_TAB_TEXT;
    await homeForTab.save();
    report.created.push('copy: home.intro "Our Mission"');
  }

  /* --- three real matters, restructured from press-release prose --- */

  /*
   * These three cases already existed, migrated from the old site with their
   * press-release titles intact ("PCN Sportiva LP Secures FIFA DRC Ruling in
   * Favour of...") and a social-media graphic as their featured image. This
   * rewrites them onto structured fields instead: a plain "X v Y" title, the
   * respondent and its country as their own fields, and a one-sentence
   * holding — what the chamber actually decided — drawn from the existing
   * `body` each record already carried, not invented.
   *
   * The holding sentences name neither party. That is deliberate: it means
   * the same sentence is safe to show whether or not a case is anonymised,
   * rather than needing a second, redacted version.
   *
   * `featuredImage` is unset, not deleted from the media library — the
   * graphic still belongs on whichever Insights article carries the same
   * announcement.
   *
   * Guarded on the old slug (a stable identifier, unlike the title this
   * migration is about to change) and on the title still being the old
   * press-release sentence, so a record already migrated, or since edited in
   * the dashboard, is left alone.
   */
  const REAL_MATTERS = [
    {
      oldSlug: 'pcn-sportiva-lp-secures-fifa-drc-decision-in-favour-of-karim-abubakar-ghana-against-al-qasim-ira',
      title: 'Karim Abubakar v Al Qasim',
      opposingParty: 'Al Qasim',
      country: 'Iraq',
      holding: 'The FIFA DRC partially upheld the player\'s claims and ordered the club to pay '
        + 'outstanding remuneration, interest and flight costs.',
    },
    {
      oldSlug: 'fifa-drc-rules-in-favour-of-anthony-uchenna-nwadioha-nigeria-in-employment-dispute-against-bigma',
      title: 'Anthony Uchenna Nwadioha v Bigman FC',
      opposingParty: 'Bigman FC',
      country: 'Tanzania',
      holding: 'The FIFA DRC ordered the club to pay the player\'s outstanding remuneration under '
        + 'his contract, with sporting sanctions available if it does not comply.',
    },
    {
      oldSlug: 'pcn-sportiva-lp-secures-fifa-drc-ruling-in-favour-of-wisdom-uda-kanu-nigeria-against-kabuscorp-s',
      title: 'Wisdom Uda Kanu v Kabuscorp Sport Clube do Palanca',
      opposingParty: 'Kabuscorp Sport Clube do Palanca',
      country: 'Angola',
      holding: 'The FIFA DRC partially upheld the player\'s claims and ordered the club to pay '
        + 'outstanding remuneration, breach-of-contract compensation and interest.',
    },
  ];

  for (const matter of REAL_MATTERS) {
    const label = `case: ${matter.title}`;
    const doc = await CaseModel.findOne({ slug: matter.oldSlug });
    if (!doc) {
      report.skipped.push(`${label} (slug not found — already renamed, or never seeded)`);
      continue;
    }
    if (doc.holding === matter.holding) {
      report.skipped.push(`${label} (already restructured)`);
      continue;
    }
    if (!/^PCN Sportiva LP Secures|^FIFA DRC RULES/.test(doc.title || '')) {
      report.skipped.push(`${label} (edited in the dashboard)`);
      continue;
    }
    doc.title = matter.title;
    doc.opposingParty = matter.opposingParty;
    doc.country = matter.country;
    doc.holding = matter.holding;
    doc.featuredImage = undefined;
    /*
     * The home page's record grid is "the three most recent published
     * cases" — the same query as everywhere else, deliberately not a
     * bespoke fetch-by-slug for these three specifically. All twelve
     * existing cases share year 2026, so publishedAt is the tiebreaker, and
     * nine of them still carry their unmigrated publishedAt from the
     * original import — without this, two of the three cards on the
     * rebuilt homepage would still be unmigrated ones. Bumped once, here,
     * inside the same guard that makes the rest of this idempotent: it
     * reflects when the record was restructured, which is what publishedAt
     * means for every other page on the site too.
     */
    doc.publishedAt = new Date();
    await doc.save();
    report.created.push(label);
  }

  /* --- hero slides: four event photographs, in this order --- */

  /*
   * One slide per photograph, each with its own phrase, small heading and
   * paragraph. The files are local, under FRONT-END/public/hero, so their URLs
   * have no /upload/ segment; thumb() and preview() pass those through
   * untouched, which means this runs without a Cloudinary account.
   */
  const heroMedia = [
    {
      publicId: 'hero-acfta',
      secureUrl: '/hero/hero-acfta.jpg',
      resourceType: 'image',
      width: 1920,
      height: 1080,
      alt: 'Three guests at the ACFTA Fest press conference, one holding the festival bag.',
    },
    {
      publicId: 'hero-table',
      secureUrl: '/hero/hero-table.jpg',
      resourceType: 'image',
      width: 1920,
      height: 1080,
      alt: 'Delegates in conversation around a table at an industry event.',
    },
    {
      publicId: 'hero-crowd',
      secureUrl: '/hero/hero-crowd.jpg',
      resourceType: 'image',
      width: 1920,
      height: 1080,
      alt: 'Conference delegates standing in the audience.',
    },
    {
      publicId: 'hero-podium',
      secureUrl: '/hero/hero-podium.jpg',
      resourceType: 'image',
      width: 1920,
      height: 1080,
      alt: 'A member of the firm speaking at a conference podium.',
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

  const heroSlides = [
    {
      title: 'every event',
      value: 'Recognition',
      text: 'We are recognised at major sports and trade events across the continent, advising the people and organisations that shape the industry.',
      image: heroMediaIds['hero-acfta'],
    },
    {
      title: 'the table',
      value: 'Client Relationships',
      text: 'Close, ongoing relationships mean we advise with full knowledge of our clients\' goals, not only their latest dispute.',
      image: heroMediaIds['hero-table'],
    },
    {
      title: 'the room',
      value: 'Industry Presence',
      text: 'We represent clients across jurisdictions and forums, from national tribunals to international bodies, and we are present where decisions are made.',
      image: heroMediaIds['hero-crowd'],
    },
    {
      title: 'the stage',
      value: 'Thought Leadership',
      text: 'We contribute to the discussion of sports law and regulation, speaking on the rules that govern transfers, disputes and governance.',
      image: heroMediaIds['hero-podium'],
    },
  ];

  const home = await Page.findOne({ slug: 'home' });
  const heroSection = home?.sections.find((s) => s.key === 'hero');
  if (heroSection) {
    // Title, eyebrow, paragraph *and* image: comparing titles alone would miss
    // a slide that keeps its phrase but points at a different photograph.
    const key = (i) => `${i.title}:${i.value || ''}:${i.text || ''}:${i.image ? String(i.image._id || i.image) : ''}`;
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

  /*
   * The earlier stadium, forum and map slides are gone. Their media records go
   * with them so the library does not keep entries for files that no longer
   * exist; the map's Cloudinary asset itself is untouched.
   */
  const retired = await Media.deleteMany({
    publicId: { $in: ['hero-forum', 'hero-gift', 'hero-border', 'pcn-sportiva/hero-beyond'] },
  });
  if (retired.deletedCount) report.created.push(`removed ${retired.deletedCount} retired hero media record(s)`);

  /* --- About page: the firm's approved copy, verbatim --- */
  const ABOUT_LEAD = "PCN SPORTIVA LP is a boutique sports law firm providing specialized and comprehensive legal services across Africa and internationally, with a practice dedicated to the evolving legal, regulatory, commercial and governance needs of the sports industry.";
  const ABOUT_BLOCKS = [
      {
          "title": "Our Team and Clients",
          "text": "Our team comprises experienced lawyers with expertise across a broad range of sports law and related practice areas. We provide bespoke, commercially focused and industry-specific legal advice to international football and basketball clubs, professional players and athletes, licensed coaches, licensed intermediaries, public agencies, sports rights holders, sports investors, sports technology companies, event management companies and other stakeholders within the sports ecosystem."
      },
      {
          "title": "Our Services",
          "text": "Our services cover a wide spectrum of sports-related matters, including sports dispute resolution and litigation, employment and contract matters, regulatory and disciplinary proceedings, player transfers and registrations, training compensation and solidarity contribution claims, sports governance and compliance, anti-doping, safeguarding and integrity matters, sports arbitration, boxing, e-sports and gaming, intellectual property, sports commercial transactions, sponsorship and endorsement agreements, sports investments, and sports-related corporate and advisory services."
      },
      {
          "title": "Intellectual Property",
          "text": "Our Intellectual Property practice supports clients in protecting, commercialising and enforcing intellectual property rights within the sports and entertainment industries, including matters relating to trademarks, branding, image rights, licensing, merchandising, content, sponsorship and other commercially valuable intellectual assets."
      },
      {
          "title": "Representation",
          "text": "We represent and advise clients before relevant international sports tribunals, federations, arbitration panels and other decision-making bodies, including proceedings involving football, basketball, boxing and other sporting disciplines. Our lawyers bring practical experience in navigating the rules and regulations of international and national sporting bodies, while providing strategic legal solutions tailored to the particular needs and resources of each client."
      },
      {
          "title": "Thought Leadership and Access to Justice",
          "text": "Beyond legal representation, PCN SPORTIVA LP is committed to contributing to the development of sports law and sports governance in Africa. We actively engage in thought leadership, professional education and industry development, regularly contributing to radio, television, national and international media, conferences, seminars and other industry platforms. We also undertake select pro bono matters in furtherance of access to justice and the development of the sports industry."
      },
      {
          "title": "Looking Ahead",
          "text": "As the sports industry continues to evolve through technology, commercialization and increasingly sophisticated regulatory frameworks, we remain committed to staying at the forefront of developments in sports law, governance, integrity, anti-doping, intellectual property, e-sports and other emerging areas of the sports business."
      },
      {
          "title": "Our Mission",
          "text": "Our ultimate mission is to provide comprehensive, integrated and commercially responsive sports legal advice and representation, combining specialized expertise, practical experience and a deep understanding of the sports industry to deliver solutions that enable our clients to protect their interests, manage risk and achieve their objectives."
      }
  ];
  const aboutDoc = await Page.findOne({ slug: 'about' });
  if (aboutDoc) {
    let touched = false;
    const lead = aboutDoc.sections.find((s) => s.key === 'intro');
    // Replaced only while it still holds one of the seeded intros.
    if (lead && (!lead.body || lead.body === OLD_ABOUT_INTRO || lead.body === ABOUT_INTRO)) {
      lead.body = ABOUT_LEAD;
      touched = true;
    }
    let topics = aboutDoc.sections.find((s) => s.key === 'sections');
    if (!topics) {
      aboutDoc.sections.push({ key: 'sections' });
      topics = aboutDoc.sections[aboutDoc.sections.length - 1];
    }
    if (!topics.items || topics.items.length === 0) {
      topics.items = ABOUT_BLOCKS;
      touched = true;
    }
    if (touched) { await aboutDoc.save(); report.created.push('page: about copy'); }
    else report.skipped.push('page: about copy');
  }

  /* --- navigation: About added after Home (header) and first (footer) --- */
  for (const [location, at] of [['header', 1], ['footer', 0]]) {
    const nav = await Navigation.findOne({ location });
    if (nav && !nav.items.some((i) => i.href === '/about')) {
      nav.items.splice(at, 0, { label: 'About', href: '/about', external: false, children: [] });
      nav.items.forEach((item, i) => { item.order = i; });
      await nav.save();
      report.created.push(`navigation: About (${location})`);
    }
  }

  /* --- the stock photograph, and the firm's own in its place --- */

  /*
   * A single stock image — "Empty stadium seating", captioned in the library as
   * a placeholder to be replaced — was set on the six practice areas and on the
   * home page's "Why the firm" section, so one generic photograph carried most
   * of the page. The service cards no longer render an image at all, and the
   * "Why the firm" section now ships with the firm's own photograph, so both
   * references are cleared.
   *
   * Guarded on the placeholder's own id: a real photograph put there since is
   * left exactly as it is. Sections on other pages still reference it and are
   * deliberately out of scope — they are listed in firm-review-required.md.
   */
  const stock = await Media.findOne({ publicId: 'pcn-sportiva/placeholders/neutral-placeholder' });

  if (!stock) {
    report.skipped.push('stock image (not in the media library)');
  } else {
    const clearedServices = await Service.updateMany(
      { image: stock._id },
      { $unset: { image: '' } },
    );
    if (clearedServices.modifiedCount) {
      report.created.push(`cleared the stock image from ${clearedServices.modifiedCount} practice area(s)`);
    } else {
      report.skipped.push('stock image on the practice areas');
    }

    const homePage = await Page.findOne({ slug: 'home' });
    const homeIntro = homePage?.sections.find((s) => s.key === 'intro');
    if (homeIntro && String(homeIntro.image) === String(stock._id)) {
      homeIntro.image = undefined;
      await homePage.save();
      report.created.push('cleared the stock image from home "Why the firm"');
    } else {
      report.skipped.push('stock image on home "Why the firm"');
    }
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
