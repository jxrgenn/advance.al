/**
 * Test helpers for querying the real test backend's MongoDB via the
 * side-channel HTTP at :3199.
 */

const SIDE = 'http://localhost:3199';

export async function getVerificationCode(email: string): Promise<string | null> {
  const res = await fetch(`${SIDE}/__test/code/${encodeURIComponent(email.toLowerCase())}`);
  const body = await res.json();
  return body.found ? body.code : null;
}

export async function waitForVerificationCode(email: string, timeoutMs = 10000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const code = await getVerificationCode(email);
    if (code) return code;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Did not capture verification code for ${email} within ${timeoutMs}ms`);
}

export async function dbFind(collection: string, filter: any = {}, projection?: any, limit = 10) {
  const res = await fetch(`${SIDE}/__test/db/find`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ collection, filter, projection, limit })
  });
  const body = await res.json();
  if (!body.ok) throw new Error('db/find: ' + body.error);
  return body.docs;
}

/** Convenience: count docs matching filter (uses dbFind with high limit). */
export async function dbCount(collection: string, filter: any = {}): Promise<number> {
  const docs = await dbFind(collection, filter, { _id: 1 }, 10000);
  return docs.length;
}

/** Convenience: find one doc, or null. */
export async function dbFindOne(collection: string, filter: any = {}, projection?: any) {
  const docs = await dbFind(collection, filter, projection, 1);
  return docs[0] || null;
}

/**
 * Replace any Date / ObjectId-string-like values in an object tree with EJSON
 * markers so the side-channel can revive them as real Date / ObjectId.
 *
 * NOTE: cannot use JSON.stringify replacer for Date wrapping because Date has
 * toJSON() and the replacer receives the ISO string AFTER toJSON, not the Date.
 * We deep-clone with manual replacement instead.
 */
function ejsonClone(node: any): any {
  if (node === null || node === undefined) return node;
  if (node instanceof Date) return { $date: node.toISOString() };
  if (Array.isArray(node)) return node.map(ejsonClone);
  if (typeof node === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(node)) out[k] = ejsonClone(v);
    return out;
  }
  return node;
}
function ejsonStringify(obj: any): string {
  return JSON.stringify(ejsonClone(obj));
}

export async function dbUpdate(collection: string, filter: any, update: any, opts: { upsert?: boolean } = {}) {
  const res = await fetch(`${SIDE}/__test/db/update`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: ejsonStringify({ collection, filter, update, upsert: opts.upsert || false })
  });
  const body = await res.json();
  if (!body.ok) throw new Error('db/update: ' + body.error);
  return body;
}

export async function dbClear() {
  const res = await fetch(`${SIDE}/__test/db/clear`, { method: 'POST' });
  const body = await res.json();
  if (!body.ok) throw new Error('db/clear: ' + body.error);
  await seedLocations();
}

const ALBANIAN_CITIES = [
  'Tiranë', 'Durrës', 'Vlorë', 'Shkodër', 'Elbasan',
  'Korçë', 'Fier', 'Berat', 'Gjirokastër', 'Lushnjë',
];

export async function seedLocations() {
  for (let i = 0; i < ALBANIAN_CITIES.length; i++) {
    const city = ALBANIAN_CITIES[i];
    await fetch(`${SIDE}/__test/db/update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collection: 'locations',
        filter: { city },
        update: { $set: { city, region: city, country: 'Albania', isActive: true, displayOrder: i, jobCount: 0 } },
        upsert: true
      })
    });
  }
}
