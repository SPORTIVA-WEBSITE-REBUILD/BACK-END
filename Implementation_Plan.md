# PCN Sportiva LP — Implementation Plan

**Project:** Rebuild of pcnsportivalp.com — public site, admin dashboard, backend API
**Date:** 15 September 2026
**Status:** Planning complete; implementation in progress

---

## A. Current System Analysis

### A.1 What is actually on disk

```
sportiva/
├── CLAUDE.md          # project brief
├── frontend/          # Colorlib "Legalcare" static template (UNMODIFIED)
├── backend/           # EMPTY
├── dashboard/         # EMPTY
└── random/            # credentials + proposal (NOT part of any app)
```

**`frontend/` is not the client's website.** It is an unmodified download of the
Colorlib *Legalcare* free Bootstrap 4 template, used as a visual starting point.
Evidence:

- Every page carries `<title>Legalcare - Free Bootstrap 4 Template by Colorlib</title>`
- `main.html` is Colorlib's "thank you for using our template" attribution page
- Placeholder content throughout: *203 Fake St. Mountain View, San Francisco*,
  `info@yourdomain.com`, `+2 392 3929 210`, Vokalia/Consonantia lorem ipsum
- Stock team photos labelled Ryan Anderson, Greg Washer, Tony Henderson, Jack Smith
- Stock practice areas: Family Law, Business Law, Insurance Law, Criminal Law,
  Drug Offenses, Fire Accident, Employment Law, Property Law

There is **zero PCN Sportiva content** in the repository.

### A.2 Existing frontend architecture

| Aspect | Finding |
|---|---|
| Framework | **None.** Plain static HTML — 9 hand-maintained `.html` files |
| React | **Not present** (CLAUDE.md §3 assumed React; it does not exist) |
| Build tool | **None.** `prepros-6.config` indicates SCSS was compiled with Prepros (GUI) |
| Routing | Filesystem — `<a href="about.html">` |
| Styling | Bootstrap 4 + custom SCSS (`scss/style.scss` → `css/style.css`) |
| Components | None — markup duplicated across all 9 files (nav and footer copy-pasted 9×) |
| State/data | None — all content hardcoded in HTML |
| Dependencies | Vendored JS files, no package manager, no `package.json`, no lockfile |
| Env vars | None |
| API integration | None |
| SEO | Single duplicated `<title>`, **no meta description, no OG tags, no canonical, no sitemap** |
| Responsive | Yes — Bootstrap 4 grid, works |
| Animations | AOS, `animate.css`, jQuery Waypoints, Stellar parallax, `txt-rotate` typewriter, animateNumber counters |

### A.3 Existing pages

`index` · `about` · `attorneys` · `practice-areas` · `practice-single` ·
`case` · `blog` · `blog-single` · `contact` (+ `main.html`, the Colorlib notice)

### A.4 Existing assets

- `images/` — 24 stock JPEGs (`bg_1`, `bg_2`, `about`, `case-1..6`, `image_1..6`, `person_1..8`, `practice-1`, `loc.png`). **All placeholder stock photography.**
- `fonts/` — 4 icon font families: Flaticon, Icomoon, Ionicons, Open Iconic
- `css/` — Bootstrap 4, animate, AOS, Owl Carousel, Magnific Popup, bootstrap-datepicker, `style.css`
- `js/` — jQuery 3.2.1 + migrate, Popper, Bootstrap, Owl Carousel, Waypoints, Stellar, Scrollax, Magnific Popup, animateNumber, AOS, `main.js`, `google-map.js`

### A.5 Existing JS dependencies (vendored, unversioned except where noted)

jQuery 3.2.1 · jQuery Migrate 3.0.1 · jQuery Easing 1.3 · Popper · Bootstrap 4 ·
Owl Carousel · Magnific Popup · Waypoints · Stellar · Scrollax · animateNumber · AOS

### A.6 Existing forms

One contact form in `contact.html`. It is **non-functional**: `action="#"`, no
`name` attributes on any input, no validation, no submit handler.

### A.7 Existing article / blog structure

`blog.html` lists hardcoded cards; `blog-single.html` is a static article layout
with a comment section. No data model, no slugs, no dates, no authorship — all
markup. Nothing to migrate from the template.

### A.8 The live site (pcnsportivalp.com)

