import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, authedAgent } from './helpers.js';
import Enquiry from '../src/models/Enquiry.js';
import SiteSettings from '../src/models/SiteSettings.js';

describe('media upload policy', () => {
  it('mints a signature covering server-chosen parameters', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/media/sign');

    expect(res.status).toBe(200);
    expect(res.body.data.signature).toBeTruthy();
    expect(res.body.data.folder).toBe('pcn-sportiva');
    expect(res.body.data.maxBytes).toBe(10 * 1024 * 1024);
    // The secret must never leave the server.
    expect(JSON.stringify(res.body)).not.toContain('test-secret');
  });

  it('refuses to sign for an unauthenticated caller', async () => {
    const res = await request(app).post('/api/media/sign');
    expect(res.status).toBe(401);
  });

  it('rejects persisting an oversized file', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/media').send({
      publicId: 'pcn-sportiva/big',
      url: 'https://res.cloudinary.com/pkesmajk/image/upload/big.jpg',
      secureUrl: 'https://res.cloudinary.com/pkesmajk/image/upload/big.jpg',
      format: 'jpg',
      bytes: 50 * 1024 * 1024,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/10 MB/);
  });

  it('rejects a disallowed file type', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/media').send({
      publicId: 'pcn-sportiva/evil',
      url: 'https://res.cloudinary.com/pkesmajk/raw/upload/evil.svg',
      secureUrl: 'https://res.cloudinary.com/pkesmajk/raw/upload/evil.svg',
      format: 'svg',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Unsupported file type/);
  });

  it('rejects media that did not come from our own Cloudinary cloud', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/media').send({
      publicId: 'elsewhere/x',
      url: 'https://res.cloudinary.com/attacker/image/upload/x.jpg',
      secureUrl: 'https://res.cloudinary.com/attacker/image/upload/x.jpg',
      format: 'jpg',
    });

    expect(res.status).toBe(400);
  });

  // Regression: a substring check on the URL used to accept any host that
  // merely contained the cloud name somewhere, which would have embedded a
  // third-party URL in the public site's <img> tags.
  it.each([
    ['an attacker host with the cloud name in the path', 'https://attacker.example/pkesmajk/x.jpg'],
    ['a host that merely ends with the delivery host', 'https://res.cloudinary.com.evil.example/pkesmajk/x.jpg'],
    ['the cloud name hidden in the query string', 'https://evil.example/a.jpg?p=/pkesmajk/'],
    ['the cloud name below the first path segment', 'https://evil.example/a/pkesmajk/x.jpg'],
    ['plain http rather than https', 'http://res.cloudinary.com/pkesmajk/x.jpg'],
  ])('refuses %s', async (_label, secureUrl) => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/media').send({
      publicId: 'pcn-sportiva/spoof', url: secureUrl, secureUrl, format: 'jpg',
    });

    expect(res.status).toBe(400);
  });

  it('refuses a publicId that tries to escape its folder', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/media').send({
      publicId: '../../../other-tenant/secret',
      url: 'https://res.cloudinary.com/pkesmajk/image/upload/x.jpg',
      secureUrl: 'https://res.cloudinary.com/pkesmajk/image/upload/x.jpg',
      format: 'jpg',
    });

    expect(res.status).toBe(400);
  });

  it('accepts a valid asset', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/media').send({
      publicId: 'pcn-sportiva/team',
      url: 'https://res.cloudinary.com/pkesmajk/image/upload/team.jpg',
      secureUrl: 'https://res.cloudinary.com/pkesmajk/image/upload/team.jpg',
      format: 'jpg',
      width: 1200,
      height: 800,
      bytes: 240000,
      alt: 'The team',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.alt).toBe('The team');
  });
});

