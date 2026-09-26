/**
 * These are safety tests, not unit tests for their own sake. Each one holds a line the
 * teleop contract draws: opposing keys stop, speed mode never exceeds the robot's
 * configured maximum, and the send rate stays comfortably inside the deadman window.
 */
import { describe, expect, it } from 'vitest';

import {
  DEADMAN_MS,
  directionForKey,
  isStopKey,
  isStopped,
  shouldHandleKey,
  SPEED_MODES,
  TELEOP_INTERVAL_MS,
  velocityFor,
} from '@/lib/control/teleop';

const MAX = 0.8;

describe('velocityFor', () => {
  it('is stopped when nothing is held', () => {
    expect(isStopped(velocityFor([], 'normal', MAX))).toBe(true);
  });

  it('never exceeds the robot’s configured maximum, even at full speed mode', () => {
    const v = velocityFor(['forward'], 'fast', MAX);
    expect(v.linear_mps).toBeLessThanOrEqual(MAX);
    expect(SPEED_MODES.fast.fraction).toBe(1);
  });

  it('scales the maximum by the speed mode rather than replacing it', () => {
    expect(velocityFor(['forward'], 'slow', MAX).linear_mps).toBeCloseTo(0.28, 5);
    expect(velocityFor(['forward'], 'normal', MAX).linear_mps).toBeCloseTo(0.56, 5);
  });

  it('reverses on back', () => {
    expect(velocityFor(['back'], 'normal', MAX).linear_mps).toBeLessThan(0);
  });

  it('turns counter-clockwise positive, as the contract specifies', () => {
    expect(velocityFor(['left'], 'normal', MAX).angular_dps).toBeGreaterThan(0);
    expect(velocityFor(['right'], 'normal', MAX).angular_dps).toBeLessThan(0);
  });

  it('stops when opposing directions are held, rather than picking one', () => {
    // A stuck key or a thumb rolling between buttons. Stopping is the safe reading.
    expect(isStopped(velocityFor(['forward', 'back'], 'fast', MAX))).toBe(true);
    expect(isStopped(velocityFor(['left', 'right'], 'fast', MAX))).toBe(true);
  });

  it('drives and turns at once', () => {
    const v = velocityFor(['forward', 'left'], 'normal', MAX);
    expect(v.linear_mps).toBeGreaterThan(0);
    expect(v.angular_dps).toBeGreaterThan(0);
  });

  it('cannot be talked into moving by a negative maximum', () => {
    expect(velocityFor(['forward'], 'fast', -2).linear_mps).toBe(0);
  });
});

describe('send rate', () => {
  it('fits at least three commands inside the robot’s deadman window', () => {
    // One lost packet must not be enough to trip the timeout mid-drive.
    expect(TELEOP_INTERVAL_MS * 3).toBeLessThanOrEqual(DEADMAN_MS);
  });
});

describe('key mapping', () => {
  it('accepts WASD and the arrows for the same directions', () => {
    expect(directionForKey('w')).toBe('forward');
    expect(directionForKey('ArrowUp')).toBe('forward');
    expect(directionForKey('S')).toBe('back');
    expect(directionForKey('ArrowLeft')).toBe('left');
    expect(directionForKey('d')).toBe('right');
    expect(directionForKey('q')).toBeNull();
  });

  it('treats space as stop', () => {
    expect(isStopKey(' ')).toBe(true);
    expect(isStopKey('w')).toBe(false);
  });
});

describe('shouldHandleKey', () => {
  const plain = { target: null, ctrlKey: false, metaKey: false, altKey: false };

  it('drives on a plain key press', () => {
    expect(shouldHandleKey(plain)).toBe(true);
  });

  it('does not drive the robot while someone is typing', () => {
    // Searching for "was" must not send the machine forward twice and left once.
    expect(shouldHandleKey({ ...plain, target: { tagName: 'INPUT' } as never })).toBe(false);
    expect(shouldHandleKey({ ...plain, target: { tagName: 'TEXTAREA' } as never })).toBe(false);
    expect(
      shouldHandleKey({ ...plain, target: { tagName: 'DIV', isContentEditable: true } as never }),
    ).toBe(false);
  });

  it('leaves modifier combinations to the browser', () => {
    expect(shouldHandleKey({ ...plain, metaKey: true })).toBe(false);
    expect(shouldHandleKey({ ...plain, ctrlKey: true })).toBe(false);
  });
});

/**
 * The slider exception.
 *
 * Replacing the three speed buttons with range inputs quietly broke driving: the slider
 * keeps focus after a drag, and the "don't drive while someone is typing" guard treats
 * every input the same. These pin the narrower rule that replaced it.
 */
describe('shouldHandleKey, around the limit sliders', () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false };
  const range = { tagName: 'INPUT', type: 'range' } as unknown as EventTarget;
  const text = { tagName: 'INPUT', type: 'search' } as unknown as EventTarget;

  it('still drives when the speed slider holds focus', () => {
    expect(shouldHandleKey({ ...base, target: range, key: 'w' })).toBe(true);
  });

  it('leaves the arrow keys to the slider, which is how it is nudged', () => {
    expect(shouldHandleKey({ ...base, target: range, key: 'ArrowUp' })).toBe(false);
    expect(shouldHandleKey({ ...base, target: range, key: 'ArrowRight' })).toBe(false);
  });

  it('still refuses to drive from a text field', () => {
    expect(shouldHandleKey({ ...base, target: text, key: 'w' })).toBe(false);
  });
});
