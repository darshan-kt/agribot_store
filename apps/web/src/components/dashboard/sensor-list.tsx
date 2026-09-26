import type { ApiRobotDetail } from '@agri/contracts';
import { cn, SimulatedBadge } from '@agri/ui';

type Sensor = NonNullable<ApiRobotDetail['sensors']>[number];

/**
 * Plain-language names and readings for each sensor.
 *
 * The robot reports machine codes; the sentences a farmer reads are composed here. That
 * keeps the wire format stable and translatable, and means fixing a confusing phrase is
 * a frontend change rather than a firmware release.
 */
const SENSOR_NAMES: Record<string, string> = {
  camera_left: 'Left camera',
  camera_right: 'Right camera',
  gps: 'GPS',
  imu: 'Motion sensor',
  lidar: 'Front obstacle sensor',
  weather: 'Weather sensor',
  encoders: 'Wheel encoders',
};

const WARNING_TEXT: Record<string, string> = {
  high_humidity_blight_risk: 'High humidity, blight risk',
  temperature_out_of_range: 'Temperature outside the normal range',
  sensor_stale: 'No recent reading',
};

const GPS_FIX: Record<string, string> = {
  none: 'No fix',
  '2d': '2D fix',
  '3d': '3D fix',
  dgps: 'Differential fix',
  rtk_float: 'RTK float',
  rtk_fixed: 'RTK fixed',
};

function readingFor(sensor: Sensor): string {
  const r = sensor.readings as Record<string, unknown>;
  const num = (key: string) => (typeof r[key] === 'number' ? (r[key] as number) : null);

  switch (sensor.sensor) {
    case 'camera_left':
    case 'camera_right':
      return `${num('width')} × ${num('height')} at ${num('fps')} fps`;
    case 'gps': {
      const fix = GPS_FIX[String(r.fix_type)] ?? String(r.fix_type);
      return `${fix}, ${formatAccuracy(num('accuracy_m'))}, ${num('satellites')} satellites`;
    }
    case 'imu':
      return `Level to ${Math.max(Math.abs(num('roll_deg') ?? 0), Math.abs(num('pitch_deg') ?? 0)).toFixed(1)}°`;
    case 'lidar': {
      const nearest = num('nearest_obstacle_m');
      return nearest === null
        ? 'Nothing within range'
        : `Nearest object ${nearest.toFixed(1)} m ahead`;
    }
    case 'weather':
      return `${num('temperature_c')?.toFixed(1)} °C, ${num('humidity_percent')?.toFixed(0)}% humidity`;
    case 'encoders':
      return `${num('left_rpm')?.toFixed(1)} / ${num('right_rpm')?.toFixed(1)} rpm`;
    default:
      return '—';
  }
}

function formatAccuracy(metres: number | null): string {
  if (metres === null) return 'accuracy unknown';
  // Centimetre-level RTK accuracy in metres reads as "0.02 m", which undersells it.
  return metres < 1 ? `± ${Math.round(metres * 100)} cm` : `± ${metres.toFixed(1)} m`;
}

export function SensorList({ sensors }: { sensors: Sensor[] }) {
  return (
    <ul className="divide-line divide-y">
      {sensors.map((sensor) => {
        const warnings = (sensor.readings as { warnings?: string[] }).warnings ?? [];
        return (
          <li
            key={sensor.sensor}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5"
          >
            <div className="flex min-w-0 flex-col">
              <span className="font-medium">{SENSOR_NAMES[sensor.sensor] ?? sensor.sensor}</span>
              <span className="text-ink-muted font-mono text-sm">{readingFor(sensor)}</span>
              {warnings.map((code) => (
                <span key={code} className="text-moderate-ink mt-0.5 text-sm font-medium">
                  {WARNING_TEXT[code] ?? code}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <SimulatedBadge source={sensor.source} size="xs" />
              <StatusPill status={sensor.status} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Two words, not a colour: "OK" and "Check" are the only states a farmer needs. */
function StatusPill({ status }: { status: string }) {
  const check = status !== 'ok';
  return (
    <span
      className={cn(
        'rounded-sm border px-2 py-0.5 text-xs font-semibold',
        check
          ? 'border-moderate bg-moderate-soft text-on-moderate'
          : 'border-line text-ink-muted bg-transparent',
      )}
    >
      {check ? 'Check' : 'OK'}
    </span>
  );
}
