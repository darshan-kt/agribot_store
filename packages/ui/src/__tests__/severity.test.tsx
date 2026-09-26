/**
 * Severity must never be communicated by colour alone: greyscale, colour-vision
 * deficiency and a sun-washed screen all remove hue as a channel.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SEVERITY_ORDER, SeverityBar, SeverityChip } from '../components/severity';

describe('SeverityChip', () => {
  it.each(['low', 'moderate', 'critical'] as const)('prints the word for %s', (severity) => {
    render(<SeverityChip severity={severity} />);
    expect(screen.getByText(new RegExp(severity, 'i'))).toBeInTheDocument();
  });

  it('shows a count alongside the word when given one', () => {
    render(<SeverityChip severity="critical" count={14} />);
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });
});

describe('SeverityBar', () => {
  it('describes the whole distribution in its accessible name', () => {
    render(<SeverityBar counts={{ critical: 14, moderate: 15, low: 8 }} />);
    const bar = screen.getByRole('img');
    expect(bar).toHaveAccessibleName('Severity mix: 14 critical, 15 moderate, 8 low');
  });

  it('degrades to an empty track rather than dividing by zero', () => {
    const { container } = render(<SeverityBar counts={{}} />);
    expect(container.querySelector('[role="presentation"]')).toBeInTheDocument();
  });

  it('orders severities worst first, the way triage reads', () => {
    expect(SEVERITY_ORDER).toEqual(['critical', 'moderate', 'low']);
  });
});
