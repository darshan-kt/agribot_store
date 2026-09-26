/**
 * Teleop: turning held keys into a velocity command.
 *
 * Pure functions and constants, deliberately separate from the React that calls them,
 * because this is the part that drives a physical machine and it must be testable
 * without a DOM.
 *
 * Three rules from the safety model are encoded here:
 *
 *  1. **Silence means stop.** The robot latches zero velocity if no `cmd/teleop` arrives
 *     within `DEADMAN_MS`, enforced on the robot rather than in the browser. The browser's
 *     job is only to stop sending the moment a key comes up — a killed tab then stops the
 *     machine on its own, because nothing is left to keep it moving.
 *  2. **Send continuously while held.** A single command on keydown would be cancelled by
 *     the deadman 300 ms later, so the loop repeats at `TELEOP_HZ` for as long as a
 *     direction is held.
 *  3. **Speed mode scales the configured maximum, it does not override it.** The robot
 *     clamps to its own configured `max_speed_mps` regardless; "fast" here means "all of
 *     what this robot is allowed to do", never more.
 */

import type { SpeedMode } from '@agri/contracts';

/** Robot-side deadman window. The browser's send interval must stay well inside it. */
export const DEADMAN_MS = 300;

/** 10 Hz: three commands inside every deadman window, so one lost packet is harmless. */
export const TELEOP_HZ = 10;

export const TELEOP_INTERVAL_MS = 1000 / TELEOP_HZ;

export type Direction = 'forward' | 'back' | 'left' | 'right';

export const SPEED_MODES: Record<SpeedMode, { label: string; fraction: number; hint: string }> = {
  slow: {
    label: 'Slow',
    fraction: 0.35,
    hint: 'For working close to plants or people.',
  },
  normal: {
    label: 'Normal',
    fraction: 0.7,
    hint: 'Scouting pace.',
  },
  fast: {
    label: 'Fast',
    fraction: 1,
    hint: 'Full configured speed. For crossing open ground.',
  },
};

export const SPEED_MODE_ORDER: readonly SpeedMode[] = ['slow', 'normal', 'fast'] as const;

/** Turn rate at full stick, degrees per second. Comfortable for a camera-carrying rig:
 *  faster than this and the video smears past the point of being able to read a leaf. */
const MAX_TURN_DPS = 45;

/**
 * The same ceiling in radians per second, which is the unit the driving controls are
 * calibrated in and the unit ROS speaks.
 *
 * The wire contract stays in degrees — `Velocity.angular_dps` is what `cmd/teleop`
 * carries and it is not being changed — so the conversion lives here, at the boundary,
 * rather than being done by hand at each call site with its own rounding.
 */
export const MAX_TURN_RADS = (MAX_TURN_DPS * Math.PI) / 180;

export function dpsToRads(dps: number): number {
  return (dps * Math.PI) / 180;
}

export function radsToDps(rads: number): number {
  return (rads * 180) / Math.PI;
}

export interface Velocity {
  linear_mps: number;
  angular_dps: number;
}

export const STOPPED: Velocity = { linear_mps: 0, angular_dps: 0 };

/**
 * The velocity for a set of held directions.
 *
 * Opposing keys cancel rather than picking a winner: someone pressing both is either
 * rolling off one of them or has a stuck key, and stopping is the safe reading of both.
 */
export function velocityFor(
  held: Iterable<Direction>,
  mode: SpeedMode,
  maxSpeedMps: number,
): Velocity {
  const keys = new Set(held);
  const forward = Number(keys.has('forward')) - Number(keys.has('back'));
  // Counter-clockwise positive, matching the contract, so 'left' is the positive turn.
  const turn = Number(keys.has('left')) - Number(keys.has('right'));

  const fraction = SPEED_MODES[mode].fraction;
  return {
    linear_mps: forward * fraction * Math.max(maxSpeedMps, 0),
    angular_dps: turn * fraction * MAX_TURN_DPS,
  };
}

