// Read-only env diagnostic — prints the values that drive the payment
// route's "fake-success vs 503" decision. Use this when /paysera/initiate
// surprises you with a 503 in dev: this script tells you exactly why.
//
// Usage: node backend/scripts/diagnose-env.js
//          npm run diag:env

import dotenv from 'dotenv';

dotenv.config();

function fmt(label, value, width = 32) {
  return `  ${String(label).padEnd(width)} ${value}`;
}

function bool(name) {
  return process.env[name] === 'true';
}

const nodeEnv = process.env.NODE_ENV || '(unset)';
const projectId = process.env.PAYSERA_PROJECT_ID || '';
const signPass  = process.env.PAYSERA_SIGN_PASSWORD || '';
const allowFake = bool('PAYSERA_ALLOW_FAKE_SUCCESS');
const isConfigured = !!(projectId && signPass);

console.log('\n=== ENV DIAGNOSTIC — payment-flow decision inputs ===\n');
console.log(fmt('NODE_ENV',                  nodeEnv));
console.log(fmt('PAYSERA_PROJECT_ID',        projectId ? `set (${projectId.length} chars)` : '(empty)'));
console.log(fmt('PAYSERA_SIGN_PASSWORD',     signPass  ? `set (${signPass.length} chars)`  : '(empty)'));
console.log(fmt('PAYSERA_TEST',              process.env.PAYSERA_TEST || '(unset)'));
console.log(fmt('PAYSERA_ALLOW_FAKE_SUCCESS', String(allowFake)));
console.log(fmt('isConfigured()',            String(isConfigured)));
console.log(fmt('FRONTEND_URL',              process.env.FRONTEND_URL || '(unset → default)'));
console.log(fmt('BACKEND_URL',               process.env.BACKEND_URL  || '(unset → default)'));

console.log('\n=== /paysera/initiate decision ===\n');
if (isConfigured) {
  console.log('  → Real Paysera flow (signed redirect URL).');
  console.log(`  → Test mode: ${process.env.PAYSERA_TEST === 'true' ? 'SANDBOX' : 'LIVE'}`);
} else if (allowFake) {
  console.log('  → Returns /payment/fake-success URL (PAYSERA_ALLOW_FAKE_SUCCESS override).');
} else if (nodeEnv !== 'production') {
  console.log('  → Returns /payment/fake-success URL (non-prod fallback).');
} else {
  console.log('  → Returns 503 "Sistemi i pagesave nuk është konfiguruar".');
  console.log('  → To bypass for dev/testing: set PAYSERA_ALLOW_FAKE_SUCCESS=true in .env');
  console.log('  → For real prod use: set PAYSERA_PROJECT_ID and PAYSERA_SIGN_PASSWORD.');
}
console.log('');
