'use client';

import type {
  ApiDetection,
  ApiFieldDetail,
  ApiMissionDetail,
  ApiRobotDetail,
} from '@agri/contracts';
import { Button, Card, CardHeader, cn, Eyebrow, Metric, SimulatedBadge } from '@agri/ui';
import { useState } from 'react';

import { TeleopBar } from '@/components/control/teleop-bar';
import { isFixtureMode } from '@/lib/data';
import { type LatLon, pointsOf } from '@/lib/geo';
import {
  drivingSecondsFor,
  formatDuration,
  missionInputFor,
  PLAN_PATTERN_ORDER,
  PLAN_PATTERNS,
  type PlanPattern,
  routeLengthM,
  waypointsFor,
  withWaypointAdded,
  withWaypointRemoved,
} from '@/lib/mission/plan';
import {
  averageLitresPerPlant,
  DEFAULT_SPRAYER_SETTINGS,
  type SprayerSettings,
  treatedDetectionIds,
} from '@/lib/mission/sprayer';

import { PlanMap } from './plan-map';
import { SprayerPanel } from './sprayer-panel';

/**
 * Mission Planner.
 *
 * Two modes that are genuinely different jobs, so the switch between them is a switch and
 * not a tab: in **autonomous** the operator describes a route and hands it over; in
 * **remote control** they drive it themselves. The sprayer belongs to both, because a
 * pesticide rig is armed the same way whoever is steering, so it sits beside the mode
 * rather than inside one of them.
 *
 * The route is computed from the field's real geometry — see lib/mission/plan.ts. It is a
 * preview: the backend expands snake and perimeter from the same PostGIS rows when the
 * mission is created, and only a custom route travels as explicit points.
 *
 * STUBBED: `POST /missions` and `cmd/mission` belong to the command service, which is
 * being built separately. Starting a mission is therefore refused with its reason. The
 * request that would be sent is shown instead of being faked — the plan is real and
 * type-checked against the contract, it simply has nowhere to go yet.
 */
