# Template Parity Plan

**Goal:** the React site renders the Colorlib *Legalcare* template
(`frontend/legacy-template/`) identically — every section, component, animation
and interaction — with **every text, label, placeholder, image and link stored
in the backend and editable in the dashboard**. The template's placeholder copy
is replaced by the firm's content through the CMS, never by code.

Reference: `frontend/legacy-template/*.html` and `js/main.js`.

---

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **URLs stay as built** (`/services`, `/record`, `/insights`, `/lawyers`). Template page designs map onto them. | Parity is about how pages look. Sitemap, redirects, structured data and tests already use these paths. Menu labels are CMS-editable, so the menu can still read "Practice Areas", "Attorneys", "Case Studies", "Blog". |
| D2 | **Pages added after the template stay**: Careers, Privacy Policy, case detail, team profile, 404, gallery. They're built only from template components. | They're contracted or were explicitly requested; removing them would be a regression. |
| D3 | **Case archive filters stay, behind a setting.** | Schedule 1 contracts a filterable archive, but the template's case page has none. Setting `showCaseFilters`, default **on**. |
| D4 | **Blog comments are built for real**, with moderation. | The template shows threaded comments and a comment form. A law firm's site must not publish unmoderated comments, so new comments are held as `pending`. |
| D5 | **Built on the existing page blueprints** (`backend/src/config/pageBlueprints.js`). Each page lists its sections and what each field means; the dashboard generates its editor from that. Home and About each keep their own consultation and testimonials sections, as the blueprints already define. | One content system, not two. The blueprint work was already underway and tested. |
| D6 | **All interface chrome is content.** Sections gain a `labels` field: named strings such as placeholders, button text and widget titles, each with the template's wording as its default. Chrome shared by every page (menu button, newsletter band, footer headings, "Read more", breadcrumb "Home") lives on a `layout` blueprint page, delivered with the site settings in one request. The **backend** fills in defaults, so the frontend never hardcodes text. | The brief is "every text". |
| D7 | **No Colorlib credit line** in the footer (removed at the firm's request, 2026-09-17). | The free template licence requires attribution, so a Colorlib licence must be bought before launch — tracked in the README launch checklist. |
| D8 | **Animations are rebuilt without jQuery** and emit the same markup and classes, so the template's CSS styles them unchanged. | Same visual result, no jQuery. |

---

## 2. Global chrome (every page)

| Slot | Template | CMS source |
|---|---|---|
| Loader | Fullscreen spinner, removed on load | behaviour |
| Brand name + tagline span | `Legalcare <span>A Law Firm Agency</span>` | `settings.siteName`, `settings.tagline` |
| Menu links | 7 links, active state | Navigation → header |
| Menu CTA button | "Free Consultation" | `layout.navCta` (cta) **NEW** |
| Navbar scroll states | `scrolled` >150px, `awake` >350px, `sleep` scrolling back up | behaviour |
| Inner page banner | background image, `h1.bread` title, breadcrumbs | page `hero` section; `layout.shared` label `breadcrumbHome` |
| Newsletter band (all except Contact) | heading, email placeholder, "Subscribe" | `layout.newsletter` (heading + labels) **NEW** · Subscriber collection **NEW** |
| Footer col 1 | brand, about paragraph, 3 social icons | `siteName`, `tagline`, `layout.footer` body **NEW**, `socials` |
| Footer col 2 | "Practice Areas" + 8 links | `layout.footer` label `servicesHeading`, Services |
| Footer col 3 | "Have a Questions?" + address, phone, email | `layout.footer` label `contactHeading`, `contact.*` |
| Footer col 4 | "Business Hours" + groups (*Opening Days:* 2 lines, *Vacations:* 2 lines) | `layout.hours` heading + items `{title, text: one line per row}` **NEW** |
| Copyright | "Copyright © {year} All rights reserved" + credit | `layout.footer` label `copyright` (`{year}` token); credit removed (D7) |

---

## 3. Pages

### 3.1 Home (`index.html` → `/`)

| # | Section | Slots | Source |
|---|---|---|---|
| 1 | Hero (`js-fullheight`, parallax) | image · subheading · heading · **rotating words + period** (typewriter) · paragraph · button label/link | `home.hero`; words = `items[].title`, period = `value` |
| 2 | Why Select Us | subheading · heading · paragraph · button · **3 cards** (icon, title, text, link) | `home.services` + first 3 Services (icon, title, summary, link) |
| 3 | About block | image · **video URL** (Vimeo popup) · subheading · heading · paragraph · **3 tabs** (label + text) · **counter** (number + label, 7s count-up) | `home.intro` (image, video, tabs) + `home.experience` (counter) |
| 4 | Case carousel (Owl, centred, looping) | subheading · heading · cards (image, title, category) · button | `home.record` + Cases |
| 5 | Attorneys (flip cards) | subheading · heading · cards (photo, name, role, **quote**) | `home.team` + Team (`quote` **NEW**) |
| 6 | Consultation form (parallax background) | image · subheading · heading · 4 placeholders · button | `home.consultation` (labels for placeholders/button) → Enquiries (`source: consultation`) |
| 7 | Testimonials (Owl, centred) | subheading · heading · cards (quote, photo, name, position) | `home.testimonials` + Testimonial collection **NEW** |
| 8 | Recent Blog | subheading · heading · 3 cards (title, image, day/year/month, excerpt, "Read more") | `home.insights` + Articles |
| 9 | Newsletter band | see §2 | global |
| + | Gallery (added, D2) | as built | `home.gallery` + Gallery |

### 3.2 About (`about.html` → `/about`)
Banner (`about.hero`) · About block (`about.intro` + `about.experience`) · Consultation (`about.consultation`) · Testimonials (`about.testimonials`) · Newsletter.

### 3.3 Attorneys (`attorneys.html` → `/lawyers`) **NEW route**
Banner · every team member as a flip card (`col-lg-3 col-sm-6`) · Newsletter.

### 3.4 Practice Areas (`practice-areas.html` → `/services`)
Banner · cards (`col-md-3`: icon, linked title, summary, arrow button) · Newsletter.

### 3.5 Practice Single (`practice-single.html` → `/services/:slug`)

| Slot | Source |
|---|---|
| Banner title | service title |
| Image | `service.image` |
| "Overview:" heading · overview text | `service-detail.overview` heading · `service.body` |
| "How Can We Help !" heading · text | `service-detail.help` heading + body |
| "Request Free Consultation" button | `service-detail.help` cta |
| "Our Legal Advisors" + flip cards (`col-lg-6`) | `service-detail.advisors` heading · team members linked to this service |
| Sidebar | §3.9 |

### 3.6 Case Studies (`case.html` → `/record`)
Banner · filter bar if `showCaseFilters` (D3) · cards (`col-md-4 case img`: image, title, category) · numbered pagination (`block-27`) · Newsletter.

### 3.7 Blog (`blog.html` → `/insights`)
Banner · cards (`col-md-4 blog-entry`: title, image, day/year/month, excerpt, "Read more") · pagination · Newsletter.

### 3.8 Blog Single (`blog-single.html` → `/insights/:slug`)

| Slot | Source |
|---|---|
| Banner title · image · h2 title · rich body | Article |
| Tag widget | `article.tags` |
| About author (photo, name, bio) | Article author |
| "{n} Comments" · threaded list (avatar, name, date, text, Reply) | Comment collection **NEW** (approved only) · `labels: commentsHeading` · `labels: reply` |
| "Leave a comment" form (Name *, Email *, Website, Message, "Post Comment") | `labels: comment*` → Comment (`pending`) |
| Sidebar | §3.9 |

### 3.9 Sidebar (Practice Single and Blog Single)

| Widget | Source |
|---|---|
| Search ("Type a keyword and hit enter") | `labels: searchPlaceholder` → `/insights?q=` |
| Categories | `labels: categoriesTitle` · services (practice) or article categories (blog) |
| Recent Blog (image, title, date, author, comment count) | `labels: recentBlogTitle` · Articles |
| Tag Cloud | `labels: tagCloudTitle` · distinct article tags |
| Paragraph | `settings.sidebarParagraph {title, text}` **NEW** |

### 3.10 Contact (`contact.html` → `/contact`)
Banner · "Contact Information" · Address / Phone / Email / **Website** (label + value) · form (4 placeholders, "Send Message") · map. **No newsletter band.**
New: `contact.website`; labels for the four field names and the heading.

---

## 4. Animations and interactions

| Behaviour | Template (`main.js`) | Rebuild |
|---|---|---|
| Loader | `#ftco-loader.show` removed on load | same element and class, removed after first paint |
| Scroll reveal | `.ftco-animate` → `fadeInUp ftco-animated`, 100ms then 50ms stagger, `data-animate-effect` | `useRevealAll`, timings aligned |
| Navbar | `scrolled` / `awake` / `sleep` at 150 and 350px | exact thresholds and class transitions |
| Full-height hero | `js-fullheight` = window height | CSS `100svh` (already in place) |
| Parallax | Stellar, `data-stellar-background-ratio="0.5"` | rAF background-position shift, same ratio; off on touch devices |
| Typewriter | TxtRotate: types at 200–300ms per char, deletes at half that, holds `period`, pauses 500ms | same algorithm |
| Counters | `animateNumber` to `data-number` over **7000ms**, comma-separated, when in view | same duration and formatting |
| Tabs | Bootstrap pills with fade | same markup, React state |
| Case carousel | Owl: `center`, `loop`, margin 30, items 1 / 2 / 3 at 0 / 600 / 1000px, dots | component emitting Owl markup; drag and dots |
| Testimony carousel | Owl: `center`, no loop, same breakpoints | same component |
| Video | Magnific Popup iframe, `mfp-fade`, disabled under 700px | component emitting `mfp-*` markup |
| Flip cards | CSS hover | unchanged |

Stylesheets to re-link: `owl.carousel.min.css`, `owl.theme.default.min.css`, `magnific-popup.css`.

---

## 5. Backend additions

| Change | Detail |
|---|---|
| `Testimonial` collection | `quote`, `name`, `position`, `photo`, `order`, `status` |
| `Subscriber` collection | `email` (unique), `status`, `ipHash`; public subscribe endpoint, rate limited |
| `Comment` collection | `article`, `parent`, `name`, `email`, `website`, `message`, `status` (`pending`/`approved`/`spam`), `ipHash`; public post (always `pending`) and list (approved only), rate limited, honeypot |
| `Enquiry.source` | `contact` or `consultation` |
| `Lawyer.quote` | short text for the back of the flip card |
| `SiteSettings` | `contact.website`, `showCaseFilters` |
| Section field `labels` | map of named strings; blueprint fields declare the keys, their dashboard names and template defaults |
| Blueprint page `layout` | menu button, newsletter band, footer about text, footer column headings, business-hours groups, copyright, shared labels ("Read more", breadcrumb "Home") |
| Blueprint additions | labels for consultation and contact forms, comments, sidebar widgets, contact information; `blog-detail` comment and sidebar sections |
| Public settings response | includes the `layout` page, so the shell still costs one request |

## 6. Dashboard additions

- **Testimonials**: list and edit
- **Subscribers**: list, search, delete, CSV export
- **Comments**: moderation queue (approve, mark spam, delete), filterable by status
- **Pages editor**: renders `labels` fields from the blueprint, showing each template default as a placeholder; the `layout` page holds global chrome
- **Site Settings**: website, template credit and case-filter toggles
- **Team**: `quote`

## 7. Done means

For every template page: the React page, loaded with the template's own placeholder text, renders the same sections in the same order, with the same number of text and image slots, and the same animations. Every slot is proven editable by changing it in the dashboard and seeing the change on the site.

---

## 8. Status (2026-09-17)

Built and tested:

- **Backend:** `labels` on sections; `layout` page served with settings; blueprint defaults filled server-side; Testimonials, Subscribers (CSV export), moderated threaded Comments; `Enquiry.source`, `Lawyer.quote`, settings `contact.website` / `showCaseFilters`; advisors on services, comment counts, categories and tags endpoints. Business hours and copyright move from settings to the layout page when `npm run seed` runs. Blueprints now list only template sections (home `stats`/`cta`, about `stats`/`team`, and list-page `intro` sections are no longer rendered; stored content shows under "Unused sections" in the page editor).
- **Dashboard:** label editor with template defaults as placeholders; Testimonials, Comments, Subscribers screens; Settings display switches and website; team quote; enquiry form filter; overview counts.
- **Frontend:** every page rebuilt with the template's markup (`src/components/template/`); loader, navbar scroll states, Stellar parallax, TxtRotate, 7s counters, Owl carousels, Magnific video popup, tabs, flip cards, reveal timings; new `/lawyers` route; all text from the API.
- **Verification:** `src/test/parity.test.jsx` asserts each template page's top-level blocks and classes match in order. Side-by-side headless screenshots with the template's own content matched page heights exactly on Home (6694px) and About (3531px); remaining height differences came from sample data (item counts, pagination).
- Fixed along the way: `animate-subset.css` had lost `.ftco-animated` (revealed blocks faded back out); `ionicons-subset.css` styled the span instead of `::before` (arrows misaligned).

## 9. Changes after parity, at the firm's request (2026-09-17)

The template is the base; these deliberate departures were requested afterwards:

- **Brand:** primary colour is the firm's blue `#047dd6` (template gold removed) on the site and the dashboard; the Colorlib credit is removed (a licence is required before launch).
- **Type:** headlines in Playfair Display (a high-contrast Baskerville-style serif), text and interface in Montserrat — on both apps.
- **Buttons:** pill-shaped, liquid-glass treatment (translucent blue with backdrop blur, white-to-blue edge light; on hover a white sheen sweep, deeper blur and a soft blue shadow). Form submits are `<button>`s so they can carry it.
- **Previews:** case cards show forum · year · outcome, two lines of summary and Read more; insight cards show author · category · reading time with a clamped excerpt; team cards link to the profile with a bio preview; a "We're hiring" strip shows open roles on home; service pages list related matters, profiles list recent insights.
- **Service cards:** image-led (no icons); the whole card links; hover blends blue into white. The icon picker is gone from the service editor.
- **Hero:** each rotating word can have its own background (Pages → Home → Hero → Rotating words), cross-fading as the word is typed. Four brand-coloured maps (Natural Earth, public domain) are attached: Africa, Nigeria, the continent, and a world view.
- **Carousels:** no dots; they advance every 5 s, pausing on hover, focus or drag, and never for reduced motion; arrow keys move them.
- **Responsive:** audited every site route (15) and dashboard screen (28) at 320–1440 px with no horizontal overflow. Fixes: detail banners grow for long titles and use a smaller phone title; case and article images keep a 4:3 box with the whole graphic fitted (Cloudinary `c_pad,b_auto`); tighter menu spacing at 992–1199 px; dashboard top bar wraps on phones; mobile menu button is icon-only.
