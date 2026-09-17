import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, authedAgent } from './helpers.js';

/**
 * The workflow the project is ultimately judged on (CLAUDE.md sections 20 and 25):
 *
 *   admin signs in -> edits content -> saved to MongoDB
 *     -> frontend requests it -> visitor sees the change
 *
 * No frontend source is touched at any point in this test, which is the whole
 * claim being verified.
 */
describe('end to end: an administrator changes what the public site says', () => {
  it('carries an edit from the dashboard through to the public API', async () => {
    // 1. The administrator signs in.
    const { agent } = await authedAgent({ email: 'editor.in.chief@example.com' });

    // 2. They set the site's name and contact details.
    await agent.patch('/api/settings').send({
      siteName: 'PCN Sportiva LP',
      tagline: 'Sports Law',
      contact: { email: 'enquiries@pcnsportivalp.com', phone: '+234 801 234 5678' },
      copyrightText: '© 2026 PCN Sportiva LP',
    }).expect(200);

    // 3. They build the header menu.
    await agent.put('/api/navigation/header').send({
      items: [
        { label: 'Home', href: '/', order: 0 },
        { label: 'Record', href: '/record', order: 1 },
      ],
    }).expect(200);

    // 4. They write the home page hero.
    const page = await agent.post('/api/pages').send({
      title: 'Home',
      slug: 'home',
      sections: [{
        key: 'hero',
        heading: 'Sports law, argued properly.',
        subheading: 'PCN Sportiva LP',
        body: 'Representation before domestic and international sporting tribunals.',
        cta: { label: 'Speak to us', href: '/contact' },
      }],
    }).expect(201);

    // A draft is not public yet — the visitor must not see unfinished work.
    // Home is a built-in page, so they get the template's default wording.
    const draftView = await request(app).get('/api/public/pages/home').expect(200);
    expect(JSON.stringify(draftView.body)).not.toContain('Sports law, argued properly.');

    // 5. They publish it.
    await agent.patch(`/api/pages/${page.body.data._id}/status`)
      .send({ status: 'published' }).expect(200);

    // 6. The visitor loads the site. One call for the whole shell.
    const shell = await request(app).get('/api/public/settings').expect(200);
    expect(shell.body.data.settings.siteName).toBe('PCN Sportiva LP');
    expect(shell.body.data.settings.contact.email).toBe('enquiries@pcnsportivalp.com');
    expect(shell.body.data.navigation.header).toHaveLength(2);
    expect(shell.body.data.navigation.header[1].label).toBe('Record');

    // 7. And the home page content the administrator just typed.
    const home = await request(app).get('/api/public/pages/home').expect(200);
    const hero = home.body.data.sections.find((s) => s.key === 'hero');
    expect(hero.heading).toBe('Sports law, argued properly.');
    expect(hero.cta.label).toBe('Speak to us');

    // 8. The administrator revises the heading.
    await agent.patch(`/api/pages/${page.body.data._id}`).send({
      title: 'Home',
      sections: [{
        key: 'hero',
        heading: 'Representation that holds up.',
        subheading: 'PCN Sportiva LP',
        cta: { label: 'Speak to us', href: '/contact' },
      }],
    }).expect(200);

    // 9. The visitor sees the revision. No deployment, no code change.
    const revised = await request(app).get('/api/public/pages/home').expect(200);
    expect(revised.body.data.sections[0].heading).toBe('Representation that holds up.');
  });

  it('publishes a case and serves it to the archive and its own page', async () => {
    const { agent } = await authedAgent({ email: 'clerk@example.com' });

    const created = await agent.post('/api/cases').send({
      title: 'Appeal against an eligibility ruling',
      forum: 'CAS',
      year: 2026,
      partyRepresented: 'athlete',
      outcome: 'won',
      summary: 'Eligibility restored on appeal after the federation applied the wrong standard.',
      body: '<p>The panel found the federation had misapplied its own regulations.</p>',
    }).expect(201);

    await agent.patch(`/api/cases/${created.body.data._id}/status`)
      .send({ status: 'published' }).expect(200);

    // The archive lists it, filtered the way the public page filters.
    const archive = await request(app).get('/api/public/cases?forum=CAS&year=2026&party=athlete');
    expect(archive.body.meta.total).toBe(1);
    expect(archive.body.data[0].title).toBe('Appeal against an eligibility ruling');
    // The list must stay light: no body in a summary response.
    expect(archive.body.data[0].body).toBeUndefined();

    // The filter controls know about it.
    const filters = await request(app).get('/api/public/cases/filters');
    expect(filters.body.data.forums).toContain('CAS');
    expect(filters.body.data.years).toContain(2026);

    // Its own page carries the full account.
    const detail = await request(app).get(`/api/public/cases/${created.body.data.slug}`);
    expect(detail.body.data.body).toContain('misapplied its own regulations');
  });

  it('delivers a visitor enquiry to the administrator', async () => {
    // A visitor writes in through the public contact form.
    await request(app).post('/api/public/enquiries').send({
      name: 'Chidi Okonkwo',
      email: 'chidi@example.com',
      subject: 'Contract dispute with my club',
      message: 'I would like to discuss terminating my contract with my current club.',
    }).expect(201);

    // The administrator finds it waiting for them.
    const { agent } = await authedAgent({ email: 'partner@example.com' });
    const stats = await agent.get('/api/stats').expect(200);
    expect(stats.body.data.counts.enquiriesNew).toBe(1);

    const list = await agent.get('/api/enquiries').expect(200);
    expect(list.body.data[0].name).toBe('Chidi Okonkwo');
    expect(list.body.data[0].message).toContain('terminating my contract');
  });

  it('keeps an editor from changing what the site says about itself', async () => {
    const { agent } = await authedAgent({ role: 'editor', email: 'junior@example.com' });

    await agent.patch('/api/settings').send({ siteName: 'Not The Firm' }).expect(403);
    await agent.put('/api/navigation/header').send({ items: [] }).expect(403);

    // But they can do the job they were hired for.
    await agent.post('/api/articles').send({ title: 'A note on eligibility rules' }).expect(201);
  });
});
