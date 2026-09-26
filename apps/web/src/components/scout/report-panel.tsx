import { Card, CardHeader, cn, Eyebrow, Metric, SeverityBar, SeverityChip } from '@agri/ui';

import type { RunReport } from '@/lib/scout/report';

/**
 * What the run found.
 *
 * Three numbers, the mix, and what the problems actually were. Plants scanned and the
 * infection rate come from the run as the robot reported it rather than being recomputed
 * from the detections on screen — a report that silently disagrees with the robot's own
 * count is worse than one that is merely coarse.
 *
 * The issue names are the plain ones from the catalogue, each with its type in the same
 * words a farmer would use. "Phytophthora infestans" is in the detail view in Analytics,
 * not here.
 */
export function ReportPanel({ report, className }: { report: RunReport; className?: string }) {
  const { plantsScanned, plantsFlagged, infectionRate, severityCounts, issues } = report;
  const maxIssueCount = Math.max(1, ...issues.map((i) => i.count));

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="This run"
        eyebrow="Report"
        action={
          report.run && (
            <span className="text-ink-muted font-mono text-xs">
              {formatWindow(report.run.started_at, report.run.ended_at)}
            </span>
          )
        }
      />

      <div className="grid grid-cols-3 gap-3 px-4 pb-3">
        <Metric label="Scanned" value={plantsScanned?.toLocaleString() ?? '—'} hint="plants" />
        <Metric
          label="Flagged"
          value={plantsFlagged.toLocaleString()}
          hint="need a look"
          tone={severityCounts.critical > 0 ? 'critical' : 'default'}
        />
        <Metric
          label="Infection"
          value={infectionRate != null ? (infectionRate * 100).toFixed(1) : '—'}
          unit="%"
          hint="of plants seen"
        />
      </div>

      <div className="flex flex-col gap-2 px-4 pb-4">
        <SeverityBar counts={severityCounts} />
        <div className="flex flex-wrap gap-1.5">
          {(['critical', 'moderate', 'low'] as const)
            .filter((severity) => severityCounts[severity] > 0)
            .map((severity) => (
              <SeverityChip key={severity} severity={severity} count={severityCounts[severity]} />
            ))}
        </div>
      </div>

      <div className="border-line border-t px-4 py-3">
        <Eyebrow>What was found</Eyebrow>
        {issues.length === 0 ? (
          <p className="text-ink-muted mt-2 text-sm">Nothing was flagged during this run.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2.5">
            {issues.map((issue) => (
              <li key={issue.code} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">
                    {issue.name}
                    <span className="text-ink-subtle ml-1.5 text-xs font-normal">
                      {issue.issueType}
                    </span>
                  </span>
                  <span className="font-mono text-sm tabular-nums">{issue.count}</span>
                </div>
                <div
                  className="bg-surface-sunk h-1.5 overflow-hidden rounded-full"
                  role="presentation"
                >
                  <div
                    className={cn(
                      'h-full rounded-full',
                      issue.worst === 'critical' && 'bg-critical',
                      issue.worst === 'moderate' && 'bg-moderate',
                      issue.worst === 'low' && 'bg-low',
                      'motion-safe:duration-slow motion-safe:transition-[width]',
                    )}
                    style={{ width: `${(issue.count / maxIssueCount) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function formatWindow(startedAt: string, endedAt?: string | null): string {
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return endedAt ? `${time(startedAt)}–${time(endedAt)}` : `from ${time(startedAt)}`;
}
