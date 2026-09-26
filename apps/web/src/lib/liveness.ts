import type { ApiRobot } from '@agri/contracts';

/**
 * Whether a robot is actually live, as opposed to having claimed so at some point.
 *
 * `online` alone is not enough. It is a cached flag written when the robot last said
 * something, so a stale snapshot would keep asserting "online" indefinitely. Liveness is
 * therefore derived from how long ago we last heard from it, measured against the
 * viewer's clock — which also means a fixture exported this morning degrades honestly
 * into "last seen 4 h ago" instead of pretending to be live forever.
 */

/** Past this, values are dimmed and their age is shown. Two missed 10 Hz pose ticks. */
export const STALE_AFTER_SECONDS = 8;

/** Past this, the robot is treated as gone rather than merely quiet. */
export const OFFLINE_AFTER_SECONDS = 60;

export interface Liveness {
  state: 'online' | 'stale' | 'offline';
  ageSeconds: number | null;
  /** True when displayed values should be dimmed. */
  stale: boolean;
}

export function livenessOf(
  robot: Pick<ApiRobot, 'online' | 'last_seen_at'>,
  now = Date.now(),
): Liveness {
  if (!robot.last_seen_at) {
    return { state: robot.online ? 'online' : 'offline', ageSeconds: null, stale: !robot.online };
  }

  const ageSeconds = Math.max(0, (now - new Date(robot.last_seen_at).getTime()) / 1000);

  if (!robot.online || ageSeconds >= OFFLINE_AFTER_SECONDS) {
    return { state: 'offline', ageSeconds, stale: true };
  }
  if (ageSeconds >= STALE_AFTER_SECONDS) {
    return { state: 'stale', ageSeconds, stale: true };
  }
  return { state: 'online', ageSeconds, stale: false };
}
