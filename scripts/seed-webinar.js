/**
 * Seeds the single Webinar document with the confirmed event facts.
 *
 * Only adds to the new `webinars` collection — never touches Page, Lawyer,
 * SiteSettings or any other existing collection. Safe to run more than
 * once: it updates the one singleton document in place rather than
 * inserting duplicates.
 *
 * Caroline Mwanzia's bio is pulled read-only from her existing, already
 * published Lawyer profile (real content, not invented). Martina
 * Spreitzer-Kropiunik and Khayran Noor have no existing profile on this
 * site, and no bio text for them was supplied, so their `bio`/`shortBio`
 * fields are left empty on purpose — see the checklist at the end of the
 * integration report. The meetUrl is left empty until supplied through the
 * admin.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Webinar from '../src/models/Webinar.js';
import Lawyer from '../src/models/Lawyer.js';
import { toPlainText } from '../src/lib/sanitize.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const caroline = await Lawyer.findOne({ name: /Caroline Mwanzia/i }).lean();

  const speakers = [
    {
      name: 'Caroline Mwanzia',
      role: 'Moderator/Speaker',
      titleLines: [
        'Associate, PCN Sportiva LP',
        'FIFA-Licensed Football Agent',
        'Ad Hoc Clerk at the Court of Arbitration for Sport (CAS)',
      ],
      bio: caroline ? toPlainText(caroline.bio).slice(0, 4000) : '',
      shortBio: '', // not supplied; left empty on purpose, see checklist
      order: 1,
    },
    {
      name: 'Martina Spreitzer-Kropiunik',
      role: 'Speaker',
      titleLines: [
        'Court President in Austria',
        'Court of Arbitration for Sport (CAS) Arbitrator',
        'WISLaw President',
      ],
      bio: '', // not supplied; left empty on purpose, see checklist
      shortBio: '',
      order: 2,
    },
    {
      name: 'Khayran Noor',
      role: 'Speaker',
      titleLines: ['International Sports Lawyer', 'Founding Director, Sports Legal'],
      bio: '', // not supplied; left empty on purpose, see checklist
      shortBio: '',
      order: 3,
    },
  ];

  const data = {
    title: 'Promoting Clean Sport: Strengthening Anti-Doping and Integrity Across the Sports Ecosystem.',
    organiserName: 'PCN Sportiva LP',
    startsAt: new Date('2026-11-06T15:00:00Z'), // 16:00 WAT
    endsAt: new Date('2026-11-06T17:00:00Z'), // 18:00 WAT
    timezone: 'Africa/Lagos',
    speakers,
    social: {
      instagram: 'https://instagram.com/pcnsportivalp',
      x: 'https://x.com/pcnsportivalp',
      linkedin: 'https://www.linkedin.com/company/pcn-sportiva-lp',
    },
    // Left as-is on purpose, per the safety rules: the hero must default OFF
    // until an administrator explicitly enables it from the dashboard.
    webinarHeroEnabled: false,
    webinarHeroEndsAt: new Date('2026-11-07T22:59:00Z'),
    registrationOpen: true,
  };

  const existing = await Webinar.findOne();
  if (existing) {
    existing.set(data);
    await existing.save();
    console.log('Updated existing Webinar document:', existing._id.toString());
  } else {
    const created = await Webinar.create(data);
    console.log('Created Webinar document:', created._id.toString());
  }

  console.log('meetUrl: NOT SET — add it in the admin before going live.');
  console.log('speakers with no bio supplied: Martina Spreitzer-Kropiunik, Khayran Noor.');
  console.log('webinarHeroEnabled: false (default OFF, per the safety rules).');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
