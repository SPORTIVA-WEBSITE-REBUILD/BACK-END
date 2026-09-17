import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, authedAgent } from './helpers.js';
import Comment from '../src/models/Comment.js';
import Subscriber from '../src/models/Subscriber.js';

/**
 * The backend side of template parity: every text the template shows has a
 * home in the CMS, empty interface text falls back to the template's wording
 * from the server (never from frontend code), and the features the template
 * shows — testimonials, newsletter, threaded comments — actually work.
 */

async function publish(agent, path, body) {
  const created = await agent.post(`/api/${path}`).send(body).expect(201);
  await agent.patch(`/api/${path}/${created.body.data._id}/status`).send({ status: 'published' }).expect(200);
  return created.body.data;
}

async function publishedArticle(agent, title = 'A note on eligibility') {
  return publish(agent, 'articles', { title, body: '<p>Body.</p>' });
}

describe('blueprint defaults are served by the API', () => {
  it('resolves a built-in page that has never been saved, filled with template wording', async () => {
    const res = await request(app).get('/api/public/pages/contact').expect(200);
    const intro = res.body.data.sections.find((s) => s.key === 'intro');
    const form = res.body.data.sections.find((s) => s.key === 'form');

    expect(intro.heading).toBe('Contact Information');
    expect(intro.labels).toMatchObject({ address: 'Address:', phone: 'Phone:', email: 'Email:', website: 'Website' });
    expect(form.cta.label).toBe('Send Message');
    expect(form.labels).toMatchObject({ name: 'Your Name', email: 'Your Email', subject: 'Subject', message: 'Message' });
  });

  it('keeps what an administrator wrote and fills only what is empty', async () => {
    const { agent } = await authedAgent();
    const page = await agent.post('/api/pages').send({
      title: 'Contact',
      slug: 'contact',
      status: 'published',
      sections: [{ key: 'form', cta: { label: 'Get in touch' }, labels: { name: 'Full name', email: '' } }],
    }).expect(201);
    expect(page.body.data.slug).toBe('contact');

    const res = await request(app).get('/api/public/pages/contact').expect(200);
    const form = res.body.data.sections.find((s) => s.key === 'form');
    expect(form.cta.label).toBe('Get in touch');
    expect(form.labels.name).toBe('Full name');
    expect(form.labels.email).toBe('Your Email');
  });

  it('never exposes the words of a draft page, only the defaults', async () => {
    const { agent } = await authedAgent();
    await agent.post('/api/pages').send({
      title: 'Contact',
      slug: 'contact',
      status: 'draft',
      sections: [{ key: 'intro', heading: 'Secret draft heading' }],
    }).expect(201);

    const res = await request(app).get('/api/public/pages/contact').expect(200);
    expect(JSON.stringify(res.body)).not.toContain('Secret draft heading');
    expect(res.body.data.sections.find((s) => s.key === 'intro').heading).toBe('Contact Information');
  });

  it('still 404s a slug that is neither stored nor built in', async () => {
    await request(app).get('/api/public/pages/no-such-page').expect(404);
  });

  it('delivers the site layout with the settings, in one request', async () => {
    const res = await request(app).get('/api/public/settings').expect(200);
    const layout = res.body.data.layout;
    const byKey = Object.fromEntries(layout.sections.map((s) => [s.key, s]));

    expect(byKey.navCta.cta).toEqual({ label: 'Free Consultation', href: '/contact' });
    expect(byKey.newsletter.heading).toBe('Subscribe to our Newsletter');
    expect(byKey.newsletter.labels).toMatchObject({ placeholder: 'Enter email address', submit: 'Subscribe' });
    expect(byKey.footer.labels).toMatchObject({ servicesHeading: 'Practice Areas', contactHeading: 'Have a Questions?' });
    expect(byKey.hours.heading).toBe('Business Hours');
    expect(byKey.common.labels).toMatchObject({ breadcrumbHome: 'Home', readMore: 'Read more' });
  });

  it('stores labels and rejects keys that are not simple names', async () => {
    const { agent } = await authedAgent();
    await agent.post('/api/pages').send({
      title: 'X', sections: [{ key: 'form', labels: { 'bad key': 'x' } }],
    }).expect(400);

    const ok = await agent.post('/api/pages').send({
      title: 'Y', sections: [{ key: 'form', labels: { submit: 'Go' } }],
    }).expect(201);
    expect(ok.body.data.sections[0].labels).toEqual({ submit: 'Go' });
  });

  it('accepts the new display switches and website in settings', async () => {
    const { agent } = await authedAgent();
    const res = await agent.patch('/api/settings')
      .send({ showCaseFilters: false, contact: { website: 'pcnsportivalp.com' } })
      .expect(200);
    expect(res.body.data.showCaseFilters).toBe(false);
    expect(res.body.data.contact.website).toBe('pcnsportivalp.com');
  });
});

