/**
 * Building the advisor's context from the API payloads.
 *
 * Kept out of `advisor.ts` so the advisor depends on a shape it owns rather than on the
 * generated contract: when the REST types move, this one file moves and the answer rules
 * and their tests do not.
 */

import type { ApiAnalyticsOverview, ApiRobotDetail, ApiScoutRun } from '@agri/contracts';

import type { AdvisorContext, AdvisorIssue } from './advisor';

export function advisorContextFrom({
  overview,
  robot,
  runs,
}: {
  overview: ApiAnalyticsOverview;
  robot: ApiRobotDetail;
  runs: readonly ApiScoutRun[];
}): AdvisorContext {
  const mix = new Map(overview.severity_mix.map((entry) => [entry.severity, entry.count]));

  // Worst first, so "the biggest problem is ..." is true rather than "the first one the
  // API happened to return is ...".
  const issues: AdvisorIssue[] = [...overview.issues]
    .sort((a, b) => (b.critical_count ?? 0) - (a.critical_count ?? 0) || b.count - a.count)
    .map((entry) => ({
      code: entry.issue.code,
      name: entry.issue.name,
      type: entry.issue.issue_type,
      count: entry.count,
      criticalCount: entry.critical_count ?? 0,
      whatItIs: entry.issue.what_it_is,
      whatToDo: entry.issue.what_to_do,
      actionWithinDays: entry.issue.action_within_days ?? null,
    }));

  const latestRun = [...runs].sort(
    (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at),
  )[0];

  return {
    // Both are optional in the contract. An unnamed block and an unplanted one are real
    // states, so they get a wording rather than a crash or an empty gap in a sentence.
    field: {
      name: overview.field.name ?? 'this field',
      crop: overview.field.crop ?? 'an unrecorded crop',
    },
    metrics: {
      plantsScanned: overview.metrics.plants_scanned,
      plantsFlagged: overview.metrics.plants_flagged,
      criticalCount: overview.metrics.critical_count,
      infectionRate: overview.metrics.infection_rate,
    },
    severity: {
      low: mix.get('low') ?? 0,
      moderate: mix.get('moderate') ?? 0,
      critical: mix.get('critical') ?? 0,
    },
    issues,
    alert: overview.alert
      ? {
          fromRow: overview.alert.from_row ?? null,
          toRow: overview.alert.to_row ?? null,
          withinDays: overview.alert.within_days ?? null,
        }
      : null,
    robot: {
      name: robot.name,
      online: robot.online,
      batteryPercent: robot.battery_percent ?? null,
      row: robot.row ?? null,
    },
    lastRunAt: latestRun?.started_at ?? null,
  };
}
