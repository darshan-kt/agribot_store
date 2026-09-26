'use client';

import type { SpeedMode } from '@agri/contracts';
import { cn } from '@agri/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEADMAN_MS,
  type Direction,
  directionForKey,
  dpsToRads,
  isStopKey,
  isStopped,
  MAX_TURN_RADS,
  modeForLinear,
  shouldHandleKey,
  SPEED_MODES,
  STOPPED,
  TELEOP_INTERVAL_MS,
  TELEOP_HZ,
  type Velocity,
  velocityForLimits,
} from '@/lib/control/teleop';

/**
 * Driving the robot.
 *
 * The keyboard and the D-pad are the same control: both feed one set of held directions,
 * so a key held while a button is pressed cannot leave a direction latched when only one
 * of them is released.
 *
 * STUBBED: `onCommand` is the wiring point for the WebSocket `command` op, and no
 * gateway answers it yet. When it is absent the bar still resolves a velocity — the
 * controls mean something regardless — but the repeat loop does not run, because its
 * only purpose is to send, and it says in plain words that nothing is reaching a robot.
 * It does not animate a moving machine.
 */
export function TeleopBar({
  maxSpeedMps,
  onCommand,
  className,
}: {
  /** The robot's configured maximum. The speed limit is clamped to it, never above it. */
  maxSpeedMps: number;
  /** Publishes `cmd/teleop`. Absent until the command service exists. */
  onCommand?: (velocity: Velocity, mode: SpeedMode) => void;
  className?: string;
}) {
  // Start where the old "Normal" preset sat, so the default driving feel is unchanged.
  // Snapped to the slider's own step: 0.7 x 0.8 is 0.5600000000000001 in binary floating
  // point, and a control that opens on an unreachable value cannot be dragged back to it.
  const [linearLimit, setLinearLimit] = useState(() =>
    snap(SPEED_MODES.normal.fraction * maxSpeedMps),
  );
  const [angularLimit, setAngularLimit] = useState(() =>
    snap(SPEED_MODES.normal.fraction * MAX_TURN_RADS),
  );
  const [held, setHeld] = useState<ReadonlySet<Direction>>(() => new Set());
  const [stoppedNotice, setStoppedNotice] = useState(false);

  const velocity = velocityForLimits(
    held,
    { linear_mps: linearLimit, angular_rads: angularLimit },
    maxSpeedMps,
  );
  const mode = modeForLinear(linearLimit, maxSpeedMps);
  const moving = !isStopped(velocity);

  const press = useCallback((direction: Direction) => {
    setStoppedNotice(false);
    setHeld((current) => {
      if (current.has(direction)) return current;
      const next = new Set(current);
      next.add(direction);
      return next;
    });
  }, []);

  const release = useCallback((direction: Direction) => {
    setHeld((current) => {
      if (!current.has(direction)) return current;
      const next = new Set(current);
      next.delete(direction);
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    setHeld((current) => (current.size === 0 ? current : new Set()));
    setStoppedNotice(true);
  }, []);

  // Keyboard. Bound to the window rather than to a focused element: an operator watching
  // the camera panels has not clicked the D-pad, and a control that only works when it
  // happens to hold focus is a control that fails at the moment it is needed.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!shouldHandleKey(event)) return;
      if (isStopKey(event.key)) {
        event.preventDefault();
        stop();
        return;
      }
      const direction = directionForKey(event.key);
      if (!direction) return;
      // Arrows scroll and repeat; neither is wanted while driving.
      event.preventDefault();
      if (event.repeat) return;
      press(direction);
    }

    function onKeyUp(event: KeyboardEvent) {
      const direction = directionForKey(event.key);
      if (direction) release(direction);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [press, release, stop]);

  // Anything that means the operator is no longer watching releases every direction: a
  // switched tab, a lost focus, a keyup that landed in another window. The robot-side
  // deadman is what actually guarantees the stop, but there is no reason to keep asking
  // for movement nobody is looking at.
  useEffect(() => {
    function releaseAll() {
      setHeld((current) => (current.size === 0 ? current : new Set()));
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') releaseAll();
    }
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // The repeat loop. Held directions are resent at TELEOP_HZ so the robot's deadman keeps
  // being fed, and one final zero goes out on release so the machine stops on the command
  // rather than on the timeout.
  const wasMoving = useRef(false);
  const { linear_mps, angular_dps } = velocity;
  useEffect(() => {
    if (!onCommand) return;

    const command: Velocity = { linear_mps, angular_dps };
    if (isStopped(command)) {
      if (wasMoving.current) {
        wasMoving.current = false;
        onCommand(STOPPED, mode);
      }
      return;
    }

    wasMoving.current = true;
    onCommand(command, mode);
    const timer = setInterval(() => onCommand(command, mode), TELEOP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [onCommand, linear_mps, angular_dps, mode]);

  return (
    <section
      className={cn('border-line bg-surface rounded-md border', className)}
      aria-label="Drive the robot"
    >
      {/* Three columns at width: what the robot is allowed to do, the thing you drive it
          with, and what it reports back. The pad is the middle one on purpose — it is the
          control the hands go to, and it stays put while the panels either side change. */}
      <div className="grid gap-x-6 gap-y-5 px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
        <div className="flex flex-col gap-3.5">
          <LimitSlider
            label="Speed"
            value={linearLimit}
            onChange={setLinearLimit}
            max={maxSpeedMps}
            step={LIMIT_STEP}
            unit="m/s"
          />
          <LimitSlider
            label="Rotation"
            value={angularLimit}
            onChange={setAngularLimit}
            max={snapFloor(MAX_TURN_RADS)}
            step={LIMIT_STEP}
            unit="rad/s"
          />
        </div>

        <div className="flex justify-center">
          <DPad held={held} onPress={press} onRelease={release} onStop={stop} />
        </div>

        <CurrentReadout velocity={velocity} moving={moving} />
      </div>

      <p role="status" className="border-line text-ink-muted border-t px-4 py-2 text-xs">
        {onCommand ? (
          <>
            Sending {TELEOP_HZ} times a second while held. The robot stops on its own if it hears
            nothing for {DEADMAN_MS} ms.
          </>
        ) : (
          <>
            <span className="text-critical-ink font-semibold">Not connected to a robot.</span> These
            controls resolve a speed but nothing is being sent — the command service is not running
            yet.
            {stoppedNotice && ' Directions released.'}
          </>
        )}
      </p>
    </section>
  );
}

/**
 * The D-pad.
 *
 * Pointer events rather than click, because a direction is *held*. `setPointerCapture`
 * keeps the release on the button the press started on, so sliding a thumb off the edge
 * of a button on a tablet still ends in a stop rather than a latched direction.
 */
function DPad({
  held,
  onPress,
  onRelease,
  onStop,
}: {
  held: ReadonlySet<Direction>;
  onPress: (d: Direction) => void;
  onRelease: (d: Direction) => void;
  onStop: () => void;
}) {
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-1">
      <PadButton direction="forward" label="Forward" held={held} {...{ onPress, onRelease }} />
      <PadButton direction="left" label="Turn left" held={held} {...{ onPress, onRelease }} />
      <button
        type="button"
        onClick={onStop}
        className={cn(
          'bg-surface-sunk border-line-strong text-ink col-start-2 row-start-2 rounded-sm border',
          'size-touch focus-visible:outline-focus text-xs font-semibold',
          'motion-safe:duration-fast hover:bg-line focus-visible:outline-2 motion-safe:transition-colors',
        )}
      >
        Stop
      </button>
      <PadButton direction="right" label="Turn right" held={held} {...{ onPress, onRelease }} />
      <PadButton direction="back" label="Reverse" held={held} {...{ onPress, onRelease }} />
    </div>
  );
}

const PAD_POSITION: Record<Direction, string> = {
  forward: 'col-start-2 row-start-1',
  left: 'col-start-1 row-start-2',
  right: 'col-start-3 row-start-2',
  back: 'col-start-2 row-start-3',
};

const PAD_ARROW: Record<Direction, string> = {
  forward: 'M8 3 L13 11 H3 Z',
  back: 'M8 13 L3 5 H13 Z',
  left: 'M3 8 L11 3 V13 Z',
  right: 'M13 8 L5 13 V3 Z',
};

function PadButton({
  direction,
  label,
  held,
  onPress,
  onRelease,
}: {
  direction: Direction;
  label: string;
  held: ReadonlySet<Direction>;
  onPress: (d: Direction) => void;
  onRelease: (d: Direction) => void;
}) {
  const active = held.has(direction);
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={cn(
        PAD_POSITION[direction],
        'size-touch flex items-center justify-center rounded-sm border',
        'focus-visible:outline-focus touch-none select-none focus-visible:outline-2',
        'motion-safe:duration-instant motion-safe:transition-colors',
        active
          ? 'bg-primary border-primary text-on-primary'
          : 'bg-surface border-line-strong text-ink hover:bg-primary-soft',
      )}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onPress(direction);
      }}
      onPointerUp={() => onRelease(direction)}
      onPointerCancel={() => onRelease(direction)}
      // A press started with the keyboard has no pointer to release it.
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onPress(direction);
      }}
      onKeyUp={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onRelease(direction);
      }}
      onBlur={() => onRelease(direction)}
    >
      <svg viewBox="0 0 16 16" className="size-4 fill-current" aria-hidden>
        <path d={PAD_ARROW[direction]} />
      </svg>
    </button>
  );
}

