/**
 * The report must not invent numbers. These tests check that it scopes to the run it
 * claims to be reporting, and that it reports the robot's own counts rather than
 * recomputing something that quietly disagrees with them.
 */
import type { ApiDetection, ApiScoutRun } from '@agri/contracts';
import { describe, expect, it } from 'vitest';

import detectionsJson from '@/lib/fixtures/detections.json';
import runsJson from '@/lib/fixtures/scout-runs.json';
import { detectionsInRun, latestPerCamera, latestRun, summariseRun } from '@/lib/scout/report';

const allDetections = (detectionsJson as { detections: ApiDetection[] }).detections;
const allRuns = (runsJson as { runs: ApiScoutRun[] }).runs;

const base = {
  code: 'late_blight',
  name: 'Late blight',
  issue_type: 'fungus',
  what_it_is: '',
  what_to_do: '',
} as ApiDetection['issue'];

function detection(over: Partial<ApiDetection> & { id: string }): ApiDetection {
  return {
    detected_at: '2026-09-25T07:30:00Z',
    severity: 'low',
    confidence: 0.8,
    camera: 'left',
    bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    row: 1,
    issue: base,
    source: 'sim',
    ...over,
  } as ApiDetection;
}

describe('latestRun', () => {
  it('picks the newest run regardless of the order they arrive in', () => {
    const shuffled = [...allRuns].reverse();
    expect(latestRun(shuffled)?.id).toBe(latestRun(allRuns)?.id);
    expect(latestRun(allRuns)?.started_at).toBe('2026-09-25T07:10:00Z');
  });

  it('has no run to report when there are none', () => {
    expect(latestRun([])).toBeNull();
  });
});

describe('detectionsInRun', () => {
  it('scopes the seeded field history down to the last run', () => {
    // The run says it flagged 37 plants. Its window has to contain exactly those 37,
    // or the panel would be reporting one number over a different set of rows.
    const run = latestRun(allRuns)!;
    expect(detectionsInRun(allDetections, run)).toHaveLength(run.plants_flagged);
  });

  it('includes a detection from a run still in progress', () => {
    const live: ApiScoutRun = {
      ...allRuns[0]!,
      ended_at: null,
      started_at: '2026-09-25T07:00:00Z',
    };
    expect(detectionsInRun([detection({ id: 'a' })], live)).toHaveLength(1);
  });

  it('is empty when there is no run', () => {
    expect(detectionsInRun(allDetections, null)).toEqual([]);
  });
});

describe('summariseRun', () => {
  const run = latestRun(allRuns)!;
  const report = summariseRun(run, detectionsInRun(allDetections, run));

  it('reports the robot’s own scanned count and infection rate, not a recomputed one', () => {
    expect(report.plantsScanned).toBe(run.plants_scanned);
    expect(report.infectionRate).toBe(run.infection_rate);
  });

  it('counts the severity mix from the detections themselves', () => {
    const total =
      report.severityCounts.low + report.severityCounts.moderate + report.severityCounts.critical;
    expect(total).toBe(report.detections.length);
  });

  it('orders detections newest first', () => {
    const times = report.detections.map((d) => Date.parse(d.detected_at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('ranks issues by worst severity, then by how many there are', () => {
    const issues = summariseRun(run, [
      detection({
        id: '1',
        severity: 'low',
        issue: { ...base, code: 'aphid_colony', name: 'Aphids' },
      }),
      detection({
        id: '2',
        severity: 'low',
        issue: { ...base, code: 'aphid_colony', name: 'Aphids' },
      }),
      detection({ id: '3', severity: 'critical' }),
    ]).issues;

    expect(issues.map((i) => i.code)).toEqual(['late_blight', 'aphid_colony']);
    expect(issues[0]!.worst).toBe('critical');
    expect(issues[1]!.count).toBe(2);
  });

  it('falls back to counting when there is no run row to quote', () => {
    const counted = summariseRun(null, [detection({ id: '1' }), detection({ id: '2' })]);
    expect(counted.plantsFlagged).toBe(2);
    expect(counted.plantsScanned).toBeNull();
    // With nothing scanned reported, a rate would be a number over an unknown total.
    expect(counted.infectionRate).toBeNull();
  });
});

describe('latestPerCamera', () => {
  it('gives each camera its own newest box', () => {
    const newest = latestPerCamera([
      detection({ id: 'old-left', camera: 'left', detected_at: '2026-09-25T07:10:00Z' }),
      detection({ id: 'new-left', camera: 'left', detected_at: '2026-09-25T07:40:00Z' }),
      detection({ id: 'only-right', camera: 'right', detected_at: '2026-09-25T07:20:00Z' }),
    ]);
    expect(newest.left?.id).toBe('new-left');
    expect(newest.right?.id).toBe('only-right');
  });

  it('reports nothing for a camera that flagged nothing', () => {
    const newest = latestPerCamera([detection({ id: 'a', camera: 'left' })]);
    expect(newest.right).toBeNull();
  });
});