- Returns a **461-byte HTML shell** — `<div id="root">`, `/assets/index-*.js`
- It is **already a React + Vite SPA**, backed by Firebase (per the proposal)
- Content is entirely client-rendered → not recoverable from raw HTML
- `robots.txt` (Cloudflare-managed) sets `User-agent: ClaudeBot → Disallow: /`

**Decision:** no automated crawling. Content migration will run from a
**Firebase/Firestore export** supplied by the client, which the proposal already
lists as a client-provided item. See §H.

### A.9 Existing problems and limitations

1. **No content management whatsoever** — every edit requires a developer
2. **No React**, despite CLAUDE.md §3 requiring it
3. **9× duplication** of nav and footer — a nav change means 9 edits
4. **SEO is effectively absent** — no descriptions, OG tags, canonicals or sitemap
5. **Contact form is decorative** — submissions go nowhere
6. **All content is placeholder** — nothing is publishable as-is
7. **Colorlib licence** — the free licence forbids removing the footer attribution
   without purchase. Must be resolved before launch for a commercial client.
8. **Secrets in the working tree** — `random/credentials.env` holds a live
   MongoDB Atlas URI and Cloudinary keys in plaintext; `random/image.png` is a
   screenshot of the Cloudinary secret. Must be gitignored and rotated at handover.
9. **Page set mismatch** — the template's pages (attorneys / practice areas /
   case studies / blog) do not match the contracted nine-page scope.

---

## B. Target Architecture

### B.1 Three independent applications

```
  VISITOR                              ADMINISTRATOR
     │                                       │
     ▼                                       ▼
┌──────────────┐                     ┌──────────────────┐
│  FRONTEND    │                     │    DASHBOARD     │
│ React + Vite │                     │  React + Vite    │
│ pcnsportiva  │                     │ admin.pcnsportiva│
│   lp.com     │                     │      lp.com      │
└──────┬───────┘                     └────────┬─────────┘
       │  GET  (public, cached)               │  ALL (cookie auth)
       └──────────────┬───────────────────────┘
                      ▼
            ┌──────────────────────┐
            │     BACKEND API      │
            │  Node + Express on   │
            │  Vercel Serverless   │
            │ api.pcnsportivalp.com│
            └─────┬────────────┬───┘
                  ▼            ▼
        ┌──────────────┐  ┌──────────────────┐
        │   MongoDB    │  │   Cloudinary     │
        │    Atlas     │  │   (media + CDN)  │
        │   (M0 free)  │  │   (free tier)    │
        └──────────────┘  └──────────────────┘
                                  ▲
                                  │ signed direct upload
                                  │ (bypasses the API)
                             DASHBOARD
```

### B.2 How the three applications communicate

- **Frontend → API:** unauthenticated `GET` only, over CORS. Responses carry
  `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400` so
  Vercel's edge serves most reads without touching Mongo.
- **Dashboard → API:** all verbs, authenticated by an **httpOnly cookie**.
  Because the dashboard is on a sibling subdomain of the API, the cookie is
  scoped `Domain=.pcnsportivalp.com; SameSite=Lax; Secure` — a first-party
  cookie, immune to third-party-cookie blocking.
- **Dashboard → Cloudinary:** the browser uploads **directly** to Cloudinary
  using a short-lived signature minted by the API. Bytes never pass through
  Node (CLAUDE.md §9). The dashboard then POSTs the returned metadata to
  `/api/media` for persistence.
- **Frontend → Cloudinary:** `<img>` tags point at CDN URLs with transformation
  parameters baked in (`f_auto,q_auto,w_*`), plus `srcset` for responsive sizes.

### B.3 Deployment (CLAUDE.md §4)

Three Vercel projects on the Hobby/free tier:

| App | Vercel project | Output | Cost |
|---|---|---|---|
| frontend | `pcn-frontend` | static SPA + `vercel.json` rewrites | Free |
| dashboard | `pcn-dashboard` | static SPA | Free |
| backend | `pcn-api` | one serverless function `api/index.js` | Free |

Plus MongoDB Atlas **M0** (free, 512 MB) and Cloudinary **free tier**
(25 GB storage / 25 GB monthly bandwidth). Realistic running cost at this
scale: **₦0–25,000/month**, matching the proposal's estimate.

**Why Vercel serverless works here.** The whole API is a single Express app
exported as one function; Vercel handles routing via a catch-all rewrite. The
only serverless hazard is Mongo connection churn on cold start, solved by
caching the Mongoose connection on `globalThis` so warm invocations reuse it
(§B.4). No always-on server, no Redis, no queues, no containers (CLAUDE.md §4, Rule 4).

