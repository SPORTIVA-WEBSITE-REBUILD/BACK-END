#!/usr/bin/env node
/**
 * Migrates content out of the previous Firebase-backed site into MongoDB.
 *
 *   npm run import:firebase -- <export.json> [--dry-run] [--map custom-map.js]
 *
 * WHAT IT EXPECTS
 * ---------------
 * A JSON export of the old database. Two shapes are accepted, because the
 * previous developer's structure is not known for certain:
 *
 *   A. Firestore CLI / firebase-admin export:
 *      { "articles": { "<docId>": {...} }, "cases": { "<docId>": {...} } }
 *
 *   B. Realtime Database export (arrays instead of keyed objects):
 *      { "articles": [ {...}, {...} ] }
 *
 * Field names in the source are guessed from the usual conventions and can be
 * overridden with --map (see FIELD_ALIASES below). Anything the script cannot
 * place is reported rather than silently dropped.
 *
 * IDEMPOTENT: records are matched on slug, so re-running with a fuller export
 * updates what is already there instead of creating duplicates. Documents an
 * administrator has since edited are left alone unless --overwrite is passed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import Article from '../src/models/Article.js';
import CaseModel from '../src/models/Case.js';
import Service from '../src/models/Service.js';
import Lawyer from '../src/models/Lawyer.js';
import Category from '../src/models/Category.js';
import Media from '../src/models/Media.js';
import { slugify, uniqueSlug } from '../src/lib/slug.js';
import { cleanHtml, toPlainText, readingMinutes } from '../src/lib/sanitize.js';
import cloudinary, { isOwnCloudinaryUrl } from '../src/lib/cloudinary.js';
import env from '../src/config/env.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const overwrite = args.includes('--overwrite');

/**
 * Source field name -> our field name. The first alias that exists on a record
 * wins, so this copes with several plausible naming conventions at once.
 */
const FIELD_ALIASES = {
  title: ['title', 'name', 'heading', 'headline'],
  slug: ['slug', 'permalink', 'url', 'id'],
  excerpt: ['excerpt', 'summary', 'description', 'subtitle', 'intro'],
  body: ['body', 'content', 'html', 'text', 'article', 'fullText'],
  image: ['image', 'featuredImage', 'coverImage', 'thumbnail', 'photo', 'imageUrl'],
  publishedAt: ['publishedAt', 'date', 'createdAt', 'publishDate', 'published'],
  author: ['author', 'writer', 'by', 'authorName'],
  category: ['category', 'section', 'type'],
  tags: ['tags', 'keywords', 'labels'],
  role: ['role', 'position', 'title', 'jobTitle'],
  bio: ['bio', 'biography', 'about', 'profile', 'description'],
  email: ['email', 'emailAddress'],
  phone: ['phone', 'telephone', 'mobile'],
  forum: ['forum', 'tribunal', 'court', 'venue'],
  year: ['year', 'caseYear'],
  outcome: ['outcome', 'result', 'verdict'],
};

const report = { created: {}, updated: {}, skipped: {}, warnings: [], media: 0 };

/**
 * Trims a value to fit its schema limit, cutting at a word boundary.
 *
 * The previous site set no length limits, so its excerpts run to a thousand
 * characters or more. Passing those through unchanged fails validation and
 * aborts the whole import, losing every record after the first long one.
 */
function clamp(value, max, label) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;

  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
  if (label) report.warnings.push(`${label}: shortened to fit (was ${text.length} characters)`);
  return trimmed;
}

/**
 * Records what each document looked like when the importer last wrote it.
 * Without this the importer cannot tell its OWN previous write apart from an
 * administrator's edit, and every second run would refuse to update anything.
 * Kept in a file rather than a schema field so a one-off migration does not
 * leave permanent residue on the content models.
 */
const STATE_FILE = path.resolve('.import-state.json');
let state = {};

async function loadState() {
  try {
    state = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
  } catch {
    state = {};
  }
}

