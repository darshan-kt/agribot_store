/**
 * DO NOT EDIT. Generated from packages/contracts/schemas by `pnpm gen`.
 *
 * One exported type per MQTT topic payload, plus the shared definitions they
 * reference. The AgriContracts interface itself is a compilation artefact.
 */

/**
 * QoS 1 on agri/v1/{robot_id}/config/ack. Configuration is shown as 'pending' in the UI until an ack with the matching version arrives. A setting the robot never confirmed is never displayed as applied.
 */
export type ConfigAck = Envelope & {
  config_version: number;
  accepted: boolean;
  rejected_reason?: string | null;
  effective?: EffectiveConfig;
};
/**
 * Semantic version of the payload schema. Frozen at 1.0.0 from the end of Phase 1; a breaking change requires a new major and a new topic namespace.
 */
export type SchemaVersion = string;
/**
 * Stable robot identifier. Also the MQTT username, client id and topic segment, so a robot cannot speak for another.
 */
export type RobotId = string;
/**
 * UTC nanoseconds since the Unix epoch, taken from the publisher's clock. The server records its own receive time separately; data age shown to an operator is always computed from the server clock, never this one.
 */
export type TimestampNs = number;
/**
 * Monotonic counter per (robot, topic). Used to drop out-of-order messages, deduplicate redelivered QoS 1 messages, and resume a WebSocket from the last frame the client saw.
 */
export type Seq = number;
/**
 * Where the value came from. Set by the publisher and passed through the backend untouched. The 'Simulated' badge in the UI is driven by this field and nothing else: there is no frontend flag that can suppress it. Uplink messages are only ever 'sim' or 'robot'; 'cloud' appears only on downlink commands, whose origin is the operator, not a sensor.
 */
export type Source = 'sim' | 'robot' | 'cloud';
/**
 * QoS 1 on agri/v1/{robot_id}/detections, one message per analysed frame. Never dropped under backpressure and deduplicated on (robot_id, seq), because a lost detection is a plant nobody inspects. Boxes are normalised to the frame so they land correctly on either video path.
 */
export type DetectionBatch = Envelope & {
  camera: CameraSide;
  frame_ts: TimestampNs;
  /**
   * Ties this batch to a video frame so the UI can align boxes, or dim them when no matching frame arrived.
   */
  frame_id?: string;
  /**
   * Scouting run this frame belongs to; null when driving manually outside a run.
   */
  run_id?: string | null;
  /**
   * Object-store key of the full annotated frame. Null until the upload completes; the detection row is written either way.
   */
  image_key?: string | null;
  /**
   * Plants seen in this frame, flagged or not. Summed to give the infection rate.
   */
  plants_scanned: number;
  detections: Detection[];
};
export type CameraSide = 'left' | 'right';
/**
 * Crop issue severity. Always paired with its text label in the UI; the three colours differ in lightness as well as hue so they survive greyscale and colour-vision deficiency.
 */
export type Severity = 'low' | 'moderate' | 'critical';
/**
 * QoS 1 on agri/v1/{robot_id}/events. Discrete things that happened, as opposed to sampled values. Safety-relevant kinds are written to audit_log and raised as operator alerts.
 */
export type RobotEvent = Envelope & {
  kind:
    | 'heartbeat'
    | 'estop_engaged'
    | 'estop_cleared'
    | 'deadman_timeout'
    | 'obstacle_stop'
    | 'geofence_violation'
    | 'spray_blocked'
    | 'tank_empty'
    | 'tank_low'
    | 'low_battery'
    | 'returning_to_base'
    | 'mission_started'
    | 'mission_completed'
    | 'mission_failed'
    | 'sensor_fault'
    | 'broker_reconnected';
  severity: 'info' | 'warning' | 'critical';
  /**
   * Operator-readable summary. Plain language, sentence case, no jargon.
   */
  message?: string;
  /**
   * Free-form context for the log. Never rendered to a farmer.
   */
  detail?: {
    [k: string]: unknown;
  };
};
/**
 * QoS 1 on agri/v1/{robot_id}/mission/progress, published on every state change rather than on a timer.
 */