/**
 * The slider step, and the grid every limit is held to.
 *
 * 0.01 rather than something coarser: the whole point of replacing three presets is that
 * an operator working a narrow bed can ask for 0.23 m/s, and on a 0-0.8 track this is
 * still only eighty stops — draggable with a thumb, and steppable with an arrow key.
 */
const LIMIT_STEP = 0.01;

/** Snapped to the step *and* back through decimal, so the value is 0.56 and not
 *  0.5600000000000001 — which renders long, and which a range input cannot return to. */
function snap(value: number): number {
  return Number((Math.round(value / LIMIT_STEP) * LIMIT_STEP).toFixed(2));
}

/** Snapped *down*, for a ceiling: rounding a maximum up would put the end of the track
 *  past the limit the velocity is clamped to, so the last millimetre would do nothing. */
function snapFloor(value: number): number {
  return Number((Math.floor(value / LIMIT_STEP) * LIMIT_STEP).toFixed(2));
}

/**
 * One limit, set by dragging.
 *
 * A range input rather than a custom-built track: it is draggable, it is operable from
 * the keyboard with arrows, Home and End, it announces itself to a screen reader, and it
 * is the one control a browser already knows how to make work with a thumb on glass.
 * Rebuilding that from pointer events is how sliders become unusable.
 *
 * The number is printed beside the label in mono, because a slider alone tells you
 * roughly and this control is setting how fast a machine moves through a crop.
 */
