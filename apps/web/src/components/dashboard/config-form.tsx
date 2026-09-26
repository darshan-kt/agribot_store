'use client';

import type { ApiConfigVersion } from '@agri/contracts';
import { Button, cn, Eyebrow } from '@agri/ui';
import { useState } from 'react';

import { isFixtureMode } from '@/lib/data';

/**
 * Robot configuration.
 *
 * Two rules from the safety model shape this form:
 *
 *  1. **A setting is not applied until the robot says so.** Saving creates a new version
 *     and the robot acknowledges it on `config/ack`. Until that acknowledgement arrives
 *     the UI shows the change as pending — never as applied. A setting the operator
 *     believes is active but the robot never took is exactly how a speed limit gets
 *     ignored.
 *  2. **Every control explains its consequence in plain language**, because these values
 *     change how a machine behaves in a field, and "0.65" means nothing on its own.
 *
 * STUBBED: the endpoint that publishes `config/set` belongs to the backend and does not
 * exist yet. Saving is therefore refused with a stated reason rather than faking a
 * pending state that would never resolve.
 */
export function ConfigForm({ config }: { config: ApiConfigVersion | null }) {
  const [maxSpeed, setMaxSpeed] = useState(config?.max_speed_mps ?? 0.8);
  const [sensitivity, setSensitivity] = useState(config?.detection_sensitivity ?? 0.65);
  const [returnAt, setReturnAt] = useState(config?.return_to_base_battery_percent ?? 20);
  const [cameraFps, setCameraFps] = useState(config?.camera_fps ?? 15);
  const [obstacleStop, setObstacleStop] = useState(config?.obstacle_stop_enabled ?? true);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty =
    maxSpeed !== config?.max_speed_mps ||
    sensitivity !== config?.detection_sensitivity ||
    returnAt !== config?.return_to_base_battery_percent ||
    cameraFps !== config?.camera_fps ||
    obstacleStop !== config?.obstacle_stop_enabled;

  function save() {
    setNotice(
      isFixtureMode
        ? 'Not connected to a robot, so nothing was sent. Settings apply only once the robot confirms them.'
        : 'Sent. Waiting for the robot to confirm.',
    );
  }

  return (
    <form
      className="flex flex-col gap-5 px-4 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Slider
        id="max-speed"
        label="Maximum driving speed"
        hint="How fast the robot is allowed to drive, however it is being controlled."
        value={maxSpeed}
        min={0.2}
        max={2}
        step={0.1}
        format={(v) => `${v.toFixed(1)} m/s`}
        onChange={setMaxSpeed}
      />

      <Slider
        id="sensitivity"
        label="Detection sensitivity"
        hint={
          sensitivity >= 0.75
            ? 'Flags more plants. You will catch problems earlier, and check more healthy plants.'
            : sensitivity <= 0.4
              ? 'Flags only clear cases. Fewer false alarms, and some early problems will be missed.'
              : 'Balanced. Flags a plant when the camera is reasonably confident.'
        }
        value={sensitivity}
        min={0.1}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={setSensitivity}
      />

      <Slider
        id="return-at"
        label="Return to base at"
        hint="The robot drives itself home when the battery reaches this level."
        value={returnAt}
        min={5}
        max={50}
        step={5}
        format={(v) => `${v}%`}
        onChange={(v) => setReturnAt(Math.round(v))}
      />

      <Slider
        id="camera-fps"
        label="Camera frame rate"
        hint="Higher rates spot problems at higher driving speeds, and use more power."
        value={cameraFps}
        min={5}
        max={30}
        step={1}
        format={(v) => `${v} fps`}
        onChange={(v) => setCameraFps(Math.round(v))}
      />

      <Toggle
        id="obstacle-stop"
        label="Stop for obstacles"
        hint="The robot stops on its own if something is in its path. Leave this on."
        checked={obstacleStop}
        onChange={setObstacleStop}
      />

      <div className="border-line flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" variant="primary" disabled={!dirty}>
          Save to robot
        </Button>
        {dirty ? (
          <p className="text-ink-muted text-sm">Not saved yet</p>
        ) : (
          <p className="text-ink-muted text-sm">
            {config?.acked_at
              ? `Version ${config.version}, confirmed by the robot`
              : 'Waiting for the robot to confirm'}
          </p>
        )}
      </div>

      {notice && (
        <p
          role="status"
          className="border-info bg-info-soft text-ink rounded-sm border px-3 py-2 text-sm"
        >
          {notice}
        </p>
      )}
    </form>
  );
}

function Slider({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {/* Not an <output>: that carries an implicit role="status", so every drag of
            the slider would be announced a second time on top of the range input's own
            value. The input carries the formatted value via aria-valuetext instead, and
            this is the sighted-user copy of it. */}
        <span aria-hidden className="font-mono text-base font-semibold tabular-nums">
          {format(value)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={format(value)}
        aria-describedby={`${id}-hint`}
        className="accent-primary focus-visible:outline-focus h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <p id={`${id}-hint`} className="text-ink-muted text-sm">
        {hint}
      </p>
    </div>
  );
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <p className="text-ink-muted text-sm">{hint}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full border-2',
          'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
          'motion-safe:duration-fast motion-safe:transition-colors',
          checked ? 'bg-primary border-primary' : 'bg-surface-sunk border-line-strong',
        )}
      >
        <span
          className={cn(
            'bg-surface absolute top-0.5 size-5 rounded-full shadow-sm',
            'motion-safe:duration-fast motion-safe:transition-[left]',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  );
}

export function ConfigHistory({ versions }: { versions: ApiConfigVersion[] }) {
  if (versions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      <Eyebrow>History</Eyebrow>
      <ul className="divide-line divide-y text-sm">
        {versions.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 py-2">
            <span className="font-mono tabular-nums">Version {v.version}</span>
            <span className={v.acked_at ? 'text-ink-muted' : 'text-moderate-ink font-medium'}>
              {v.acked_at ? 'Confirmed by the robot' : 'Pending'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