**Why not Render/Railway/Fly?** They require an always-on instance (paid, or
sleeps with 30 s cold starts on free tiers). Vercel's per-request model is
strictly cheaper for a brochure site's traffic, and colocating the API with the
frontend on one vendor simplifies handover.

### B.4 Serverless connection handling

```js
// backend/src/lib/db.js
let cached = globalThis.__mongoose;
if (!cached) cached = globalThis.__mongoose = { conn: null, promise: null };

export async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 5,          // Atlas M0 caps at 500 connections
      serverSelectionTimeoutMS: 8000,
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
```

---

## C. Database Design

MongoDB via **Mongoose 8**. Ten collections. All use `{ timestamps: true }`.

### C.1 `admins`

| Field | Type | Req | Notes |
|---|---|---|---|
| `name` | String | ✔ | trim, 2–80 |
| `email` | String | ✔ | lowercase, trim, **unique index** |
| `passwordHash` | String | ✔ | bcrypt cost 12, `select: false` |
| `role` | String | ✔ | enum `super_admin` \| `admin` \| `editor`, default `editor` |
| `permissions` | [String] | | explicit grants layered over the role |
| `isActive` | Boolean | ✔ | default `true` — disable without deleting |
| `lastLoginAt` | Date | | |
| `refreshTokenHash` | String | | `select: false`; rotated each refresh |
| `passwordChangedAt` | Date | | invalidates tokens issued earlier |

Indexes: `{ email: 1 }` unique · `{ role: 1, isActive: 1 }`

### C.2 `siteSettings` — singleton (`key: "global"`, unique)

Website name, logo (media ref), favicon, contact block (address, phone, email,
business hours), social links `[{ platform, url }]`, copyright text, SEO
defaults (title template, description, OG image), enquiry recipient address.

### C.3 `navigation`

`{ location: "header" | "footer", items: [{ label, href, order, external, children[] }] }`
Index: `{ location: 1 }` unique. One document per location — small, bounded,
one query per page load.

### C.4 `pages` — structured content for the fixed pages

| Field | Type | Notes |
|---|---|---|
| `slug` | String | **unique index**; `home`, `services`, `about`, `contact`, `privacy-policy`, `record-insights` |
| `title` | String | |
| `sections` | [Mixed] | `[{ key, type, heading, subheading, body, image, items[], cta{} }]` |
| `seo` | SeoSchema | shared sub-schema (§C.11) |
| `status` | String | `draft` \| `published` |

**Boundary (CLAUDE.md §8, Rule 7):** `sections` holds *content* keyed by a
stable `key`. React owns which component renders each `key`, and all layout,
styling and animation. The DB never describes a component.

### C.5 `services` (practice areas)

`title`, `slug` (unique), `icon` (flaticon class), `summary`, `body` (HTML),
`image` (media ref), `order`, `status`, `seo`.
Indexes: `{ slug: 1 }` unique · `{ status: 1, order: 1 }`

### C.6 `cases` — the filterable case record

The distinctive entity from the proposal: *"a filterable archive of the firm's
outcomes, by forum, year and party represented"*.

| Field | Type | Req | Notes |
|---|---|---|---|
| `title` | String | ✔ | |
| `slug` | String | ✔ | **unique index** |
| `forum` | String | ✔ | e.g. CAS, NFF, FIFA DRC, NDT, High Court |
| `year` | Number | ✔ | indexed |
| `partyRepresented` | String | ✔ | enum: `athlete` \| `club` \| `federation` \| `agent` \| `sponsor` \| `other` |
| `outcome` | String | ✔ | enum: `won` \| `settled` \| `dismissed` \| `ongoing` \| `withdrawn` |
| `summary` | String | ✔ | list-card excerpt |
| `body` | String | | sanitized HTML |
| `anonymised` | Boolean | ✔ | default `true` — parties not named |
| `practiceArea` | ObjectId → `services` | | |
| `featuredImage` | ObjectId → `media` | | |
| `publishedAt` | Date | | |
| `status` | String | ✔ | `draft` \| `published` |
| `seo` | SeoSchema | | |

Indexes: `{ slug: 1 }` unique · `{ status: 1, year: -1 }` ·
`{ status: 1, forum: 1, year: -1 }` · `{ status: 1, partyRepresented: 1, year: -1 }` ·
text index on `title` + `summary`