function LimitSlider({
  label,
  value,
  onChange,
  max,
  step,
  unit,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  max: number;
  step: number;
  unit: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={`teleop-${label.toLowerCase()}`}
          className="text-ink-subtle text-xs font-semibold uppercase tracking-[0.08em]"
        >
          {label}
        </label>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {value.toFixed(2)} <span className="text-ink-muted font-normal">{unit}</span>
        </span>
      </div>
      <input
        id={`teleop-${label.toLowerCase()}`}
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuetext={`${value.toFixed(2)} ${unit}`}
        className={cn(
          'accent-primary h-5 w-full cursor-pointer',
          'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
        )}
      />
    </div>
  );
}

/**
 * The two live figures, boxed.
 *
 * These are the *commanded* velocity — what the controls are resolving to right now —
 * which is why they move as the sliders are dragged and the keys are held. The panel's
 * standing banner underneath says whether any of it is reaching a machine, so the pair
 * cannot be read as a claim about a robot that is not connected.
 */
function CurrentReadout({ velocity, moving }: { velocity: Velocity; moving: boolean }) {
  return (
    <div className="flex gap-3 lg:flex-col lg:items-end">
      <ReadoutBox
        label="Current speed"
        value={`${velocity.linear_mps >= 0 ? '+' : '−'}${Math.abs(velocity.linear_mps).toFixed(2)}`}
        unit="m/s"
        active={moving}
      />
      <ReadoutBox
        label="Current rotation"
        value={`${velocity.angular_dps >= 0 ? '+' : '−'}${dpsToRads(Math.abs(velocity.angular_dps)).toFixed(2)}`}
        unit="rad/s"
        active={moving}
      />
    </div>
  );
}

function ReadoutBox({
  label,
  value,
  unit,
  active,
}: {
  label: string;
  value: string;
  unit: string;
  active: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 lg:flex-none">
      <span className="text-ink-subtle text-xs font-semibold uppercase tracking-[0.08em]">
        {label}
      </span>
      <p
        className={cn(
          'border-line bg-surface-sunk rounded-sm border px-3 py-2',
          'font-mono text-base tabular-nums lg:min-w-[9.5rem] lg:text-right',
          active ? 'text-ink font-semibold' : 'text-ink-muted',
        )}
      >
        {value} <span className="text-ink-subtle text-sm">{unit}</span>
      </p>
    </div>
  );
}
