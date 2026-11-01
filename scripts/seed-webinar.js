/**
 * Creates or updates the single Webinar document with the confirmed event
 * facts and real speaker bios.
 *
 * Only writes to the new `webinars` collection — never touches Page,
 * Lawyer, SiteSettings or any other existing collection.
 *
 * Idempotent and safe to re-run at any time, matching the guarded-rewrite
 * pattern already used in scripts/seed-content.js: on a brand-new document
 * everything below is written outright (there is nothing to protect yet).
 * On an existing document, each field is only overwritten when it is still
 * empty or still equal to what this script would write — if it holds
 * anything else, an administrator has edited it through the dashboard, and
 * it is left alone and reported as skipped. "Never overwrite admin edits"
 * from here on.
 *
 * Caroline Mwanzia's bio is pulled read-only from her existing, already
 * published Lawyer profile the first time this runs (real content, not
 * invented); the full bios for all three speakers below were supplied
 * directly by the firm.
 *
 * No speaker email or phone number is stored anywhere in this schema.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Webinar from '../src/models/Webinar.js';
import Lawyer from '../src/models/Lawyer.js';
import { toPlainText } from '../src/lib/sanitize.js';

const report = { written: [], skippedAlreadySet: [], skippedEdited: [] };

const isEmptyValue = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Writes `obj[field] = newValue` unless the current value is something
 *  other than empty or `newValue` itself — in which case it is an admin
 *  edit, and it is left untouched. */
function seedField(obj, field, newValue, label) {
  const current = obj[field];
  if (isEmptyValue(current)) {
    obj[field] = newValue;
    report.written.push(label);
  } else if (deepEqual(current, newValue)) {
    report.skippedAlreadySet.push(`${label} (already set)`);
  } else {
    report.skippedEdited.push(`${label} (edited in the dashboard — left alone)`);
  }
}

