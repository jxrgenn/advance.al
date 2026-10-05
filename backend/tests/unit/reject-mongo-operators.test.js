/**
 * O-68 — unit tests for the global NoSQL operator guard
 * (src/middleware/rejectMongoOperators.js).
 *
 * findUnsafeKey must find a `$`-prefixed or dotted KEY at any depth (objects
 * and arrays), must never flag VALUES (a `$` or `.` inside a string is data),
 * and must not recurse (a deeply nested body cannot overflow the stack).
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  findUnsafeKey,
  rejectMongoOperators,
  UNSAFE_KEY_MESSAGE,
} from '../../src/middleware/rejectMongoOperators.js';

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('findUnsafeKey', () => {
  it('returns null for bodies without objects (undefined, null, string, number, empty)', () => {
    expect(findUnsafeKey(undefined)).toBeNull();
    expect(findUnsafeKey(null)).toBeNull();
    expect(findUnsafeKey('$ne')).toBeNull();
    expect(findUnsafeKey(42)).toBeNull();
    expect(findUnsafeKey({})).toBeNull();
    expect(findUnsafeKey([])).toBeNull();
  });

  it('ignores `$` and `.` inside string VALUES', () => {
    expect(findUnsafeKey({
      coverLetter: 'Paga $1,000. Kontakt: a.b@c.al',
      price: '$ne',
      tags: ['$gt', 'v1.2'],
    })).toBeNull();
  });

  it('finds a top-level operator key', () => {
    expect(findUnsafeKey({ token: 'x', $where: 'sleep(1000)' })).toBe('$where');
  });

  it('finds an operator nested inside a field value', () => {
    expect(findUnsafeKey({ token: { $ne: null } })).toBe('$ne');
  });

  it('finds a dotted key (update-path injection)', () => {
    expect(findUnsafeKey({ 'profile.employerProfile.verified': true })).toBe('profile.employerProfile.verified');
  });

  it('finds operators inside arrays, including arrays of arrays', () => {
    expect(findUnsafeKey({ customAnswers: [{ question: 'q', answer: 'a' }, { answer: { $gt: '' } }] })).toBe('$gt');
    expect(findUnsafeKey({ a: [[[{ ok: 1 }], [{ $in: ['x'] }]]] })).toBe('$in');
  });

  it('handles a 20,000-level nested body without a stack overflow', () => {
    let deep = { $ne: null };
    for (let i = 0; i < 20000; i++) deep = { child: deep };
    expect(findUnsafeKey(deep)).toBe('$ne');

    let deepClean = { leaf: 'ok' };
    for (let i = 0; i < 20000; i++) deepClean = [deepClean];
    expect(findUnsafeKey(deepClean)).toBeNull();
  });
});

describe('rejectMongoOperators middleware', () => {
  it('calls next() and sends nothing for a clean body', () => {
    const next = jest.fn();
    const res = mockRes();
    rejectMongoOperators({ body: { email: 'a@b.al', password: 'Pa$$w0rd.' }, method: 'POST', path: '/x' }, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() when there is no body (GET)', () => {
    const next = jest.fn();
    const res = mockRes();
    rejectMongoOperators({ method: 'GET', path: '/x' }, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('answers 400 with the Albanian message and does NOT call next() for an operator body', () => {
    const next = jest.fn();
    const res = mockRes();
    rejectMongoOperators({ body: { token: { $ne: null } }, method: 'POST', path: '/api/quickusers/unsubscribe' }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: UNSAFE_KEY_MESSAGE });
    expect(UNSAFE_KEY_MESSAGE).toBe('Kërkesa përmban fusha të palejuara.');
  });
});
