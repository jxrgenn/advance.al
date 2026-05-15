#!/usr/bin/env node
/**
 * verify-employer.js
 *
 * One-off: mark an employer account as email-verified + admin-verified so
 * they can post jobs. Use only when the user has explicitly asked.
 *
 * USAGE
 *   node --env-file=.env scripts/verify-employer.js <email>
 */

import mongoose from 'mongoose';
import { User } from '../src/models/index.js';

const email = process.argv[2];
if (!email) {
  console.error('usage: node --env-file=.env scripts/verify-employer.js <email>');
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI not set');
  process.exit(1);
}

await mongoose.connect(uri);
console.log('connected');

const user = await User.findOne({ email: email.toLowerCase() });
if (!user) {
  console.error(`no user with email ${email}`);
  await mongoose.disconnect();
  process.exit(2);
}

console.log('BEFORE:', {
  _id: user._id.toString(),
  email: user.email,
  userType: user.userType,
  emailVerified: user.emailVerified,
  employerVerified: user.profile?.employerProfile?.verified,
  companyName: user.profile?.employerProfile?.companyName,
});

if (user.userType !== 'employer') {
  console.error(`user is ${user.userType}, not employer — refusing to set employerProfile.verified`);
  await mongoose.disconnect();
  process.exit(3);
}

user.emailVerified = true;
if (!user.profile) user.profile = {};
if (!user.profile.employerProfile) user.profile.employerProfile = {};
user.profile.employerProfile.verified = true;
await user.save();

const after = await User.findById(user._id).lean();
console.log('AFTER:', {
  emailVerified: after.emailVerified,
  employerVerified: after.profile?.employerProfile?.verified,
});

await mongoose.disconnect();
console.log('done');
