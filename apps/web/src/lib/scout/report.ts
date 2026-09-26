/**
 * What a scouting run found.
 *
 * Crop Scout reports on *a run*, not on the field's whole history — the question it
 * answers is "what did this pass turn up", and Analytics is where the week is read.
 * The REST contract can filter detections by `run_id`, but a detection row carries the
 * run only on the backend side of the contract, so runs are scoped here by their time
 * window, which is the same thing the query would do and is verifiable against the data:
 * the most recent seeded run reports 37 flagged plants and its window contains exactly
 * 37 detections.
 *
 * Nothing here invents a number. Plants scanned and the infection rate come from the run
 * row as the robot reported it; the mixes are counted from the detections themselves.
 */

import type { ApiDetection, ApiScoutRun, ApiSeverity } from '@agri/contracts';

export interface IssueCount {
  code: string;
  name: string;
  /** "fungus", "insect" — the plain word, for people who do not know the Latin. */
  issueType: string;
  count: number;
  /** Worst severity seen for this issue in the run, which is what sets its urgency. */
  worst: ApiSeverity;
}

export interface RunReport {
  run: ApiScoutRun | null;
  detections: ApiDetection[];
  plantsScanned: number | null;
  plantsFlagged: number;
  /** From the run row when it has one, else counted; null when neither is knowable. */
  infectionRate: number | null;
  severityCounts: Record<ApiSeverity, number>;
  issues: IssueCount[];
}

const SEVERITY_RANK: Record<ApiSeverity, number> = { low: 0, moderate: 1, critical: 2 };

/** Detections recorded between a run's start and end. Ends open when the run is live. */
export function detectionsInRun(
  detections: readonly ApiDetection[],
  run: ApiScoutRun | null,
): ApiDetection[] {
  if (!run) return [];
  const from = Date.parse(run.started_at);
  const to = run.ended_at ? Date.parse(run.ended_at) : Number.POSITIVE_INFINITY;
  return detections.filter((d) => {
    const at = Date.parse(d.detected_at);
    return at >= from && at <= to;
  });
}

/** Newest first is how the API returns runs, but ordering here means it cannot matter. */
export function latestRun(runs: readonly ApiScoutRun[]): ApiScoutRun | null {
  if (runs.length === 0) return null;
  return [...runs].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0]!;
}

export function summariseRun(
  run: ApiScoutRun | null,
  detections: readonly ApiDetection[],
): RunReport {
  const inRun = [...detections].sort(
    (a, b) => Date.parse(b.detected_at) - Date.parse(a.detected_at),
  );

  const severityCounts: Record<ApiSeverity, number> = { low: 0, moderate: 0, critical: 0 };
  const byIssue = new Map<string, IssueCount>();

  for (const detection of inRun) {
    severityCounts[detection.severity] += 1;

    const existing = byIssue.get(detection.issue.code);
    if (existing) {
      existing.count += 1;
      if (SEVERITY_RANK[detection.severity] > SEVERITY_RANK[existing.worst]) {
        existing.worst = detection.severity;
      }
    } else {
      byIssue.set(detection.issue.code, {
        code: detection.issue.code,
        name: detection.issue.name,
        issueType: detection.issue.issue_type,
        count: 1,
        worst: detection.severity,
      });
    }
  }

  const plantsFlagged = run?.plants_flagged ?? inRun.length;
  const plantsScanned = run?.plants_scanned ?? null;

  return {
    run,
    detections: inRun,
    plantsScanned,
    plantsFlagged,
    infectionRate: run?.infection_rate ?? (plantsScanned ? plantsFlagged / plantsScanned : null),
    severityCounts,
    // Worst first, then commonest: the list is read top-down when deciding what to treat.
    issues: [...byIssue.values()].sort(
      (a, b) => SEVERITY_RANK[b.worst] - SEVERITY_RANK[a.worst] || b.count - a.count,
    ),
  };
}

/** The most recent detection on each camera — the boxes a live feed would be showing. */
export function latestPerCamera(
  detections: readonly ApiDetection[],
): Record<'left' | 'right', ApiDetection | null> {
  const newest = { left: null, right: null } as Record<'left' | 'right', ApiDetection | null>;
  for (const detection of detections) {
    const current = newest[detection.camera];
    if (!current || Date.parse(detection.detected_at) > Date.parse(current.detected_at)) {
      newest[detection.camera] = detection;
    }
  }
  return newest;
}