> **Confidentiality.** `anonymised` defaults to `true` and the dashboard warns
> before publishing a named matter — matching the proposal's requirement that
> the firm decides which matters may name parties.

### C.7 `articles` (insights)

`title`, `slug` (unique), `excerpt`, `body` (sanitized HTML), `author`
(ObjectId → `lawyers`), `category` (ObjectId → `categories`), `tags` [String],
`featuredImage` (ObjectId → `media`), `status` (`draft`|`published`),
`publishedAt`, `readingMinutes`, `seo`.
Indexes: `{ slug: 1 }` unique · `{ status: 1, publishedAt: -1 }` ·
`{ category: 1, status: 1, publishedAt: -1 }` · `{ tags: 1 }` · text on title+excerpt

### C.8 `categories`

`name`, `slug` (unique), `description`. Small and bounded.

### C.9 `lawyers`

`name`, `slug` (unique), `role`, `bio` (HTML), `photo` (media ref),
`qualifications` [String], `practiceAreas` [ObjectId → `services`],
`email`, `phone`, `socials` [{platform, url}], `order`, `status`, `seo`.
Indexes: `{ slug: 1 }` unique · `{ status: 1, order: 1 }`

### C.10 `media` — Cloudinary metadata only

`publicId` (unique), `url`, `secureUrl`, `format`, `resourceType`, `width`,
`height`, `bytes`, `alt`, `caption`, `folder`, `uploadedBy` (ObjectId → `admins`).
**No binaries in Mongo** (CLAUDE.md §3, §15).
Indexes: `{ publicId: 1 }` unique · `{ createdAt: -1 }` · `{ folder: 1 }`

### C.11 `enquiries` — contact form submissions

`name`, `email`, `phone`, `subject`, `message`, `status`
(`new`|`read`|`replied`|`spam`), `ipHash` (hashed, not raw — data minimisation),
`userAgent`, `readAt`.
Indexes: `{ status: 1, createdAt: -1 }` · `{ createdAt: -1 }`

### C.12 Shared `SeoSchema` sub-document

`metaTitle`, `metaDescription`, `canonicalUrl`, `ogImage` (media ref),
`noIndex` (Boolean).

### C.13 Slug safety (CLAUDE.md §18)

Renaming a slug would break live URLs. Every slugged model keeps
`previousSlugs: [String]` (indexed). Lookups fall back to `previousSlugs` and
respond **301** to the current URL. Administrators cannot silently break links.

---

## D. API Design

Base: `https://api.pcnsportivalp.com/api`. All responses share one envelope.

```jsonc
// success
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 12, "total": 47 } }
// failure
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…",
                               "details": [{ "path": "email", "message": "…" }] } }
```

Codes: `VALIDATION_ERROR` 400 · `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 ·
`NOT_FOUND` 404 · `CONFLICT` 409 · `RATE_LIMITED` 429 · `SERVER_ERROR` 500.
Stack traces are logged, never returned (CLAUDE.md §14).

### D.1 Auth — `/api/auth`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/login` | — | email + password → sets access + refresh cookies. Rate limited 5/15 min per IP+email |
| POST | `/refresh` | refresh cookie | rotates the refresh token |
| POST | `/logout` | access cookie | clears cookies, nulls `refreshTokenHash` |
| GET | `/me` | access cookie | current admin + permissions |
| PATCH | `/me` | access cookie | own name / email |
| PATCH | `/me/password` | access cookie | requires current password; bumps `passwordChangedAt` |

### D.2 Public content — no auth, all `GET`, all edge-cached

```
GET /api/public/settings                 → site settings + both navigations (one call)
GET /api/public/pages/:slug              → page + sections
GET /api/public/services                 → published, ordered
GET /api/public/services/:slug
GET /api/public/cases?forum=&year=&party=&page=&limit=
GET /api/public/cases/filters            → distinct forums/years/parties for the filter UI
GET /api/public/cases/:slug
GET /api/public/articles?category=&tag=&q=&page=&limit=
GET /api/public/articles/:slug
GET /api/public/lawyers
GET /api/public/lawyers/:slug
POST /api/public/enquiries               → contact form (rate limited + honeypot)
```

List endpoints return **projected summary documents only** — never full bodies
(CLAUDE.md §11). `/settings` is deliberately one call so the shell needs one
round trip rather than three.

