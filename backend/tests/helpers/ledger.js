/**
 * Test Ledger Helper
 *
 * Appends one row per assertion to tests/results/honest-test-ledger.json.
 * Each row carries enough evidence (request/response/db state/side effects)
 * to be reproducible without re-running the suite.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEDGER_PATH = path.resolve(__dirname, '../../../tests/results/honest-test-ledger.json');

function load() {
  if (!fs.existsSync(LEDGER_PATH)) {
    return {
      version: 1,
      started: new Date().toISOString().slice(0, 10),
      principles: [
        'No claim without artifact',
        'Real DB, real HTTP, real services',
        "Failures are loud — no 'deferred'"
      ],
      rows: []
    };
  }
  const raw = fs.readFileSync(LEDGER_PATH, 'utf8');
  return JSON.parse(raw);
}

function save(data) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(data, null, 2));
}

/**
 * Append a single test result row.
 *
 * @param {object} row - Must include id, phase, kind, name, verdict.
 *                        Optional: endpoint, request, response, dbBefore, dbAfter,
 *                        sideEffects, evidence, code_reference, details
 */
export function appendRow(row) {
  if (!row || !row.id || !row.verdict) {
    throw new Error('ledger.appendRow requires at least { id, verdict }');
  }
  const data = load();
  data.rows.push({
    timestamp: new Date().toISOString(),
    ...row
  });
  save(data);
}

export function getLedgerPath() {
  return LEDGER_PATH;
}

export default { appendRow, getLedgerPath };
