import { describe, it, expect } from 'vitest';
import { renderWebinarEmail } from '../src/lib/webinarTemplate.js';
import { buildWebinarIcs } from '../src/lib/ics.js';
import { describeMailerError } from '../src/lib/webinarMailer.js';

const baseWebinar = {
  title: 'Promoting Clean Sport: Strengthening Anti-Doping and Integrity Across the Sports Ecosystem.',
  description: 'A live discussion on anti-doping and sports integrity.',
  startsAt: new Date('2026-11-06T15:00:00Z'),
  endsAt: new Date('2026-11-06T17:00:00Z'),
  timezone: 'Africa/Lagos',
  meetUrl: 'https://meet.google.com/abc-defg-hij',
  organiserName: 'PCN Sportiva LP',
  bannerUrl: 'https://res.cloudinary.com/demo/banner.jpg',
  speakers: [
    { name: 'Caroline Mwanzia', role: 'Moderator/Speaker', titleLines: ['Associate, PCN Sportiva LP'], bio: '', order: 1 },
    { name: 'Martina Spreitzer-Kropiunik', role: 'Speaker', titleLines: ['Court President, Austria'], bio: 'CAS Arbitrator.', order: 2 },
  ],
  faq: [
    { question: 'What will this cover?', answer: 'An overview of *anti-doping* enforcement.', order: 1 },
    { question: 'Will there be a recording?', answer: '', order: 2 }, // empty answer: must be skipped
  ],
  social: { instagram: 'https://instagram.com/pcnsportivalp', x: '', linkedin: '' },
  email: {
    subject: "You're registered: Clean Sport Webinar",
    introParagraph: 'Thank you for registering.',
    noteBoxText: 'Please keep this email.',
    footerText: 'PCN Sportiva LP, Lagos.',
  },
};

const registrant = { name: 'Jane <Doe>', email: 'jane@example.com', reference: 'WEB-ABC123' };

describe('webinar confirmation email template', () => {
  const { html, text, subject } = renderWebinarEmail(baseWebinar, registrant, 'confirmation');

  it('escapes the registrant name (header injection / XSS guard)', () => {
    expect(html).not.toContain('<Doe>');
    expect(html).toContain('Jane &lt;Doe&gt;');
  });

  it('includes the required sections', () => {
    for (const marker of [
      'Join on Google Meet', 'YOUR REGISTRATION', 'About this webinar',
      'Meet your speakers', 'Frequently asked questions', 'Please keep this email.',
    ]) {
      expect(html).toContain(marker);
    }
  });

  it('never prints the meet link as visible text only — the plain URL is shown too', () => {
    expect(html).toContain(baseWebinar.meetUrl);
  });

  it('renders a speaker with no bio cleanly (no empty gap / "undefined")', () => {
    expect(html).toContain('Caroline Mwanzia');
    expect(html).not.toContain('undefined');
    expect(html).not.toMatch(/Caroline Mwanzia[\s\S]{0,40}<div[^>]*>\s*<\/div>/);
  });

  it('skips a FAQ item whose answer is empty', () => {
    expect(html).not.toContain('Will there be a recording?');
  });

  it('turns *bold phrases* in an FAQ answer into <strong>, safely', () => {
    expect(html).toContain('<strong>anti-doping</strong>');
  });

  it('includes a plain-text alternative and a non-empty subject', () => {
    expect(text.length).toBeGreaterThan(20);
    expect(text).toContain('Jane <Doe>'); // text part: no HTML escaping needed
    expect(subject.length).toBeGreaterThan(0);
  });

  it('has a hidden preheader and no <script> tags', () => {
    expect(html).toMatch(/display:none/);
    expect(html.toLowerCase()).not.toContain('<script');
  });

  it('uses table layout and inline styles only (no <style> block, no external CSS)', () => {
    expect(html).not.toContain('<style');
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
    expect((html.match(/<table/g) || []).length).toBeGreaterThan(3);
  });
});

describe('date/time formatting', () => {
  it('matches the brief\'s literal format, with no comma after the weekday', () => {
    const { html } = renderWebinarEmail(baseWebinar, registrant, 'confirmation');
    expect(html).toContain('Fri 6 Nov 2026, 16:00 to 18:00 WAT');
    expect(html).not.toContain('Fri, 6 Nov 2026');
  });
});

describe('webinar reminder email', () => {
  it('is short and includes the meet link, date/time and calendar link, with no speaker/FAQ sections', () => {
    const { html } = renderWebinarEmail(baseWebinar, registrant, 'reminderDay');
    expect(html).toContain('Join on Google Meet');
    expect(html).toContain(baseWebinar.meetUrl);
    expect(html).toContain('Add to calendar');
    expect(html).not.toContain('Frequently asked questions');
    expect(html).not.toContain('Meet your speakers');
  });
});

describe('webinar email: no speakers, no FAQ, no banner', () => {
  it('renders without error and without the now-empty sections', () => {
    const minimal = { ...baseWebinar, speakers: [], faq: [], bannerUrl: '' };
    const { html } = renderWebinarEmail(minimal, registrant, 'confirmation');
    expect(html).not.toContain('Meet your speakers');
    expect(html).not.toContain('Frequently asked questions');
  });
});

describe('ICS calendar attachment', () => {
  const ics = buildWebinarIcs({
    uid: 'test@example.com',
    title: 'Title; with, special "chars"\nand a newline',
    description: 'desc',
    location: 'https://meet.google.com/x',
    startsAt: new Date('2026-11-06T15:00:00Z'),
    endsAt: new Date('2026-11-06T17:00:00Z'),
    organiserName: 'PCN Sportiva LP',
    organiserEmail: 'contact@pcnsportivalp.com',
  });

  it('produces a valid VCALENDAR with DTSTART/DTEND in UTC and two alarms', () => {
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20261106T150000Z');
    expect(ics).toContain('DTEND:20261106T170000Z');
    expect((ics.match(/BEGIN:VALARM/g) || []).length).toBe(2);
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('TRIGGER:-PT30M');
  });

  it('escapes semicolons, commas and newlines in text fields per RFC 5545', () => {
    expect(ics).toContain('Title\\; with\\, special');
    expect(ics).toMatch(/and a newline/);
    expect(ics).not.toMatch(/SUMMARY:[^\\]*\n[^D]/); // no raw unescaped newline inside the field
  });

  it('uses CRLF line endings', () => {
    expect(ics.includes('\r\n')).toBe(true);
  });
});

describe('describeMailerError', () => {
  it('prefers the real error code', () => {
    expect(describeMailerError({ code: 'EAUTH', command: 'AUTH PLAIN' })).toBe('EAUTH');
  });

  it('falls back to the failing command when there is no code', () => {
    expect(describeMailerError({ command: 'EHLO' })).toBe('failed during EHLO');
  });

  it('falls back to the SMTP response code when there is neither a code nor a command', () => {
    expect(describeMailerError({ responseCode: 421 })).toBe('SMTP 421');
  });

  it('recognises a TLS/certificate failure from the message when nothing else is available', () => {
    expect(describeMailerError({ message: 'unable to verify the first certificate' })).toBe('TLS handshake failed');
  });

  it('never returns the bare word UNKNOWN', () => {
    expect(describeMailerError({})).not.toBe('UNKNOWN');
    expect(describeMailerError(undefined)).not.toBe('UNKNOWN');
  });
});
