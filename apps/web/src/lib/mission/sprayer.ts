/**
 * The sprayer: settings, interlocks and dose arithmetic.
 *
 * This panel opens a pesticide valve, so the whole model is built around one rule from
 * the safety requirements: **the valve opens only when every interlock is satisfied**, and
 * the robot's own copy of those interlocks is the authoritative one — it is the copy
 * attached to the valve.
 *
 * Which forces a three-state interlock, not a boolean. An interlock the robot has not
 * reported is `unknown`, and unknown is not a pass. Rendering an unreported interlock as
 * a green tick is how someone ends up holding a spray button believing the geofence was
 * checked. Only `ok` permits, and `ok` requires the robot to have said so.
 */

import type { SprayArc, SprayerInterlocks, SprayerState } from '@agri/contracts';

/** Limits from cmd/sprayer.json. The robot enforces its own; these stop the UI from
 *  composing a command the contract would reject. */
export const NOZZLE_MIN_CM = 20;
export const NOZZLE_MAX_CM = 90;
export const FLOW_MIN_LPM = 0;
export const FLOW_MAX_LPM = 10;

export const ARC_OPTIONS: readonly SprayArc[] = [180, 360] as const;

export const ARC_LABEL: Record<SprayArc, { label: string; hint: string }> = {
  180: {
    label: 'Front only',
    hint: 'Sprays the half circle ahead of the rig. Less drift onto the row behind.',
  },
  360: {
    label: 'All round',
    hint: 'Sprays the full circle. Covers both sides of the rig in one pass.',
  },
};

/** A bounded burst. The contract caps duration_ms at 30 s; the robot applies its own
 *  maximum as well, so a lost 'spray_stop' cannot empty the tank. */
export const MAX_BURST_MS = 30_000;

/** Below this share of capacity the tank is called low: about one more pass. */
export const TANK_LOW_FRACTION = 0.15;

/**
 * Half-angle of the nozzle cone, degrees.
 *
 * A rig property, not a preference — it is why raising the nozzle widens the band and
 * thins the dose. 30° gives a band roughly equal to the nozzle height, which matches the
 * 45 cm height and the coverage recorded in the seeded spray events.
 */
export const NOZZLE_CONE_HALF_ANGLE_DEG = 30;

export interface SprayerSettings {
  nozzleHeightCm: number;
  arcDeg: SprayArc;
  flowLpm: number;
}

export const DEFAULT_SPRAYER_SETTINGS: SprayerSettings = {
  nozzleHeightCm: 45,
  arcDeg: 180,
  flowLpm: 1.8,
};

/** Radius on the ground covered by the nozzle at a height, in metres. */
export function coverageRadiusM(nozzleHeightCm: number): number {
  const heightM = nozzleHeightCm / 100;
  return heightM * Math.tan((NOZZLE_CONE_HALF_ANGLE_DEG * Math.PI) / 180);
}

/** Litres delivered by a burst. Flow is per minute; bursts are measured in milliseconds. */
export function litresFor(durationMs: number, flowLpm: number): number {
  return (Math.max(durationMs, 0) / 60_000) * Math.max(flowLpm, 0);
}

export type InterlockState = 'ok' | 'blocked' | 'unknown';

export type InterlockKey = keyof SprayerInterlocks;

/**
 * Precedence for the single reason shown to the operator.
 *
 * E-stop first because it overrides everything else that could be wrong, then arming
 * because it is the one the operator can act on immediately, then the conditions that
 * need the machine moved or filled. The robot's own `blocked_reason` wins over this
 * order whenever it sends one — the contract says it exists precisely so the UI does not
 * have to guess.
 */
export const INTERLOCK_ORDER: readonly InterlockKey[] = [
  'estop_clear',
  'armed',
  'inside_geofence',
  'speed_ok',
  'tank_ok',
] as const;

export const INTERLOCK_COPY: Record<
  InterlockKey,
  { label: string; ok: string; blocked: string; unknown: string }
> = {
  estop_clear: {
    label: 'Emergency stop clear',
    ok: 'No stop is engaged.',
    blocked: 'The emergency stop is engaged. Release it on the robot.',
    unknown: 'The robot has not reported whether a stop is engaged.',
  },
  armed: {
    label: 'Sprayer armed',
    ok: 'The robot has confirmed the sprayer is armed.',
    blocked: 'The sprayer is not armed.',
    unknown: 'The robot has not confirmed the sprayer is armed.',
  },
  inside_geofence: {
    label: 'Inside the field',
    ok: 'The robot is inside the field boundary.',
    blocked: 'The robot is outside the field boundary. It will not spray here.',
    unknown: 'The robot has not reported its position, so the boundary cannot be checked.',
  },
  speed_ok: {
    label: 'Slow enough to spray',
    ok: 'Below the spray speed limit.',
    blocked: 'Driving too fast to spray evenly. Slow down.',
    unknown: 'The robot has not reported its speed.',
  },
  tank_ok: {
    label: 'Tank has liquid',
    ok: 'Enough in the tank to spray.',
    blocked: 'The tank is empty. Refill before spraying.',
    unknown: 'The robot has not reported its tank level.',
  },
};

/** The robot's `blocked_reason` values, in the words an operator needs. */
export const BLOCKED_REASON_COPY: Record<NonNullable<SprayerState['blocked_reason']>, string> = {
  not_armed: 'The sprayer is not armed.',
  outside_geofence: 'The robot is outside the field boundary.',
  too_fast: 'The robot is driving too fast to spray evenly.',
  tank_empty: 'The tank is empty.',
  estop_engaged: 'The emergency stop is engaged.',
  hardware_fault: 'The robot reports a sprayer fault. It will not spray until that is cleared.',
};

