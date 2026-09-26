/**
 * Fixture-backed data source.
 *
 * The JSON in ../fixtures is exported from the seeded PostgreSQL database by
 * `make fixtures` — it is real data that went through real PostGIS geometry, not
 * hand-written sample objects. `source` is carried through unchanged, which is why
 * fixture-backed screens still show the Simulated badge: the values genuinely are
 * simulated, and the UI says so for the same reason it would with a live sim robot.
 */

import type { ApiAnalyticsOverview, ApiFieldDetail, ApiRobotDetail } from '@agri/contracts';

import { clusterHotspots } from '@/lib/analytics/hotspots';

import analyticsJson from '../fixtures/analytics-overview.json';
import detectionsJson from '../fixtures/detections.json';
import fieldJson from '../fixtures/field.json';
import missionsJson from '../fixtures/missions.json';
import robotJson from '../fixtures/robot.json';
import scoutRunsJson from '../fixtures/scout-runs.json';
import storeAppsJson from '../fixtures/store-apps.json';
import telemetryJson from '../fixtures/telemetry.json';
import type {
  DataSource,
  DetectionList,
  DetectionQuery,
  HotspotList,
  HotspotQuery,
  MissionList,
  ScoutRunList,
  StoreCatalog,
  TelemetryHistory,
} from './types';

// The JSON modules are checked against the generated contract types here. If an export
// drifts from openapi.yaml, this file stops compiling.
const storeApps = storeAppsJson as StoreCatalog;
const robot = robotJson as ApiRobotDetail;
const field = fieldJson as ApiFieldDetail;
const detections = detectionsJson as DetectionList;
const scoutRuns = scoutRunsJson as ScoutRunList;
const missions = missionsJson as MissionList;
const analytics = analyticsJson as ApiAnalyticsOverview;
const telemetry = telemetryJson as TelemetryHistory;

export const fixturesSource: DataSource = {
  kind: 'fixtures',

  async getStoreApps() {
    return storeApps;
  },

  async getRobot() {
    return robot;
  },

  async getField() {
    return field;
  },

  async getDetections(params: DetectionQuery = {}) {
    let rows = detections.detections;
    if (params.severity) rows = rows.filter((d) => d.severity === params.severity);
    if (params.row !== undefined) rows = rows.filter((d) => d.row === params.row);
    if (params.uninspected) rows = rows.filter((d) => d.inspection_status === null);
    if (params.limit) rows = rows.slice(0, params.limit);
    return { detections: rows, next_cursor: null };
  },

  async getScoutRuns() {
    return scoutRuns;
  },

  async getMissions() {
    return missions;
  },

  async getAnalyticsOverview() {
    return analytics;
  },

  // Derived here rather than exported from the seed: `/analytics/hotspots` groups in
  // PostGIS, and the rule this stands in for is written down in lib/analytics/hotspots.ts
  // so the two can be checked against each other when the endpoint exists.
  async getHotspots(params: HotspotQuery = {}): Promise<HotspotList> {
    const hotspots = clusterHotspots(detections.detections);
    return {
      hotspots: params.severity
        ? hotspots.filter((hotspot) => hotspot.severity === params.severity)
        : hotspots,
    };
  },

  async getTelemetry() {
    return telemetry;
  },
};
