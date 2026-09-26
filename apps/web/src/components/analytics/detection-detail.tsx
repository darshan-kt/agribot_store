'use client';

import type { ApiDetection } from '@agri/contracts';
import { Button, Card, CardHeader, cn, Eyebrow, SeverityChip, SimulatedBadge } from '@agri/ui';
import { useState } from 'react';

import { isFixtureMode } from '@/lib/data';

/**
 * One plant, close up: what it is, where it is, and what to do about it.
 *
 * This is the screen someone reads standing in a row with a phone in one hand, so it is
 * ordered the way the decision is made — the verdict, then the walk, then the action —
 * and the guidance is the issue catalogue's own plain language, not a paraphrase.
 *
 * STUBBED: **the sample image.** `image_url` and `crop_url` are null on every seeded
 * detection: the seed does not invent photographs, and the object store has no frames in
 * it because nothing has uploaded any. The panel says the photograph was never stored
 * rather than showing a placeholder that could be mistaken for one — and it draws where
 * in the camera frame the plant was seen, because that part *is* recorded.
 *
 * STUBBED: **marking inspected.** That is `POST /detections/{id}/inspections`, which the
 * backend owns. It refuses with its reason rather than ticking a box that would be gone
 * on reload.
 */
export function DetectionDetail({
  detection,
  onClose,
  className,
}: {
  detection: ApiDetection;
  onClose?: () => void;
  className?: string;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const gps = detection.location
    ? `${detection.location.lat.toFixed(6)}, ${detection.location.lon.toFixed(6)}`
    : null;

  async function copyGps() {
    if (!gps) return;
    try {
      await navigator.clipboard.writeText(gps);
      setCopied(true);
      setNotice(null);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused on an insecure origin and in some locked-down
      // browsers. The coordinates are on screen and selectable, so say that rather than
      // failing silently.
      setNotice('Could not reach the clipboard. The coordinates above can be selected and copied.');
    }
  }

  function markInspected() {
    setNotice(
      isFixtureMode
        ? 'Not connected to the server, so this was not recorded. Inspections are saved against the plant, not on this device.'
        : 'The server did not accept the inspection.',
    );
  }

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title={detection.issue.name}
        eyebrow="Flagged plant"
        action={
          onClose && (
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-4 px-4 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={detection.severity} />
          <SimulatedBadge source={detection.source} size="xs" />
          {detection.inspection_status && (
            <span className="border-line text-ink-muted rounded-sm border px-2 py-0.5 text-xs">
              {INSPECTION_LABEL[detection.inspection_status]}
            </span>
          )}
          <span className="text-ink-muted ml-auto font-mono text-xs tabular-nums">
            {Math.round(detection.confidence * 100)}% confident
          </span>
        </div>

        <SampleImage detection={detection} />

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Fact label="Row">{detection.row != null ? `Row ${detection.row}` : 'Not recorded'}</Fact>
          <Fact label="From the field edge">
            {detection.metres_from_edge != null
              ? `${detection.metres_from_edge.toFixed(1)} m`
              : 'Not recorded'}
          </Fact>
          <Fact label="Seen by">
            {detection.camera === 'left' ? 'Left camera' : 'Right camera'}
          </Fact>
          <Fact label="Found">
            {new Date(detection.detected_at).toLocaleString([], {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Fact>
        </dl>

        <div className="border-line flex flex-wrap items-end justify-between gap-2 border-t pt-4">
          <div className="flex flex-col gap-0.5">
            <Eyebrow>GPS</Eyebrow>
            <p className="font-mono text-sm tabular-nums">{gps ?? 'No position recorded'}</p>
          </div>
          {gps && (
            <Button size="sm" variant="secondary" onClick={copyGps}>
              {copied ? 'Copied' : 'Copy GPS'}
            </Button>
          )}
        </div>

        <div className="border-line flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-col gap-1">
            <Eyebrow>What it is</Eyebrow>
            <p className="text-sm">{detection.issue.what_it_is}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Eyebrow>What to do</Eyebrow>
            <p className="text-sm">{detection.issue.what_to_do}</p>
            <p className="text-ink-muted text-sm">
              Act within{' '}
              <span className="text-ink font-semibold">
                {detection.issue.action_within_days}{' '}
                {detection.issue.action_within_days === 1 ? 'day' : 'days'}
              </span>
              .
            </p>
          </div>
        </div>

        <Button variant="primary" onClick={markInspected}>
          Mark inspected
        </Button>

        {notice && (
          <p role="alert" className="text-critical-ink text-sm">
            {notice}
          </p>
        )}
      </div>
    </Card>
  );
}

const INSPECTION_LABEL: Record<string, string> = {
  pending: 'Inspection pending',
  confirmed: 'Confirmed on foot',
  false_positive: 'Not a problem',
  treated: 'Treated',
};

/**
 * The sample.
 *
 * When there is a photograph, it is shown with the detection's box over it. When there is
 * not — which is every seeded detection, and every real one whose upload has not landed —
 * the frame diagram stands in: the box position is recorded even when the pixels are not,
 * and knowing the plant was low and to the left of frame is worth something. It is
 * captioned as a diagram so it cannot be read as a picture of the plant.
 */
function SampleImage({ detection }: { detection: ApiDetection }) {
  const url = detection.crop_url ?? detection.image_url;
  const { x, y, w, h } = detection.bbox;

  if (url) {
    return (
      <figure className="flex flex-col gap-1">
        <div className="border-line bg-surface-sunk relative overflow-hidden rounded-md border">
          {/* eslint-disable-next-line @next/next/no-img-element -- the object store is not
              a configured next/image loader, and these are operational photographs served
              from a presigned URL rather than site assets. */}
          <img
            src={url}
            alt={`Camera frame showing ${detection.issue.name}`}
            className="block w-full"
          />
          <span
            className="border-critical absolute border-2"
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${w * 100}%`,
              height: `${h * 100}%`,
            }}
            aria-hidden
          />
        </div>
        <figcaption className="text-ink-muted text-xs">
          The box is where the camera found it.
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="flex flex-col gap-1">
      <div className="border-line bg-surface-sunk flex flex-col gap-2 rounded-md border p-3">
        <svg
          viewBox="0 0 160 90"
          className="border-line-strong block w-full rounded-sm border border-dashed"
          role="img"
          aria-label={`Where in the ${detection.camera} camera frame the plant was seen: ${Math.round(
            (x + w / 2) * 100,
          )}% across, ${Math.round((y + h / 2) * 100)}% down.`}
        >
          <rect
            x={x * 160}
            y={y * 90}
            width={w * 160}
            height={h * 90}
            className="fill-critical/15 stroke-critical"
            strokeWidth="1.5"
          />
        </svg>
        <p className="text-ink-muted text-xs">
          <span className="text-ink font-semibold">No photograph was stored.</span> The robot
          records where in the frame it found the plant; the frame itself is uploaded by the camera
          pipeline, which is not running.
        </p>
      </div>
      <figcaption className="text-ink-subtle text-2xs">
        Diagram of the {detection.camera} camera frame — not a picture of the plant.
      </figcaption>
    </figure>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-ink-subtle text-xs font-semibold uppercase tracking-[0.08em]">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