export type MissionProgress = Envelope & {
  mission_id: string;
  status: MissionStatus;
  pattern?: MissionPattern;
  current_waypoint_index?: number | null;
  total_waypoints: number;
  distance_travelled_m?: number;
  eta_s?: number | null;
  plants_scanned?: number;
  plants_flagged?: number;
  plants_sprayed?: number;
  /**
   * Present only when status is 'failed'. Surfaced verbatim next to a retry action, because a mission that stopped without a reason is worse than one that failed loudly.
   */
  failure_reason?: string | null;
};
export type MissionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type MissionPattern = 'snake' | 'perimeter' | 'custom';
/**
 * 10 Hz on agri/v1/{robot_id}/pose at QoS 0. The browser interpolates between ticks so the robot glides rather than teleporting, and shows the true telemetry age numerically so interpolation never hides a stall.
 */
export type Pose = Envelope & {
  position: LatLon;
  altitude_m?: number;
  map_position?: MapPosition;
  /**
   * Compass heading, 0 = north, clockwise.
   */
  heading_deg: number;
  speed_mps?: number;
  yaw_rate_dps?: number;
  fix_type: 'none' | '2d' | '3d' | 'dgps' | 'rtk_float' | 'rtk_fixed';
  accuracy_m?: number;
};
/**
 * 1 Hz on agri/v1/{robot_id}/sensors. Backs the Dashboard sensor list. Each sensor carries its own ok/check/fault status decided on the robot, which knows its own tolerances; the backend does not re-derive health from raw values. Warnings are machine codes, not sentences, so farmer-facing copy lives in the frontend and stays translatable.
 */
export type Sensors = Envelope & {
  cameras: CameraSensors;
  gps: GpsSensor;
  imu: ImuSensor;
  lidar: LidarSensor;
  weather: WeatherSensor;
  encoders: EncoderSensor;
};
/**
 * Plain two-state health for a farmer-facing list, plus 'fault' for a sensor that is not reporting at all.
 */
export type SensorStatus = 'ok' | 'check' | 'fault';
/**
 * 2 Hz and on every change, on agri/v1/{robot_id}/sprayer/state. `interlocks` is the robot's own view of each precondition. The backend re-checks the same conditions before publishing a spray command, but the robot's copy is authoritative: it is the one attached to the valve.
 */
export type SprayerState = Envelope & {
  /**
   * Arming requires an explicit operator confirm and auto-clears on disconnect or lease expiry.
   */
  armed: boolean;
  spraying: boolean;
  nozzle_height_cm: number;
  arc_deg: SprayArc;
  flow_lpm: number;
  tank_litres: number;
  tank_capacity_litres: number;
  litres_sprayed_total?: number;
  interlocks: SprayerInterlocks;
  /**
   * The single interlock the robot reports as the current blocker, so the UI does not have to guess a precedence order.
   */
  blocked_reason?:
    | 'not_armed'
    | 'outside_geofence'
    | 'too_fast'
    | 'tank_empty'
    | 'estop_engaged'
    | 'hardware_fault'
    | null;
};
/**
 * Spray rotation: 180 degrees covers the front only, 360 covers the full circle.
 */
export type SprayArc = 180 | 360;
/**
 * Retained on agri/v1/{robot_id}/state. The broker republishes it to every new subscriber, so a browser opening the store sees the robot's liveness immediately. The Last Will and Testament is a copy of this payload with online=false and reason='lwt', which the broker publishes if the robot's connection drops without a clean disconnect.
 */
