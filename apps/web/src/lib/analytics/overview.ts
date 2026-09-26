/**
 * Reading the overview: the small amount of arithmetic the numbers need on the way to
 * the screen, and the scale the trend chart is drawn on.
 *
 * The aggregates themselves are computed once, server-side, and arrive together — the
 * contract is explicit that the alert sentence and the numbers beside it come from one
 * snapshot so they cannot disagree. Nothing here recomputes them; it formats them, and
 * works out where a point sits on an axis.
 */

import type { ApiAnalyticsOverview, ApiSeverity } from '@agri/contracts';

export type TrendPoint = ApiAnalyticsOverview['trend']['points'][number];

/** A rate as a percentage, at the precision the data supports. Infection rates here run
 *  well under a tenth, so one decimal place is the difference between runs. */
export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** A signed change, for "up 0.5 points on the last run". Null when there is no previous
 *  run to compare with — the first run of a season is not a change of zero. */
export function formatChange(change: number | null | undefined): string | null {
  if (change === null || change === undefined) return null;
  const points = Math.abs(change * 100).toFixed(1);
  if (Math.abs(change) < 0.0005) return 'level with the last run';
  return change > 0
    ? `up ${points} points on the last run`
    : `down ${points} points on the last run`;
}

export function severityCounts(
  overview: ApiAnalyticsOverview,
): Partial<Record<ApiSeverity, number>> {
  const counts: Partial<Record<ApiSeverity, number>> = {};
  for (const entry of overview.severity_mix) counts[entry.severity] = entry.count;
  return counts;
}

export interface TrendScale {
  /** Top of the axis. Always above both the data and the threshold, so neither is drawn
   *  on the frame of the chart. */
  max: number;
  x(index: number): number;
  y(rate: number): number;
  width: number;
  height: number;
}

/**
 * The scale for the trend chart.
 *
 * The axis starts at zero: this is a rate, and a truncated baseline on a rate turns a
 * half-point rise into a cliff. It is the most common way a chart lies, and the one this
 * chart would be most tempted by — the series only spans two points of a percent.
 */
export function trendScale(
  points: readonly TrendPoint[],
  threshold: number,
  width: number,
  height: number,
): TrendScale {
  const highest = Math.max(threshold, ...points.map((point) => point.infection_rate), 0.0001);
  // A tenth of headroom keeps the peak marker and its label clear of the top edge.
  const max = highest * 1.1;
  const lastIndex = Math.max(points.length - 1, 1);

  return {
    max,
    width,
    height,
    x: (index) => (index / lastIndex) * width,
    y: (rate) => height - (rate / max) * height,
  };
}

/** Whether the latest run is at or above the level the agronomy advice says to act on. */
export function aboveThreshold(overview: ApiAnalyticsOverview): boolean {
  const latest = overview.trend.points[overview.trend.points.length - 1];
  return latest ? latest.infection_rate >= overview.trend.action_threshold : false;
}

/** The plain-language issue type, for a label beside a disease name. */
export const ISSUE_TYPE_LABEL: Record<string, string> = {
  fungus: 'fungus',
  insect: 'insect',
  bacteria: 'bacteria',
  virus: 'virus',
  nutrient: 'nutrient',
  abiotic: 'weather or soil',
};