export function MissionWorkspace({
  robot,
  field,
  detections,
  missions,
}: {
  robot: ApiRobotDetail;
  field: ApiFieldDetail;
  /** Plants the latest scouting run flagged, plus any an earlier run already treated. */
  detections: readonly ApiDetection[];
  /** Recorded missions, newest first. The source of every spray already on the ground. */
  missions: readonly ApiMissionDetail[];
}) {
  const [mode, setMode] = useState<'autonomous' | 'remote_control'>('autonomous');
  const [pattern, setPattern] = useState<PlanPattern>('snake');
  const [custom, setCustom] = useState<readonly LatLon[]>([]);
  const [speedMps, setSpeedMps] = useState(robot.active_config?.max_speed_mps ?? 0.8);
  const [autoSpray, setAutoSpray] = useState(false);
  const [sprayer, setSprayer] = useState<SprayerSettings>(DEFAULT_SPRAYER_SETTINGS);
  const [notice, setNotice] = useState<string | null>(null);

  const maxSpeed = robot.active_config?.max_speed_mps ?? 0.8;
  const waypoints = mode === 'autonomous' ? waypointsFor(pattern, field, custom) : [];
  const lengthM = routeLengthM(waypoints);

  const sprayEvents = missions.flatMap((mission) => mission.spray_events ?? []);
  const treatedIds = treatedDetectionIds(sprayEvents);
  const untreated = detections.filter((detection) => !treatedIds.has(detection.id));
  const perPlantLitres = averageLitresPerPlant(sprayEvents);

  const request = missionInputFor({
    robotId: robot.robot_id,
    fieldId: field.id,
    name: missionName(field.name, mode, pattern),
    mode,
    pattern,
    speedMps,
    autoSpray,
    waypoints,
  });

  function start() {
    if (mode === 'autonomous' && waypoints.length < 2) {
      setNotice('This route has nowhere to go yet. Add at least two points.');
      return;
    }
    // STUBBED: POST /missions then cmd/mission. Neither exists; a progress bar over a
    // command that was never published would be an animation of nothing.
    setNotice(
      isFixtureMode
        ? 'Not connected to a robot. This plan drives a real machine, so nothing was started or sent.'
        : 'The command service did not accept the mission.',
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold leading-tight">
            {field.name} · {field.crop}
          </h2>
          <p className="text-ink-muted text-sm">
            {field.row_count} rows · {field.area_hectares?.toFixed(2) ?? '—'} ha
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SimulatedBadge source={robot.source} />
          <ModeSwitch mode={mode} onChange={setMode} />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-3">
            <PlanMap
              field={field}
              waypoints={waypoints}
              detections={detections}
              treatedIds={treatedIds}
              sprayEvents={sprayEvents}
              editable={mode === 'autonomous' && pattern === 'custom'}
              onPickPoint={(point) => setCustom((points) => withWaypointAdded(points, point))}
              onRemoveWaypoint={(index) =>
                setCustom((points) => withWaypointRemoved(points, index))
              }
            />
            {/* Only custom mode keeps a caption. Tapping the field is the one affordance
                here that nothing on screen announces; how a snake route is derived, and
                what the map shows in remote control, are both visible in the map. */}
            {mode === 'autonomous' && pattern === 'custom' && (
              <p className="text-ink-muted text-xs">
                Tap the field to drop a point. Tap a numbered point to remove it.
              </p>
            )}
          </Card>

          {mode === 'autonomous' ? (
            <PlanPanel
              pattern={pattern}
              onPatternChange={setPattern}
              field={field}
              custom={custom}
              onCustomChange={setCustom}
              waypointCount={waypoints.length}
              lengthM={lengthM}
              speedMps={speedMps}
              onSpeedChange={setSpeedMps}
              maxSpeed={maxSpeed}
              autoSpray={autoSpray}
              untreatedCount={untreated.length}
              perPlantLitres={perPlantLitres}
              request={request}
              onStart={start}
              notice={notice}
            />
          ) : (
            <RemoteControlPanel maxSpeedMps={maxSpeed} distanceHint={robot.row} />
          )}
        </div>

        <div className="flex flex-col gap-4">
          <SprayerPanel
            settings={sprayer}
            onSettingsChange={setSprayer}
            autoSpray={autoSpray}
            onAutoSprayChange={setAutoSpray}
            flaggedCount={untreated.length}
            reported={null}
          />
          <MissionHistory missions={missions} />
        </div>
      </div>
    </div>
  );
}

/** The two modes, as one control. Which one is active decides what the whole left column
 *  is, so it is a switch rather than a pair of buttons that happen to be next to each other. */
function ModeSwitch({
  mode,
  onChange,
}: {
  mode: 'autonomous' | 'remote_control';
  onChange: (mode: 'autonomous' | 'remote_control') => void;
}) {
  const options = [
    { value: 'autonomous' as const, label: 'Autonomous' },
    { value: 'remote_control' as const, label: 'Remote control' },
  ];
  return (
    <div
      className="border-line-strong inline-flex rounded-sm border p-0.5"
      role="group"
      aria-label="Control mode"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={mode === option.value}
          className={cn(
            'rounded-xs focus-visible:outline-focus h-11 px-4 text-sm font-semibold',
            'motion-safe:duration-fast focus-visible:outline-2 motion-safe:transition-colors',
            mode === option.value ? 'bg-primary text-on-primary' : 'text-ink-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PlanPanel({
  pattern,
  onPatternChange,
  field,
  custom,
  onCustomChange,
  waypointCount,
  lengthM,
  speedMps,
  onSpeedChange,
  maxSpeed,
  autoSpray,
  untreatedCount,
  perPlantLitres,
  request,
  onStart,
  notice,
}: {
  pattern: PlanPattern;
  onPatternChange: (pattern: PlanPattern) => void;
  field: ApiFieldDetail;
  custom: readonly LatLon[];
  onCustomChange: (points: readonly LatLon[]) => void;
  waypointCount: number;
  lengthM: number;
  speedMps: number;
  onSpeedChange: (speed: number) => void;
  maxSpeed: number;
  autoSpray: boolean;
  untreatedCount: number;
  perPlantLitres: number | null;
  request: ReturnType<typeof missionInputFor>;
  onStart: () => void;
  notice: string | null;
}) {
  const driving = drivingSecondsFor(lengthM, speedMps);

  return (
    <Card className="flex flex-col">
      <CardHeader title="The route" eyebrow="Plan" />

      <div className="flex flex-col gap-4 px-4 pb-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Route pattern</legend>
          <div className="flex flex-wrap gap-2">
            {PLAN_PATTERN_ORDER.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onPatternChange(option)}
                aria-pressed={pattern === option}
                className={cn(
                  'focus-visible:outline-focus rounded-sm border px-3.5 py-2.5 text-sm font-medium',
                  'motion-safe:duration-fast focus-visible:outline-2 motion-safe:transition-colors',
                  pattern === option
                    ? 'bg-primary border-primary text-on-primary'
                    : 'bg-surface border-line-strong text-ink hover:bg-primary-soft',
                )}
              >
                {PLAN_PATTERNS[option].label}
              </button>
            ))}
          </div>
        </fieldset>

        {pattern === 'custom' && (
          <CustomRouteEditor field={field} points={custom} onChange={onCustomChange} />
        )}

        <div className="border-line grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
          <Metric label="Points" value={waypointCount} />
          <Metric label="Distance" value={Math.round(lengthM).toLocaleString()} unit="m" />
          <Metric label="Driving" value={formatDuration(driving)} />
          {/* The litre estimate is a number, so it is shown as one rather than described
              in a sentence underneath. With auto-spray off there is nothing to treat and
              the dash says so. */}
          <Metric
            label="To treat"
            value={autoSpray ? untreatedCount : '—'}
            {...(autoSpray ? { unit: 'plants' } : {})}
            {...(autoSpray && perPlantLitres
              ? { hint: `≈ ${(untreatedCount * perPlantLitres).toFixed(1)} L` }
              : {})}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="mission-speed" className="font-medium">
              Driving speed
            </label>
            <span aria-hidden className="font-mono text-base font-semibold tabular-nums">
              {speedMps.toFixed(2)} m/s
            </span>
          </div>
          <input
            id="mission-speed"
            type="range"
            min={0.1}
            max={maxSpeed}
            step={0.05}
            value={speedMps}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
            aria-valuetext={`${speedMps.toFixed(2)} metres per second`}
            className="accent-primary focus-visible:outline-focus h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </div>

        <div className="border-line flex flex-wrap items-center gap-3 border-t pt-4">
          <Button variant="primary" onClick={onStart}>
            Start the mission
          </Button>
          <p className="text-ink-muted text-sm">
            The robot drives itself. Keep everyone clear of the field.
          </p>
        </div>

        {notice && (
          <p role="alert" className="text-critical-ink text-sm">
            {notice}
          </p>
        )}

        <details className="border-line rounded-sm border">
          <summary className="focus-visible:outline-focus cursor-pointer px-3 py-2 text-sm font-medium focus-visible:outline-2">
            The request this would send
          </summary>
          {/* Shown because the backend is being written separately and this is the exact
              body it has to accept — POST /api/v1/missions, typed as MissionInput. */}
          <pre className="border-line text-ink-muted overflow-x-auto border-t px-3 py-2 font-mono text-xs">
            {JSON.stringify(request, null, 2)}
          </pre>
        </details>
      </div>
    </Card>
  );
}

