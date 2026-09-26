'use client';

import type { SprayerState } from '@agri/contracts';
import { Button, Card, CardHeader, cn, Eyebrow } from '@agri/ui';
import { useState } from 'react';

import {
  ARC_LABEL,
  ARC_OPTIONS,
  blockingReason,
  canSpray,
  clampFlow,
  clampNozzleHeight,
  FLOW_MAX_LPM,
  type InterlockView,
  interlockViews,
  NOZZLE_MAX_CM,
  NOZZLE_MIN_CM,
  type SprayerSettings,
  tankView,
} from '@/lib/mission/sprayer';

import { RigIllustration } from './rig-illustration';

/**
 * The sprayer.
 *
 * Every control here ends at a pesticide valve, so the panel is built around the
 * interlock chain rather than around the settings. The hold-to-spray button is enabled
 * only when the robot has reported all five interlocks satisfied; anything else — one
 * blocked, or simply never reported — disables it and prints the single reason why.
 *
 * Arming takes two deliberate actions, and the second one says what it is arming. A
 * one-tap toggle next to a nozzle slider is a valve opened by a brushed sleeve.
 *
 * STUBBED, and stated on screen: the sprayer's state arrives on the `sprayer` WebSocket
 * channel and its commands go out through the command service. Neither exists yet, so
 * nothing here is armed, the tank level is unknown, and every interlock reads "the robot
 * has not reported". That is the truth, and it is also the safe reading: an unreported
 * interlock is not a satisfied one, so the spray button stays disabled rather than
 * offering to open a valve nobody has checked.
 */
