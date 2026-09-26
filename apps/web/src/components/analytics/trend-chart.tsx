'use client';

import { cn } from '@agri/ui';
import { useState } from 'react';

import { formatRate, type TrendPoint, trendScale } from '@/lib/analytics/overview';

/**
 * Infection rate across scouting runs, against the level worth acting on.
 *
 * One series, so there is no legend: the heading names it. The threshold is the second
 * mark and is labelled where it sits, because "the line you do not want to cross" has to
 * be readable without a key.
 *
 * **The axis starts at zero.** This series spans about two points of a percent, which is
 * exactly the shape a truncated baseline flatters into a cliff — and this particular
 * chart decides whether someone sprays a field.
 *
 * Hand-drawn SVG rather than a charting library: seven points, one line and a rule. visx
 * and Recharts are both in the approved stack and both would be several hundred kilobytes
 * to draw this, on a phone, in a field, over a connection that may not be there.
 *
 * The numbers are also published as a table underneath. A chart whose colours fall below
 * 3:1 — which the severity scale does, by the brief's own palette — owes the reader
 * another way to read it, and a table is the one that works in greyscale, in sunlight and
 * in a screen reader.
 */

const WIDTH = 320;
const HEIGHT = 120;

export function TrendChart({
  points,
  threshold,
  className,
}: {
  points: readonly TrendPoint[];
  threshold: number;
  className?: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <p className="text-ink-muted text-sm">
        A trend needs at least two scouting runs. There {points.length === 1 ? 'is 1' : 'are none'}{' '}
        so far.
      </p>
    );
  }

  const scale = trendScale(points, threshold, WIDTH, HEIGHT);
  const line = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${scale.x(index)} ${scale.y(point.infection_rate)}`,
    )
    .join(' ');
  const area = `${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`;
  const thresholdY = scale.y(threshold);
  const latest = points[points.length - 1]!;
  const shown = active === null ? null : points[active];

  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block w-full overflow-visible"
          role="img"
          aria-label={`Infection rate over ${points.length} scouting runs, from ${formatRate(
            points[0]!.infection_rate,
          )} to ${formatRate(latest.infection_rate)}. The level worth acting on is ${formatRate(
            threshold,
          )}.`}
          onPointerLeave={() => setActive(null)}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            if (box.width === 0) return;
            const ratio = (event.clientX - box.left) / box.width;
            setActive(
              Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))),
            );
          }}
        >
          {/* The threshold, drawn under the series so the data reads over it. */}
          <line
            x1="0"
            y1={thresholdY}
            x2={WIDTH}
            y2={thresholdY}
            className="stroke-critical"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
          />

          <path d={area} className="fill-info/12" />
          <path
            d={line}
            fill="none"
            className="stroke-info"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {shown && (
            <line
              x1={scale.x(active!)}
              y1="0"
              x2={scale.x(active!)}
              y2={HEIGHT}
              className="stroke-line-strong"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {points.map((point, index) => (
            <circle
              key={point.run_id}
              cx={scale.x(index)}
              cy={scale.y(point.infection_rate)}
              r={index === active || index === points.length - 1 ? 5 : 3.5}
              className={cn(
                'stroke-surface',
                point.infection_rate >= threshold ? 'fill-critical' : 'fill-info',
              )}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        <span
          className="text-critical-ink text-2xs absolute right-0 font-semibold"
          style={{ top: `${(thresholdY / HEIGHT) * 100}%` }}
          aria-hidden
        >
          Act above {formatRate(threshold)}
        </span>

        {shown && (
          <div
            role="status"
            className="border-line bg-surface-raised text-ink pointer-events-none absolute left-0 top-0 rounded-sm border px-2 py-1 text-xs shadow-md"
          >
            <span className="font-mono font-semibold tabular-nums">
              {formatRate(shown.infection_rate)}
            </span>{' '}
            · {shown.flagged} flagged ·{' '}
            {new Date(shown.at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
          </div>
        )}
      </div>

      <div className="text-ink-subtle text-2xs flex justify-between font-mono">
        <span>
          {new Date(points[0]!.at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
        </span>
        <span>
          {new Date(latest.at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
        </span>
      </div>

      <details className="text-sm">
        <summary className="focus-visible:outline-focus text-ink-muted cursor-pointer focus-visible:outline-2">
          Show the numbers
        </summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">Infection rate by scouting run</caption>
          <thead className="text-ink-subtle text-xs">
            <tr>
              <th scope="col" className="py-1 font-medium">
                Run
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Flagged
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Rate
              </th>
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {points.map((point) => (
              <tr key={point.run_id}>
                <th scope="row" className="py-1 font-normal">
                  {new Date(point.at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                </th>
                <td className="py-1 text-right font-mono tabular-nums">{point.flagged}</td>
                <td className="py-1 text-right font-mono tabular-nums">
                  {formatRate(point.infection_rate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
