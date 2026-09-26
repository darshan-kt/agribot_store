import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusDot } from '../components/status-dot';
import { formatAge, StaleNotice } from '../components/states';

describe('StatusDot', () => {
  it('always exposes the state as text, even when the label is visually hidden', () => {
    render(<StatusDot state="offline" label={false} />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });
});

describe('StaleNotice', () => {
  it('says nothing while data is fresh', () => {
    const { container } = render(<StaleNotice seconds={2} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reports the age once data has gone stale', () => {
    render(<StaleNotice seconds={12} />);
    expect(screen.getByText('Last seen 12 s ago')).toBeInTheDocument();
  });
});

describe('formatAge', () => {
  it.each([
    [12, '12 s'],
    [90, '2 min'],
    [7200, '2 h'],
    [172_800, '2 d'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatAge(seconds)).toBe(expected);
  });
});
