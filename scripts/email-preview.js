/**
 * `npm run email:preview` — renders the webinar email with sample data and
 * writes it straight to ./tmp/email-preview.{html,text}, with no DB
 * connection, no SMTP, and nothing sent. For checking the template itself.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { renderWebinarEmail } from '../src/lib/webinarTemplate.js';

const sampleWebinar = {
  title: 'Promoting Clean Sport: Strengthening Anti-Doping and Integrity Across the Sports Ecosystem.',
  description: 'A live discussion on anti-doping enforcement, athlete welfare and the integrity frameworks that govern modern sport, with practitioners who work in this area every day.',
  startsAt: new Date('2026-11-06T15:00:00Z'),
  endsAt: new Date('2026-11-06T17:00:00Z'),
  timezone: 'Africa/Lagos',
  meetUrl: 'https://meet.google.com/sample-link-for-preview',
  organiserName: 'PCN Sportiva LP',
  bannerUrl: 'https://res.cloudinary.com/h2mogbd1/image/upload/v1/pcn-sportiva/webinar-banner-placeholder.jpg',
  speakers: [
    {
      name: 'Caroline Mwanzia', role: 'Moderator/Speaker',
      titleLines: ['Associate, PCN Sportiva LP', 'FIFA-Licensed Football Agent', 'Ad Hoc Clerk at the Court of Arbitration for Sport (CAS)'],
      bio: 'Caroline M. Mwanzia is a Sports Advocate and FIFA-Licensed Football Agent with over five years of experience in sports law, anti-doping, safeguarding and sports governance.',
      order: 1,
    },
    {
      name: 'Martina Spreitzer-Kropiunik', role: 'Speaker',
      titleLines: ['Court President in Austria', 'Court of Arbitration for Sport (CAS) Arbitrator', 'WISLaw President'],
      bio: '', // sample data only — no real bio was supplied, see the integration checklist
      order: 2,
    },
    {
      name: 'Khayran Noor', role: 'Speaker',
      titleLines: ['International Sports Lawyer', 'Founding Director, Sports Legal'],
      bio: '',
      order: 3,
    },
  ],
  faq: [
    { question: 'What will this cover?', answer: 'An overview of *anti-doping* enforcement and sports integrity frameworks across the sports ecosystem.', order: 1 },
    { question: 'How do I join?', answer: 'Click the **Join on Google Meet** button in this email at the start time.', order: 2 },
    { question: 'Do I need to install anything?', answer: 'No — Google Meet runs in your browser.', order: 3 },
    { question: 'Will there be a recording?', answer: '', order: 4 }, // empty: must be skipped in the real render
    { question: 'Can I ask questions?', answer: 'Yes, through the Q&A feature in Google Meet during the session.', order: 5 },
    { question: 'Who do I contact for help?', answer: 'Email the address shown in the footer of this email.', order: 6 },
  ],
  social: {
    instagram: 'https://instagram.com/pcnsportivalp',
    x: 'https://x.com/pcnsportivalp',
    linkedin: 'https://www.linkedin.com/company/pcn-sportiva-lp',
  },
  email: {
    subject: "You're registered: Promoting Clean Sport",
    introParagraph: 'Thank you for registering. Here is everything you need to join.',
    noteBoxText: 'Please keep this email. Use the link above at the start time.',
    footerText: 'Questions? Reply to this email or contact the organiser directly.',
  },
};

const sampleRegistrant = { name: 'Sample Registrant', email: 'sample@example.test', reference: 'WEB-SAMPLE' };

async function run() {
  const dir = path.resolve(process.cwd(), 'tmp');
  await fs.mkdir(dir, { recursive: true });

  const confirmation = renderWebinarEmail(sampleWebinar, sampleRegistrant, 'confirmation');
  await fs.writeFile(path.join(dir, 'email-preview.html'), confirmation.html, 'utf8');
  await fs.writeFile(path.join(dir, 'email-preview.txt'), confirmation.text, 'utf8');

  const reminder = renderWebinarEmail(sampleWebinar, sampleRegistrant, 'reminderDay');
  await fs.writeFile(path.join(dir, 'email-preview-reminder.html'), reminder.html, 'utf8');

  console.log('Wrote:');
  console.log('  tmp/email-preview.html        (confirmation, open in a browser)');
  console.log('  tmp/email-preview.txt         (plain-text alternative)');
  console.log('  tmp/email-preview-reminder.html');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
