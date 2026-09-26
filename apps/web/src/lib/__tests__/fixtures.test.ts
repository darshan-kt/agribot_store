/**
 * The product's headline claims are counts taken from the database, not strings written
 * into the interface. These tests assert exactly that, so a future change to the seed
 * cannot leave the UI quoting a number that is no longer true.
 */
import type { ApiAnalyticsOverview, ApiStoreApp } from '@agri/contracts';
import { describe, expect, it } from 'vitest';

import analytics from '@/lib/fixtures/analytics-overview.json';
import detections from '@/lib/fixtures/detections.json';
import storeApps from '@/lib/fixtures/store-apps.json';

const overview = analytics as ApiAnalyticsOverview;
const apps = (storeApps as { apps: ApiStoreApp[] }).apps;

describe('store badges', () => {
  it('shows a critical count on Crop Health that matches the analytics metrics', () => {
    const badge = apps.find((a) => a.slug === 'crop-health')?.badge;
    expect(badge?.label).toBe(`${overview.metrics.critical_count} critical`);
    expect(badge?.tone).toBe('critical');
  });

  it('never invents a badge for an app with nothing to report', () => {
    expect(apps.find((a) => a.slug === 'crop-scout')?.badge).toBeNull();
  });
});

describe('the alert sentence', () => {
  it('quotes the same critical count as the metric card beside it', () => {
    expect(overview.alert).not.toBeNull();
    expect(overview.alert?.critical_count).toBe(overview.metrics.critical_count);
    expect(overview.alert?.sentence).toContain(String(overview.metrics.critical_count));
  });

  it('names a real row range and a real deadline', () => {
    const alert = overview.alert!;
    expect(alert.from_row).toBeGreaterThan(0);
    expect(alert.to_row).toBeGreaterThanOrEqual(alert.from_row!);
    expect(alert.sentence).toContain(`rows ${alert.from_row} to ${alert.to_row}`);
    expect(alert.sentence).toContain(`within ${alert.within_days} days`);
  });
});

describe('simulated provenance', () => {
  it('marks every seeded detection as simulated, so none can render unbadged', () => {
    const sources = new Set(
      (detections as { detections: Array<{ source: string }> }).detections.map((d) => d.source),
    );
    expect([...sources]).toEqual(['sim']);
  });
});
