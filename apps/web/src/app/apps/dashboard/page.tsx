import type { Metadata } from 'next';

import { Card, CardHeader, Eyebrow, formatAge, Metric, SimulatedBadge } from '@agri/ui';

import { ComputePanel } from '@/components/dashboard/compute-panel';
import { ConfigForm, ConfigHistory } from '@/components/dashboard/config-form';
import { SensorList } from '@/components/dashboard/sensor-list';
import { Sparkline } from '@/components/dashboard/sparkline';
import { AppShell } from '@/components/shell/app-shell';
import { data } from '@/lib/data';
import { livenessOf } from '@/lib/liveness';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const [robot, telemetry] = await Promise.all([
    data.getRobot('scout-01'),
    data.getTelemetry('scout-01'),
  ]);

  const { latest, samples } = telemetry;
  const liveness = livenessOf(robot);
  const sensors = orderSensors(robot.sensors ?? []);
  const checks = sensors.filter((s) => s.status !== 'ok').length;

  const batteryHours = latest.battery_time_remaining_s
    ? latest.battery_time_remaining_s / 3600
    : null;

  return (
    <AppShell robot={robot} title="Dashboard" subtitle="How the robot itself is doing" showEstop>
      <div className="flex flex-col gap-4">
        {/* Identity. Model and firmware belong here rather than buried in settings:
            they are the first thing anyone asks for when reporting a fault. */}
        <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3.5">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-display text-xl font-semibold leading-tight">{robot.name}</h2>
            <p className="text-ink-muted text-sm">
              {robot.model}
              {robot.firmware && <span className="font-mono"> · firmware {robot.firmware}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SimulatedBadge source={robot.source} />
            <span
              className={
                liveness.state === 'online'
                  ? 'text-primary text-sm font-semibold'
                  : 'text-ink-muted text-sm font-semibold'
              }
            >
              {liveness.state === 'online'
                ? 'Online'
                : liveness.ageSeconds !== null
                  ? `Last seen ${formatAge(liveness.ageSeconds)} ago`
                  : 'Offline'}
            </span>
          </div>
        </Card>

        {/* Status. Four things an operator checks before sending the robot out. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="flex flex-col gap-2 p-4">
            <Metric
              label="Battery"
              value={latest.battery_percent?.toFixed(0) ?? '—'}
              unit="%"
              hint={batteryHours ? `About ${batteryHours.toFixed(1)} hours left` : undefined}
              tone={
                latest.battery_percent != null && latest.battery_percent <= 20
                  ? 'critical'
                  : 'default'
              }
            />
            <Sparkline
              values={samples.map((s) => s.battery_percent)}
              label="Battery over the last two hours"
              className="h-7 w-full"
            />
          </Card>

          <Card className="flex flex-col gap-2 p-4">
            <Metric
              label="Signal"
              value={latest.signal_dbm?.toFixed(0) ?? '—'}
              unit="dBm"
              hint={describeSignal(latest.signal_dbm)}
            />
            <Sparkline
              values={samples.map((s) => s.signal_dbm)}
              label="Signal over the last two hours"
              className="h-7 w-full"
            />
          </Card>

          <Card className="p-4">
            <Metric
              label="Uptime"
              value={latest.uptime_s ? formatAge(latest.uptime_s) : '—'}
              hint="Since the robot was last powered on"
            />
          </Card>

          <Card className="p-4">
            <Metric
              label="Location"
              value={robot.field?.name ?? '—'}
              hint={robot.row != null ? `Row ${robot.row} of 9` : 'Not in a field'}
            />
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader
                title="Sensors"
                eyebrow={`${sensors.length} fitted`}
                action={
                  checks > 0 ? (
                    // Mono, like every other count in the product: figures are tabular,
                    // and Instrument Sans sets a 2px space in semibold, which closes up
                    // "1 check" into "1check" at badge size.
                    <span className="border-moderate bg-moderate-soft text-on-moderate rounded-sm border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums">
                      {`${checks} ${checks === 1 ? 'check' : 'checks'}`}
                    </span>
                  ) : (
                    <span className="text-ink-muted text-xs font-medium">All OK</span>
                  )
                }
              />
              <SensorList sensors={sensors} />
            </Card>

            <Card>
              <CardHeader title="Onboard computer" eyebrow="Load" />
              <ComputePanel latest={latest} />
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Settings"
              eyebrow="Configuration"
              action={
                robot.active_config ? (
                  <span className="text-ink-muted font-mono text-xs">
                    v{robot.active_config.version}
                  </span>
                ) : undefined
              }
            />
            <p className="text-ink-muted px-4 pb-3 text-sm">
              Changes are sent to the robot and only take effect once it confirms them.
            </p>
            <ConfigForm config={robot.active_config ?? null} />
            <ConfigHistory versions={robot.active_config ? [robot.active_config] : []} />
          </Card>
        </div>

        <p className="text-ink-muted flex items-center gap-2 text-sm">
          <Eyebrow>Data</Eyebrow>
          Telemetry averaged per minute over the last {Math.round(samples.length / 60)} hours.
        </p>
      </div>
    </AppShell>
  );
}

/**
 * Display order for the sensor list.
 *
 * The API returns them keyed alphabetically, which puts the wheel encoders between the
 * cameras and the GPS. This is the order an operator actually checks: what it sees,
 * where it is, how it is moving, what is in the way, then the conditions around it.
 */
const SENSOR_ORDER = ['camera_left', 'camera_right', 'gps', 'imu', 'lidar', 'encoders', 'weather'];

function orderSensors<T extends { sensor: string }>(sensors: T[]): T[] {
  return [...sensors].sort((a, b) => {
    const ai = SENSOR_ORDER.indexOf(a.sensor);
    const bi = SENSOR_ORDER.indexOf(b.sensor);
    // Anything unrecognised sorts to the end rather than to the front.
    return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
  });
}

/** dBm means nothing to most people; the word for it does. */
function describeSignal(dbm: number | null | undefined): string | undefined {
  if (dbm == null) return undefined;
  if (dbm >= -60) return 'Strong';
  if (dbm >= -75) return 'Good';
  if (dbm >= -85) return 'Weak — expect slower video';
  return 'Very weak — control may lag';
}