const SPEAKERS = [
  {
    name: 'Caroline Mwanzia',
    role: 'Moderator/Speaker',
    titleLines: [
      'Associate, PCN Sportiva LP',
      'FIFA-Licensed Football Agent',
      'Ad Hoc Clerk at the Court of Arbitration for Sport (CAS)',
    ],
    shortBio: 'Caroline Mwanzia is a Sports Advocate and FIFA-Licensed Football Agent with over five years of experience in sports law, anti-doping, safeguarding and sports governance. She is an Associate at PCN Sportiva LP and an Ad Hoc Junior Clerk for the Court of Arbitration for Sport (CAS), with particular expertise in Anti-Doping Rule Violation (ADRV) litigation and WADA Code compliance.',
    // bio: filled in below from her existing Lawyer profile, not hardcoded
    // here — see the loop after this array.
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
    shortBio: 'Martina Spreitzer-Kropiunik is an Austrian judge, sports arbitrator and specialist in sports integrity, anti-doping and ethics. She is President of the Regional Court of St. Pölten, has been a CAS arbitrator since 2018, served on the CAS Anti-Doping Division at the Beijing 2022 and Paris 2024 Olympic Games, and is President of Women in Sports Law (WISLaw).',
    bio: `Martina Spreitzer-Kropiunik is an Austrian judge, sports arbitrator and leading specialist in sports integrity, anti-doping and sports ethics. She currently serves as President of the Regional Court of St. Pölten, having previously served as Vice-President of the Criminal Court of Vienna. She has been a criminal judge since 1995, with extensive experience in complex cases involving corruption, organised crime, drugs and anti-doping.

Martina has served as an arbitrator of the Court of Arbitration for Sport (CAS) since 2018 and has been closely involved in the CAS Anti-Doping Division. She served as a member of the CAS Anti-Doping Division during the Beijing 2022 Winter Olympic Games and the Paris 2024 Olympic Games, bringing extensive judicial and adjudicative experience to international sports disputes.

Her experience also extends to sports governance and ethics. She is President of Women in Sports Law (WISLaw) and an elected member of the Ethics Commission of the European Olympic Committees (EOC). Through these roles, she has contributed to strengthening ethical standards, integrity and good governance within sport.

With a career spanning more than three decades in judicial decision-making and international sports law, Martina brings a distinctive perspective to sports dispute resolution, combining judicial independence, expertise in integrity and anti-doping matters, and first-hand experience of international sports arbitration. She is a sought-after speaker and lecturer on sports law, anti-doping, ethics and integrity in sport.`,
    order: 2,
  },
  {
    name: 'Khayran Noor',
    role: 'Speaker',
    titleLines: ['International Sports Lawyer', 'Founding Director, Sports Legal'],
    shortBio: 'Khayran Noor is an international sports lawyer, governance specialist, educator and arbitrator, and Founding Director of Sports Legal™, a consultancy advancing integrity, governance, safeguarding and compliance in sport. She chairs the East Africa Law Society\'s Sports Law Committee, lectures at the Academy for Leadership Sciences Switzerland, and is an Arbitrator (MCIArb) with the Chartered Institute of Arbitrators.',
    bio: `Khayran Noor is an international sports lawyer, governance specialist, educator, and arbitrator, serving as the Founding Director of Sports Legal™, a specialist consultancy dedicated to advancing integrity, governance, safeguarding, compliance, and legal excellence across the sports sector.

With extensive experience at the intersection of sport, law, human rights, and governance, Khayran has established herself as a respected professional within the international sports ecosystem. Her work focuses on regulatory and legislative development, safeguarding, good governance, compliance frameworks, human rights, diversity and inclusion, dispute resolution, and institutional capacity building.

Through Sports Legal™ Khayran works to advance legal and governance standards in sport, with a particular focus on safeguarding, human rights, compliance, integrity, and institutional governance. Her work combines legal expertise, education, policy development, and capacity building to support the continued evolution of sport across Africa and internationally.

In addition to her work through Sports Legal™, Khayran holds a number of leadership, advisory, and academic appointments. She serves as Chairperson of the East Africa Law Society, Sports Law Committee and is a Special Advisor in Sports Law, Governance, and Human Rights with the BOLD Global Alliance for Women, Girls & Sport (BOLD). She has also contributed as a Protocol Expert for the Human Rights Empowered through Rights of Athletes (H.E.R.O) Project and served as a member of the expert review group responsible for the development of Rugby Africa's Safeguarding Policy, Safeguarding Toolkit, and implementation strategy.

Khayran recently completed a Master's Degree in Football Law at ITTI Sports Institute, further strengthening her expertise in the legal, regulatory, and governance frameworks of international football. She also lectures at the Academy for Leadership Sciences Switzerland (ALSS), where she teaches within the MBA in Leadership in Sport programme and the Human Rights in Sport course, reflecting her commitment to education, capacity building, and the advancement of best practice within the sports industry.

As an Arbitrator (MCIArb) with the Chartered Institute of Arbitrators, Khayran brings valuable expertise in dispute prevention and resolution. Her arbitration credentials are complemented by the Africa Arbitration Academy Diploma in International Arbitration, strengthening her capabilities in international commercial and sports-related dispute resolution.

Her academic qualifications include an LLM in Sports Law & Practice from De Montfort University (DMU), Leicester, United Kingdom, and an LLB (Honours) from Kenyatta University. She is also an Advocate of the High Court of Kenya.

Recognised for her multidisciplinary approach, Khayran combines legal expertise, governance insight, and practical experience to support organisations in navigating complex challenges within sport. Her work is driven by a commitment to integrity, accountability, inclusion, and the promotion of safe and rights-respecting sporting environments.`,
    order: 3,
  },
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const carolineProfile = await Lawyer.findOne({ name: /Caroline Mwanzia/i }).lean();
  const carolineBio = carolineProfile ? toPlainText(carolineProfile.bio).slice(0, 4000) : '';
  const speakersWithBio = SPEAKERS.map((s) => (
    s.name === 'Caroline Mwanzia' ? { ...s, bio: carolineBio || s.shortBio } : s
  ));

  const baseFacts = {
    title: 'Promoting Clean Sport: Strengthening Anti-Doping and Integrity Across the Sports Ecosystem.',
    organiserName: 'PCN Sportiva LP',
    startsAt: new Date('2026-11-06T15:00:00Z'), // 16:00 WAT
    endsAt: new Date('2026-11-06T17:00:00Z'), // 18:00 WAT
    timezone: 'Africa/Lagos',
    social: {
      instagram: 'https://instagram.com/pcnsportivalp',
      x: 'https://x.com/pcnsportivalp',
      linkedin: 'https://www.linkedin.com/company/pcn-sportiva-lp',
    },
  };

  let webinar = await Webinar.findOne();

  if (!webinar) {
    webinar = await Webinar.create({
      ...baseFacts,
      speakers: speakersWithBio,
      webinarHeroEnabled: false, // OFF by default — an admin must switch it on
      webinarHeroEndsAt: new Date('2026-11-07T22:59:00Z'),
      registrationOpen: true,
    });
    console.log('Created the Webinar document:', webinar._id.toString());
    console.log('meetUrl: NOT SET — add it in the admin before going live.');
    console.log('webinarHeroEnabled: false (default OFF).');
  } else {
    for (const [key, value] of Object.entries(baseFacts)) {
      seedField(webinar, key, value, `event facts — ${key}`);
    }

    const byName = new Map((webinar.speakers || []).map((s) => [s.name, s]));
    for (const wanted of speakersWithBio) {
      const existing = byName.get(wanted.name);
      if (!existing) {
        webinar.speakers.push(wanted);
        report.written.push(`${wanted.name} — added as a new speaker`);
        continue;
      }
      seedField(existing, 'role', wanted.role, `${wanted.name} — role`);
      seedField(existing, 'titleLines', wanted.titleLines, `${wanted.name} — titleLines`);
      seedField(existing, 'shortBio', wanted.shortBio, `${wanted.name} — shortBio`);
      seedField(existing, 'bio', wanted.bio, `${wanted.name} — bio`);
    }
    webinar.markModified('speakers');

    seedField(webinar, 'webinarHeroEnabled', false, 'webinarHeroEnabled (default; not changed unless still unset)');

    await webinar.save();

    console.log('Written:');
    if (report.written.length === 0) console.log('  (nothing — everything already matched)');
    report.written.forEach((l) => console.log('  +', l));
    console.log('Already set (no change needed):');
    report.skippedAlreadySet.forEach((l) => console.log('  =', l));
    console.log('Skipped — edited in the dashboard since the last seed:');
    if (report.skippedEdited.length === 0) console.log('  (none)');
    report.skippedEdited.forEach((l) => console.log('  !', l));
  }

  console.log('\nNo speaker email or phone number is stored or published anywhere — the speaker schema has no such fields.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
