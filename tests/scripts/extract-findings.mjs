#!/usr/bin/env node
/**
 * Reads frontend/test-results/overnight-results.json (Playwright JSON
 * reporter output), extracts every test failure with:
 *   - spec file
 *   - test title (full describe path)
 *   - first error message + first stack frame
 *
 * Outputs a markdown report to stdout grouped by spec file.
 *
 * Usage:
 *   node tests/scripts/extract-findings.mjs [path-to-results.json]
 */

import fs from 'fs';
import path from 'path';

const resultsPath = process.argv[2] ||
  path.resolve(process.cwd(), 'frontend/test-results/overnight-results.json');

if (!fs.existsSync(resultsPath)) {
  console.error('Results file not found:', resultsPath);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

const failures = [];
const passes = [];
const flaky = [];

function walkSuite(suite, descPath = []) {
  const here = suite.title ? [...descPath, suite.title] : descPath;
  if (suite.suites) for (const s of suite.suites) walkSuite(s, here);
  if (suite.specs) {
    for (const spec of suite.specs) {
      const fullTitle = [...here, spec.title].join(' > ');
      const file = spec.file || suite.file || 'unknown';
      for (const t of spec.tests || []) {
        const last = t.results[t.results.length - 1];
        if (!last) continue;
        if (last.status === 'passed') {
          passes.push({ file, title: fullTitle });
        } else if (last.status === 'failed' || last.status === 'timedOut' || last.status === 'unexpected') {
          const err = last.errors?.[0] || {};
          const msg = (err.message || err.value || '').replace(/\[[0-9;]*m/g, '');
          const stack = (err.stack || '').replace(/\[[0-9;]*m/g, '');
          const firstStack = (stack.split('\n').find(l => l.includes('.spec.ts')) || '').trim();
          failures.push({ file, title: fullTitle, message: msg.split('\n').slice(0, 4).join('\n'), location: firstStack });
        } else if (last.status === 'flaky' || (t.results.length > 1 && last.status === 'passed')) {
          flaky.push({ file, title: fullTitle });
        }
      }
    }
  }
}

for (const s of data.suites || []) walkSuite(s);

const byFile = new Map();
for (const f of failures) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}

console.log('# Phase 23 — Run Findings');
console.log('');
console.log(`**Run started:** ${data.config?.metadata?.startTime || 'n/a'}`);
console.log(`**Tests passed:** ${passes.length}`);
console.log(`**Tests failed:** ${failures.length}`);
console.log(`**Tests flaky:**  ${flaky.length}`);
console.log('');

if (failures.length === 0) {
  console.log('## All tests passed. Bug-hunt yielded no failures.');
  process.exit(0);
}

console.log('## Failures by spec file');
console.log('');
for (const [file, fs] of [...byFile.entries()].sort()) {
  const rel = file.replace(/^.*\/overnight\//, 'overnight/');
  console.log(`### ${rel} — ${fs.length} failure${fs.length > 1 ? 's' : ''}`);
  console.log('');
  for (const f of fs) {
    console.log(`- **${f.title}**`);
    if (f.location) console.log(`  - location: \`${f.location}\``);
    console.log(`  - error: \`${f.message.split('\n')[0].slice(0, 240)}\``);
  }
  console.log('');
}
