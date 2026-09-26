/**
 * App icons.
 *
 * Drawn rather than pulled from a set, and deliberately not emoji: emoji render
 * differently on every platform, carry no consistent weight, and read as decoration on
 * a screen that is meant to be operated. Each glyph is built from the same 24-unit grid
 * with a 1.75 stroke, so the four sit together as a family.
 */

export type AppIconName = 'scout' | 'route' | 'leaf' | 'gauge' | 'chat';

const COMMON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function AppIcon({ name, className }: { name: AppIconName; className?: string }) {
  switch (name) {
    // A camera viewfinder over a row: what scouting is — looking down a row.
    case 'scout':
      return (
        <svg {...COMMON} className={className} aria-hidden>
          <path d="M3 7.5h3.2l1.4-2h8.8l1.4 2H21v11H3z" />
          <circle cx="12" cy="13" r="3.2" />
        </svg>
      );
    // A snake path between two turn points: the coverage pattern itself.
    case 'route':
      return (
        <svg {...COMMON} className={className} aria-hidden>
          <path d="M5 20V8a3 3 0 0 1 6 0v8a3 3 0 0 0 6 0V4" />
          <circle cx="5" cy="20" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="17" cy="4" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
    // A leaf with a midrib, marked: a plant with something found on it.
    case 'leaf':
      return (
        <svg {...COMMON} className={className} aria-hidden>
          <path d="M20 4c0 8.5-4.8 13-11 13H5.5C5.5 9.5 11 4 20 4Z" />
          <path d="M5 20c2.5-5 6-8.2 10.5-10.5" />
        </svg>
      );
    // A speech bubble over a seedling: asking about what is growing. Drawn on the same
    // grid and stroke as the rest, so it sits in the family rather than beside it.
    case 'chat':
      return (
        <svg {...COMMON} className={className} aria-hidden>
          <path d="M20.5 13.5a3 3 0 0 1-3 3H10l-4.5 3.5v-3.5h-1a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3Z" />
          <path d="M12 12.5v-3" />
          <path d="M12 10.5c1.9 0 3-1.1 3-3-1.9 0-3 1.1-3 3Z" />
          <path d="M12 11.5c-1.6 0-2.5-.9-2.5-2.5 1.6 0 2.5.9 2.5 2.5Z" />
        </svg>
      );
    // A dial at three-quarter deflection.
    case 'gauge':
      return (
        <svg {...COMMON} className={className} aria-hidden>
          <path d="M4 17a8.5 8.5 0 1 1 16 0" />
          <path d="m12 17 4.2-5" />
          <circle cx="12" cy="17" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

/** Battery glyph whose fill tracks the charge. */
export function BatteryIcon({ percent, className }: { percent: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <svg viewBox="0 0 26 14" className={className} aria-hidden>
      <rect
        x="0.9"
        y="0.9"
        width="20.2"
        height="12.2"
        rx="2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M23.5 5v4a2.4 2.4 0 0 0 0-4Z" fill="currentColor" />
      <rect x="3" y="3" width={(clamped / 100) * 16.2} height="8" rx="1" fill="currentColor" />
    </svg>
  );
}
