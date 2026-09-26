/**
 * The interlock chain gates a pesticide valve, so what is tested here is mostly refusal:
 * that an unreported interlock never reads as a pass, that one blocked condition is
 * enough to stop the valve, and that the reason the operator is shown is the robot's own
 * whenever the robot sent one.
 */
import type { SprayerState } from '@agri/contracts';
import { describe, expect, it } from 'vitest';

import missionsJson from '@/lib/fixtures/missions.json';
import {
  armCommand,
  averageLitresPerPlant,
  blockingReason,
  canSpray,
  clampFlow,
  clampNozzleHeight,
  configureCommand,
  coverageRadiusM,
  FLOW_MAX_LPM,
  interlockViews,
  litresFor,
  NOZZLE_MAX_CM,
  NOZZLE_MIN_CM,
  tankView,
} from '@/lib/mission/sprayer';

/** A robot reporting every interlock satisfied. Individual tests break one at a time. */
function reportedState(overrides: Partial<SprayerState> = {}): SprayerState {
  return {
    schema_version: '1.0.0',
    robot_id: 'scout-01',
    ts: 0,
    seq: 1,
    source: 'sim',
    armed: true,
    spraying: false,
    nozzle_height_cm: 45,
    arc_deg: 180,
    flow_lpm: 1.8,
    tank_litres: 12,
    tank_capacity_litres: 20,
    interlocks: {
      armed: true,
      inside_geofence: true,
      speed_ok: true,
      tank_ok: true,
      estop_clear: true,
    },
    ...overrides,
  } as SprayerState;
}

describe('interlockViews', () => {
  it('reports every interlock as unknown when the robot has not spoken', () => {
    const views = interlockViews(null);
    expect(views).toHaveLength(5);
    expect(views.every((view) => view.state === 'unknown')).toBe(true);
  });

  it('never lets an unknown interlock permit a spray', () => {
    // The whole point of the three-state model: nothing checked means nothing passes.
    expect(canSpray(interlockViews(null))).toBe(false);
  });

  it('permits only when the robot has reported all five satisfied', () => {
    expect(canSpray(interlockViews(reportedState()))).toBe(true);
  });

  it.each([
    ['estop_clear', 'engaged'],
    ['armed', 'not armed'],
    ['inside_geofence', 'outside the field'],
    ['speed_ok', 'too fast'],
    ['tank_ok', 'tank empty'],
  ] as const)('refuses when %s is blocked (%s)', (key, _reason) => {
    const state = reportedState();
    const views = interlockViews(
      reportedState({ interlocks: { ...state.interlocks, [key]: false } }),
    );
    expect(canSpray(views)).toBe(false);
    expect(views.find((view) => view.key === key)?.state).toBe('blocked');
  });
});

describe('blockingReason', () => {
  it('is null when the valve may open', () => {
    expect(blockingReason(interlockViews(reportedState()), reportedState())).toBeNull();
  });

  it('prefers the robot’s own blocked_reason over the UI’s precedence order', () => {
    const state = reportedState({
      interlocks: {
        armed: false,
        inside_geofence: false,
        speed_ok: true,
        tank_ok: true,
        estop_clear: true,
      },
      blocked_reason: 'outside_geofence',
    });
    // Arming comes first in the UI's order, but the robot says the geofence is the
    // blocker — and the robot is the one attached to the valve.
    expect(blockingReason(interlockViews(state), state)).toMatch(/outside the field boundary/i);
  });

  it('puts the emergency stop ahead of everything else it could say', () => {
    const state = reportedState({
      interlocks: {
        armed: false,
        inside_geofence: false,
        speed_ok: false,
        tank_ok: false,
        estop_clear: false,
      },
    });
    expect(blockingReason(interlockViews(state), state)).toMatch(/emergency stop/i);
  });

  it('says what has not been reported, rather than implying a refusal', () => {
    expect(blockingReason(interlockViews(null), null)).toMatch(/has not reported/i);
  });

  it('explains a hardware fault the interlocks alone would not show', () => {
    const state = reportedState({
      blocked_reason: 'hardware_fault',
      interlocks: { ...reportedState().interlocks, tank_ok: false },
    });
    expect(blockingReason(interlockViews(state), state)).toMatch(/sprayer fault/i);
  });
});

describe('tankView', () => {
  it('is unknown, not empty, when the robot has not reported a level', () => {
    const view = tankView(null);
    expect(view.status).toBe('unknown');
    expect(view.litres).toBeNull();
    expect(view.message).toMatch(/has not reported/i);
  });

  it('warns before the tank runs out, not after', () => {
    expect(tankView(reportedState({ tank_litres: 2, tank_capacity_litres: 20 })).status).toBe(
      'low',
    );
    expect(tankView(reportedState({ tank_litres: 12, tank_capacity_litres: 20 })).status).toBe(
      'ok',
    );
  });

  it('calls an empty tank empty', () => {
    const view = tankView(reportedState({ tank_litres: 0, tank_capacity_litres: 20 }));
    expect(view.status).toBe('empty');
    expect(view.fraction).toBe(0);
  });
});

describe('dose arithmetic', () => {
  it('converts a burst to litres at the flow rate', () => {
    expect(litresFor(60_000, 1.8)).toBeCloseTo(1.8, 6);
    expect(litresFor(1_000, 1.8)).toBeCloseTo(0.03, 6);
  });

  it('cannot deliver a negative dose', () => {
    expect(litresFor(-500, 1.8)).toBe(0);
  });

  it('widens the band as the nozzle rises, which is the reason the slider exists', () => {
    expect(coverageRadiusM(20)).toBeCloseTo(0.1155, 3);
    expect(coverageRadiusM(90)).toBeCloseTo(0.5196, 3);
    expect(coverageRadiusM(90)).toBeGreaterThan(coverageRadiusM(45));
  });

  it('averages the doses the robot actually recorded', () => {
    const events = (
      missionsJson as { missions: { spray_events?: { litres: number }[] }[] }
    ).missions.flatMap((mission) => mission.spray_events ?? []);
    const average = averageLitresPerPlant(events);
    expect(average).not.toBeNull();
    // The seeded run treated 11 plants with doses in the tens of millilitres.
    expect(average!).toBeGreaterThan(0.01);
    expect(average!).toBeLessThan(0.2);
  });

  it('returns null rather than a made-up dose when nothing has been sprayed', () => {
    expect(averageLitresPerPlant([])).toBeNull();
  });
});

describe('command bodies', () => {
  it('clamps settings to the range the contract allows', () => {
    expect(clampNozzleHeight(5)).toBe(NOZZLE_MIN_CM);
    expect(clampNozzleHeight(200)).toBe(NOZZLE_MAX_CM);
    expect(clampFlow(-1)).toBe(0);
    expect(clampFlow(99)).toBe(FLOW_MAX_LPM);
  });

  it('builds a configure command inside the contract’s limits', () => {
    const command = configureCommand({ nozzleHeightCm: 500, arcDeg: 360, flowLpm: 500 });
    expect(command).toEqual({
      action: 'configure',
      nozzle_height_cm: NOZZLE_MAX_CM,
      arc_deg: 360,
      flow_lpm: FLOW_MAX_LPM,
    });
  });

  it('always carries the confirmation flag when arming', () => {
    // The contract requires it: it is the record that a human passed the confirm step.
    expect(armCommand()).toEqual({ action: 'arm', confirmed: true });
  });
});
