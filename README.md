# PCN Sportiva LP — Backend API

Node.js + Express API on Vercel serverless, backed by MongoDB and Cloudinary.
Serves both the public website and the admin dashboard.

**Related repositories**
- Public website — `SPORTIVA-WEBSITE-REBUILD/FRONT-END`
- Admin dashboard — `SPORTIVA-WEBSITE-REBUILD/DASHBOARD`

---

## Running locally

```bash
npm install
cp .env.example .env          # then fill it in
npm run seed                  # fixed pages, navigation, categories
npm run create-admin          # your first super administrator
npm run dev                   # http://localhost:4000
```

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server with reload |
| `npm test` | 125 tests against an in-memory MongoDB |
| `npm run seed` | Structural content: pages, navigation, categories |
| `npm run seed:content` | The firm's own copy, services and team |
| `npm run create-admin` | Interactive super-admin creation |
| `npm run import:firebase` | Migrate content from the previous Firebase site |

## Environment

See `.env.example`. `MONGODB_URI`, `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
are required. Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Set `NODE_ENV=production` in production — it switches on secure cookies and
stops stack traces reaching clients.

## Architecture

Full documentation, including the data model, API surface, security posture and
deployment, is in `Implementation_Plan.md` and `PROJECT_README.md` in this repo.
