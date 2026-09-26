# ROS 2 bridge mapping

**Status: specified, not yet implemented.** The `agri_bridge` rclpy package is Phase 9. This document is its contract, so the MQTT side can be built and tested against a simulated robot first.

Target ROS 2 Jazzy, kept Humble-compatible. The bridge is the only process that talks to both DDS and MQTT.

## Uplink: ROS 2 → MQTT

| ROS 2 topic                                 | Type                              | QoS profile                       | MQTT topic                           | Notes                                                                                       |
| ------------------------------------------- | --------------------------------- | --------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `/battery_state`                            | `sensor_msgs/BatteryState`        | sensor data, best effort, depth 1 | `telemetry`                          | Merged with compute stats from `/diagnostics` into one payload at 2 Hz.                     |
| `/diagnostics`                              | `diagnostic_msgs/DiagnosticArray` | default, reliable                 | `telemetry`, `events`                | CPU/GPU/memory into telemetry; a status transition to ERROR becomes a `sensor_fault` event. |
| `/fix`                                      | `sensor_msgs/NavSatFix`           | sensor data                       | `pose`, `sensors`                    | `status.status` maps to `fix_type`; covariance to `accuracy_m`.                             |
| `/odometry/filtered`                        | `nav_msgs/Odometry`               | sensor data                       | `pose`                               | From `robot_localization`. Supplies `map_position`, `speed_mps`, `yaw_rate_dps`.            |
| `/imu`                                      | `sensor_msgs/Imu`                 | sensor data                       | `sensors`                            | Quaternion converted to roll/pitch/yaw degrees at the bridge, not in the browser.           |
| `/scan`                                     | `sensor_msgs/LaserScan`           | sensor data                       | `sensors`                            | Reduced to `nearest_obstacle_m` and its bearing; the full scan never leaves the robot.      |
| `/camera/{left,right}/image_raw/compressed` | `sensor_msgs/CompressedImage`     | sensor data, depth 1              | WebRTC track, or `camera` WS channel | Never published to MQTT — see below.                                                        |
| `/detections`                               | `agri_msgs/DetectionArray`        | reliable, depth 10                | `detections`                         | `detection_id` is generated here if the vision node did not supply one.                     |
| `/sprayer/state`                            | `agri_msgs/SprayerState`          | reliable, transient local         | `sprayer/state`                      | Interlock booleans pass through unchanged.                                                  |
| `/navigate_through_poses/_action/feedback`  | Nav2 action feedback              | reliable                          | `mission/progress`                   | Waypoint index and distance remaining.                                                      |

### Why video is not on MQTT

MQTT is a poor transport for continuous video: broker fan-out, retained-message semantics and per-message overhead all work against it, and a slow subscriber would apply backpressure to the same broker that carries e-stop. Frames go over WebRTC, with a JPEG-over-WebSocket fallback that is explicitly rate-limited and droppable. Detections travel separately, carrying `frame_id` and `frame_ts` so the browser can align boxes to a frame — and dim them with a stale marker when no matching frame arrived.

## Downlink: MQTT → ROS 2

| MQTT topic    | ROS 2 interface                | Type                                    | Notes                                                                                 |
| ------------- | ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------- |
| `cmd/teleop`  | `/cmd_vel`                     | `geometry_msgs/Twist`                   | Republished at 20 Hz from the last valid command. **The deadman lives here.**         |
| `cmd/estop`   | `/estop` + Nav2 cancel         | `std_msgs/Bool`, action cancel          | Latches. Also zeroes `/cmd_vel` and cancels any active Nav2 goal.                     |
| `cmd/mission` | `/navigate_through_poses`      | `nav2_msgs/action/NavigateThroughPoses` | Waypoints converted from WGS 84 to the map frame via `navsat_transform`.              |
| `cmd/sprayer` | `/sprayer/command`             | `agri_msgs/SprayerCommand`              | Published only after the bridge re-checks all five interlocks.                        |
| `config/set`  | `rcl_interfaces/SetParameters` | parameter service                       | Applied atomically; the resulting values are read back and published on `config/ack`. |

## Deadman implementation

The single most important behaviour in the bridge:

```
timer @ 20 Hz:
    if now - last_teleop_rx > 300 ms:
        publish Twist(0, 0) to /cmd_vel      # every tick, not once
        if not already_latched:
            latch; publish `deadman_timeout` event
    else:
        publish last commanded Twist
```

Zero velocity is republished on every tick rather than once, because a single dropped message must not leave a stopped robot with a stale non-zero command in a downstream buffer. Resuming requires a fresh `cmd/teleop`; the robot never restarts itself.

## QoS profiles

- Sensor streams: `SensorDataQoS` — best effort, depth 1, volatile. A late sensor sample is worthless.
- Commands and detections: reliable, depth 10, volatile.
- `sprayer/state` and `state`: reliable, **transient local**, depth 1, so a subscriber that joins late immediately learns whether the sprayer is armed instead of assuming it is not.

## Connection loss

MQTT reconnect uses exponential backoff with jitter. While disconnected the bridge:

- keeps enforcing the deadman, so the robot stops;
- buffers detections in a bounded queue (1000 messages, oldest dropped first) and replays them on reconnect, because a detection is the one uplink worth storing and forwarding;
- discards buffered telemetry, sensors and pose entirely, since none of it is useful once stale;
- lets the broker's LWT mark the robot offline for every watching browser.
