/**
 * Smoke test for /api/jobs/recommendations against the locally-running backend.
 * Mints a short-lived JWT for the user using JWT_SECRET, hits the endpoint,
 * prints scoringMode + top recs. No login flow / password needed.
 *
 * Usage:
 *   node scripts/embeddings-smoke-recommendations.js --user jurgenhalili1142
 *   node scripts/embeddings-smoke-recommendations.js --user jurgenhalili1142 --limit 10 --base http://localhost:3001
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { connectDB } from '../src/config/database.js';
import User from '../src/models/User.js';

dotenv.config();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { user: 'jurgenhalili1142', limit: 10, base: 'http://localhost:3001' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--user') opts.user = args[++i];
    else if (a === '--limit') opts.limit = parseInt(args[++i], 10);
    else if (a === '--base') opts.base = args[++i];
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  await connectDB();

  const rx = new RegExp(opts.user, 'i');
  const user = await User.findOne({
    userType: 'jobseeker',
    $or: [{ email: rx }, { 'profile.firstName': rx }, { 'profile.lastName': rx }],
  });
  if (!user) {
    console.error('User not found:', opts.user);
    process.exit(1);
  }

  const token = jwt.sign(
    { id: user._id, email: user.email, userType: user.userType },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );

  const url = `${opts.base}/api/jobs/recommendations?limit=${opts.limit}`;
  console.log(`User: ${user.email} (${user._id})`);
  console.log(`GET  ${url}`);

  const t0 = Date.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const ms = Date.now() - t0;
  const body = await res.json();

  console.log(`Status: ${res.status}  (${ms}ms)`);
  if (!res.ok) {
    console.error('ERROR body:', JSON.stringify(body, null, 2));
    await mongoose.disconnect();
    process.exit(1);
  }

  const d = body.data || {};
  console.log(`scoringMode: ${d.scoringMode || '(missing!)'}`);
  console.log(`personalized: ${d.personalized}`);
  console.log(`total: ${d.total}`);
  console.log(`\nTop recommendations:\n`);
  console.log('rank | score   | id                          | title                                    | city        | seniority | jobType    | tier');
  console.log('-----|---------|-----------------------------|------------------------------------------|-------------|-----------|------------|--------');
  (d.recommendations || []).forEach((j, i) => {
    const sn = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
    console.log(
      String(i + 1).padStart(4) + ' | ' +
      (j.score != null ? Number(j.score).toFixed(4) : '------') + ' | ' +
      String(j._id).padEnd(27) + ' | ' +
      sn(j.title, 40).padEnd(40) + ' | ' +
      sn(j.location?.city, 11).padEnd(11) + ' | ' +
      sn(j.seniority, 9).padEnd(9) + ' | ' +
      sn(j.jobType, 10).padEnd(10) + ' | ' +
      sn(j.tier, 6)
    );
  });

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error('FATAL:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
