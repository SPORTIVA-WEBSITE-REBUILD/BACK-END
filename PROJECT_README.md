# PCN Sportiva LP

The firm's public website, its content API, and the admin dashboard the firm
uses to run it — three independent applications.

```
sportiva/
├── frontend/          Public website          React 18 + Vite     (static)
│   └── legacy-template/   the original Colorlib template, kept for reference
├── backend/           Content API             Node + Express      (serverless)
├── dashboard/         Admin CMS               React 18 + Vite     (static)
└── Implementation_Plan.md    architecture and the reasoning behind it
```

Content lives in **MongoDB**, media in **Cloudinary**, and all three apps deploy
to **Vercel's free tier**. There is no always-on server, no Redis, no queue and
no container to maintain.

---

## Quick start

You need Node 20+, a MongoDB connection string and a Cloudinary account.

```bash
# 1. API
cd backend
npm install
cp .env.example .env          # then fill it in — see "Environment" below
npm run seed                  # creates the fixed pages, navigation, categories
npm run create-admin          # creates your first super administrator
npm run dev                   # http://localhost:4000

# 2. Dashboard  (new terminal)
cd dashboard
npm install
cp .env.example .env
npm run dev                   # http://localhost:5174

# 3. Public site  (new terminal)
cd frontend
npm install
cp .env.example .env
npm run dev                   # http://localhost:5173
```

Sign in to the dashboard with the account you just created, change something,
and it appears on the public site. No code is edited to change content.

---

## Environment

### `backend/.env`

