/**
 * REST-backed data source.
 *
 * Implements the same interface against the OpenAPI contract in
 * packages/contracts/openapi.yaml. It is wired and typed but not yet exercised: the
 * backend that answers these routes is being built separately, so selecting it before
 * that service exists will surface connection errors in the UI's designed error states,
 * which is the correct behaviour rather than a fallback to invented data.
 */

import type {
  ApiAnalyticsOverview,
  ApiFieldDetail,
  ApiProblem,
  ApiRobotDetail,
} from '@agri/contracts';

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

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/** An API error carrying the RFC 9457 problem document, so callers can show its detail. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ApiProblem | null,
  ) {
    super(problem?.title ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const url = new URL(`${BASE}/api/v1${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    let problem: ApiProblem | null = null;
    try {
      problem = (await response.json()) as ApiProblem;
    } catch {
      // A non-JSON error body is still an error; the status alone is enough to report.
    }
    throw new ApiError(response.status, problem);
  }
  return (await response.json()) as T;
}

export const httpSource: DataSource = {
  kind: 'http',

  getStoreApps: (robotId) => get<StoreCatalog>('/store/apps', { robot_id: robotId }),
  getRobot: (robotId) => get<ApiRobotDetail>(`/robots/${robotId}`),
  getField: (fieldId) => get<ApiFieldDetail>(`/fields/${fieldId}`),
  getScoutRuns: () => get<ScoutRunList>('/scout-runs'),
  getMissions: () => get<MissionList>('/missions'),
  getAnalyticsOverview: (fieldId) =>
    get<ApiAnalyticsOverview>('/analytics/overview', { field_id: fieldId }),

  getHotspots: (params: HotspotQuery = {}) =>
    get<HotspotList>('/analytics/hotspots', {
      field_id: params.fieldId,
      severity: params.severity,
    }),

  getTelemetry: (robotId) =>
    get<TelemetryHistory>(`/robots/${robotId}/telemetry`, {
      from: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      resolution: 'minute',
    }),

  getDetections: (params: DetectionQuery = {}) =>
    get<DetectionList>('/detections', {
      severity: params.severity,
      row: params.row,
      run_id: params.runId,
      uninspected: params.uninspected,
      limit: params.limit,
    }),
};
