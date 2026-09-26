/**
 * Liveness is derived, not trusted.
 *
 * A cached `online` flag keeps asserting the robot is there long after it has gone, so
 * these tests pin the rule that how recently we heard from it is what decides.
 */
import { describe, expect, it } from 'vitest';

import { livenessOf, OFFLINE_AFTER_SECONDS, STALE_AFTER_SECONDS } from '../liveness';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const secondsAgo = (s: number) => new Date(NOW - s * 1000).toISOString();

describe('livenessOf', () => {
  it('is online when the robot spoke a moment ago', () => {
    const result = livenessOf({ online: true, last_seen_at: secondsAgo(2) }, NOW);
    expect(result.state).toBe('online');
    expect(result.stale).toBe(false);
  });

  it('goes stale once readings stop arriving, without waiting for a flag to change', () => {
    const result = livenessOf(
      { online: true, last_seen_at: secondsAgo(STALE_AFTER_SECONDS + 1) },
      NOW,
    );
    expect(result.state).toBe('stale');
    expect(result.stale).toBe(true);
  });

  it('treats a long silence as offline even while the robot still claims to be online', () => {
    const result = livenessOf(
      { online: true, last_seen_at: secondsAgo(OFFLINE_AFTER_SECONDS + 1) },
      NOW,
    );
    expect(result.state).toBe('offline');
  });

  it('never reports a robot as live when the last message said otherwise', () => {
    const result = livenessOf({ online: false, last_seen_at: secondsAgo(1) }, NOW);
    expect(result.state).toBe('offline');
    expect(result.stale).toBe(true);
  });

  it('reports the age so the UI can state it rather than imply it', () => {
    const result = livenessOf({ online: true, last_seen_at: secondsAgo(42) }, NOW);
    expect(result.ageSeconds).toBeCloseTo(42, 1);
  });

  it('handles a robot that has never reported', () => {
    const result = livenessOf({ online: false, last_seen_at: null }, NOW);
    expect(result.state).toBe('offline');
    expect(result.ageSeconds).toBeNull();
  });
});
