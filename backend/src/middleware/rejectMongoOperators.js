/**
 * O-68 — global NoSQL operator-injection guard.
 *
 * Route handlers routinely drop body values straight into Mongo filters
 * (`QuickUser.findOne({ unsubscribeToken: req.body.token })`). JSON bodies —
 * and urlencoded bodies, which server.js parses with `extended: true`, so
 * `token[$ne]=x` becomes `{ token: { $ne: 'x' } }` — can carry operator
 * objects that turn an equality match into "match anything".
 *
 * No legitimate payload from our frontend uses object keys that start with
 * `$` (Mongo operators) or contain `.` (dotted paths reach into nested
 * documents on update), so any such key anywhere in the body — at any depth,
 * inside arrays too — rejects the request with 400 before a route sees it.
 * Values are never inspected: a `$` or `.` inside a string is ordinary data.
 *
 * Scope: mounted in server.js right after express.json/urlencoded. Multipart
 * bodies are parsed later by per-route multer, so routes that JSON.parse
 * multipart fields call `findUnsafeKey` themselves (see quickusers.js).
 * req.query needs no walk: Express 5's default 'simple' query parser never
 * produces nested objects.
 */
import logger from '../config/logger.js';

export const UNSAFE_KEY_MESSAGE = 'Kërkesa përmban fusha të palejuara.';

const isUnsafeKey = (key) => key.startsWith('$') || key.includes('.');

/**
 * Returns the first unsafe key found anywhere in `value`, or null.
 * Iterative (explicit stack) so a deeply nested 1 MB body cannot overflow
 * the call stack.
 */
export function findUnsafeKey(value) {
  const stack = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    for (const key of Object.keys(current)) {
      if (isUnsafeKey(key)) return key;
      stack.push(current[key]);
    }
  }
  return null;
}

export function rejectMongoOperators(req, res, next) {
  const unsafeKey = findUnsafeKey(req.body);
  if (unsafeKey !== null) {
    logger.warn('Rejected request body with operator/dotted key', {
      method: req.method,
      path: req.path, // no query string — it can carry tokens
      key: unsafeKey.slice(0, 64),
    });
    return res.status(400).json({
      success: false,
      message: UNSAFE_KEY_MESSAGE,
    });
  }
  next();
}

export default rejectMongoOperators;
