import { cn } from '@agri/ui';

import type { LatestTelemetry } from '@/lib/data';

/**
 * Onboard computer load.
 *
 * Bars rather than bare numbers because the question is "is it near its limit", which is
 * a proportion, not a value. Each bar still prints its number: a bar alone cannot be read
 * precisely, and 78% versus 87% matters when deciding whether to raise the frame rate.
 *
 * The thresholds are not decoration — above 85% the robot starts dropping detection
 * frames, so the bar turns amber there and red at 95%.
 */
function toneFor(percent: number): 'ok' | 'warn' | 'critical' {
  if (percent >= 95) return 'critical';
  if (percent >= 85) return 'warn';
  return 'ok';
}

const FILL: Record<'ok' | 'warn' | 'critical', string> = {
  ok: 'bg-primary',
  warn: 'bg-moderate',
  critical: 'bg-critical',
};

export function LoadBar({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: number | null | undefined;
  detail?: string | undefined;
}) {
  const value = percent ?? 0;
  const tone = toneFor(value);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-sm tabular-nums">
          {percent === null ? '—' : `${value.toFixed(0)}%`}
          {detail && <span className="text-ink-muted"> · {detail}</span>}
        </span>
      </div>
      <div
        className="bg-surface-sunk h-2 overflow-hidden rounded-full"
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn(
            FILL[tone],
            'motion-safe:duration-slow h-full motion-safe:transition-[width]',
          )}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

export function ComputePanel({ latest }: { latest: LatestTelemetry }) {
  const storageUsed = latest.storage_used_gb ?? 0;
  const storageTotal = latest.storage_total_gb ?? 0;
  const storagePercent = storageTotal > 0 ? (storageUsed / storageTotal) * 100 : 0;

  return (
    <div className="flex flex-col gap-3.5 px-4 pb-4">
      <LoadBar
        label="Processor"
        percent={latest.cpu_percent}
        detail={latest.cpu_temp_c != null ? `${latest.cpu_temp_c.toFixed(0)} °C` : undefined}
      />
      <LoadBar
        label="Graphics"
        percent={latest.gpu_percent}
        detail={latest.gpu_temp_c != null ? `${latest.gpu_temp_c.toFixed(0)} °C` : undefined}
      />
      <LoadBar label="Memory" percent={latest.memory_percent} />
      <LoadBar
        label="Storage"
        percent={storagePercent}
        detail={`${storageUsed.toFixed(0)} of ${storageTotal.toFixed(0)} GB`}
      />

      <div className="border-line flex items-baseline justify-between gap-3 border-t pt-3">
        <span className="text-sm font-medium">Detection rate</span>
        <span className="text-right font-mono text-sm tabular-nums">
          {latest.detection_fps != null ? `${latest.detection_fps.toFixed(1)} fps` : '—'}
          {latest.detection_fps === 0 && (
            <span className="text-ink-muted"> · idle, not scouting</span>
          )}
        </span>
      </div>
    </div>
  );
}
