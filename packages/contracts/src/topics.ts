/**
 * MQTT topic construction and the WebSocket channel map.
 *
 * Topics are built here and nowhere else, so a robot id can never be interpolated
 * into a topic string by hand at a call site.
 */

import type {
  ConfigAck,
  ConfigSet,
  DetectionBatch,
  EstopCommand,
  MissionCommand,
  MissionProgress,
  Pose,
  RobotEvent,
  RobotState,
  Sensors,
  SprayerCommand,
  SprayerState,
  TeleopCommand,
  Telemetry,
} from './generated/contracts';

/** Root of every topic: agri/v1/{robot_id}/... */
export const MQTT_NAMESPACE = 'agri/v1' as const;

/** Frozen at the end of Phase 1. A breaking change needs a new major and a new namespace. */
export const SCHEMA_VERSION = '1.0.0' as const;

/** Robot → cloud. */
export const UP_TOPICS = {
  state: 'state',
  telemetry: 'telemetry',
  sensors: 'sensors',
  pose: 'pose',
  detections: 'detections',
  sprayerState: 'sprayer/state',
  missionProgress: 'mission/progress',
  configAck: 'config/ack',
  events: 'events',
} as const;

/** Cloud → robot. */
export const DOWN_TOPICS = {
  teleop: 'cmd/teleop',
  estop: 'cmd/estop',
  mission: 'cmd/mission',
  sprayer: 'cmd/sprayer',
  configSet: 'config/set',
} as const;

export type UpTopic = (typeof UP_TOPICS)[keyof typeof UP_TOPICS];
export type DownTopic = (typeof DOWN_TOPICS)[keyof typeof DOWN_TOPICS];

/** Payload type for each uplink topic. */
export interface UpPayloads {
  state: RobotState;
  telemetry: Telemetry;
  sensors: Sensors;
  pose: Pose;
  detections: DetectionBatch;
  sprayerState: SprayerState;
  missionProgress: MissionProgress;
  configAck: ConfigAck;
  events: RobotEvent;
}

/** Payload type for each downlink topic. */
export interface DownPayloads {
  teleop: TeleopCommand;
  estop: EstopCommand;
  mission: MissionCommand;
  sprayer: SprayerCommand;
  configSet: ConfigSet;
}

/** Build a topic for one robot, e.g. topicFor('scout-01', 'pose') → 'agri/v1/scout-01/pose'. */
export function topicFor(robotId: string, topic: UpTopic | DownTopic): string {
  return `${MQTT_NAMESPACE}/${robotId}/${topic}`;
}

/** Wildcard subscription covering every topic of one robot. */
export function robotWildcard(robotId: string): string {
  return `${MQTT_NAMESPACE}/${robotId}/#`;
}

/**
 * WebSocket channels on /ws/robots/{id}.
 *
 * `lossy` marks the channels the gateway may drop under backpressure, keeping only
 * the newest value. Detections, acks and alerts are never dropped: losing one means
 * losing a plant nobody inspects or a command nobody confirmed.
 */
export const WS_CHANNELS = {
  telemetry: { lossy: true },
  pose: { lossy: true },
  camera: { lossy: true },
  detections: { lossy: false },
  sprayer: { lossy: false },
  mission: { lossy: false },
  alerts: { lossy: false },
  control: { lossy: false },
} as const;

export type WsChannel = keyof typeof WS_CHANNELS;

/** True if the gateway is allowed to discard a stale frame on this channel. */
export function isLossyChannel(channel: WsChannel): boolean {
  return WS_CHANNELS[channel].lossy;
}