### D.3 Admin content — cookie auth + permission checks

Uniform REST for `pages`, `services`, `cases`, `articles`, `categories`,
`lawyers`, `media`, `enquiries`:

```
GET    /api/<resource>          list, paginated, incl. drafts, ?q= search
POST   /api/<resource>          create
GET    /api/<resource>/:id      read
PATCH  /api/<resource>/:id      update
DELETE /api/<resource>/:id      delete (confirmation enforced client-side)
PATCH  /api/<resource>/:id/status   publish / unpublish
```

Plus:
```
GET    /api/settings            PATCH /api/settings
GET    /api/navigation/:location PUT  /api/navigation/:location
POST   /api/media/sign          → short-lived Cloudinary upload signature
POST   /api/media               → persist metadata after a direct upload
GET    /api/admins  POST /api/admins  PATCH /api/admins/:id  DELETE /api/admins/:id   (super_admin only)
GET    /api/stats               → dashboard counts (one aggregation, not N queries)
```

### D.4 Validation

**Zod** schemas on every write, applied as `validate(schema)` middleware before
the controller. Unknown keys stripped — mass-assignment is impossible. Mongoose
schemas provide a second layer (CLAUDE.md §15).

---

## E. Authentication & Authorization

### E.1 Token strategy

- **Access token** — JWT, 15 min, httpOnly + Secure + SameSite=Lax cookie
- **Refresh token** — opaque random 256-bit, 7 days, httpOnly cookie, stored
  **hashed** on the admin document, **rotated on every use**
- Cookies scoped `Domain=.pcnsportivalp.com` so dashboard and API share them
  first-party
- `passwordChangedAt` invalidates any access token issued before a password change

**Why cookies, not `localStorage`:** an XSS in the dashboard cannot read an
httpOnly cookie. Since API and dashboard are same-site, CSRF risk is handled by
`SameSite=Lax` plus an `Origin` check on all state-changing verbs.

**Fallback if subdomains are unavailable:** access token in memory (never
storage) + `SameSite=None; Secure` refresh cookie. Documented, not default.

### E.2 Roles and permissions

Roles expand to permission sets, so new roles need no rewrite (CLAUDE.md §6E):

```js
const ROLE_PERMISSIONS = {
  editor:      ['articles:*', 'cases:*', 'media:*', 'enquiries:read'],
  admin:       ['articles:*','cases:*','media:*','enquiries:*','pages:*',
                'services:*','lawyers:*','categories:*','settings:*','navigation:*'],
  super_admin: ['*'],
};
```

Middleware `requirePermission('cases:update')` checks
`ROLE_PERMISSIONS[role] ∪ admin.permissions` against the requirement,
honouring `*` wildcards. Adding a role is a data change, not a refactor.

### E.3 Protected super-admin capability

Only `super_admin` may touch `/api/admins`. Three invariants are enforced
server-side (CLAUDE.md §6E):

1. The **last active super_admin cannot be deleted, demoted or disabled**
2. An admin **cannot change their own role** (no self-escalation)
3. An admin **cannot delete their own account**

### E.4 Bootstrapping the first super admin

`npm run create-admin` — an interactive CLI in the backend. No default
credentials ever ship, and no seeded password exists in any file.

---

## F. Media Architecture (CLAUDE.md §9)

**Cloudinary.** The decision is already made by the client's existing account
(`random/credentials.env`, cloud `pkesmajk`) and the proposal's reference to
migrating an existing Cloudinary library. It is also the right choice on merits:

| Criterion | Cloudinary | S3 + CloudFront | Verdict |
|---|---|---|---|
| Cost at this scale | Free 25 GB | ~$1–3/mo + setup | Cloudinary |
| Transformations | Built into the URL | Needs Lambda@Edge | **Cloudinary** |
| `f_auto` / `q_auto` (AVIF/WebP) | Automatic | Manual pipeline | **Cloudinary** |
| CDN | Included | Separate service | Cloudinary |
| Upload UX | Signed direct browser upload | Presigned PUT, more wiring | Cloudinary |
| Serverless fit | Stateless SDK | Stateless SDK | Tie |
| Existing account | **Yes** | No | **Cloudinary** |

### F.1 Upload flow — bytes never touch Node