export interface InterlockView {
  key: InterlockKey;
  state: InterlockState;
  label: string;
  detail: string;
}

/**
 * Each interlock as the UI should show it.
 *
 * With no sprayer state every interlock is `unknown`, which is the true answer while the
 * robot connection is not running: nothing has been checked, so nothing passes.
 */
export function interlockViews(reported: SprayerState | null): InterlockView[] {
  return INTERLOCK_ORDER.map((key) => {
    const copy = INTERLOCK_COPY[key];
    if (!reported)
      return { key, state: 'unknown' as const, label: copy.label, detail: copy.unknown };
    const state: InterlockState = reported.interlocks[key] ? 'ok' : 'blocked';
    return { key, state, label: copy.label, detail: state === 'ok' ? copy.ok : copy.blocked };
  });
}

/** True only when the robot has reported every interlock satisfied. */
export function canSpray(views: readonly InterlockView[]): boolean {
  return views.length > 0 && views.every((view) => view.state === 'ok');
}

/**
 * The one sentence saying why the valve will not open, or null when it will.
 *
 * The robot's own `blocked_reason` is preferred whenever it sent one, so the UI and the
 * machine never disagree about which condition is the blocker.
 */
export function blockingReason(
  views: readonly InterlockView[],
  reported: SprayerState | null,
): string | null {
  if (canSpray(views)) return null;
  if (reported?.blocked_reason) return BLOCKED_REASON_COPY[reported.blocked_reason];

  const blocked = views.find((view) => view.state === 'blocked');
  if (blocked) return blocked.detail;

  const unknown = views.find((view) => view.state === 'unknown');
  return unknown ? unknown.detail : null;
}

export type TankStatus = 'ok' | 'low' | 'empty' | 'unknown';

export interface TankView {
  status: TankStatus;
  /** Share of capacity, or null when the robot has not reported a level. */
  fraction: number | null;
  litres: number | null;
  capacityLitres: number | null;
  message: string;
}

export function tankView(reported: SprayerState | null): TankView {
  if (!reported) {
    return {
      status: 'unknown',
      fraction: null,
      litres: null,
      capacityLitres: null,
      message: 'The robot has not reported its tank level.',
    };
  }

  const { tank_litres: litres, tank_capacity_litres: capacity } = reported;
  const fraction = capacity > 0 ? Math.min(Math.max(litres / capacity, 0), 1) : 0;

  if (litres <= 0) {
    return {
      status: 'empty',
      fraction,
      litres,
      capacityLitres: capacity,
      message: 'Tank empty. Refill before spraying.',
    };
  }
  if (fraction <= TANK_LOW_FRACTION) {
    return {
      status: 'low',
      fraction,
      litres,
      capacityLitres: capacity,
      message: 'Tank low. Refill soon.',
    };
  }
  return {
    status: 'ok',
    fraction,
    litres,
    capacityLitres: capacity,
    message: 'Tank has enough to spray.',
  };
}

/** Clamp to the contract's range, so an out-of-range value can never leave the UI. */
export function clampNozzleHeight(cm: number): number {
  return Math.min(Math.max(cm, NOZZLE_MIN_CM), NOZZLE_MAX_CM);
}

export function clampFlow(lpm: number): number {
  return Math.min(Math.max(lpm, FLOW_MIN_LPM), FLOW_MAX_LPM);
}

/**
 * The average dose a plant actually took, from recorded spray events.
 *
 * Used to say how many plants a tank covers. It is measured from what the robot did on a
 * previous run rather than assumed from flow rate, because the burst length is the
 * robot's decision and only its own records know how long it held the valve open. Null
 * when there is nothing recorded to average — in which case the UI says so instead of
 * quoting a number it made up.
 */
export function averageLitresPerPlant(events: readonly { litres: number }[]): number | null {
  const sprayed = events.filter((event) => event.litres > 0);
  if (sprayed.length === 0) return null;
  return sprayed.reduce((sum, event) => sum + event.litres, 0) / sprayed.length;
}

/**
 * The plants a recorded spray already covered.
 *
 * Read from `spray_events`, each of which names the detection it was aimed at, so a plant
 * counts as treated because the robot recorded treating it — not because a run finished
 * or a box was ticked. Both the map (which draws these green) and the mission plan (which
 * must not send the robot to spray them twice) ask this one function.
 */
export function treatedDetectionIds(
  events: readonly { detection_id?: string | null }[],
): Set<string> {
  return new Set(
    events.map((event) => event.detection_id).filter((id): id is string => id != null),
  );
}

/** The fields of a `cmd/sprayer` payload this UI is responsible for. The envelope —
 *  schema_version, robot_id, ts, seq, source — is stamped by the command service. */
export type SprayerCommandBody =
  | { action: 'arm'; confirmed: true }
  | { action: 'disarm' }
  | {
      action: 'configure';
      nozzle_height_cm: number;
      arc_deg: SprayArc;
      flow_lpm: number;
    }
  | { action: 'spray_start'; duration_ms: number | null }
  | { action: 'spray_stop' };

export function configureCommand(settings: SprayerSettings): SprayerCommandBody {
  return {
    action: 'configure',
    nozzle_height_cm: clampNozzleHeight(settings.nozzleHeightCm),
    arc_deg: settings.arcDeg,
    flow_lpm: clampFlow(settings.flowLpm),
  };
}

/** Arming always carries the confirmation flag: the contract requires it, and it is the
 *  record that a human passed the confirm step rather than brushing a toggle. */
export function armCommand(): SprayerCommandBody {
  return { action: 'arm', confirmed: true };
}
