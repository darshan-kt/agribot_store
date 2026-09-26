import type { ApiRobotDetail } from '@agri/contracts';
import { formatAge, SimulatedBadge, StatusDot } from '@agri/ui';

import { BatteryIcon } from '../app-icon';

/**
 * The connected robot, shown above everything else.
 *
 * This strip answers the question an operator has before they open any app: is the
 * machine there, where is it, and does it have power to finish. It stays visible at the
 * top of the store rather than living inside the Dashboard, because deciding *which*
 * app to open depends on knowing the robot's state first.
 */
export function RobotStrip({ robot }: { robot: ApiRobotDetail }) {
  const battery = robot.battery_percent ?? null;
  const lastSeenSeconds = robot.last_seen_at
    ? Math.max(0, (Date.now() - new Date(robot.last_seen_at).getTime()) / 1000)
    : null;

  return (
    <div className="border-line bg-surface flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border px-4 py-3">
      <div className="flex items-center gap-2.5">
        <StatusDot state={robot.online ? 'online' : 'offline'} label={false} />
        <span className="font-display text-lg font-semibold leading-none">{robot.name}</span>
        <SimulatedBadge source={robot.source} size="xs" />
      </div>

      <Divider />

      <Item label="Field">
        {robot.field?.name ?? 'Not in a field'}
        {robot.row != null && <span className="text-ink-muted"> · row {robot.row}</span>}
      </Item>

      <Divider />

      <Item label="Battery">
        <span className="inline-flex items-center gap-1.5">
          <BatteryIcon
            percent={battery ?? 0}
            className={
              battery != null && battery <= 20 ? 'text-critical-ink h-3.5' : 'text-primary h-3.5'
            }
          />
          <span className="font-mono tabular-nums">
            {battery != null ? `${Math.round(battery)}%` : '—'}
          </span>
        </span>
      </Item>

      {/* Offline is stated in words, with how long it has been, rather than left to a
          grey dot the reader has to interpret. */}
      {!robot.online && (
        <p className="text-ink-muted ml-auto text-sm">
          Offline
          {lastSeenSeconds != null && ` · last seen ${formatAge(lastSeenSeconds)} ago`}
        </p>
      )}
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="flex items-baseline gap-1.5 text-sm">
      <span className="text-ink-subtle">{label}</span>
      <span className="font-medium">{children}</span>
    </p>
  );
}

function Divider() {
  return <span aria-hidden className="bg-line hidden h-4 w-px sm:block" />;
}