/**
 * The limits the operator has dialled in: a top speed and a top turn rate, each set
 * directly rather than picked from three presets.
 *
 * A continuous limit is the honest control for this, because the robot's own configured
 * maximum is a continuous number — "normal" was always just 0.7 of it, and an operator
 * working a narrow bed wants 0.3, not the nearest of three guesses.
 */
export interface TeleopLimits {
  linear_mps: number;
  angular_rads: number;
}

/**
 * The velocity for a set of held directions under explicit limits.
 *
 * Same cancellation rule as `velocityFor`, and the same guarantee about the robot's
 * configured ceiling: the linear limit is clamped to `maxSpeedMps` here as well as on
 * the robot, so a slider that somehow rendered wider than the robot allows still cannot
 * ask for more than it.
 */
export function velocityForLimits(
  held: Iterable<Direction>,
  limits: TeleopLimits,
  maxSpeedMps: number,
): Velocity {
  const keys = new Set(held);
  const forward = Number(keys.has('forward')) - Number(keys.has('back'));
  const turn = Number(keys.has('left')) - Number(keys.has('right'));

  const linear = Math.min(Math.max(limits.linear_mps, 0), Math.max(maxSpeedMps, 0));
  const angular = Math.min(Math.max(limits.angular_rads, 0), MAX_TURN_RADS);

  return {
    linear_mps: forward * linear,
    angular_dps: turn * radsToDps(angular),
  };
}

/**
 * The nearest named speed mode for a linear limit.
 *
 * `cmd/teleop` carries a mode alongside the velocity and that contract is unchanged, so
 * a continuous slider still has to name itself when it publishes. The thresholds are the
 * midpoints between the three preset fractions this replaced.
 */
export function modeForLinear(linearMps: number, maxSpeedMps: number): SpeedMode {
  if (maxSpeedMps <= 0) return 'slow';
  const fraction = linearMps / maxSpeedMps;
  if (fraction < (SPEED_MODES.slow.fraction + SPEED_MODES.normal.fraction) / 2) return 'slow';
  if (fraction < (SPEED_MODES.normal.fraction + SPEED_MODES.fast.fraction) / 2) return 'normal';
  return 'fast';
}

export function isStopped(v: Velocity): boolean {
  return v.linear_mps === 0 && v.angular_dps === 0;
}

/**
 * The direction a key press means, or null if the key is not ours.
 *
 * WASD and the arrows both, because an operator's other hand is on the speed buttons or
 * a tablet, and because arrows are what someone tries first.
 */
export function directionForKey(key: string): Direction | null {
  switch (key) {
    case 'w':
    case 'W':
    case 'ArrowUp':
      return 'forward';
    case 's':
    case 'S':
    case 'ArrowDown':
      return 'back';
    case 'a':
    case 'A':
    case 'ArrowLeft':
      return 'left';
    case 'd':
    case 'D':
    case 'ArrowRight':
      return 'right';
    default:
      return null;
  }
}

/** Space is stop. It is the only key that acts on press rather than on hold. */
export function isStopKey(key: string): boolean {
  return key === ' ' || key === 'Spacebar';
}

/**
 * Whether a key event should drive the robot at all.
 *
 * Typing "was" in the search box must not move a machine, so anything originating in a
 * text field or a contenteditable is ignored. Modifier combinations are left to the
 * browser: ctrl+S is a save, not a reverse.
 */
export function shouldHandleKey(event: {
  target: EventTarget | null;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  key?: string;
}): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (target && typeof target === 'object' && 'tagName' in target) {
    const element = target as { tagName?: string; type?: string; isContentEditable?: boolean };
    const tag = element.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      // The speed and rotation sliders are the one exception, and they have to be.
      // A range input cannot receive text, so the rule this guard exists for — typing
      // "was" into a search box must not move a machine — does not apply to it. Without
      // the exception, setting a speed leaves the slider focused and the next W does
      // nothing, which is a driving control that silently stops working after you use
      // the control next to it.
      const isRange = tag === 'input' && element.type === 'range';
      if (!isRange) return false;
      // Arrows still belong to the slider: they are how it is nudged a step at a time.
      if (event.key?.startsWith('Arrow')) return false;
      return true;
    }
    if (element.isContentEditable) return false;
  }
  return true;
}
