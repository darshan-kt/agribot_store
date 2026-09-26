/**
 * @agri/ui — the design system.
 *
 * Tokens live in tokens.css and are the only source of colour, type, radius, elevation
 * and motion in the product. No component in this package declares a raw value; if you
 * find yourself needing one, add a token instead.
 *
 * Import the stylesheet once, in the app's root: `import '@agri/ui/tokens.css'`.
 */

export { cn, type ClassValue } from './lib/cn';

export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './components/button';
export { Card, CardHeader, Eyebrow, Metric } from './components/card';
export { EstopButton } from './components/estop';
export { SEVERITY_LABEL, SEVERITY_ORDER, SeverityBar, SeverityChip } from './components/severity';
export { anySimulated, SimulatedBadge } from './components/simulated-badge';
export { StatusDot, type ConnectionState } from './components/status-dot';
export {
  EmptyState,
  ErrorState,
  formatAge,
  LoadingBlock,
  Skeleton,
  StaleNotice,
} from './components/states';
