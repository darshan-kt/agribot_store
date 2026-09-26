/**
 * Which data source the app uses.
 *
 * Defaults to fixtures because the backend is still being built. Set
 * NEXT_PUBLIC_DATA_SOURCE=http once it answers — no other code changes.
 */

import { fixturesSource } from './fixtures-source';
import { httpSource } from './http-source';
import type { DataSource } from './types';

export type {
  DataSource,
  DetectionList,
  DetectionQuery,
  HotspotList,
  HotspotQuery,
  LatestTelemetry,
  MissionList,
  ScoutRunList,
  StoreCatalog,
  TelemetryHistory,
} from './types';
export { ApiError } from './http-source';

const configured = process.env.NEXT_PUBLIC_DATA_SOURCE ?? 'fixtures';

export const data: DataSource = configured === 'http' ? httpSource : fixturesSource;

/** True when the screen is reading exported fixtures rather than a live backend. */
export const isFixtureMode = data.kind === 'fixtures';