export type RobotState = Envelope & {
  /**
   * False in the LWT and in a clean shutdown notice.
   */
  online: boolean;
  reason?: 'connected' | 'shutdown' | 'lwt' | 'reconnected';
  mode: RobotMode;
  /**
   * Latched on the robot. Clears only on an explicit operator reset.
   */
  estop_engaged: boolean;
  name?: string;
  model?: string;
  firmware?: string;
  boot_ts?: TimestampNs;
  /**
   * Version of the configuration the robot is currently running.
   */
  config_version?: number;
};
export type RobotMode = 'idle' | 'teleop' | 'mission' | 'estop' | 'charging' | 'fault';
/**
 * 1-10 Hz on agri/v1/{robot_id}/telemetry at QoS 0. Drives the Dashboard status cards and onboard-computer bars. Lossy by design: a dropped telemetry frame is replaced by the next one, so it is the first thing shed under backpressure.
 */
export type Telemetry = Envelope & {
  battery: BatteryTelemetry;
  /**
   * Negative; closer to zero is stronger.
   */
  signal_dbm?: number;
  uptime_s: number;
  speed_mps?: number;
  distance_travelled_m?: number;
  /**
   * Field the robot believes it is in, or null when outside every known field.
   */
  field_id?: string | null;
  row?: number | null;
  compute: ComputeTelemetry;
};
/**
 * QoS 1 on agri/v1/{robot_id}/cmd/estop, its own topic so it can never queue behind telemetry.
 *
 * SAFETY: idempotent — engaging an already-engaged e-stop is a no-op, so the UI may retry freely. It bypasses the control-lease check and the rate limiter: any authenticated operator with a control-capable role may stop a robot, including one they do not hold the lease on. Releasing is NOT the inverse of engaging: `engage: false` is an explicit reset that a human must choose, and the robot will not resume motion on its own afterwards.
 */
export type EstopCommand = Envelope & {
  /**
   * True engages and latches. False is an operator reset, allowed only once the cause is cleared.
   */
  engage: boolean;
  reason?: string;
  /**
   * User id of the operator. Written to audit_log with the command; every command is attributable to a person.
   */
  issued_by: string;
  /**
   * Control lease held by that operator. The backend rejects a command whose lease has expired or is held by someone else.
   */
  lease_id?: string | null;
};
/**
 * QoS 1 on agri/v1/{robot_id}/cmd/mission. The bridge maps 'start' onto a Nav2 NavigateThroughPoses goal.
 */
export type MissionCommand = Envelope & {
  action: 'start' | 'pause' | 'resume' | 'cancel';
  mission_id: string;
  pattern?: MissionPattern;
  /**
   * Ordered. Required for 'start', ignored otherwise. Snake and perimeter patterns are expanded to explicit waypoints by the backend, so the robot receives one uniform representation.
   *
   * @maxItems 2000
   */
  waypoints?: Waypoint[];
  speed_mps?: number;
  /**
   * Spray flagged plants during the run. Has no effect unless the sprayer is separately armed: this flag cannot arm it.
   */
  auto_spray?: boolean;
  /**
   * User id of the operator. Written to audit_log with the command; every command is attributable to a person.
   */
  issued_by: string;
  /**
   * Control lease held by that operator. The backend rejects a command whose lease has expired or is held by someone else.
   */
  lease_id?: string | null;
};
/**
 * QoS 1 on agri/v1/{robot_id}/cmd/sprayer.
 *
 * SAFETY: this opens a pesticide valve. The backend refuses to publish 'spray_start' unless the robot is armed, inside the field geofence, under the speed limit, has tank remaining and has no e-stop engaged; the robot then checks the identical set again before actuating. 'arm' requires an explicit operator confirmation in the UI and auto-reverses on disconnect or lease expiry.
 */