describe('testimonials', () => {
  it('shows only published testimonials, in order', async () => {
    const { agent } = await authedAgent();
    await agent.post('/api/testimonials').send({ quote: 'Draft', name: 'Hidden' }).expect(201);
    await publish(agent, 'testimonials', { quote: 'Second', name: 'B', order: 2 });
    await publish(agent, 'testimonials', { quote: 'First', name: 'A', position: 'Club secretary', order: 1 });

    const res = await request(app).get('/api/public/testimonials').expect(200);
    expect(res.body.data.map((t) => t.name)).toEqual(['A', 'B']);
    expect(res.body.data[0].position).toBe('Club secretary');
  });

  it('can be managed by an editor', async () => {
    const { agent } = await authedAgent({ role: 'editor', email: 'writer@example.com' });
    await agent.post('/api/testimonials').send({ quote: 'Good', name: 'C' }).expect(201);
  });
});

describe('newsletter', () => {
  it('signs up an address', async () => {
    await request(app).post('/api/public/subscribers').send({ email: 'Fan@Example.com' }).expect(201);
    const doc = await Subscriber.findOne({ email: 'fan@example.com' });
    expect(doc.status).toBe('subscribed');
    expect(doc.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('answers a repeat sign-up exactly like a first one, without duplicating it', async () => {
    const first = await request(app).post('/api/public/subscribers').send({ email: 'fan@example.com' });
    const again = await request(app).post('/api/public/subscribers').send({ email: 'fan@example.com' });
    expect(again.status).toBe(first.status);
    expect(again.body).toEqual(first.body);
    expect(await Subscriber.countDocuments()).toBe(1);
  });

  it('re-subscribes someone who had left', async () => {
    await Subscriber.create({ email: 'back@example.com', status: 'unsubscribed' });
    await request(app).post('/api/public/subscribers').send({ email: 'back@example.com' }).expect(201);
    expect((await Subscriber.findOne({ email: 'back@example.com' })).status).toBe('subscribed');
  });

  it('silently drops a bot that fills the honeypot', async () => {
    await request(app).post('/api/public/subscribers').send({ email: 'bot@example.com', company: 'x' }).expect(400);
    expect(await Subscriber.countDocuments()).toBe(0);
  });

  it('rejects an invalid address', async () => {
    await request(app).post('/api/public/subscribers').send({ email: 'nope' }).expect(400);
  });

  it('keeps the list away from the public and from editors', async () => {
    await request(app).get('/api/subscribers').expect(401);
    const { agent } = await authedAgent({ role: 'editor', email: 'writer@example.com' });
    await agent.get('/api/subscribers').expect(403);
  });

  it('exports CSV that a spreadsheet cannot execute', async () => {
    await Subscriber.create({ email: '=cmd@example.com' });
    await Subscriber.create({ email: 'plain@example.com' });
    const { agent } = await authedAgent();
    const res = await agent.get('/api/subscribers/export').expect(200);

    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\n')[0]).toBe('email,status,subscribed_at');
    expect(res.text).toContain(`"'=cmd@example.com"`);
    expect(res.text).not.toMatch(/(^|,)"=cmd/m);
  });
});

describe('comments', () => {
  const comment = { name: 'Ada Obi', email: 'ada@example.com', message: 'A useful explanation.' };

  it('holds a new comment for moderation and hides it until approved', async () => {
    const { agent } = await authedAgent();
    const article = await publishedArticle(agent);

    const res = await request(app).post(`/api/public/articles/${article.slug}/comments`).send(comment).expect(201);
    expect(res.body.data.status).toBe('pending');

    let list = await request(app).get(`/api/public/articles/${article.slug}/comments`).expect(200);
    expect(list.body.data).toHaveLength(0);

    const stored = await Comment.findOne();
    await agent.patch(`/api/comments/${stored._id}/status`).send({ status: 'approved' }).expect(200);

    list = await request(app).get(`/api/public/articles/${article.slug}/comments`).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].message).toBe('A useful explanation.');
  });

  it('never publishes a commenter\'s email address', async () => {
    const { agent } = await authedAgent();
    const article = await publishedArticle(agent);
    await Comment.create({ ...comment, article: article._id, status: 'approved' });

    const list = await request(app).get(`/api/public/articles/${article.slug}/comments`);
    expect(JSON.stringify(list.body)).not.toContain('ada@example.com');
  });

  it('nests replies under the comment they answer', async () => {
    const { agent } = await authedAgent();
    const article = await publishedArticle(agent);
    const parent = await Comment.create({ ...comment, article: article._id, status: 'approved' });
    const child = await Comment.create({ ...comment, name: 'Reply', article: article._id, parent: parent._id, status: 'approved' });
    await Comment.create({ ...comment, name: 'Grandchild', article: article._id, parent: child._id, status: 'approved' });

    const list = await request(app).get(`/api/public/articles/${article.slug}/comments`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].replies[0].name).toBe('Reply');
    expect(list.body.data[0].replies[0].replies[0].name).toBe('Grandchild');
    expect(list.body.meta.total).toBe(3);
  });

  it('refuses a reply to a comment that is not approved', async () => {
    const { agent } = await authedAgent();
    const article = await publishedArticle(agent);
    const pending = await Comment.create({ ...comment, article: article._id });

    await request(app).post(`/api/public/articles/${article.slug}/comments`)
      .send({ ...comment, parent: String(pending._id) }).expect(400);
  });

  it('refuses comments on an unpublished article', async () => {
    const { agent } = await authedAgent();
    const draft = await agent.post('/api/articles').send({ title: 'Unpublished' }).expect(201);
    await request(app).post(`/api/public/articles/${draft.body.data.slug}/comments`).send(comment).expect(404);
  });

  it('refuses a javascript: website, which would become a link', async () => {
    const { agent } = await authedAgent();
    const article = await publishedArticle(agent);
    await request(app).post(`/api/public/articles/${article.slug}/comments`)
      .send({ ...comment, website: 'javascript:alert(1)' }).expect(400);
  });

  it('removes a comment together with its replies', async () => {
    const { agent } = await authedAgent();
    const article = await publishedArticle(agent);
    const parent = await Comment.create({ ...comment, article: article._id, status: 'approved' });
    const child = await Comment.create({ ...comment, article: article._id, parent: parent._id });
    await Comment.create({ ...comment, article: article._id, parent: child._id });

    await agent.delete(`/api/comments/${parent._id}`).expect(204);
    expect(await Comment.countDocuments()).toBe(0);
  });

  it('lets an editor moderate', async () => {
    const { agent: admin } = await authedAgent();
    const article = await publishedArticle(admin);
    const c = await Comment.create({ ...comment, article: article._id });

    const { agent } = await authedAgent({ role: 'editor', email: 'writer@example.com' });
    await agent.get('/api/comments?status=pending').expect(200);
    await agent.patch(`/api/comments/${c._id}/status`).send({ status: 'spam' }).expect(200);
  });

  it('counts only approved comments on the article list', async () => {
    const { agent } = await authedAgent();
    const article = await publishedArticle(agent);
    await Comment.create({ ...comment, article: article._id, status: 'approved' });
    await Comment.create({ ...comment, article: article._id, status: 'approved' });
    await Comment.create({ ...comment, article: article._id, status: 'pending' });

    const res = await request(app).get('/api/public/articles');
    expect(res.body.data[0].commentCount).toBe(2);
  });
});

describe('enquiries', () => {
  it('records which form an enquiry came from', async () => {
    await request(app).post('/api/public/enquiries').send({
      name: 'Ada Obi', email: 'ada@example.com', message: 'I would like a consultation please.', source: 'consultation',
    }).expect(201);

    const { agent } = await authedAgent();
    const res = await agent.get('/api/enquiries?source=consultation').expect(200);
    expect(res.body.data).toHaveLength(1);
  });

  // Regression: the enquiry list validated its query with the generic schema,
  // which only allows draft/published, so every status filter was a 400.
  it('filters by an enquiry status', async () => {
    const { agent } = await authedAgent();
    await agent.get('/api/enquiries?status=new').expect(200);
    await agent.get('/api/enquiries?status=spam').expect(200);
  });
});

describe('data the template layouts need', () => {
  it('returns the legal advisors linked to a service', async () => {
    const { agent } = await authedAgent();
    const service = await publish(agent, 'services', { title: 'Sports Disputes' });
    await publish(agent, 'lawyers', { name: 'Linked Lawyer', quote: 'We fight for athletes.', practiceAreas: [service._id] });
    await publish(agent, 'lawyers', { name: 'Unlinked Lawyer' });

    const res = await request(app).get(`/api/public/services/${service.slug}`).expect(200);
    expect(res.body.data.advisors.map((l) => l.name)).toEqual(['Linked Lawyer']);
    expect(res.body.data.advisors[0].quote).toBe('We fight for athletes.');
  });

  it('includes the flip-card quote on the team list', async () => {
    const { agent } = await authedAgent();
    await publish(agent, 'lawyers', { name: 'Quoted', quote: 'Justice for players.' });
    const res = await request(app).get('/api/public/lawyers');
    expect(res.body.data[0].quote).toBe('Justice for players.');
  });

  it('lists categories and tags that published articles actually use', async () => {
    const { agent } = await authedAgent();
    const used = await agent.post('/api/categories').send({ name: 'Used' }).expect(201);
    await agent.post('/api/categories').send({ name: 'Empty' }).expect(201);
    await publish(agent, 'articles', { title: 'Tagged', category: used.body.data._id, tags: ['FIFA', 'agents'] });

    const cats = await request(app).get('/api/public/categories').expect(200);
    expect(cats.body.data.map((c) => c.name)).toEqual(['Used']);
    const tags = await request(app).get('/api/public/articles/tags').expect(200);
    expect(tags.body.data).toEqual(['agents', 'FIFA']);
  });

  it('counts pending comments, testimonials and subscribers on the overview', async () => {
    const { agent } = await authedAgent();
    const article = await publishedArticle(agent);
    await Comment.create({ name: 'A', email: 'a@b.com', message: 'hello there', article: article._id });
    await Subscriber.create({ email: 'x@y.com' });
    await publish(agent, 'testimonials', { quote: 'Great', name: 'Roger' });

    const res = await agent.get('/api/stats').expect(200);
    expect(res.body.data.counts).toMatchObject({ commentsPending: 1, subscribers: 1, testimonials: 1 });
  });

});

describe('previews of stored content', () => {
  it('gives team cards a short plain-text bio preview, not the full rich text', async () => {
    const { agent } = await authedAgent();
    const long = `<p>Pius &amp; partners ${'advises clubs on disputes. '.repeat(20)}</p>`;
    await publish(agent, 'lawyers', { name: 'Previewed', bio: long });

    const res = await request(app).get('/api/public/lawyers').expect(200);
    const [lawyer] = res.body.data;
    expect(lawyer.bio).toBeUndefined();
    expect(lawyer.bioPreview.startsWith('Pius & partners advises')).toBe(true);
    expect(lawyer.bioPreview).not.toContain('<');
    expect(lawyer.bioPreview.length).toBeLessThanOrEqual(221);
    expect(lawyer.bioPreview.endsWith('…')).toBe(true);
  });

  it('lists published cases in a service\'s practice area on the service', async () => {
    const { agent } = await authedAgent();
    const service = await publish(agent, 'services', { title: 'Disputes' });
    const base = { forum: 'CAS', year: 2026, partyRepresented: 'athlete', outcome: 'won', summary: 'Won on appeal.' };
    await publish(agent, 'cases', { ...base, title: 'Linked matter', practiceArea: service._id });
    await agent.post('/api/cases').send({ ...base, title: 'Draft matter', practiceArea: service._id }).expect(201);
    await publish(agent, 'cases', { ...base, title: 'Other matter' });

    const res = await request(app).get(`/api/public/services/${service.slug}`).expect(200);
    expect(res.body.data.cases.map((c) => c.title)).toEqual(['Linked matter']);
    expect(res.body.data.cases[0]).toMatchObject({ forum: 'CAS', outcome: 'won', summary: 'Won on appeal.' });
  });

  it('lists a team member\'s published articles on their profile', async () => {
    const { agent } = await authedAgent();
    const lawyer = await publish(agent, 'lawyers', { name: 'Author' });
    await publish(agent, 'articles', { title: 'Theirs', body: '<p>x</p>', author: lawyer._id });
    await agent.post('/api/articles').send({ title: 'Unpublished', author: lawyer._id }).expect(201);
    await publish(agent, 'articles', { title: 'Someone else', body: '<p>x</p>' });

    const res = await request(app).get(`/api/public/lawyers/${lawyer.slug}`).expect(200);
    expect(res.body.data.articles.map((a) => a.title)).toEqual(['Theirs']);
  });

  it('defaults the new preview wording on the home and detail pages', async () => {
    const home = (await request(app).get('/api/public/pages/home')).body.data.sections;
    const by = (list, key) => list.find((s) => s.key === key);
    expect(by(home, 'services').cta).toEqual({ label: 'All services', href: '/services' });
    expect(by(home, 'careers')).toMatchObject({ heading: "We're hiring", cta: { label: 'View all roles', href: '/careers' } });
    expect(by(home, 'careers').labels).toEqual({ viewRole: 'View role', closes: 'Closes' });

    const service = (await request(app).get('/api/public/pages/service-detail')).body.data.sections;
    expect(by(service, 'relatedCases').heading).toBe('Related matters');
    const profile = (await request(app).get('/api/public/pages/lawyer-detail')).body.data.sections;
    expect(by(profile, 'insights').heading).toBe('Recent insights');
  });
});
