import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, authedAgent } from './helpers.js';
import { PAGE_BLUEPRINTS } from '../src/config/pageBlueprints.js';

const ITEM_FIELDS = ['title', 'text', 'icon', 'value', 'href', 'image'];
const SECTION_FIELDS = ['heading', 'subheading', 'body', 'image', 'video', 'value', 'cta', 'items', 'labels'];

describe('page blueprints', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/pages/blueprints').expect(401);
  });

  it('is not mistaken for a page id', async () => {
    const { agent } = await authedAgent();
    const res = await agent.get('/api/pages/blueprints').expect(200);
    expect(res.body.data.map((b) => b.slug)).toContain('home');
  });

  it('is refused to a role without pages:read', async () => {
    const { agent } = await authedAgent({ email: 'editor@example.com', role: 'editor' });
    await agent.get('/api/pages/blueprints').expect(403);
  });

  // The dashboard renders an input for every field a blueprint names, and the
  // API must accept each of them, so a blueprint can only use real fields.
  it('only names fields a page section can store', () => {
    for (const page of PAGE_BLUEPRINTS) {
      const keys = page.sections.map((s) => s.key);
      expect(new Set(keys).size, `duplicate section key on ${page.slug}`).toBe(keys.length);
      for (const section of page.sections) {
        for (const field of Object.keys(section.fields)) {
          expect(SECTION_FIELDS, `${page.slug}.${section.key}.${field}`).toContain(field);
        }
        for (const field of Object.keys(section.fields.items?.fields || {})) {
          expect(ITEM_FIELDS, `${page.slug}.${section.key}.items.${field}`).toContain(field);
        }
      }
    }
  });

  it('has unique page slugs', () => {
    const slugs = PAGE_BLUEPRINTS.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('section video and value fields', () => {
  it('stores a video link and a value', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/pages').send({
      title: 'About',
      sections: [{ key: 'intro', video: 'https://vimeo.com/45830194', value: '40' }],
    }).expect(201);

    expect(res.body.data.sections[0].video).toBe('https://vimeo.com/45830194');
    expect(res.body.data.sections[0].value).toBe('40');
  });

  it('accepts an empty video link', async () => {
    const { agent } = await authedAgent();
    await agent.post('/api/pages').send({
      title: 'About',
      sections: [{ key: 'intro', video: '' }],
    }).expect(201);
  });

  it.each([
    'javascript:alert(1)',
    'http://vimeo.com/45830194',
    '/videos/intro',
  ])('rejects %s as a video link', async (video) => {
    const { agent } = await authedAgent();
    await agent.post('/api/pages').send({
      title: 'About',
      sections: [{ key: 'intro', video }],
    }).expect(400);
  });
});
