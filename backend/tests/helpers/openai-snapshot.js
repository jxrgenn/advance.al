/**
 * OpenAI snapshot-replay client (Phase 28 — Phase 3A).
 *
 * Wraps a real OpenAI client and either:
 *   1. Records real API responses to disk (when UPDATE_OPENAI_SNAPSHOTS=true)
 *   2. Replays cached responses from disk (default, $0 cost)
 *
 * This lets us run "real" OpenAI integration tests on every CI build at
 * zero per-run cost. Snapshot files are deterministic per (params hash)
 * and committed to git.
 *
 * Cost model:
 *   - Normal CI runs: $0 (replay only)
 *   - Snapshot refresh runs (workflow_dispatch): ~$0.05-0.20 per refresh
 *   - Refresh trigger: when prompts/model change in source code
 *
 * Usage:
 *
 *   import { snapshottedOpenAI } from '../helpers/openai-snapshot.js';
 *   const openai = snapshottedOpenAI();
 *
 *   const completion = await openai.chat.completions.create({
 *     model: 'gpt-4o-mini',
 *     messages: [{ role: 'user', content: 'Test prompt' }],
 *   });
 *
 *   // First run with UPDATE_OPENAI_SNAPSHOTS=true: hits real API, saves to disk
 *   // All other runs: reads from disk, no API call
 *
 * To refresh snapshots:
 *   OPENAI_API_KEY=$KEY UPDATE_OPENAI_SNAPSHOTS=true npm test -- openai-real
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = path.join(__dirname, '..', 'fixtures', 'openai-snapshots');

const UPDATE_MODE = process.env.UPDATE_OPENAI_SNAPSHOTS === 'true';

/**
 * Hash the request params to a deterministic snapshot key. Same input ⇒
 * same key ⇒ same snapshot. Changing the model or any prompt token
 * generates a new key (test will fail with "missing snapshot" → run
 * UPDATE_OPENAI_SNAPSHOTS=true to regenerate).
 */
function hashParams(params) {
  // Stringify with sorted keys for stability (JSON.stringify alone is order-dependent)
  const stable = JSON.stringify(params, Object.keys(params).sort());
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 16);
}

function snapshotPath(kind, params) {
  const key = hashParams(params);
  return path.join(SNAPSHOT_DIR, `${kind}-${key}.json`);
}

function ensureSnapshotDir() {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
}

async function snapshottedCall(kind, realFn, params) {
  const file = snapshotPath(kind, params);

  if (UPDATE_MODE) {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith('sk-ci-placeholder')) {
      throw new Error(
        `UPDATE_OPENAI_SNAPSHOTS=true requires a real OPENAI_API_KEY. ` +
        `Got: ${process.env.OPENAI_API_KEY?.slice(0, 12) || '(empty)'}`
      );
    }
    const real = await realFn(params);
    ensureSnapshotDir();
    // Write the response. OpenAI SDK returns class instances; toJSON / spread
    // gives plain object. Use JSON roundtrip to strip prototype.
    const plain = JSON.parse(JSON.stringify(real));
    fs.writeFileSync(file, JSON.stringify({ params, response: plain }, null, 2));
    return real;
  }

  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing OpenAI snapshot: ${path.relative(process.cwd(), file)}\n` +
      `  kind: ${kind}\n` +
      `  params hash: ${hashParams(params)}\n` +
      `Run with UPDATE_OPENAI_SNAPSHOTS=true and a real OPENAI_API_KEY to generate it.`
    );
  }

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return raw.response;
}

/**
 * Returns an OpenAI-shaped client. In UPDATE_MODE, instantiates a real
 * OpenAI client and records all calls. In replay mode, no real client
 * is created — works without OPENAI_API_KEY set.
 *
 * Async because dynamic import of 'openai' is needed for ESM.
 */
export async function snapshottedOpenAI() {
  let real = null;
  if (UPDATE_MODE) {
    // Lazy import to avoid throwing on missing key in replay mode
    // (openai SDK constructor throws when key is missing).
    const { default: OpenAI } = await import('openai');
    real = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return {
    chat: {
      completions: {
        create: (params) =>
          snapshottedCall('chat-completions', (p) => real.chat.completions.create(p), params),
      },
    },
    embeddings: {
      create: (params) =>
        snapshottedCall('embeddings', (p) => real.embeddings.create(p), params),
    },
  };
}

/** Helper to inspect snapshot directory state — useful for tests. */
export function listSnapshots() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return [];
  return fs.readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith('.json'));
}

export const SNAPSHOT_DIR_PATH = SNAPSHOT_DIR;
export const IS_UPDATE_MODE = UPDATE_MODE;