```
Dashboard  → POST /api/media/sign  (auth + MIME/size policy)
           ← { signature, timestamp, apiKey, folder }
Dashboard  → POST direct to Cloudinary (XHR, with progress bar)
           ← { public_id, secure_url, width, height, bytes, format }
Dashboard  → POST /api/media  (persist metadata)
           → MongoDB
Frontend   ← secure_url + transformations
```

### F.2 Delivery

A `cloudinaryUrl(publicId, { w, h, crop })` helper injects `f_auto,q_auto,dpr_auto`
and emits `srcset` at 480/768/1200/1920 px. Below-the-fold images get
`loading="lazy"`; the hero gets `fetchpriority="high"`.

### F.3 Upload policy

Server-side: `image/jpeg|png|webp|avif` and `application/pdf` only; 10 MB cap;
fixed folder prefix; `resource_type` pinned. The signature is minted only for
parameters the server itself chose, so the client cannot widen the policy.

---

## G. Article Editor (CLAUDE.md §17)

**Choice: TipTap rich text → sanitized HTML.**

| Option | Security | Ease for non-technical staff | Consistency | Verdict |
|---|---|---|---|---|
| Raw HTML textarea | Poor | Poor | Poor | Rejected |
| Markdown | Good | Moderate — syntax to learn | Good | Rejected |
| **TipTap → sanitized HTML** | Good with sanitiser | **Excellent — WYSIWYG** | Good | **Chosen** |
| Structured blocks | Good | Good | Excellent | Rejected — over-engineered for a 3-week scope (Rule 3) |

The firm's staff are lawyers, not developers, and the proposal promises they can
"publish unaided" after one week of coaching. WYSIWYG is the only option that
delivers that. Security is handled by sanitising **on write** in the backend with
`sanitize-html` against a strict allowlist (`p, h2–h4, strong, em, ul, ol, li,
blockquote, a[href|title], img[src|alt], figure, figcaption, br`), stripping all
scripts, event handlers and `javascript:` URLs. Because content is stored
pre-sanitised, the frontend renders it directly and any future consumer inherits
the same guarantee.

---

## H. Content Migration

The live site is a React SPA over Firebase; its HTML contains no content, and its
`robots.txt` disallows automated crawlers. Migration therefore runs from a
**Firestore export** (a client-provided item in the proposal).

`backend/scripts/import-firebase.js` accepts a Firestore JSON export, maps the
legacy collections onto the schemas above, re-uploads referenced images into the
new Cloudinary folder, generates slugs, and reports anything it could not map.
It is **idempotent** — safe to re-run as further exports arrive.

Until the export lands, a small `seed.js` populates structural stubs so the site
and dashboard are demonstrable end to end.

---

## I. Frontend Migration (CLAUDE.md §10)

### I.1 Stack

Vite 5 + React 18 + React Router 6 + TanStack Query + `react-helmet-async`.

### I.2 Preserving the design

The existing `scss/style.scss` and Bootstrap 4 CSS are **carried over verbatim**
and imported once in `main.jsx`. Markup moves from `.html` into `.jsx` with
classnames unchanged, so the rendered DOM — and therefore the visual result — is
identical. The 9× duplicated nav and footer collapse into one `<Layout>`.

jQuery plugins are replaced with small React equivalents that produce the same
visual behaviour (AOS works as-is via a router-aware `AOS.refresh()`; Owl Carousel
→ a light React carousel; Waypoints counters → IntersectionObserver;
`txt-rotate` → a hook). jQuery itself is dropped — a ~90 KB saving with no visual change.

### I.3 Routes (contracted nine-page scope)

```
/                      home
/services              services index
/services/:slug        service detail
/record                case record — filterable archive
/record/:slug          case detail
/insights              articles index
/insights/:slug        article detail
/lawyers/:slug         lawyer profile
/about                 about
/contact               contact + enquiry form
/privacy-policy        privacy policy
*                      404
```

### I.4 Data flow

`<h1>Hardcoded heading</h1>` → `<h1>{page.hero.title}</h1>`, fed by TanStack
Query. Site settings and navigation are fetched once in the layout and cached;
each page fetches only its own document (CLAUDE.md §11). Every component keeps a
skeleton loading state so no layout shift occurs.

### I.5 SEO

`react-helmet-async` renders title, description, canonical and OG/Twitter tags
per route from the `seo` sub-document, with `siteSettings` defaults as fallback.
A build-time `sitemap.xml` generator queries published slugs.

