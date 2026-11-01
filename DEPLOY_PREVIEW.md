# Deploy preview: `webinar-integration` — API

## Site
This repo deploys to the Netlify site named **pcnsportivalp-api**
(production URL `https://pcnsportivalp-api.netlify.app`). I'm writing this
from local project files, not a live Netlify API call in this session — if
the site name or ID has changed since the last deploy I did, confirm it in
Netlify before relying on the branch-deploy URL below.

**Branch deploys must be turned on** for this to produce a preview at all:
Site settings → Build & deploy → Deploy contexts → enable **Deploy previews
and branch deploys**, or at minimum set `webinar-integration` as a
branch to build. Without this, pushing the branch alone builds nothing.

Once enabled, the branch deploy is served at a predictable URL:
```
https://webinar-integration--pcnsportivalp-api.netlify.app
```

## Environment variables the branch build needs (NAMES only)

Already live for the enquiry-email feature — the webinar mailer **reuses
these**, it does not duplicate them (see the Stage 1 report for why):
- `MONGODB_URI`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `CORS_ORIGIN`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `PUBLIC_SITE_URL`

New, for this feature only:
- `MAIL_FROM_NAME`
- `MAIL_FROM_ADDRESS`
- `MAIL_REPLY_TO`
- `EMAIL_DRY_RUN` — set to `true` on this branch's preview so test
  registrations never send a real email; the rendered HTML/text land in
  `./tmp/email-preview.*` inside the function's ephemeral filesystem instead
  (not retrievable after the invocation ends — use `npm run email:preview`
  locally to actually see the output, not the deployed preview).
- `SMTP_SECURE` (optional — only if the default port-465 convention is wrong
  for this account)
- `TURNSTILE_SECRET_KEY` (optional — omit to leave Turnstile verification
  skipped)
- `COOKIE_DOMAIN` — leave **unset** on every Netlify `*.netlify.app`
  preview. The dashboard preview and this API preview are different site
  names under the same `netlify.app` suffix, so they are cross-site; the
  cookie logic (`src/lib/tokens.js`) only sends `SameSite=None` when
  `COOKIE_DOMAIN` is empty. Setting it here would break preview login.

**Every name above must be set in Netlify's "Branch deploys" context, not
only "Production."** Site settings → Environment variables → for each one,
open its scope and tick Branch deploys (or set it to "All contexts"). A
variable scoped to Production-only is invisible to this branch's build and
the function will throw its "missing required environment variables" error
at cold start.

## CORS for the branch preview

`CORS_ORIGIN` is a literal comma-separated allowlist (`src/app.js`,
`origin()` callback) — there's no wildcard or subdomain matching. The branch
deploy's **exact** preview URLs must be added to it:
```
https://webinar-integration--pcnsportivalp-web.netlify.app,
https://webinar-integration--pcnsportivalp-admin.netlify.app
```
Since `CORS_ORIGIN` is one value shared by every context, either add these
to the existing Production value (safe — they won't match anything except
this branch's exact preview hosts) or set a Branch-deploys-scoped override
with just these two plus `http://localhost:5173`/`:4000` for local work.

## Safety for this branch specifically

- Every new collection here (`webinars`, `webinarregistrations`,
  `ratelimithits`) is additive; nothing in `scripts/seed-webinar.js` or any
  route touches an existing collection.
- `webinarHeroEnabled` defaults to `false` in the schema and is seeded as
  `false` — the home page hero is unaffected until an administrator
  switches it on.
- Use `@example.test`-style addresses (an IANA-reserved test TLD) when
  registering through the preview, then clear them with:
  `DELETE /api/admin/webinar/registrations/test-cleanup?domain=example.test`
  (admin auth required, `webinar:write`). It only deletes rows whose email
  ends in exactly that domain — see `tests/webinar.test.js` for the proof
  it can't touch anything else.
