# ROS 2 workspace

Built in **Phase 9**. This workspace will hold `agri_bridge`, an `rclpy` package that maps
ROS 2 topics, services and actions onto the MQTT contract in
[`docs/contracts/mqtt.md`](../../docs/contracts/mqtt.md), with:

- QoS profiles matched per topic (sensor data best-effort, commands reliable).
- The **300 ms teleop deadman enforced here**, on the robot, not in the browser.
- Broker reconnect with backoff and bounded store-and-forward for detections.
- A launch file, parameters, and `launch_testing` unit tests.

Target: ROS 2 Jazzy, kept Humble-compatible. This machine has Humble at `/opt/ros/humble`.

Nothing is built here yet — `src/` is intentionally empty.