> **Known limitation and how it is resolved.** A Vite SPA renders client-side.
> Google executes JS and will index it, but social scrapers (WhatsApp, LinkedIn,
> X, Slack) do not, so link previews would show nothing. Schedule 1 item 7 of
> the signed agreement lists "link preview metadata" as a deliverable, so this
> is not optional.
>
> **Implemented:** `frontend/middleware.js` runs on Vercel's edge. It matches a
> deliberately narrow list of crawler user-agents, fetches the record from the
> API, and returns a small document carrying the real Open Graph and Twitter
> tags. Every other request falls straight through to the SPA, and any failure
> (timeout, API down, unknown route) also falls through rather than degrading
> the page. The pure logic is unit-tested in `src/test/prerender.test.js`,
> including attribute escaping.
>
> **Residual risk:** this depends on Vercel's edge middleware. On a plain static
> host it is inert, and previews would regress. Moving the frontend to Next.js
> remains the structural fix if the site ever leaves Vercel.

---

## J. Performance (CLAUDE.md §11)

- Edge caching: `s-maxage=300, stale-while-revalidate=86400` on all public GETs;
  the dashboard purges by revalidating on write
- Lean queries: `.lean()`, explicit `.select()` projections, never full bodies in lists
- Indexes match every documented query pattern (§C)
- No N+1: `.populate()` with projection, or `$lookup` in the stats aggregation
- Route-level code splitting via `React.lazy`
- Images: `f_auto,q_auto`, `srcset`, lazy loading below the fold
- Cold start: cached Mongo connection, `maxPoolSize: 5`, minimal dependency graph

## K. Security (CLAUDE.md §12)

`helmet` · strict CORS allowlist from `CORS_ORIGIN` · `express-rate-limit`
(login 5/15 min, enquiries 3/hour, global 100/15 min) · `express-mongo-sanitize`
against operator injection · Zod on every write · bcrypt cost 12 ·
httpOnly/Secure/SameSite cookies · Origin check on state-changing verbs ·
`sanitize-html` on all rich text · signed uploads with server-chosen MIME/size
policy · payload cap 1 MB · secrets only in Vercel env vars, never in any client
bundle · generic error bodies in production.

`random/` is added to `.gitignore`. **The MongoDB and Cloudinary credentials
currently sitting in plaintext in the working tree should be rotated before handover.**

## L. Environment Configuration (CLAUDE.md §13)

**backend/.env.example**
```
MONGODB_URI=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
COOKIE_DOMAIN=.pcnsportivalp.com
CORS_ORIGIN=https://pcnsportivalp.com,https://admin.pcnsportivalp.com
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=pcn-sportiva
ENQUIRY_RECIPIENT=
RESEND_API_KEY=
NODE_ENV=development
```

**frontend/.env.example** — `VITE_API_URL=`, `VITE_SITE_URL=` (public only)
**dashboard/.env.example** — `VITE_API_URL=` (no secrets; auth lives in cookies)

## M. Testing (CLAUDE.md §20)

Vitest + Supertest + `mongodb-memory-server` on the backend: auth (login,
refresh rotation, lockout), authorization (role matrix, the three super-admin
invariants), CRUD for cases and articles, slug uniqueness and 301 fallback,
Zod validation rejection, media signing policy, enquiry rate limiting.
React Testing Library on the frontend for API-driven rendering and loading states.
Plus the manual end-to-end walk: log in → edit → Mongo → frontend → visitor.

## N. Build Order (CLAUDE.md §19, §23)

The static site in `frontend/` keeps working untouched until its React
replacement is complete and verified.

1. Backend scaffold, DB connection, models, indexes
2. Auth + authorization + `create-admin` CLI
3. Public + admin API routes, validation, error handling
4. Cloudinary signing and media persistence
5. Backend tests
6. Dashboard: auth, shell, then each content module
7. Frontend: Vite scaffold, port SCSS + layout, then page by page
8. Frontend tests, SEO, sitemap
9. Firebase import script (on receipt of the export)
10. Optimisation pass and documentation

---

## O. Open Items Requiring the Client

1. **Firestore export** from the existing Firebase project — blocks content migration (§H)
2. **Colorlib licence** — purchase, or the design must not retain template attribution (§A.9.7)
3. **Confidentiality decisions** — which matters may name parties (§C.6)
4. **Credential rotation** at handover (§K)
5. **Subdomain access** for `api.` and `admin.` — enables the cookie auth model (§E.1)
