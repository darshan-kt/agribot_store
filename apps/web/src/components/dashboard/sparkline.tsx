/**
 * A two-hour trend behind a status card.
 *
 * Deliberately minimal: no axes, no grid, no tooltip. It answers one question — is this
 * going up or down — and the exact current value is printed beside it in full size. The
 * last point is marked because "where it is now" is the part of the shape that matters.
 */
export function Sparkline({
  values,
  className,
  label,
}: {
  values: Array<number | null | undefined>;
  className?: string;
  label: string;
}) {
  const points = values.filter((v): v is number => typeof v === 'number');
  if (points.length < 2) return null;

  const width = 100;
  const height = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  // A flat series would divide by zero; draw it down the middle instead.
  const span = max - min || 1;

  const coords = points.map((value, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return [x, y] as const;
  });

  const path = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
  const area = `${path} L${width} ${height} L0 ${height} Z`;
  const last = coords[coords.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label}: ${points[0]!.toFixed(0)} to ${points[points.length - 1]!.toFixed(0)} over the last two hours`}
    >
      <path d={area} className="fill-primary/10" />
      <path
        d={path}
        fill="none"
        className="stroke-primary"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        r="2"
        className="fill-primary"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
