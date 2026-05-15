// Read-only paywall diagnostic.
//
// Answers: "why didn't the paywall fire when I posted a job?" — by printing
// the two runtime flags that the POST /api/jobs route consults
// (SystemConfiguration.payment_enabled and User.freePostingEnabled) and
// running the same decision the route runs.
//
// Usage:
//   node backend/scripts/diagnose-paywall.js [email]
//
// If [email] is omitted, defaults to keithjones240424@gmail.com (the
// project owner) — adjust as needed. Read-only: no $set, no upserts.

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User, SystemConfiguration, Job } from '../src/models/index.js';

dotenv.config();

const DEFAULT_EMAIL = 'keithjones240424@gmail.com';

function fmt(label, value) {
  return `  ${label.padEnd(28)} ${value}`;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set. Aborting.');
    process.exit(1);
  }

  const email = (process.argv[2] || DEFAULT_EMAIL).toLowerCase();

  await mongoose.connect(process.env.MONGODB_URI);

  console.log('\n=== PAYWALL DIAGNOSTIC ===\n');

  // 1) SystemConfiguration.payment_enabled
  const paymentEnabledDoc = await SystemConfiguration.findOne({ key: 'payment_enabled' }).lean();
  console.log('1. SystemConfiguration.payment_enabled');
  if (!paymentEnabledDoc) {
    console.log(fmt('present?', 'NO — doc missing'));
    console.log(fmt('effective value', 'undefined (treated as falsy → paywall OFF)'));
  } else {
    console.log(fmt('value', String(paymentEnabledDoc.value)));
    console.log(fmt('defaultValue', String(paymentEnabledDoc.defaultValue)));
    console.log(fmt('updatedAt', paymentEnabledDoc.updatedAt?.toISOString?.() ?? 'n/a'));
  }
  const paymentEnabled = paymentEnabledDoc?.value === true;

  // 2) Target user
  console.log(`\n2. Target user: ${email}`);
  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.log(fmt('found?', 'NO — no user with that email'));
  } else {
    console.log(fmt('_id', String(user._id)));
    console.log(fmt('userType', user.userType));
    console.log(fmt('freePostingEnabled', String(user.freePostingEnabled === true)));
    console.log(fmt('status', user.status ?? 'n/a'));
    console.log(fmt('emailVerified', String(user.emailVerified === true)));
  }
  const freePosting = user?.freePostingEnabled === true;

  // 3) Employer/job summary
  console.log('\n3. Database summary');
  const employerTotal = await User.countDocuments({ userType: 'employer' });
  const employerFree = await User.countDocuments({ userType: 'employer', freePostingEnabled: true });
  const jobsPendingPayment = await Job.countDocuments({ status: 'pending_payment' });
  const jobsActive = await Job.countDocuments({ status: 'active' });
  console.log(fmt('total employers', String(employerTotal)));
  console.log(fmt('employers with freePosting', String(employerFree)));
  console.log(fmt('jobs in pending_payment', String(jobsPendingPayment)));
  console.log(fmt('jobs in active', String(jobsActive)));

  // 4) Decision matrix — replicates routes/jobs.js logic
  // (isFreeForEmployer = employer.freePostingEnabled || !paymentEnabled)
  console.log('\n4. Decision (would a fresh post by this user hit paywall?)');
  console.log(fmt('paymentEnabled (system)', String(paymentEnabled)));
  console.log(fmt('freePostingEnabled (user)', String(freePosting)));
  const isFreeForEmployer = freePosting || !paymentEnabled;
  console.log(fmt('=> isFreeForEmployer', String(isFreeForEmployer)));
  console.log(fmt('=> route would set', isFreeForEmployer ? "status='active' (BYPASS)" : "status='pending_payment' (PAYWALL)"));

  // 5) Verdict + next step
  console.log('\n=== VERDICT ===');
  if (isFreeForEmployer) {
    const reasons = [];
    if (!paymentEnabled) reasons.push('payment_enabled is not true at system level');
    if (freePosting)     reasons.push(`${email} has freePostingEnabled=true`);
    console.log(`Paywall WILL BE BYPASSED for ${email}.`);
    console.log(`Reason(s): ${reasons.join(' AND ')}.`);
    console.log('\nNext step(s):');
    if (!paymentEnabled) {
      console.log('  • Run:  node backend/scripts/enable-payments.js');
    }
    if (freePosting) {
      console.log(`  • Manually flip freePostingEnabled to false for ${email} (admin panel or one-off mongo update), OR test the paywall from a different employer account.`);
    }
  } else {
    console.log(`Paywall WILL FIRE for ${email}. Posting a job should land them on /payment/job/:id.`);
    console.log('If it still doesn\'t — re-check the POST /api/jobs response payload and the frontend redirect logic in PostJob.tsx.');
  }
  console.log('');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('diagnose-paywall failed:', err);
  process.exit(1);
});