/**
 * Building a route by hand.
 *
 * Tapping the map is the fast way and it is pointer-only, so the same route can be built
 * from the keyboard here: every row has a south and a north end, which is where a route
 * turns anyway. The list is the authoritative view of the order — the map numbers agree
 * with it — and each point can be removed from either.
 */
function CustomRouteEditor({
  field,
  points,
  onChange,
}: {
  field: ApiFieldDetail;
  points: readonly LatLon[];
  onChange: (points: readonly LatLon[]) => void;
}) {
  const rows = [...(field.rows ?? [])].sort((a, b) => a.row_number - b.row_number);
  const [rowNumber, setRowNumber] = useState(rows[0]?.row_number ?? 1);

  function addEnd(which: 'south' | 'north') {
    const row = rows.find((candidate) => candidate.row_number === rowNumber);
    if (!row) return;
    const path = pointsOf(row.path.coordinates);
    // Rows are stored running south to north, so the ends are the first and last vertex.
    const end = which === 'south' ? path[0] : path[path.length - 1];
    if (end) onChange(withWaypointAdded(points, end));
  }

  return (
    <div className="border-line flex flex-col gap-3 border-t pt-4">
      <Eyebrow>Points</Eyebrow>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="waypoint-row" className="text-sm font-medium">
            Row
          </label>
          <select
            id="waypoint-row"
            value={rowNumber}
            onChange={(event) => setRowNumber(Number(event.target.value))}
            className="border-line-strong bg-surface text-ink focus-visible:outline-focus h-11 rounded-sm border px-2.5 text-sm focus-visible:outline-2"
          >
            {rows.map((row) => (
              <option key={row.row_number} value={row.row_number}>
                Row {row.row_number}
              </option>
            ))}
          </select>
        </div>
        <Button variant="secondary" onClick={() => addEnd('south')}>
          Add south end
        </Button>
        <Button variant="secondary" onClick={() => addEnd('north')}>
          Add north end
        </Button>
        {points.length > 0 && (
          <Button variant="ghost" onClick={() => onChange([])}>
            Clear all
          </Button>
        )}
      </div>

      {points.length === 0 ? (
        <p className="text-ink-muted text-sm">No points yet. Two at least.</p>
      ) : (
        <ol className="divide-line divide-y text-sm" aria-label="Route points in order">
          {points.map((point, index) => (
            <li
              key={`${point.lat},${point.lon},${index}`}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <span className="font-mono tabular-nums">
                {index + 1}. {point.lat.toFixed(6)}, {point.lon.toFixed(6)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange(withWaypointRemoved(points, index))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Driving it yourself.
 *
 * STUBBED: heading and distance driven both come from `pose`, which is a WebSocket
 * channel with no gateway behind it. They are shown as not reported rather than as zero —
 * a heading of 0° is north, not "unknown", and a distance of 0 m would say the robot has
 * not moved.
 */
function RemoteControlPanel({
  maxSpeedMps,
  distanceHint,
}: {
  maxSpeedMps: number;
  distanceHint: number | null | undefined;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader title="Drive it yourself" eyebrow="Remote control" />

      <div className="flex flex-col gap-4 px-4 pb-4">
        <TeleopBar maxSpeedMps={maxSpeedMps} className="border-line-strong" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Metric label="Heading" value="—" />
          <Metric label="Distance driven" value="—" />
          <Metric label="Row" value={distanceHint ?? '—'} />
        </div>

      </div>
    </Card>
  );
}

function MissionHistory({ missions }: { missions: readonly ApiMissionDetail[] }) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Recorded missions"
        eyebrow="History"
        action={
          <span className="text-ink-muted font-mono text-xs tabular-nums">{missions.length}</span>
        }
      />
      {missions.length === 0 ? (
        <p className="text-ink-muted px-4 pb-4 text-sm">Nothing has been run in this field yet.</p>
      ) : (
        <ul className="divide-line divide-y">
          {missions.map((mission) => {
            const sprays = mission.spray_events?.length ?? 0;
            const litres = (mission.spray_events ?? []).reduce(
              (sum, event) => sum + event.litres,
              0,
            );
            return (
              <li key={mission.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{mission.name}</span>
                  <span className="text-ink-muted text-xs">
                    {mission.mode === 'autonomous' ? 'Autonomous' : 'Remote control'}
                  </span>
                </div>
                <p className="text-ink-muted text-sm">
                  {mission.status} ·{' '}
                  <span className="font-mono tabular-nums">
                    {(mission.distance_travelled_m ?? 0).toFixed(0)} m
                  </span>
                  {sprays > 0 && (
                    <>
                      {' · '}
                      <span className="font-mono tabular-nums">{sprays}</span> plants treated with{' '}
                      <span className="font-mono tabular-nums">{litres.toFixed(2)} L</span>
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function missionName(
  fieldName: string,
  mode: 'autonomous' | 'remote_control',
  pattern: PlanPattern,
) {
  if (mode === 'remote_control') return `${fieldName} manual drive`;
  if (pattern === 'snake') return `${fieldName} full coverage`;
  if (pattern === 'perimeter') return `${fieldName} boundary lap`;
  return `${fieldName} custom route`;
}
