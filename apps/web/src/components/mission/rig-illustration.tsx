'use client';

import { cn } from '@agri/ui';

import { coverageRadiusM } from '@/lib/mission/sprayer';

import type { SprayArc } from '@agri/contracts';

/**
 * The rig, seen from the side, at the height the operator has set.
 *
 * This is the reason the nozzle slider is worth having: height is not a preference, it is
 * the thing that decides how wide the band is and therefore how thin the dose is. Raising
 * the nozzle from 20 cm to 90 cm takes the band from about 23 cm to about a metre, and
 * seeing the cone open up says that faster than any number.
 *
 * Drawn in centimetres — one SVG unit is one centimetre — so the cone geometry is the same
 * arithmetic the map uses for coverage discs, not a second version of it that could drift.
 *
 * The arc is shown the way it is sprayed: 180° covers the ground ahead of the rig only,
 * 360° covers ahead and behind. The plants are there for scale; a tomato at this point in
 * the season is roughly 60 cm, which is what makes a 20 cm nozzle a bad idea.
 */

/** Everything below is in centimetres in this coordinate space. */
const GROUND_Y = 108;
const NOZZLE_X = 96;
const VIEW_W = 200;
const VIEW_H = 124;
const PLANT_H = 60;

export function RigIllustration({
  nozzleHeightCm,
  arcDeg,
  /** True only when the robot reports the valve open. Nothing animates otherwise. */
  spraying = false,
  className,
}: {
  nozzleHeightCm: number;
  arcDeg: SprayArc;
  spraying?: boolean;
  className?: string;
}) {
  const nozzleY = GROUND_Y - nozzleHeightCm;
  const reachCm = coverageRadiusM(nozzleHeightCm) * 100;
  const bandStart = arcDeg === 360 ? NOZZLE_X - reachCm : NOZZLE_X;
  const bandEnd = NOZZLE_X + reachCm;
  const bandWidthM = (bandEnd - bandStart) / 100;

  return (
    <figure className={cn('flex flex-col gap-1.5', className)}>
      <div className="border-line bg-surface-sunk overflow-hidden rounded-md border">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block w-full"
          role="img"
          aria-label={`Side view of the rig. Nozzle ${Math.round(nozzleHeightCm)} centimetres above the ground, spraying a band ${bandWidthM.toFixed(2)} metres wide ${
            arcDeg === 360 ? 'ahead of and behind the rig' : 'ahead of the rig'
          }.`}
        >
          {/* The soil. Everything else stands on it. */}
          <line
            x1="0"
            y1={GROUND_Y}
            x2={VIEW_W}
            y2={GROUND_Y}
            className="stroke-line-strong"
            strokeWidth="1.5"
          />

          <Plant x={26} />
          <Plant x={150} />
          <Plant x={176} />

          {/* The band the spray lands on, before the cone, so the cone reads over it. */}
          <rect
            x={bandStart}
            y={GROUND_Y - 1.5}
            width={bandEnd - bandStart}
            height="3"
            className="fill-primary"
            opacity="0.85"
          />

          <path
            d={`M ${NOZZLE_X} ${nozzleY} L ${bandEnd} ${GROUND_Y} L ${bandStart} ${GROUND_Y} Z`}
            className="fill-primary-soft stroke-primary"
            strokeWidth="0.8"
            opacity="0.85"
          />

          {spraying && (
            <g className="motion-safe:animate-pulse-soft" aria-hidden>
              {[0.3, 0.55, 0.8].map((t) => (
                <line
                  key={t}
                  x1={NOZZLE_X}
                  y1={nozzleY}
                  x2={bandStart + (bandEnd - bandStart) * t}
                  y2={GROUND_Y}
                  className="stroke-primary"
                  strokeWidth="0.6"
                  strokeDasharray="2 4"
                />
              ))}
            </g>
          )}

          {/* The rig: body, wheels, mast and the nozzle head at the set height. */}
          <rect
            x="40"
            y={GROUND_Y - 46}
            width="52"
            height="22"
            rx="3"
            className="fill-surface stroke-line-strong"
            strokeWidth="1.5"
          />
          <circle
            cx="54"
            cy={GROUND_Y - 12}
            r="12"
            className="fill-surface stroke-line-strong"
            strokeWidth="1.5"
          />
          <circle
            cx="82"
            cy={GROUND_Y - 12}
            r="12"
            className="fill-surface stroke-line-strong"
            strokeWidth="1.5"
          />
          <line
            x1={NOZZLE_X}
            y1={GROUND_Y - 42}
            x2={NOZZLE_X}
            y2={nozzleY}
            className="stroke-line-strong"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle
            cx={NOZZLE_X}
            cy={nozzleY}
            r="4"
            className="fill-primary stroke-surface"
            strokeWidth="1.5"
          />

          {/* Height dimension, so the number and the picture cannot disagree. */}
          <g className="stroke-ink-subtle" strokeWidth="0.8" aria-hidden>
            <line
              x1={NOZZLE_X + 14}
              y1={nozzleY}
              x2={NOZZLE_X + 14}
              y2={GROUND_Y}
              strokeDasharray="3 3"
            />
            <line x1={NOZZLE_X + 10} y1={nozzleY} x2={NOZZLE_X + 18} y2={nozzleY} />
            <line x1={NOZZLE_X + 10} y1={GROUND_Y} x2={NOZZLE_X + 18} y2={GROUND_Y} />
          </g>
          <text
            x={NOZZLE_X + 21}
            y={(nozzleY + GROUND_Y) / 2}
            className="fill-ink-muted font-mono"
            fontSize="9"
            dominantBaseline="central"
            aria-hidden
          >
            {Math.round(nozzleHeightCm)} cm
          </text>
        </svg>
      </div>

      {/* The band width is the one thing here that is derived rather than set, so it is
          the one thing the caption still says. The advice that used to follow it — how a
          fixed cone turns height into width, what a high nozzle does in wind — described
          the diagram directly above it. The low-nozzle case is kept, because that one is
          a collision, not an explanation. */}
      <figcaption className="text-ink-muted text-xs">
        Sprays a band{' '}
        <span className="text-ink font-mono font-semibold tabular-nums">
          {bandWidthM.toFixed(2)} m
        </span>{' '}
        wide {arcDeg === 360 ? 'around the rig' : 'ahead of the rig'}.
        {nozzleHeightCm <= PLANT_H && (
          <span className="text-moderate-ink font-medium">
            {' '}
            Below the top of the crop: the nozzle will catch on plants.
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** A tomato plant at roughly the height one reaches mid-season. Scale reference only. */
function Plant({ x }: { x: number }) {
  return (
    <g className="stroke-line-strong" strokeWidth="1.2" fill="none" aria-hidden>
      <line x1={x} y1={GROUND_Y} x2={x} y2={GROUND_Y - PLANT_H} strokeLinecap="round" />
      <path d={`M ${x} ${GROUND_Y - 22} q -11 -5 -13 -15 q 11 1 13 12`} />
      <path d={`M ${x} ${GROUND_Y - 34} q 11 -5 13 -15 q -11 1 -13 12`} />
      <path d={`M ${x} ${GROUND_Y - 48} q -10 -4 -12 -13 q 10 1 12 11`} />
    </g>
  );
}
