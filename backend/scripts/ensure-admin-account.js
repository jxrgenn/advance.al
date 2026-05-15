// One-off: ensure an admin account exists with the canonical credentials.
// Idempotent — re-running is safe (always re-sets the password, so this
// is also the "reset admin password" recovery script).
//
// Usage: node backend/scripts/ensure-admin-account.js
//
// Credentials come from env (defaults to admin@advance.al / PasswordIForte123@
// per CLAUDE.md memory). ADMIN_EMAIL / ADMIN_PASSWORD env vars override.

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/index.js';

dotenv.config();

const ADMIN_EMAIL    = (process.env.ADMIN_EMAIL    || 'admin@advance.al').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'PasswordIForte123@';

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  let user = await User.findOne({ email: ADMIN_EMAIL });
  let action;

  if (!user) {
    user = new User({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,            // pre-save hook bcrypts this
      userType: 'admin',
      emailVerified: true,
      status: 'active',
      profile: {
        firstName: 'Admin',
        lastName: 'advance.al',
        location: { city: 'Tiranë', region: 'Tiranë' },
      },
    });
    await user.save();
    action = 'CREATED';
  } else {
    user.password      = ADMIN_PASSWORD;   // pre-save hook re-hashes
    user.userType      = 'admin';
    user.emailVerified = true;
    user.status        = 'active';
    if (!user.profile) user.profile = {};
    if (!user.profile.firstName) user.profile.firstName = 'Admin';
    if (!user.profile.lastName)  user.profile.lastName  = 'advance.al';
    if (!user.profile.location || !user.profile.location.city) {
      user.profile.location = { city: 'Tiranë', region: 'Tiranë' };
    }
    await user.save();
    action = 'UPDATED';
  }

  console.log(`\n=== ENSURE-ADMIN-ACCOUNT — ${action} ===\n`);
  console.log(`  email:         ${user.email}`);
  console.log(`  userType:      ${user.userType}`);
  console.log(`  emailVerified: ${user.emailVerified}`);
  console.log(`  status:        ${user.status}`);
  console.log(`  _id:           ${user._id}`);
  console.log(`\n  password set to:  ${ADMIN_PASSWORD}`);
  console.log(`  login URL:        ${process.env.FRONTEND_URL || 'http://localhost:5173'}/login\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('ensure-admin-account failed:', err);
  process.exit(1);
});