| Variable | Required | What it is |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB connection string, including the database name |
| `JWT_ACCESS_SECRET` | yes | Signs 15-minute access tokens |
| `JWT_REFRESH_SECRET` | yes | Signs refresh tokens |
| `ACCESS_TOKEN_TTL` | no | Default `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | no | Default `7` |
| `COOKIE_DOMAIN` | production | `.pcnsportivalp.com` so the API and dashboard share a cookie. **Leave blank on localhost.** |
| `CORS_ORIGIN` | yes | Comma-separated list of allowed origins, no trailing slashes |
| `CLOUDINARY_CLOUD_NAME` | yes | From the Cloudinary console |
| `CLOUDINARY_API_KEY` | yes | " |
| `CLOUDINARY_API_SECRET` | yes | " — **never** goes near a browser |
| `CLOUDINARY_FOLDER` | no | Default `pcn-sportiva` |
| `NODE_ENV` | yes | `production` in production: it switches on secure cookies and hides stack traces |

Generate the secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### `frontend/.env`

```
VITE_API_URL=https://api.pcnsportivalp.com/api
VITE_SITE_URL=https://pcnsportivalp.com
```

### `dashboard/.env`

```
VITE_API_URL=https://api.pcnsportivalp.com/api
```

> Anything prefixed `VITE_` is compiled into the browser bundle and is readable
> by every visitor. Only ever put public values there. The dashboard holds no
> secret at all — the session is an httpOnly cookie that JavaScript cannot read.

---

## Administrators

### The first one

```bash
cd backend && npm run create-admin
```

It prompts for a name, email and password, and makes the first account a
**super admin**. No default credentials ship with this project and no password
is written to any file.

### The rest

Super admins create other administrators in the dashboard, under
**Administrators**. Three roles exist:

| Role | Can do |
|---|---|
| **Editor** | Articles, case record, media |
| **Admin** | All content, plus site settings and navigation |
| **Super Admin** | Everything, including managing administrators |

Roles expand to permission strings (`cases:update`, `settings:*`), so a new role
is a data change in `backend/src/config/permissions.js`, not a rewrite.

Three rules are enforced by the server, not the dashboard:

1. The last active super admin cannot be deleted, demoted or disabled
2. Nobody can change their own role
3. Nobody can delete their own account

Prefer **disabling** an account over deleting it — it keeps the record of who
published what.

---

## Content architecture

The split is deliberate: **the database holds content, React holds presentation.**

**Careers** was added after the original nine-page scope. It is a `Vacancy`
collection with its own dashboard section: role, team, location, working
arrangement, employment type, responsibilities, requirements, salary range and
closing date. A role past its closing date drops off the listing automatically
but keeps its own page, so a link already shared does not break. Each published
role emits `JobPosting` structured data, which is what puts it into Google Jobs.

Applications are **by email** — each vacancy can set its own address, otherwise
the careers inbox from Site Settings is used. There is deliberately no CV
upload: storing CVs brings retention, access and NDPR obligations that a simple
mailto does not. See *Extending careers* below.

| MongoDB owns | React owns |
|---|---|
| Headings, copy, images, links | Layout, components, styling |
| Articles, cases, services, team | Animations, interaction |
| Site settings, navigation | Which component renders which section |

A page is a list of `sections`, each with a stable `key`. The React page looks
a section up by key and decides how to render it. An administrator edits the
words; they cannot invent a section that has no component to display it.

### Collections

`admins` · `siteSettings` · `navigation` · `pages` · `services` · `cases` ·
`articles` · `categories` · `lawyers` · `vacancies` · `gallery` · `media` ·
`enquiries`

Full field definitions, indexes and the reasoning are in
[Implementation_Plan.md](Implementation_Plan.md).

### Slugs and broken links

Every slugged model keeps a `previousSlugs` list. Renaming a slug does not break
the old URL: it still resolves, and the API reports the canonical slug so the
frontend issues a redirect. Administrators cannot silently orphan a page.

---

## API

Base: `/api`. Every response uses one envelope.

```jsonc
{ "success": true,  "data": {…}, "meta": {…} }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": […] } }
```

| Group | Auth | Notes |
|---|---|---|
| `/api/public/*` | none | GET only, edge-cached 5–15 min |
| `/api/auth/*` | mixed | Login, refresh, logout, own profile |
| `/api/<resource>` | cookie | `pages` `services` `cases` `articles` `categories` `lawyers` `vacancies` `gallery` `media` `enquiries` |
| `/api/settings`, `/api/navigation/:location` | cookie | Site-wide configuration |
| `/api/admins` | super admin only | |

Public list endpoints return **summary projections** — an article's body never
travels in a listing.

---

## SEO

### Per-page metadata

Titles, meta descriptions, canonical URLs and Open Graph/Twitter tags are set
per route from each record's `seo` sub-document, falling back to the defaults an
administrator sets under **Site Settings**. The dashboard shows character
counters against the lengths search engines actually display.

### Structured data

Every content type emits Schema.org JSON-LD, built from content the
administrator already maintains:

| Page | Emits |
|---|---|
| Home | `LegalService` (name, address, phone, social profiles) + `WebSite` |
| Article | `Article` with author, dates and image + `BreadcrumbList` |
| Case | `Article` scoped to `/record` + `BreadcrumbList` |
| Lawyer | `Person` with job title, employed by the firm + `BreadcrumbList` |
| Service | `Service` provided by the firm + `BreadcrumbList` |
| Vacancy | `JobPosting` with location, type and `validThrough` + `BreadcrumbList` |

This is what lets a search result show the firm as a business with contact
details, and articles with an author and date. Fields the administrator has not
filled in are omitted rather than emitted empty.

### Sitemap and robots

`/sitemap.xml` and `/robots.txt` are **generated live by the API** and rewritten
through by `frontend/vercel.json`. Publishing an article adds it to the sitemap
within the cache window — **no redeploy**. Unpublishing removes it again.

`frontend/scripts/generate-sitemap.js` still writes a static fallback into
`dist/` at build time, which matters only if the site is served somewhere those
rewrites do not apply.

### Client rendering, and what handles it

The site renders in the browser, which two kinds of crawler handle differently,
so `frontend/middleware.js` treats them differently:

- **Link-preview bots** (WhatsApp, LinkedIn, Facebook, X, Slack, Discord,
  Telegram) do not execute JavaScript, so they receive a small prerendered head
  carrying the real Open Graph tags.
- **Search engines** (Google, Bing, Yandex, Apple) *do* execute JavaScript and
  are deliberately **left to render the real page**. Serving them the stub would
  get a thin title-and-link version indexed instead of the actual content and
  its structured data.

Both get a genuine **404 status** for a URL that maps to nothing. A single-page
app otherwise answers every path with 200, which search engines read as a soft
404 and may index or waste crawl budget on.

When an administrator renames a slug, crawlers get a real **301** to the new
address, which is what moves the ranking across; visitors get the in-app
redirect. The old URL keeps working either way — see *Slugs and broken links*.

### After launch, verify

- Facebook **Sharing Debugger** and LinkedIn **Post Inspector** on a live URL
- Google **Rich Results Test** on an article and on the home page
- Submit `https://pcnsportivalp.com/sitemap.xml` in Search Console
- Confirm a nonsense URL returns 404, not 200

---

## Media

The dashboard uploads **directly to Cloudinary** using a short-lived signature
the API mints; the file never passes through Node. MongoDB stores only the
metadata and URL.

Delivery URLs carry `f_auto,q_auto,dpr_auto`, so Cloudinary serves AVIF or WebP
at a sensible quality for each browser and screen, with `srcset` at 480/768/
1200/1920px.

Uploads are limited to JPEG, PNG, WebP, AVIF and PDF, 10 MB each. The signature
covers server-chosen parameters, so a client cannot widen those limits.

---

## Articles

Written in a rich-text editor (TipTap), stored as HTML that the **backend
sanitises on write** against a strict allowlist. Scripts, event handlers and
`javascript:` URLs are stripped before anything is saved, so the stored HTML is
already safe for any consumer.

---

## Migrating the old site's content

The previous site was built on Firebase. Export it, then:

```bash
cd backend
npm run import:firebase -- ./export.json --dry-run   # report only, writes nothing
npm run import:firebase -- ./export.json             # for real
```

- Accepts Firestore-style (`{ "posts": { "id": {...} } }`) and Realtime
  Database-style (`{ "posts": [ ... ] }`) exports
- Guesses source field names from common conventions; unmapped collections are
  reported rather than silently dropped
- Re-hosts images found in the export onto your own Cloudinary account
- **Idempotent** — safe to re-run as fuller exports arrive
- **Never clobbers an editor's work**: anything changed in the dashboard since
  it was imported is skipped and reported
- Everything lands as a **draft**, because the proposal requires the firm to
  sign off on factual and legal content before it is published

If your export uses different field names, extend `FIELD_ALIASES` and
`COLLECTIONS` at the top of `backend/scripts/import-firebase.js`.

---

## Performance

Measured on the built site, gzipped, as actually served.

| | Before | After |
|---|---|---|
| Render-blocking stylesheets | 11 | 7 |
| CSS | 63.7 KB | 23.4 KB |
| Icon fonts | 410 KB | 9.9 KB |
| **First visit total** | **~553 KB** | **113 KB** |

What the difference is:

- **Icon fonts were the bulk of it.** icomoon alone was a 307 KB font and an
  80 KB stylesheet for **nine** glyphs out of 1014; ionicons was 112 KB for
  **two**. Both are now subset to exactly the glyphs the site renders — same
  artwork, 2.7 KB and 0.5 KB.
- **Three stylesheets were dead.** Owl Carousel, Magnific Popup and AOS were
  still linked, but the React build renders none of their markup — jQuery is
  gone and the animations are IntersectionObserver hooks now.
- **animate.css** shipped ~90 keyframe sets for the one entrance animation used.
- **Bootstrap is trimmed** to the components the markup actually uses. No modal,
  carousel, dropdown, card, table, alert, badge, tooltip, popover, toast,
  spinner, jumbotron, list-group, pagination or breadcrumb is rendered anywhere.
- **Fonts** now preconnect, and Poppins requests six weights rather than seven
  (900 was never used).

API responses are 3–60 ms warm with payloads of 1–2 KB, and public GETs are
edge-cached for 5–15 minutes, so most visits never reach the database. List
endpoints return summary projections — an article's body never travels in a
listing.

### Icon fonts

Adding an icon to a component means regenerating the subset:

```bash
cd frontend
node scripts/subset-icons.js     # requires: pip3 install fonttools brotli
```

`npm test` fails and names the glyph if a component uses an icon the subset
lacks, so this cannot be forgotten silently.

---

## Security

### Identifiers

Every identifier is a MongoDB **ObjectId** — there are no integer or
auto-incrementing IDs anywhere. Worth knowing, though, that an ObjectId is not a
random UUID: it is a 4-byte timestamp + 5-byte per-process random + 3-byte
counter, so consecutive documents differ by one and the creation time is
recoverable from the value.

That is acceptable here because **the public site addresses everything by slug,
never by ID**. IDs appear only on authenticated dashboard routes. If IDs ever
become part of a public URL, switch to a random UUID first.

### Findings from the audit, and what was done

| Finding | Severity | Status |
|---|---|---|
| Media URL accepted any host containing the cloud name as a substring — an admin could point site images at a third-party server, leaking every visitor's IP | High | Fixed: hostname parsed and compared exactly; cloud name must be the first path segment |
| Stored XSS — page section bodies are rendered as HTML but were never sanitised, because the sanitiser only walked top-level fields | High | Fixed: sanitiser now walks dotted paths through arrays; `sections.body` and `sections.items.text` covered |
| Login leaked account existence by timing — 2ms for an unknown email vs 440ms for a known one (~173x), defeating the identical error messages | Medium | Fixed: a dummy bcrypt comparison runs when the account does not exist |
| Open redirect via admin-set navigation links (React Router advisory GHSA-wrjc-x8rr-h8h6) | Medium | Fixed at storage (rejects `javascript:`, `data:`, `//host`, backslash forms) and again at render; React Router upgraded to 7 |
| Tiptap prototype-pollution advisory (GHSA-cp6q-959q-f8rh) | Moderate | Fixed: upgraded to Tiptap 3 |
| JWT algorithm not pinned on verify | Low | Fixed: pinned to HS256 on both sign and verify |

`npm audit` reports **0 vulnerabilities** across all three applications.

### Controls in place

- **Passwords** — bcrypt cost 12, minimum 10 characters, never returned by any endpoint
- **Sessions** — 15-minute access JWT plus an opaque refresh token, both httpOnly/Secure/SameSite cookies. The refresh token is stored hashed and **rotated on every use**, so a stolen one is good for at most one request. A password change ends every session.
- **Authorization** — checked server-side on every route. The dashboard hides what a role cannot do as a courtesy, not a control.
- **Input** — Zod on every write with unknown keys rejected, so mass assignment and prototype pollution both fail
- **Injection** — `express-mongo-sanitize` plus Zod type checks; a `{"$ne": null}` login body is a 400
- **XSS** — all rich text sanitised on write against a strict allowlist; scripts, event handlers and `javascript:` URLs stripped before storage
- **Rate limiting** — login 5 per 15 min keyed by IP *and* email (so one account cannot lock out another), enquiries 3 per hour, 300 per 15 min globally
- **CORS** — strict allowlist; an unknown origin gets a clean 403 and no `Access-Control-Allow-Origin` header
- **Uploads** — signed with server-chosen parameters, so a client cannot widen the folder, the format list or the 10 MB cap. SVG is deliberately excluded (it can carry script).
- **Errors** — stack traces are logged, never returned, when `NODE_ENV=production`

### Residual risks, stated plainly

1. **Administrators are trusted.** Anyone with `pages:*` or `settings:*` can change what the public site says. Sanitisation limits the damage to content, not code execution, but give people the lowest role that does their job.
2. **No self-service password reset.** A locked-out administrator needs a super admin to set a new password. This is a deliberate trade — it removes an email-based account-takeover surface — but it means never letting the super admin account become unreachable.
3. **`status` is writable on create.** A role holding `<resource>:create` without `<resource>:update` could publish directly rather than going through the publish endpoint. No current role is in that position; keep it that way when adding roles.
4. **PDF uploads are allowed.** PDFs can contain active content. They are served from Cloudinary's domain rather than the site's, which limits the impact, but drop `pdf` from the allowed formats if the firm does not need it.

---

## Gallery

A gallery block sits on the home page, between the case record and the insights
sections. Images are managed in the dashboard under **Gallery**.

Each entry has a **title** (required), an **image** (required), and optional
**description**, **location**, **date taken** and **display order**. The section
heading and intro copy come from the Home page's `gallery` section under
**Pages**, the same split the services and record blocks use: the page owns the
wording, the collection owns the images.

- Clicking a tile opens a **lightbox** with the title, description, location and
  date. Escape closes it, the arrow keys move between images, and it says which
  image you are on.
- An entry **cannot be saved without an image** — an entry without one would
  render as an empty tile.
- If nothing is published, **the whole section disappears** rather than leaving
  a heading over an empty grid.
- If an image is later deleted from the media library, that entry is dropped
  from the response rather than shown broken.
- Images are served through Cloudinary at `600×450` for the grid and up to
  `1400px` in the lightbox, so the grid never downloads full-resolution photos.

The lightbox is written rather than pulled in: the template's Magnific Popup was
jQuery-based and its stylesheet was dropped as dead weight.

---

## Social links

The footer and each team profile show social icons, managed in the dashboard
under **Site Settings → Social links** (and per profile under **Team**).

Supported platforms: **Facebook, Instagram, TikTok, LinkedIn, Twitter, X,
YouTube, WhatsApp**.

**A link with no URL is not displayed.** An administrator can add a row and
leave it blank without breaking the save — the empty row is discarded on write
and never reaches the public site. The footer filters again at render, so older
records created before that rule still cannot produce a blank or broken icon.
A link that is not a valid `https://` address is rejected with a message, and
anything unsafe (`javascript:`, protocol-relative) is refused outright.

### Why these are SVG, not icon-font glyphs

The bundled icon font is a Font Awesome 4-era set: it has **no TikTok glyph and
no X logo**, and subsetting a font cannot add one. Social marks are therefore
inline SVG in `SocialIcon.jsx` — a few hundred bytes each, they inherit the
surrounding colour, and adding a platform is one path plus one label.

Only platforms with an icon can be saved, so the footer never has to decide
what to draw for an unknown value. To add one: add the path to
`frontend/src/components/SocialIcon.jsx`, copy that file to
`dashboard/src/components/`, and add the name to `SOCIAL_PLATFORMS` in
`backend/src/validators/schemas.js`.

---

## Extending careers

The current build lists roles and points applicants at an email address. If the
firm later wants applications handled on the site, the work is:

1. An `Application` model — name, email, phone, covering note, the vacancy it
   refers to, and a CV reference
2. CV uploads through the existing signed Cloudinary flow, restricted to PDF and
   DOCX, stored in a separate private folder
3. An applicant inbox in the dashboard, shaped like Enquiries, with a status
   per applicant
4. **A retention policy.** CVs are personal data under the NDPR: decide how long
   they are kept, who may read them, and how they are deleted. This is the part
   that makes it a larger piece of work than it first appears, and it should be
   agreed with the firm in writing before it is built.

---

## Testing

```bash
cd backend  && npm test     # 79 tests
cd frontend && npm test     # 13 tests
```

The backend suite runs against a real MongoDB in memory and covers
authentication, the role matrix, the three super-admin invariants, CRUD, slug
redirects, HTML sanitisation, the media upload policy, rate limiting, and an
end-to-end walk from an admin's edit through to the public API.

---

## Deployment

Three Vercel projects from one repository.

| Project | Root directory | Build | Output |
|---|---|---|---|
| `pcn-api` | `backend` | — | `api/index.js` (serverless) |
| `pcn-frontend` | `frontend` | `npm run build` | `dist` |
| `pcn-dashboard` | `dashboard` | `npm run build` | `dist` |

Suggested domains — sharing one parent domain is what lets the session cookie
be first-party:

```
pcnsportivalp.com        → frontend
api.pcnsportivalp.com    → backend
admin.pcnsportivalp.com  → dashboard
```

Then set, in the API project:

```
COOKIE_DOMAIN=.pcnsportivalp.com
CORS_ORIGIN=https://pcnsportivalp.com,https://admin.pcnsportivalp.com
NODE_ENV=production
```

**MongoDB Atlas:** add Vercel's egress to the IP access list (`0.0.0.0/0` is the
practical setting for serverless, with a strong database password) and use an
M0 cluster. **Cloudinary:** the free tier covers this site comfortably.

### Going live checklist

- [ ] Rotate every credential handed over by the previous developer
- [ ] `NODE_ENV=production` on the API
- [ ] `COOKIE_DOMAIN` and `CORS_ORIGIN` set to the real domains
- [ ] First super admin created, initial password changed
- [ ] Content imported, reviewed and published
- [ ] Factual and legal review file signed off by the firm
- [ ] Colorlib template licence resolved (see below)
- [ ] `random/` deleted from the working tree

---

## Known items still outstanding

1. **Firebase export** — needed before content migration can run
2. **Template licence** — the design derives from Colorlib's free *Legalcare*
   template, whose licence requires either keeping the attribution or buying a
   licence. Resolve before launch for a commercial site.
3. **Credentials in `random/`** — a live MongoDB URI and Cloudinary secret are
   sitting in plaintext there, and one is a screenshot of the secret. That
   directory is gitignored; rotate the keys and delete it.
4. **Link previews** — handled, but verify after launch. The public site
   renders client-side, which social crawlers cannot read, so
   `frontend/middleware.js` detects known crawlers (WhatsApp, LinkedIn,
   Facebook, X, Slack, Discord, Telegram) and answers them with a small
   server-rendered document carrying the real Open Graph tags. Real visitors are
   untouched. **This runs only on Vercel** — it does nothing on a plain static
   host. After launch, check a link in Facebook's Sharing Debugger and
   LinkedIn's Post Inspector.
