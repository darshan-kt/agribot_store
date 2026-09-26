/**
 * The data access interface.
 *
 * One interface, two implementations: `fixtures` reads JSON exported from the seeded
 * database, `http` calls the REST API. Both are typed by the *generated* OpenAPI types,
 * so a fixture that drifts from the contract fails `pnpm typecheck` rather than failing
 * silently at runtime.
 *
 * The backend is being built separately. Until it answers, `fixtures` is the default —
 * see NEXT_PUBLIC_DATA_SOURCE in .env.example. Switching is a configuration change.
 */

import type {
  ApiAnalyticsOverview,
  ApiDetection,
  ApiFieldDetail,
  ApiHotspot,
  ApiMissionDetail,
  ApiRobotDetail,
  ApiScoutRun,
  ApiSeverity,
  ApiSource,
  ApiStoreApp,
  ApiTelemetrySample,
} from '@agri/contracts';

export interface StoreCatalog {
  apps: ApiStoreApp[];
}

export interface DetectionList {
  detections: ApiDetection[];
  next_cursor: string | null;
}

export interface ScoutRunList {
  runs: ApiScoutRun[];
  next_cursor: string | null;
}

/**
 * Recent telemetry plus the single newest raw sample.
 *
 * The series is the minute rollup (a two-hour trend cannot show more), while the
 * status cards read `latest`, because an operator wants the current value rather than
 * an average of the minute it fell in.
 */
export interface TelemetryHistory {
  resolution: 'raw' | 'minute';
  samples: ApiTelemetrySample[];
  latest: LatestTelemetry;
}

export interface LatestTelemetry extends ApiTelemetrySample {
  battery_time_remaining_s: number | null;
  battery_voltage_v: number | null;
  uptime_s: number | null;
  gpu_temp_c: number | null;
  storage_used_gb: number | null;
  storage_total_gb: number | null;
  source: ApiSource;
}

export interface MissionList {
  missions: ApiMissionDetail[];
  next_cursor: string | null;
}

export interface HotspotList {
  hotspots: ApiHotspot[];
}

export interface DataSource {
  readonly kind: 'fixtures' | 'http';
  getStoreApps(robotId?: string): Promise<StoreCatalog>;
  getRobot(robotId: string): Promise<ApiRobotDetail>;
  getField(fieldId?: string): Promise<ApiFieldDetail>;
  getDetections(params?: DetectionQuery): Promise<DetectionList>;
  getScoutRuns(): Promise<ScoutRunList>;
  getMissions(): Promise<MissionList>;
  getAnalyticsOverview(fieldId?: string): Promise<ApiAnalyticsOverview>;
  getHotspots(params?: HotspotQuery): Promise<HotspotList>;
  getTelemetry(robotId: string): Promise<TelemetryHistory>;
}

export interface DetectionQuery {
  severity?: ApiDetection['severity'];
  row?: number;
  runId?: string;
  uninspected?: boolean;
  limit?: number;
}

export interface HotspotQuery {
  fieldId?: string;
  severity?: ApiSeverity;
}
