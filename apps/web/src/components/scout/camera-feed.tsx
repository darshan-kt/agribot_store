import type { ApiDetection, ApiRobotDetail, ApiSeverity } from '@agri/contracts';
import { cn, SEVERITY_LABEL, SimulatedBadge } from '@agri/ui';

/**
 * A camera panel.
 *
 * STUBBED: there is no video. WebRTC is served by the backend's `aiortc` track and the
 * JPEG fallback arrives on the `camera` WebSocket channel — neither exists yet, so this
 * renders the same "no video" state it will show when a feed drops, rather than a
 * placeholder pretending to be a picture. There is no scanline and no crop drift either:
 * motion that implies a live image when there is none is the worst thing this panel
 * could do.
 *
 * The box, however, is real. Boxes arrive on `detections`, not on the video — that is
 * why the contract normalises them to the frame — so the most recent detection for this
 * camera is drawn at the position it was actually recorded at, and the panel says plainly
 * that the frame behind it was never stored.
 */

const BOX: Record<ApiSeverity, string> = {
  low: 'border-low',
  moderate: 'border-moderate',
  critical: 'border-critical',
};

const LABEL: Record<ApiSeverity, string> = {
  low: 'bg-low text-on-low',
  moderate: 'bg-moderate text-on-moderate',
  critical: 'bg-critical text-on-critical',
};

/** The robot's own sensor row for this camera, straight off the contract. */
export type CameraSensor = NonNullable<ApiRobotDetail['sensors']>[number];

export function CameraFeed({
  side,
  detection,
  sensor,
  selected,
  onSelect,
  className,
}: {
  side: 'left' | 'right';
  /** The newest detection on this camera, or null if it saw nothing this run. */
  detection: ApiDetection | null;
  sensor: CameraSensor | null;
  selected: boolean;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const title = side === 'left' ? 'Left camera' : 'Right camera';
  const resolution = formatResolution(sensor?.readings);

  return (
    <section
      className={cn('border-line bg-surface flex flex-col rounded-md border', className)}
      aria-label={title}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {resolution && (
            <span className="text-ink-subtle text-2xs truncate font-mono">{resolution}</span>
          )}
        </div>
        {sensor?.source && <SimulatedBadge source={sensor.source} size="xs" />}
      </header>

      {/* 4:3 rather than 16:9: these are inspection cameras pointed at a row of plants,
          and the seeded sensor reports 1920 × 1080 only for the stream it would send. */}
      <div className="bg-surface-sunk border-line relative aspect-[4/3] overflow-hidden border-y">
        <NoFrame />

        {detection && (
          <button
            type="button"
            onClick={() => onSelect(detection.id)}
            aria-pressed={selected}
            className={cn(
              'focus-visible:outline-focus absolute border-2 focus-visible:outline-2 focus-visible:outline-offset-2',
              'motion-safe:duration-base motion-safe:transition-[box-shadow,transform]',
              BOX[detection.severity],
              selected && 'ring-focus ring-2 ring-offset-1',
            )}
            style={{
              left: `${detection.bbox.x * 100}%`,
              top: `${detection.bbox.y * 100}%`,
              width: `${detection.bbox.w * 100}%`,
              height: `${detection.bbox.h * 100}%`,
            }}
          >
            <span
              className={cn(
                'rounded-t-xs absolute left-0 top-0 -translate-y-full whitespace-nowrap px-1.5 py-0.5',
                'text-2xs font-semibold',
                LABEL[detection.severity],
              )}
            >
              {detection.issue.name}
              <span className="ml-1 font-mono font-normal tabular-nums">
                {Math.round(detection.confidence * 100)}%
              </span>
            </span>
            <span className="sr-only">
              {`${SEVERITY_LABEL[detection.severity]} ${detection.issue.name}, ${Math.round(
                detection.confidence * 100,
              )}% confidence, ${detection.row != null ? `row ${detection.row}` : 'row unknown'}`}
            </span>
          </button>
        )}
      </div>

      {/* Only the empty case is narrated now. When there *is* a box, the box and its
          label already say what they are, and a sentence repeating it under every frame
          was noise on the densest panel of the densest screen. */}
      {!detection && (
        <p className="text-ink-muted px-3 py-2 text-xs">
          This camera flagged nothing during the run.
        </p>
      )}
    </section>
  );
}

/**
 * The empty frame.
 *
 * A hatch, not a grey fill: at a glance it has to be obviously "nothing here" rather
 * than a dark image, especially on a tablet in the sun where a flat dark rectangle and
 * an unlit camera look identical.
 */
function NoFrame() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
      <svg className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <pattern
            id="no-frame-hatch"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="8" className="stroke-line" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#no-frame-hatch)" opacity="0.5" />
      </svg>
      <p className="text-ink-muted relative text-sm font-medium">No video</p>
      <p className="text-ink-subtle relative max-w-[28ch] text-center text-xs">
        The video gateway is not running yet.
      </p>
    </div>
  );
}

function formatResolution(readings: Record<string, unknown> | null | undefined): string | null {
  if (!readings) return null;
  const { width, height, fps } = readings as { width?: number; height?: number; fps?: number };
  if (!width || !height) return null;
  return fps ? `${width}×${height} · ${fps} fps` : `${width}×${height}`;
}

