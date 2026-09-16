#!/usr/bin/env node
/**
 * Creates the first super administrator, interactively.
 *
 * No default credentials ship with this project and no password is written to
 * any file — the only way an account comes into existence is by running this.
 *
 *   npm run create-admin
 */
import readline from 'node:readline';
import { Writable } from 'node:stream';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import Admin from '../src/models/Admin.js';
import { ROLES } from '../src/config/permissions.js';

// A writable that can swallow echoed characters, so the password is not
// left sitting in the terminal scrollback.
let muted = false;
const mutedOut = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding);
    callback();
  },
});

const rl = readline.createInterface({
  input: process.stdin,
  output: mutedOut,
  terminal: true,
});

const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

async function askHidden(question) {
  process.stdout.write(question);
  muted = true;
  const answer = await new Promise((resolve) => rl.question('', resolve));
  muted = false;
  process.stdout.write('\n');
  return answer;
}

async function main() {
  await connectDB();

  const existingSupers = await Admin.countDocuments({ role: 'super_admin' });
  console.log(`\n  PCN Sportiva — create administrator`);
  console.log(`  Existing super administrators: ${existingSupers}\n`);

  const name = (await ask('  Full name: ')).trim();
  const email = (await ask('  Email: ')).trim().toLowerCase();

  if (!name || name.length < 2) throw new Error('Name must be at least 2 characters');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That is not a valid email');

  if (await Admin.exists({ email })) {
    throw new Error(`An administrator with ${email} already exists`);
  }

  const password = await askHidden('  Password (min 10 characters): ');
  const confirm = await askHidden('  Confirm password: ');

  if (password.length < 10) throw new Error('Password must be at least 10 characters');
  if (password !== confirm) throw new Error('Passwords do not match');

  // The first account must be a super admin, or nobody could create the others.
  const defaultRole = existingSupers === 0 ? 'super_admin' : 'admin';
  const roleInput = (await ask(`  Role [${ROLES.join(' / ')}] (default ${defaultRole}): `)).trim();
  const role = roleInput || defaultRole;
  if (!ROLES.includes(role)) throw new Error(`Role must be one of: ${ROLES.join(', ')}`);

  const admin = new Admin({ name, email, role });
  await admin.setPassword(password);
  await admin.save();

  console.log(`\n  Created ${role} "${name}" <${email}>`);
  console.log('  Sign in at the dashboard with these credentials.\n');
}

main()
  .catch((err) => {
    console.error(`\n  Error: ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await disconnectDB();
    await mongoose.connection.close().catch(() => {});
    process.exit(process.exitCode || 0);
  });
