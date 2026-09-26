'use client';

import type { ApiFieldDetail, ApiRobotDetail } from '@agri/contracts';
import { Button, Card, CardHeader, SimulatedBadge } from '@agri/ui';
import { useState } from 'react';

import { isFixtureMode } from '@/lib/data';
import { latestPerCamera, type RunReport } from '@/lib/scout/report';

import { TeleopBar } from '../control/teleop-bar';

import { CameraFeed, type CameraSensor } from './camera-feed';
import { DetectionLog } from './detection-log';
import { FieldMap } from './field-map';
import { ReportPanel } from './report-panel';

/**
 * Crop Scout.
 *
 * The layout is the job: cameras on the sides because that is where the robot's eyes
 * are, the map between them because that is where the robot is, the log down the right
 * because it accumulates, and the teleop bar across the bottom under the thumbs. On a
 * phone it stacks — the brief optimises this app for tablet and desktop, but a stacked
 * column still works and losing the app entirely on a phone would be worse.
 *
 * One selection is shared by all three views. This component holds it and nothing else.
 */
export function ScoutWorkspace({
  robot,
  field,
  report,
}: {
  robot: ApiRobotDetail;
  field: ApiFieldDetail;
  report: RunReport;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scoutNotice, setScoutNotice] = useState<string | null>(null);

  const newest = latestPerCamera(report.detections);
  const sensors = robot.sensors ?? [];
  const cameraSensor = (side: 'left' | 'right'): CameraSensor | null =>
    sensors.find((s) => s.sensor === `camera_${side}`) ?? null;

  const maxSpeed = robot.active_config?.max_speed_mps ?? 0.8;

  // STUBBED pose. The real one arrives on the `pose` channel, which is not running; this
  // is a stand-in on the row the robot last reported, so the map has a machine on it.
  // Labelled as simulated everywhere it appears — see FieldMap.
  const simulatedPose = robot.row != null ? { row: robot.row, along: 0.55 } : null;

  function startScouting() {
    // STUBBED: an autonomous run is a `cmd/mission` with pattern "snake", published by
    // the command service. Refusing with the reason is the only honest response until
    // that service exists — a progress bar here would be an animation of nothing.
    setScoutNotice(
      isFixtureMode
        ? 'Not connected to a robot. A scouting run drives a real machine, so nothing was started.'
        : 'The command service did not accept the run.',
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
            {field.row_count} rows
            {report.run && (
              <>
                {' · last run '}
                <time dateTime={report.run.started_at} className="font-mono">
                  {new Date(report.run.started_at).toLocaleString([], {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {report.run && <SimulatedBadge source={report.run.source} />}
          <Button variant="primary" onClick={startScouting}>
            Start scouting
          </Button>
        </div>
        {scoutNotice && (
          <p role="alert" className="text-critical-ink basis-full text-sm">
            {scoutNotice}
          </p>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
        <CameraFeed
          side="left"
          detection={newest.left}
          sensor={cameraSensor('left')}
          selected={newest.left?.id === selectedId}
          onSelect={setSelectedId}
        />

        <Card className="flex flex-col gap-2 p-3 xl:order-none">
          <FieldMap
            field={field}
            detections={report.detections}
            selectedId={selectedId}
            onSelect={setSelectedId}
            reportedRow={robot.row ?? null}
            simulatedPose={simulatedPose}
          />
        </Card>

        <CameraFeed
          side="right"
          detection={newest.right}
          sensor={cameraSensor('right')}
          selected={newest.right?.id === selectedId}
          onSelect={setSelectedId}
        />
      </div>

      <TeleopBar maxSpeedMps={maxSpeed} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ReportPanel report={report} />

        <Card className="flex max-h-[28rem] flex-col">
          <CardHeader
            title="Detections"
            eyebrow="Log"
            action={
              <span className="text-ink-muted font-mono text-xs tabular-nums">
                {report.detections.length}
              </span>
            }
          />
          <DetectionLog
            detections={report.detections}
            selectedId={selectedId}
            onSelect={setSelectedId}
            className="border-line min-h-0 flex-1 border-t"
          />
        </Card>
      </div>
    </div>
  );
}