export function SprayerPanel({
  settings,
  onSettingsChange,
  autoSpray,
  onAutoSprayChange,
  flaggedCount,
  reported,
  className,
}: {
  settings: SprayerSettings;
  onSettingsChange: (settings: SprayerSettings) => void;
  /** Part of the mission, not of the sprayer: spray flagged plants during the run. */
  autoSpray: boolean;
  onAutoSprayChange: (value: boolean) => void;
  /** Plants the last scouting run flagged — what auto-spray would treat. */
  flaggedCount: number;
  /** The robot's own sprayer state. Null until the robot connection exists. */
  reported: SprayerState | null;
  className?: string;
}) {
  const [confirmingArm, setConfirmingArm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const interlocks = interlockViews(reported);
  const ready = canSpray(interlocks);
  const blocked = blockingReason(interlocks, reported);
  const tank = tankView(reported);
  const armed = reported?.armed ?? false;

  function requestArm() {
    setNotice(null);
    setConfirmingArm(true);
  }

  function confirmArm() {
    setConfirmingArm(false);
    // STUBBED: `cmd/sprayer` with action "arm" goes through the command service, which
    // does not exist. Refusing with the reason is the only honest answer — showing the
    // switch as armed would mean the operator believes a valve is live when it is not.
    setNotice('Not connected to a robot. The sprayer was not armed and nothing was sent.');
  }

  function disarm() {
    setConfirmingArm(false);
    setNotice('Not connected to a robot. There is nothing armed to disarm.');
  }

  function refill() {
    setNotice(
      'Refilling is recorded on the robot once the tank is filled. Nothing was sent — the robot connection is not running.',
    );
  }

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Sprayer"
        eyebrow="Pesticide"
        action={
          <span
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-semibold',
              armed
                ? 'border-danger bg-critical-soft text-critical-ink'
                : 'border-line text-ink-muted',
            )}
          >
            {armed ? 'Armed' : 'Not armed'}
          </span>
        }
      />

      <div className="flex flex-col gap-5 px-4 pb-4">
        <div className="flex flex-col gap-2">
          {armed ? (
            <Button variant="danger" onClick={disarm}>
              Disarm the sprayer
            </Button>
          ) : confirmingArm ? (
            <div className="border-danger bg-critical-soft flex flex-col gap-2 rounded-sm border px-3 py-2.5">
              <p className="text-ink text-sm">
                Arming opens the pesticide valve to the robot&rsquo;s control. It will spray when a
                mission or the hold button tells it to. Everyone must be clear of the rig.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" onClick={confirmArm}>
                  Yes, arm it
                </Button>
                <Button variant="secondary" onClick={() => setConfirmingArm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={requestArm}>
              Arm the sprayer
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Eyebrow>Nozzle</Eyebrow>
          <RigIllustration
            nozzleHeightCm={settings.nozzleHeightCm}
            arcDeg={settings.arcDeg}
            spraying={reported?.spraying ?? false}
          />
          <Slider
            id="nozzle-height"
            label="Nozzle height"
            value={settings.nozzleHeightCm}
            min={NOZZLE_MIN_CM}
            max={NOZZLE_MAX_CM}
            step={1}
            format={(v) => `${Math.round(v)} cm`}
            onChange={(v) =>
              onSettingsChange({ ...settings, nozzleHeightCm: clampNozzleHeight(v) })
            }
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-ink-subtle text-xs font-semibold uppercase tracking-[0.08em]">
            Spray rotation
          </legend>
          <div className="border-line inline-flex w-fit rounded-sm border p-0.5" role="group">
            {ARC_OPTIONS.map((arc) => (
              <button
                key={arc}
                type="button"
                onClick={() => onSettingsChange({ ...settings, arcDeg: arc })}
                aria-pressed={settings.arcDeg === arc}
                className={cn(
                  'rounded-xs focus-visible:outline-focus h-11 px-4 text-sm font-medium',
                  'motion-safe:duration-fast focus-visible:outline-2 motion-safe:transition-colors',
                  settings.arcDeg === arc
                    ? 'bg-primary text-on-primary'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                {arc}° {ARC_LABEL[arc].label.toLowerCase()}
              </button>
            ))}
          </div>
        </fieldset>

        <Slider
          id="flow-rate"
          label="Flow rate"
          value={settings.flowLpm}
          min={0.2}
          max={FLOW_MAX_LPM}
          step={0.1}
          format={(v) => `${v.toFixed(1)} L/min`}
          onChange={(v) => onSettingsChange({ ...settings, flowLpm: clampFlow(v) })}
        />

        <TankGauge tank={tank} onRefill={refill} />

        <div className="border-line flex flex-col gap-3 border-t pt-4">
          <Eyebrow>Interlocks</Eyebrow>
          <InterlockList views={interlocks} />
        </div>

        <div className="flex flex-col gap-2">
          <HoldToSpray enabled={ready} flowLpm={settings.flowLpm} />
          {!ready && blocked && (
            <p role="status" className="text-ink-muted text-sm">
              <span className="text-ink font-semibold">Will not spray.</span> {blocked}
            </p>
          )}
        </div>

        <div className="border-line flex items-start justify-between gap-4 border-t pt-4">
          <div className="flex flex-col gap-0.5">
            <label htmlFor="auto-spray" className="font-medium">
              Treat flagged plants during the mission
            </label>
            <p className="text-ink-muted text-sm">
              {flaggedCount > 0 ? `${flaggedCount} flagged in this field` : 'Nothing flagged'}
            </p>
          </div>
          <Toggle id="auto-spray" checked={autoSpray} onChange={onAutoSprayChange} />
        </div>

        {notice && (
          <p
            role="alert"
            className="border-line bg-surface-sunk text-ink rounded-sm border px-3 py-2 text-sm"
          >
            {notice}
          </p>
        )}
      </div>
    </Card>
  );
}

/**
 * Hold to spray.
 *
 * Pointer events, not click: the valve is open for exactly as long as the button is held,
 * and `setPointerCapture` means a thumb sliding off the edge still ends in a release. The
 * same reasoning as the teleop D-pad, for a more consequential actuator.
 */
function HoldToSpray({ enabled, flowLpm }: { enabled: boolean; flowLpm: number }) {
  const [holding, setHolding] = useState(false);

  return (
    <button
      type="button"
      disabled={!enabled}
      aria-pressed={holding}
      onPointerDown={(event) => {
        if (!enabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setHolding(true);
      }}
      onPointerUp={() => setHolding(false)}
      onPointerCancel={() => setHolding(false)}
      onBlur={() => setHolding(false)}
      onKeyDown={(event) => {
        if (enabled && (event.key === 'Enter' || event.key === ' ')) setHolding(true);
      }}
      onKeyUp={(event) => {
        if (event.key === 'Enter' || event.key === ' ') setHolding(false);
      }}
      className={cn(
        'h-13 focus-visible:outline-focus flex w-full items-center justify-center rounded-sm border text-lg font-semibold',
        'touch-none select-none focus-visible:outline-2 focus-visible:outline-offset-2',
        'motion-safe:duration-fast motion-safe:transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        holding
          ? 'bg-danger border-danger text-on-critical'
          : 'bg-surface border-line-strong text-ink',
      )}
    >
      {holding ? `Spraying at ${flowLpm.toFixed(1)} L/min` : 'Hold to spray'}
    </button>
  );
}

function InterlockList({ views }: { views: readonly InterlockView[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {views.map((view) => (
        <li key={view.key} className="flex items-start gap-2.5">
          <InterlockMark state={view.state} />
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">{view.label}</span>
            {/* Only a blocked interlock explains itself. "Not reported" is already on the
                mark beside it, and five rows repeating it was five sentences saying what
                five icons had just said. A block is different: it names what to go fix. */}
            {view.state === 'blocked' && (
              <span className="text-ink-muted text-sm">{view.detail}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The state of one interlock, as a shape and not only a colour.
 *
 * Three states need three marks: a tick, a cross, and a question. Two of them being red
 * would be enough for a sighted operator to tell them apart and not enough for anyone
 * else — and "unknown" and "blocked" have different remedies.
 */
function InterlockMark({ state }: { state: InterlockView['state'] }) {
  const label = state === 'ok' ? 'Satisfied' : state === 'blocked' ? 'Blocked' : 'Not reported';
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        'size-4.5 text-2xs mt-0.5 flex shrink-0 items-center justify-center rounded-full border font-bold',
        state === 'ok' && 'border-primary bg-primary text-on-primary',
        state === 'blocked' && 'border-danger bg-danger text-on-critical',
        state === 'unknown' && 'border-line-strong text-ink-subtle',
      )}
    >
      {state === 'ok' ? '✓' : state === 'blocked' ? '✕' : '?'}
    </span>
  );
}

function TankGauge({
  tank,
  onRefill,
}: {
  tank: ReturnType<typeof tankView>;
  onRefill: () => void;
}) {
  const percent = tank.fraction === null ? null : Math.round(tank.fraction * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>Tank</Eyebrow>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {tank.litres !== null && tank.capacityLitres !== null
            ? `${tank.litres.toFixed(1)} / ${tank.capacityLitres.toFixed(0)} L`
            : 'Not reported'}
        </span>
      </div>

      {/* A meter must carry a value, and an unreported tank has none to carry. Rather
          than invent a zero — which would read as "empty", the one state this must never
          claim wrongly — the bar drops the role and becomes what it is: an empty trough
          next to the words "Not reported". */}
      <div
        className="bg-surface-sunk border-line h-3 w-full overflow-hidden rounded-full border"
        {...(percent === null
          ? { role: 'presentation' as const }
          : {
              role: 'meter' as const,
              'aria-valuenow': percent,
              'aria-valuemin': 0,
              'aria-valuemax': 100,
              'aria-valuetext': `${percent}% full`,
              'aria-label': 'Tank level',
            })}
      >
        {percent !== null && (
          <div
            className={cn(
              'h-full rounded-full',
              tank.status === 'empty' && 'bg-danger',
              tank.status === 'low' && 'bg-moderate',
              tank.status === 'ok' && 'bg-info',
            )}
            style={{ width: `${percent}%` }}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* A low or empty tank is a warning and keeps its sentence. "Not reported" and
            "fine" are already legible in the reading above, so they do not get one. */}
        {(tank.status === 'empty' || tank.status === 'low') && (
          <p
            className={cn(
              'text-sm font-medium',
              tank.status === 'empty' ? 'text-critical-ink' : 'text-moderate-ink',
            )}
          >
            {tank.message}
          </p>
        )}
        <Button size="sm" variant="secondary" onClick={onRefill}>
          Mark as refilled
        </Button>
      </div>
    </div>
  );
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  id: string;
  label: string;
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
        {/* Not an <output>: that carries an implicit role="status", so every drag would
            be announced on top of the range input's own value. */}
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
        className="accent-primary focus-visible:outline-focus h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2"
      />
    </div>
  );
}

function Toggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
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
  );
}