export type SprayerCommand = Envelope & {
  action: 'arm' | 'disarm' | 'spray_start' | 'spray_stop' | 'configure';
  /**
   * Must be true for 'arm'. Records that a human passed the confirmation step rather than mis-tapping a toggle.
   */
  confirmed?: boolean;
  nozzle_height_cm?: number;
  arc_deg?: SprayArc;
  flow_lpm?: number;
  /**
   * Bounded burst for hold-to-spray. Null means spray until 'spray_stop'; the robot still applies its own maximum so a lost stop message cannot empty the tank.
   */
  duration_ms?: number | null;
  /**
   * User id of the operator. Written to audit_log with the command; every command is attributable to a person.
   */
  issued_by: string;
  /**
   * Control lease held by that operator. The backend rejects a command whose lease has expired or is held by someone else.
   */
  lease_id?: string | null;
};
/**
 * QoS 0 on agri/v1/{robot_id}/cmd/teleop, published continuously while a key or D-pad button is held.
 *
 * SAFETY: this topic is the deadman. The robot latches zero velocity if no valid teleop message arrives within 300 ms, and that timeout is enforced on the robot, not in the browser. A frozen tab, a dropped network or a killed process therefore all stop the machine. QoS 0 is deliberate: a redelivered stale velocity is more dangerous than a dropped one, because the next message is 40-100 ms away anyway.
 */
export type TeleopCommand = Envelope & {
  /**
   * Forward positive. Clamped on the robot to the configured max speed.
   */
  linear_mps: number;
  /**
   * Counter-clockwise positive.
   */
  angular_dps: number;
  speed_mode: SpeedMode;
  /**
   * User id of the operator. Written to audit_log with the command; every command is attributable to a person.
   */
  issued_by: string;
  /**
   * Control lease held by that operator. The backend rejects a command whose lease has expired or is held by someone else.
   */
  lease_id?: string | null;
};
export type SpeedMode = 'slow' | 'normal' | 'fast';
/**
 * QoS 1 on agri/v1/{robot_id}/config/set. Versioned: the robot echoes the version back on config/ack, and the UI shows the change as pending until it does. Versions are assigned by the backend and stored in robot_config_versions, so the full history of who changed what is recoverable.
 */
export type ConfigSet = Envelope & {
  config_version: number;
  max_speed_mps?: number;
  /**
   * Higher flags more plants and produces more false positives. The UI states that in plain language rather than showing a bare number.
   */
  detection_sensitivity?: number;
  return_to_base_battery_percent?: number;
  camera_fps?: number;
  obstacle_stop_enabled?: boolean;
  /**
   * User id of the operator. Written to audit_log with the command; every command is attributable to a person.
   */
  issued_by: string;
  /**
   * Control lease held by that operator. The backend rejects a command whose lease has expired or is held by someone else.
   */
  lease_id?: string | null;
};

/**
 * Internal wrapper used only to compile every topic payload into one module. Not a wire format — nothing ever sends an AgriContracts object.
 */
export interface AgriContracts {
  up_config_ack: ConfigAck;
  up_detections: DetectionBatch;
  up_events: RobotEvent;
  up_mission_progress: MissionProgress;
  up_pose: Pose;
  up_sensors: Sensors;
  up_sprayer_state: SprayerState;
  up_state: RobotState;
  up_telemetry: Telemetry;
  down_cmd_estop: EstopCommand;
  down_cmd_mission: MissionCommand;
  down_cmd_sprayer: SprayerCommand;
  down_cmd_teleop: TeleopCommand;
  down_config_set: ConfigSet;
}
/**
 * Fields carried by every message on every topic, in both directions.
 */
export interface Envelope {
  schema_version: SchemaVersion;
  robot_id: RobotId;
  ts: TimestampNs;
  seq: Seq;
  source: Source;
}
/**
 * What the robot is actually running now, echoed back rather than assumed from the request.
 */