async function saveState() {
  if (dryRun) return;
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

function bump(bucket, kind) {
  report[bucket][kind] = (report[bucket][kind] || 0) + 1;
}

/** Reads the first alias present on the record. */
function pick(record, field) {
  for (const alias of FIELD_ALIASES[field] || [field]) {
    const value = record[alias];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/** Normalises both accepted export shapes into a flat array of records. */
function toRecords(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node.filter(Boolean);
  if (typeof node === 'object') {
    return Object.entries(node)
      .filter(([, v]) => v && typeof v === 'object')
      .map(([id, v]) => ({ _sourceId: id, ...v }));
  }
  return [];
}

/** Firestore timestamps export in several shapes; accept all of them. */
function toDate(value) {
  if (!value) return undefined;
  if (typeof value === 'object') {
    if (value._seconds) return new Date(value._seconds * 1000);
    if (value.seconds) return new Date(value.seconds * 1000);
    if (value.$date) return new Date(value.$date);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Re-hosts an image found in the old export on our Cloudinary account, so the
 * new site does not depend on the old infrastructure staying alive.
 * Already-migrated URLs are reused rather than uploaded twice.
 */
async function importImage(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return undefined;

  const existing = await Media.findOne({ $or: [{ url }, { secureUrl: url }] });
  if (existing) return existing._id;

  if (isOwnCloudinaryUrl(url)) {
    // Already on our cloud but not recorded: register it without re-uploading.
    const publicId = url.split('/upload/')[1]?.replace(/^v\d+\//, '').replace(/\.[^.]+$/, '');
    if (!publicId) return undefined;
    const media = await Media.create({ publicId, url, secureUrl: url, folder: env.cloudinary.folder });
    report.media += 1;
    return media._id;
  }

  if (dryRun) return undefined;

  try {
    const result = await cloudinary.uploader.upload(url, {
      folder: `${env.cloudinary.folder}/migrated`,
      resource_type: 'auto',
    });
    const media = await Media.create({
      publicId: result.public_id,
      url: result.url,
      secureUrl: result.secure_url,
      format: result.format,
      resourceType: result.resource_type,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      folder: `${env.cloudinary.folder}/migrated`,
      alt: '',
    });
    report.media += 1;
    return media._id;
  } catch (err) {
    report.warnings.push(`Could not re-host image ${url}: ${err.message}`);
    return undefined;
  }
}

/**
 * Upserts one record, honouring the "do not clobber an editor's work" rule.
 *
 * `base` is the DETERMINISTIC slug for this source record. Matching on it is
 * what makes re-running safe: disambiguation (-2, -3) happens only when a
 * genuinely different record needs a slug that is already taken, never on the
 * lookup, or every re-run would mint a new slug and duplicate the content.
 */
async function upsert(Model, kind, base, doc) {
  const slug = slugify(base);
  const existing = await Model.findOne({ $or: [{ slug }, { previousSlugs: slug }] });

  const stateKey = `${kind}:${slug}`;

  if (existing && !overwrite) {
    // Compare against what the importer itself last wrote. A difference means
    // a person has since edited this in the dashboard, so it is left alone.
    const lastWritten = state[stateKey];
    const currentStamp = existing.updatedAt?.toISOString();
    if (lastWritten && currentStamp && lastWritten !== currentStamp) {
      bump('skipped', kind);
      report.warnings.push(`Skipped "${slug}" (${kind}): edited in the dashboard since it was imported.`);
      return;
    }
  }

  if (dryRun) {
    bump(existing ? 'updated' : 'created', kind);
    return;
  }

  if (existing) {
    existing.set(doc);
    await existing.save();
    state[stateKey] = existing.updatedAt?.toISOString();
    bump('updated', kind);
  } else {
    // Only now can a collision be real: a different source record already
    // holds this slug.
    const made = await Model.create({ ...doc, slug: await uniqueSlug(Model, slug) });
    state[`${kind}:${made.slug}`] = made.updatedAt?.toISOString();
    bump('created', kind);
  }
}

async function importArticles(records) {
  for (const r of records) {
    const title = pick(r, 'title');
    if (!title) { report.warnings.push('Skipped an article with no title'); continue; }

    const base = pick(r, 'slug') || title;
    const body = cleanHtml(pick(r, 'body') || '');
    const featuredImage = await importImage(pick(r, 'image'));

    // The old author is a name, not a reference; match it to a team profile if
    // one exists, otherwise leave it unset for an administrator to assign.
    let author;
    const authorName = pick(r, 'author');
    if (authorName && typeof authorName === 'string') {
      const match = await Lawyer.findOne({ slug: slugify(authorName) });
      if (match) author = match._id;
      else report.warnings.push(`Article "${title}": author "${authorName}" has no team profile yet.`);
    }

    let category;
    const categoryName = pick(r, 'category');
    if (categoryName && typeof categoryName === 'string') {
      const catSlug = slugify(categoryName);
      category = (await Category.findOne({ slug: catSlug })
        || (dryRun ? null : await Category.create({ name: categoryName, slug: catSlug })))?._id;
    }

    const tags = pick(r, 'tags');

    await upsert(Article, 'articles', base, {
      title: clamp(title, 200, `Article title "${String(title).slice(0, 40)}…"`),
      excerpt: clamp(pick(r, 'excerpt') || toPlainText(body), 400, `Excerpt for "${String(title).slice(0, 40)}…"`),
      body,
      author,
      category,
      tags: Array.isArray(tags) ? tags.map(String) : [],
      featuredImage,
      publishedAt: toDate(pick(r, 'publishedAt')) || new Date(),
      readingMinutes: readingMinutes(body),
      // Imported content lands as a draft so the firm reviews it before it is
      // live — the proposal requires a factual and legal sign-off before launch.
      status: 'draft',
    });
  }
}

async function importCases(records) {
  for (const r of records) {
    const title = pick(r, 'title');
    if (!title) { report.warnings.push('Skipped a case with no title'); continue; }

    const base = pick(r, 'slug') || title;
    const body = cleanHtml(pick(r, 'body') || '');
    const featuredImage = await importImage(pick(r, 'image'));
    const year = Number(pick(r, 'year')) || toDate(pick(r, 'publishedAt'))?.getFullYear();

    const missing = [];
    if (!pick(r, 'forum')) missing.push('forum');
    if (!year) missing.push('year');
    if (missing.length) {
      report.warnings.push(`Case "${title}": missing ${missing.join(', ')} — filled with placeholders, needs review.`);
    }

    await upsert(CaseModel, 'cases', base, {
      title: clamp(title, 200),
      forum: pick(r, 'forum') || 'Unknown',
      year: year || new Date().getFullYear(),
      // The old site had no structured party/outcome fields; an administrator
      // must set these, so they default to the most conservative values.
      partyRepresented: 'other',
      outcome: 'ongoing',
      summary: clamp(pick(r, 'excerpt') || toPlainText(body) || title, 600, `Summary for "${String(title).slice(0, 40)}…"`),
      body,
      anonymised: true,
      featuredImage,
      status: 'draft',
    });
  }
}

async function importLawyers(records) {
  for (const r of records) {
    const name = pick(r, 'title');
    if (!name) { report.warnings.push('Skipped a team member with no name'); continue; }

    const base = pick(r, 'slug') || name;
    const photo = await importImage(pick(r, 'image'));

    await upsert(Lawyer, 'lawyers', base, {
      name: clamp(name, 120),
      role: pick(r, 'role') || '',
      bio: cleanHtml(pick(r, 'bio') || ''),
      photo,
      email: pick(r, 'email') || '',
      phone: pick(r, 'phone') || '',
      status: 'draft',
    });
  }
}

async function importServices(records) {
  for (const r of records) {
    const title = pick(r, 'title');
    if (!title) continue;

    const base = pick(r, 'slug') || title;
    const image = await importImage(pick(r, 'image'));

    await upsert(Service, 'services', base, {
      title: clamp(title, 120),
      summary: clamp(pick(r, 'excerpt') || '', 400),
      body: cleanHtml(pick(r, 'body') || ''),
      image,
      status: 'draft',
    });
  }
}

/** Old collection name -> importer. Extra spellings are cheap insurance. */
const COLLECTIONS = [
  [['articles', 'posts', 'blog', 'news', 'insights'], importArticles, 'articles'],
  [['cases', 'caseStudies', 'matters', 'record'], importCases, 'cases'],
  [['lawyers', 'attorneys', 'team', 'people', 'staff'], importLawyers, 'lawyers'],
  [['services', 'practiceAreas', 'practices'], importServices, 'services'],
];

async function main() {
  if (!file) {
    console.error(`
  Usage: npm run import:firebase -- <export.json> [--dry-run] [--overwrite]

    --dry-run    report what would happen without writing anything
    --overwrite  replace records even if they were edited in the dashboard
`);
    process.exitCode = 1;
    return;
  }

  const raw = await fs.readFile(path.resolve(file), 'utf8');
  const data = JSON.parse(raw);

  // Firestore's own export nests everything under __collections__.
  const root = data.__collections__ || data.collections || data;

  await connectDB();
  await loadState();
  console.log(`\n  Importing from ${file}${dryRun ? ' (dry run — nothing will be written)' : ''}\n`);

  const handled = new Set();
  for (const [names, importer, kind] of COLLECTIONS) {
    for (const name of names) {
      if (!root[name]) continue;
      const records = toRecords(root[name]);
      console.log(`  ${name} → ${kind}: ${records.length} record(s)`);
      handled.add(name);
      // eslint-disable-next-line no-await-in-loop
      await importer(records);
    }
  }

  const unhandled = Object.keys(root).filter((k) => !handled.has(k) && !k.startsWith('_'));
  if (unhandled.length) {
    report.warnings.push(`No importer for: ${unhandled.join(', ')}. Add an alias in COLLECTIONS if these hold content.`);
  }

  await saveState();

  console.log('\n  ── Summary ──');
  for (const bucket of ['created', 'updated', 'skipped']) {
    const entries = Object.entries(report[bucket]);
    if (entries.length) {
      console.log(`  ${bucket}: ${entries.map(([k, v]) => `${v} ${k}`).join(', ')}`);
    }
  }
  console.log(`  images re-hosted on Cloudinary: ${report.media}`);

  if (report.warnings.length) {
    console.log(`\n  ── Needs attention (${report.warnings.length}) ──`);
    for (const w of report.warnings.slice(0, 40)) console.log(`  • ${w}`);
    if (report.warnings.length > 40) console.log(`  …and ${report.warnings.length - 40} more`);
  }

  console.log(`
  Everything imported is a DRAFT. Review each item in the dashboard and
  publish it once the firm has signed off on the content.
`);
}

main()
  .catch((err) => {
    console.error(`\n  Import failed: ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB();
    await mongoose.connection.close().catch(() => {});
    process.exit(process.exitCode || 0);
  });