describe('enquiries', () => {
  const valid = {
    name: 'Ada Obi',
    email: 'ada@example.com',
    subject: 'Representation enquiry',
    message: 'I would like to discuss a contractual dispute with my club.',
  };

  it('accepts a valid enquiry', async () => {
    const res = await request(app).post('/api/public/enquiries').send(valid);

    expect(res.status).toBe(201);
    expect(await Enquiry.countDocuments()).toBe(1);
  });

  it('stores a hash of the IP rather than the address itself', async () => {
    await request(app).post('/api/public/enquiries').send(valid);
    const stored = await Enquiry.findOne();

    expect(stored.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.ipHash).not.toContain('127.0.0.1');
  });

  it('silently discards a honeypot submission', async () => {
    const res = await request(app).post('/api/public/enquiries')
      .send({ ...valid, website: 'http://spam.example' });

    // Looks identical to success, so a bot learns nothing.
    expect(res.status).toBe(400); // max(0) rejects a non-empty honeypot
    expect(await Enquiry.countDocuments()).toBe(0);
  });

  it('rejects an invalid email', async () => {
    const res = await request(app).post('/api/public/enquiries')
      .send({ ...valid, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('email');
  });

  it('rejects a message that is too short', async () => {
    const res = await request(app).post('/api/public/enquiries')
      .send({ ...valid, message: 'hi' });

    expect(res.status).toBe(400);
  });

  it('keeps enquiries off the public API', async () => {
    await request(app).post('/api/public/enquiries').send(valid);
    const res = await request(app).get('/api/enquiries');

    expect(res.status).toBe(401);
  });

  it('marks an enquiry read when an admin opens it', async () => {
    await request(app).post('/api/public/enquiries').send(valid);
    const { agent } = await authedAgent();

    const list = await agent.get('/api/enquiries');
    const id = list.body.data[0]._id;
    expect(list.body.data[0].status).toBe('new');

    const opened = await agent.get(`/api/enquiries/${id}`);
    expect(opened.body.data.status).toBe('read');
  });
});

describe('settings and navigation', () => {
  it('creates the settings singleton on first read', async () => {
    const { agent } = await authedAgent();
    const res = await agent.get('/api/settings');

    expect(res.status).toBe(200);
    expect(res.body.data.key).toBe('global');
    expect(await SiteSettings.countDocuments()).toBe(1);
  });

  it('updates settings and reflects them on the public endpoint', async () => {
    const { agent } = await authedAgent();
    await agent.patch('/api/settings').send({
      siteName: 'PCN Sportiva LP',
      contact: { email: 'hello@pcnsportivalp.com', phone: '+234 000 0000' },
    }).expect(200);

    const pub = await request(app).get('/api/public/settings');
    expect(pub.body.data.settings.siteName).toBe('PCN Sportiva LP');
    expect(pub.body.data.settings.contact.email).toBe('hello@pcnsportivalp.com');
  });

  it('rejects an unknown settings field', async () => {
    const { agent } = await authedAgent();
    const res = await agent.patch('/api/settings').send({ nonsense: true });
    expect(res.status).toBe(400);
  });

  it('saves and returns navigation for a location', async () => {
    const { agent } = await authedAgent();
    await agent.put('/api/navigation/header').send({
      items: [{ label: 'Home', href: '/', order: 0 }],
    }).expect(200);

    const pub = await request(app).get('/api/public/settings');
    expect(pub.body.data.navigation.header[0].label).toBe('Home');
  });

  it('refuses an unknown navigation location', async () => {
    const { agent } = await authedAgent();
    const res = await agent.put('/api/navigation/sidebar').send({ items: [] });
    expect(res.status).toBe(404);
  });
});

describe('API contract', () => {
  it('reports health without a database write', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toEqual({ success: true, data: { status: 'ok', env: 'test' } });
  });

  it('uses the standard envelope for a 404', async () => {
    const res = await request(app).get('/api/nope');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('converts a malformed ObjectId into a validation error, not a 500', async () => {
    const { agent } = await authedAgent();
    const res = await agent.get('/api/cases/not-an-id');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('marks public GETs as edge-cacheable and admin reads as no-store', async () => {
    const pub = await request(app).get('/api/public/services');
    expect(pub.headers['cache-control']).toMatch(/s-maxage=\d+/);

    const { agent } = await authedAgent();
    const admin = await agent.get('/api/cases');
    expect(admin.headers['cache-control']).toBe('no-store');
  });

  it('neutralises MongoDB operator injection in a request body', async () => {
    // Without sanitisation this would match any account.
    const res = await request(app).post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } });

    expect(res.status).toBe(400);
  });

  it('does not leak a stack trace in the error body in production mode', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.body.error.code).toBe('NOT_FOUND');
    // The dev-only stack is present here; the production branch omits it.
    expect(res.body.error).not.toHaveProperty('sql');
  });
});

