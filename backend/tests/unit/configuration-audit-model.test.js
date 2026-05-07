/**
 * Unit tests for ConfigurationAudit model virtuals (Phase 28 — Phase 6).
 *
 * Pure logic — virtuals exercised without DB.
 */

import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import ConfigurationAudit from '../../src/models/ConfigurationAudit.js';

const SOMEONE = new mongoose.Types.ObjectId();
const CFG = new mongoose.Types.ObjectId();

function mkAudit(overrides = {}) {
  return new ConfigurationAudit({
    configurationId: CFG,
    configurationKey: 'max_cv_file_size',
    action: 'updated',
    oldValue: 5,
    newValue: 10,
    changedBy: SOMEONE,
    category: 'security',
    changedAt: new Date(),
    ...overrides,
  });
}

describe('ConfigurationAudit.timeSinceChange', () => {
  it('returns null when changedAt is explicitly null', () => {
    const a = mkAudit();
    a.changedAt = null;
    expect(a.timeSinceChange).toBeNull();
  });

  it('"Sapo ndryshuar" when <1 minute ago', () => {
    const a = mkAudit({ changedAt: new Date(Date.now() - 30 * 1000) });
    expect(a.timeSinceChange).toBe('Sapo ndryshuar');
  });

  it('returns minutes-ago bucket', () => {
    const a = mkAudit({ changedAt: new Date(Date.now() - 5 * 60 * 1000) });
    expect(a.timeSinceChange).toMatch(/5 minuta më parë/);
  });

  it('returns hours-ago bucket', () => {
    const a = mkAudit({ changedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) });
    expect(a.timeSinceChange).toMatch(/3 orë më parë/);
  });

  it('returns days-ago bucket', () => {
    const a = mkAudit({ changedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) });
    expect(a.timeSinceChange).toMatch(/5 ditë më parë/);
  });
});

describe('ConfigurationAudit.changeDescription', () => {
  it('maps created → Krijuar', () => {
    expect(mkAudit({ action: 'created' }).changeDescription).toBe('Krijuar');
  });

  it('maps updated → Përditësuar', () => {
    expect(mkAudit({ action: 'updated' }).changeDescription).toBe('Përditësuar');
  });

  it('maps deleted → Fshirë', () => {
    expect(mkAudit({ action: 'deleted' }).changeDescription).toBe('Fshirë');
  });

  it('maps reset_to_default → Rikthyer në vlerën e paracaktuar', () => {
    expect(mkAudit({ action: 'reset_to_default' }).changeDescription)
      .toBe('Rikthyer në vlerën e paracaktuar');
  });

  it('falls back to raw action for unknown', () => {
    const a = mkAudit();
    a.action = 'mysterious';
    expect(a.changeDescription).toBe('mysterious');
  });
});

describe('ConfigurationAudit.formattedChange', () => {
  it('formats created action', () => {
    expect(mkAudit({ action: 'created', oldValue: null, newValue: 100 }).formattedChange)
      .toBe('Krijuar me vlerën: 100');
  });

  it('formats updated action with quotes', () => {
    expect(mkAudit({ action: 'updated', oldValue: 5, newValue: 10 }).formattedChange)
      .toBe('Ndryshuar nga "5" në "10"');
  });

  it('formats deleted action', () => {
    expect(mkAudit({ action: 'deleted', oldValue: 'foo', newValue: null }).formattedChange)
      .toBe('Fshirë (vlera e fundit: foo)');
  });

  it('formats reset_to_default action', () => {
    expect(mkAudit({ action: 'reset_to_default', newValue: 'default' }).formattedChange)
      .toBe('Rikthyer në vlerën e paracaktuar: default');
  });

  it('formats null/undefined as "null"', () => {
    expect(mkAudit({ action: 'updated', oldValue: null, newValue: undefined }).formattedChange)
      .toBe('Ndryshuar nga "null" në "null"');
  });

  it('formats boolean as Po/Jo', () => {
    expect(mkAudit({ action: 'updated', oldValue: false, newValue: true }).formattedChange)
      .toBe('Ndryshuar nga "Jo" në "Po"');
  });

  it('formats object as JSON', () => {
    expect(mkAudit({ action: 'updated', oldValue: { a: 1 }, newValue: { b: 2 } }).formattedChange)
      .toBe('Ndryshuar nga "{"a":1}" në "{"b":2}"');
  });
});
