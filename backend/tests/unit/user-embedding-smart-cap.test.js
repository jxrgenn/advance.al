/**
 * Unit tests for userEmbeddingService.applySmartMatchCap — the smart hard cap
 * on new-job notification fan-out. Three layered caps:
 *   1. Relative gap: drop scores < topScore - RELATIVE_GAP
 *   2. Absolute ceiling: take at most ABSOLUTE matches
 *   3. Safety valve: if matches > SAFETY_VALVE_RATIO of candidates, return []
 *
 * Pure-logic unit tests — no DB, no I/O.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import userEmbeddingService from '../../src/services/userEmbeddingService.js';

// Helper: build a sorted-desc match list with given scores
const mkMatches = (scores) => scores.map((score, i) => ({ user: { _id: `u${i}` }, score }));

describe('userEmbeddingService.applySmartMatchCap', () => {
  let original;
  beforeEach(() => {
    original = {
      abs: userEmbeddingService.notifyCapAbsolute,
      gap: userEmbeddingService.notifyCapRelativeGap,
      valve: userEmbeddingService.notifySafetyValveRatio,
      minPop: userEmbeddingService.notifySafetyValveMinPopulation,
    };
    // Default min-population low for tests; specific tests can override
    userEmbeddingService.notifySafetyValveMinPopulation = 1;
  });
  afterEach(() => {
    userEmbeddingService.notifyCapAbsolute = original.abs;
    userEmbeddingService.notifyCapRelativeGap = original.gap;
    userEmbeddingService.notifySafetyValveRatio = original.valve;
    userEmbeddingService.notifySafetyValveMinPopulation = original.minPop;
  });

  describe('relative-gap filter (score-distribution aware)', () => {
    it('niche-job case: tight score cluster keeps all matches within gap', () => {
      // Best 0.85, others within 0.15 of best
      const matches = mkMatches([0.85, 0.82, 0.78, 0.75, 0.71]);
      userEmbeddingService.notifyCapAbsolute = 100;
      userEmbeddingService.notifyCapRelativeGap = 0.15;
      userEmbeddingService.notifySafetyValveRatio = 0.99;

      const result = userEmbeddingService.applySmartMatchCap(matches, 1000, 'test');
      expect(result).toHaveLength(5);
      expect(result.map(m => m.score)).toEqual([0.85, 0.82, 0.78, 0.75, 0.71]);
    });

    it('generic-job case: wide score spread cuts at top-0.15 floor', () => {
      // Best 0.85, then a long tail down to 0.55 (just above threshold)
      const matches = mkMatches([0.85, 0.82, 0.78, 0.65, 0.60, 0.58, 0.55]);
      userEmbeddingService.notifyCapAbsolute = 100;
      userEmbeddingService.notifyCapRelativeGap = 0.15;
      userEmbeddingService.notifySafetyValveRatio = 0.99;

      // Relative floor = 0.85 - 0.15 = 0.70. Only 0.85, 0.82, 0.78 survive.
      const result = userEmbeddingService.applySmartMatchCap(matches, 1000, 'test');
      expect(result).toHaveLength(3);
      expect(result.every(m => m.score >= 0.70)).toBe(true);
    });

    it('single match: kept (no gap to compare against)', () => {
      const matches = mkMatches([0.62]);
      userEmbeddingService.notifyCapAbsolute = 100;
      userEmbeddingService.notifyCapRelativeGap = 0.15;
      userEmbeddingService.notifySafetyValveRatio = 0.99;

      const result = userEmbeddingService.applySmartMatchCap(matches, 1000, 'test');
      expect(result).toHaveLength(1);
    });

    it('empty matches: empty out (no top score, no work)', () => {
      const result = userEmbeddingService.applySmartMatchCap([], 1000, 'test');
      expect(result).toEqual([]);
    });
  });

  describe('absolute ceiling', () => {
    it('caps at ABSOLUTE even when relative gap allows more', () => {
      // 80 matches all within 0.05 of each other (would all pass relative gap)
      const scores = Array.from({ length: 80 }, (_, i) => 0.85 - i * 0.0005);
      const matches = mkMatches(scores);
      userEmbeddingService.notifyCapAbsolute = 50;
      userEmbeddingService.notifyCapRelativeGap = 0.15;
      userEmbeddingService.notifySafetyValveRatio = 0.99;

      const result = userEmbeddingService.applySmartMatchCap(matches, 200, 'test');
      expect(result).toHaveLength(50);
      // Top 50 by score (input was already sorted desc)
      expect(result[0].score).toBeCloseTo(0.85, 5);
      expect(result[49].score).toBeCloseTo(0.85 - 49 * 0.0005, 5);
    });

    it('does not exceed ABSOLUTE configured via env-read at construction', () => {
      userEmbeddingService.notifyCapAbsolute = 3;
      userEmbeddingService.notifyCapRelativeGap = 1.0; // disable gap filter
      userEmbeddingService.notifySafetyValveRatio = 0.99;

      const matches = mkMatches([0.9, 0.85, 0.8, 0.75, 0.7]);
      const result = userEmbeddingService.applySmartMatchCap(matches, 100, 'test');
      expect(result).toHaveLength(3);
      expect(result.map(m => m.score)).toEqual([0.9, 0.85, 0.8]);
    });
  });

  describe('safety valve (runaway-match detection)', () => {
    it('trips when matches > SAFETY_VALVE_RATIO of candidates', () => {
      // 600 matches out of 1000 candidates = 60%, above 50% threshold
      const scores = Array.from({ length: 600 }, () => 0.6);
      const matches = mkMatches(scores);
      userEmbeddingService.notifyCapAbsolute = 100;
      userEmbeddingService.notifyCapRelativeGap = 0.15;
      userEmbeddingService.notifySafetyValveRatio = 0.5;

      const result = userEmbeddingService.applySmartMatchCap(matches, 1000, 'test');
      expect(result).toEqual([]);  // bail out — likely a bug
    });

    it('does NOT trip just below SAFETY_VALVE_RATIO', () => {
      // 499 matches out of 1000 = 49.9%, below 50% threshold
      const scores = Array.from({ length: 499 }, (_, i) => 0.85 - i * 0.0001);
      const matches = mkMatches(scores);
      userEmbeddingService.notifyCapAbsolute = 100;
      userEmbeddingService.notifyCapRelativeGap = 0.15;
      userEmbeddingService.notifySafetyValveRatio = 0.5;

      const result = userEmbeddingService.applySmartMatchCap(matches, 1000, 'test');
      // Should be capped by absolute=100, not by safety valve
      expect(result.length).toBe(100);
    });

    it('does not trip when matches is small relative to candidates', () => {
      // 30 matches out of 10000 = 0.3% — totally normal
      const scores = Array.from({ length: 30 }, (_, i) => 0.85 - i * 0.002);
      const matches = mkMatches(scores);
      userEmbeddingService.notifyCapAbsolute = 100;
      userEmbeddingService.notifyCapRelativeGap = 0.15;
      userEmbeddingService.notifySafetyValveRatio = 0.5;

      const result = userEmbeddingService.applySmartMatchCap(matches, 10000, 'test');
      // 0.85 - 0.15 = 0.70 floor. 0.85, 0.848, 0.846 ... until score < 0.70.
      // Scores decrement by 0.002. Floor hit at index where 0.85 - i*0.002 < 0.70
      // → i > 75. So 76 scores pass relative gap; capped at absolute=100.
      expect(result.length).toBeGreaterThanOrEqual(30);
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it('zero-candidate population: no safety valve trip', () => {
      // Edge case: empty population shouldn't crash on divide-by-zero math
      const result = userEmbeddingService.applySmartMatchCap([], 0, 'test');
      expect(result).toEqual([]);
    });

    it('does NOT trip when population is below MIN_POPULATION', () => {
      // Tiny population: 5 candidates, 5 matches (100%) — not enough data to call a bug
      const matches = mkMatches([0.9, 0.85, 0.8, 0.75, 0.7]);
      userEmbeddingService.notifyCapAbsolute = 100;
      userEmbeddingService.notifyCapRelativeGap = 0.5;  // wide gap so all pass relative filter
      userEmbeddingService.notifySafetyValveRatio = 0.5;
      userEmbeddingService.notifySafetyValveMinPopulation = 20;

      const result = userEmbeddingService.applySmartMatchCap(matches, 5, 'test');
      expect(result.length).toBe(5);  // valve dormant on small populations
    });
  });

  describe('the 10,000-users / 300-matches scenario from the user audit', () => {
    it('keeps top-cluster matches when 300/10000 match (normal case)', () => {
      // 300 matches with realistic score distribution: top=0.78, tail to 0.55
      const scores = Array.from({ length: 300 }, (_, i) => 0.78 - (i / 300) * 0.23);
      const matches = mkMatches(scores);
      userEmbeddingService.notifyCapAbsolute = 50;
      userEmbeddingService.notifyCapRelativeGap = 0.15;
      userEmbeddingService.notifySafetyValveRatio = 0.5;

      const result = userEmbeddingService.applySmartMatchCap(matches, 10000, 'test');

      // Safety valve does NOT trip (300/10000 = 3%, well under 50%)
      // Relative floor = 0.78 - 0.15 = 0.63. Tail below 0.63 drops.
      // Of those above 0.63, absolute caps at 50.
      expect(result.length).toBe(50);
      expect(result.every(m => m.score >= 0.63)).toBe(true);
    });

    it('catastrophic bug case: 300/300 match (everyone) → safety valve trips', () => {
      // Total population is 300, all 300 matched at suspiciously uniform 0.6
      const scores = Array.from({ length: 300 }, () => 0.6);
      const matches = mkMatches(scores);
      userEmbeddingService.notifyCapAbsolute = 50;
      userEmbeddingService.notifyCapRelativeGap = 0.15;
      userEmbeddingService.notifySafetyValveRatio = 0.5;

      const result = userEmbeddingService.applySmartMatchCap(matches, 300, 'test');
      expect(result).toEqual([]);  // bail out, log error
    });
  });
});