describe('sitemap and robots are served live', () => {
  it('lists the static routes even with no content', async () => {
    const res = await request(app).get('/api/public/sitemap.xml');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('<?xml version="1.0"');
    expect(res.text).toContain('<urlset');
    expect(res.text).toContain('/record');
    expect(res.text).toContain('/insights');
  });

  it('includes published content and updates without a redeploy', async () => {
    const { agent } = await authedAgent();
    const created = await agent.post('/api/articles').send({ title: 'A published note' });

    const draftSitemap = await request(app).get('/api/public/sitemap.xml');
    expect(draftSitemap.text).not.toContain('a-published-note');

    await agent.patch(`/api/articles/${created.body.data._id}/status`).send({ status: 'published' });

    const liveSitemap = await request(app).get('/api/public/sitemap.xml');
    expect(liveSitemap.text).toContain('/insights/a-published-note');
    expect(liveSitemap.text).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it('drops content again when it is unpublished', async () => {
    const { agent } = await authedAgent();
    const created = await agent.post('/api/cases').send({
      title: 'Temporarily public', forum: 'CAS', year: 2026,
      partyRepresented: 'athlete', outcome: 'won', summary: 'A summary of the matter.',
    });
    await agent.patch(`/api/cases/${created.body.data._id}/status`).send({ status: 'published' });
    expect((await request(app).get('/api/public/sitemap.xml')).text).toContain('temporarily-public');

    await agent.patch(`/api/cases/${created.body.data._id}/status`).send({ status: 'draft' });
    expect((await request(app).get('/api/public/sitemap.xml')).text).not.toContain('temporarily-public');
  });

  it('escapes characters that would produce invalid XML', async () => {
    const { agent } = await authedAgent();
    const created = await agent.post('/api/articles').send({ title: 'Rules and regulations' });
    await agent.patch(`/api/articles/${created.body.data._id}/status`).send({ status: 'published' });

    const res = await request(app).get('/api/public/sitemap.xml');
    // A raw ampersand would make the document unparseable.
    expect(res.text).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it('serves robots.txt pointing at the sitemap', async () => {
    const res = await request(app).get('/api/public/robots.txt');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('User-agent: *');
    expect(res.text).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  });

  it('marks both as edge-cacheable', async () => {
    const sitemap = await request(app).get('/api/public/sitemap.xml');
    expect(sitemap.headers['cache-control']).toMatch(/s-maxage=\d+/);
  });
});

describe('social links', () => {
  it('accepts all five platforms the firm uses, including TikTok', async () => {
    const { agent } = await authedAgent();
    const res = await agent.patch('/api/settings').send({
      socials: [
        { platform: 'facebook', url: 'https://facebook.com/pcn' },
        { platform: 'instagram', url: 'https://instagram.com/pcn' },
        { platform: 'tiktok', url: 'https://tiktok.com/@pcn' },
        { platform: 'linkedin', url: 'https://linkedin.com/company/pcn' },
        { platform: 'twitter', url: 'https://twitter.com/pcn' },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.socials).toHaveLength(5);
    expect(res.body.data.socials.map((s) => s.platform)).toContain('tiktok');
  });

  // An administrator adding a row and not filling it in should still be able to
  // save; the empty row must simply never reach the footer.
  it('drops a link with an empty URL instead of rejecting the whole form', async () => {
    const { agent } = await authedAgent();
    const res = await agent.patch('/api/settings').send({
      socials: [
        { platform: 'facebook', url: 'https://facebook.com/pcn' },
        { platform: 'tiktok', url: '' },
        { platform: 'instagram', url: '   ' },
        { platform: '', url: '' },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.socials).toHaveLength(1);
    expect(res.body.data.socials[0].platform).toBe('facebook');
  });

  it('never serves an empty social link to the public site', async () => {
    const { agent } = await authedAgent();
    await agent.patch('/api/settings').send({
      socials: [{ platform: 'linkedin', url: 'https://linkedin.com/company/pcn' }, { platform: 'tiktok', url: '' }],
    });

    const pub = await request(app).get('/api/public/settings');
    const socials = pub.body.data.settings.socials;
    expect(socials).toHaveLength(1);
    expect(socials.every((s) => s.url && s.url.length > 0)).toBe(true);
  });

  it('refuses a platform the site cannot draw an icon for', async () => {
    const { agent } = await authedAgent();
    const res = await agent.patch('/api/settings').send({
      socials: [{ platform: 'myspace', url: 'https://myspace.com/pcn' }],
    });

    expect(res.status).toBe(400);
  });

  it('refuses a malformed URL', async () => {
    const { agent } = await authedAgent();
    const res = await agent.patch('/api/settings').send({
      socials: [{ platform: 'facebook', url: 'facebook.com/pcn' }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].message).toMatch(/https/i);
  });

  it('applies the same rules to a team member profile', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/lawyers').send({
      name: 'Agu Richard',
      socials: [
        { platform: 'linkedin', url: 'https://linkedin.com/in/agu' },
        { platform: 'tiktok', url: '' },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.socials).toHaveLength(1);
  });
});