export interface EffectiveConfig {
  max_speed_mps: number;
  detection_sensitivity: number;
  return_to_base_battery_percent: number;
  camera_fps: number;
  obstacle_stop_enabled: boolean;
}
export interface Detection {
  /**
   * Generated on the robot so a redelivered QoS 1 message cannot create a duplicate row.
   */
  detection_id: string;
  /**
   * Key into issue_catalog, which holds the plain-language name, the type, what it is and what to do.
   */
  issue_code: string;
  severity: Severity;
  confidence: number;
  bbox: BoundingBox;
  position?: LatLon;
  row?: number | null;
  /**
   * Distance along the row from the field edge. This is how a farmer actually walks to the plant.
   */
  metres_from_edge?: number | null;
  /**
   * Object-store key of the cropped sample image shown in the Analytics hotspot detail.
   */
  crop_key?: string | null;
}
/**
 * Normalised to the frame: 0,0 is top-left, 1,1 is bottom-right. Resolution-independent, so a box drawn on a 320x240 fallback frame lands in the same place on a 1920x1080 WebRTC frame.
 */
export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface LatLon {
  lat: number;
  lon: number;
}
/**
 * Metres in the field's local map frame, produced by navsat_transform. Cheaper than lat/lon for drawing and immune to projection drift near the field.
 */
export interface MapPosition {
  x: number;
  y: number;
}
export interface CameraSensors {
  left: CameraSensor;
  right: CameraSensor;
}
/**
 * Left camera.
 */
export interface CameraSensor {
  status: SensorStatus;
  width: number;
  height: number;
  fps: number;
  dropped_frames?: number;
}
/**
 * RTK GPS receiver.
 */
export interface GpsSensor {
  status: SensorStatus;
  fix_type: 'none' | '2d' | '3d' | 'dgps' | 'rtk_float' | 'rtk_fixed';
  accuracy_m: number;
  satellites: number;
  position?: LatLon;
}
/**
 * Inertial measurement unit.
 */
export interface ImuSensor {
  status: SensorStatus;
  roll_deg: number;
  pitch_deg: number;
  yaw_deg: number;
  accel_mps2?: Vector3;
  gyro_dps?: Vector3;
}
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}
/**
 * Forward-facing obstacle lidar. Feeds the obstacle-stop interlock.
 */
export interface LidarSensor {
  status: SensorStatus;
  /**
   * Null when nothing is within range.
   */
  nearest_obstacle_m: number | null;
  bearing_deg?: number | null;
  range_max_m?: number;
}
/**
 * On-board temperature and humidity. High humidity after rain is the condition that drives blight, so this sensor is what raises the blight-risk advisory.
 */
export interface WeatherSensor {
  status: SensorStatus;
  temperature_c: number;
  humidity_percent: number;
  /**
   * Machine codes. The UI maps each to a plain-language sentence.
   */
  warnings?: ('high_humidity_blight_risk' | 'temperature_out_of_range' | 'sensor_stale')[];
}
/**
 * Wheel encoders, used for odometry and the speed interlock.
 */
export interface EncoderSensor {
  status: SensorStatus;
  left_rpm: number;
  right_rpm: number;
  left_ticks?: number;
  right_ticks?: number;
}
/**
 * Every one of these must be true for the valve to open. Reported individually so the UI can say exactly which one is blocking, rather than a bare refusal.
 */
export interface SprayerInterlocks {
  armed: boolean;
  /**
   * Robot is inside the field polygon. Checked on the robot and again in PostGIS on the backend.
   */
  inside_geofence: boolean;
  /**
   * Ground speed below the spray limit; spraying while too fast under-doses and drifts.
   */
  speed_ok: boolean;
  tank_ok: boolean;
  estop_clear: boolean;
}
export interface BatteryTelemetry {
  percent: number;
  /**
   * Null while the estimate is not yet stable.
   */
  time_remaining_s?: number | null;
  voltage_v?: number;
  current_a?: number;
  charging?: boolean;
}
export interface ComputeTelemetry {
  cpu_percent: number;
  gpu_percent?: number;
  memory_percent: number;
  cpu_temp_c?: number;
  gpu_temp_c?: number;
  detection_fps?: number;
  storage_used_gb?: number;
  storage_total_gb?: number;
}
export interface Waypoint {
  seq: number;
  lat: number;
  lon: number;
  heading_deg?: number | null;
}
