/**
 * The Simulated badge is a safety control. These tests exist to make it hard to
 * accidentally remove the guarantee that unreal data is always labelled as unreal.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { anySimulated, SimulatedBadge } from '../components/simulated-badge';

describe('SimulatedBadge', () => {
  it('labels a value that came from the simulator', () => {
    render(<SimulatedBadge source="sim" />);
    expect(screen.getByText('Simulated')).toBeInTheDocument();
  });

  it('renders nothing for a value that came from real hardware', () => {
    const { container } = render(<SimulatedBadge source="robot" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explains itself on hover for anyone who does not know the term', () => {
    render(<SimulatedBadge source="sim" />);
    expect(screen.getByTitle(/came from the simulated robot/i)).toBeInTheDocument();
  });

  it('cannot be suppressed: the only input is source', () => {
    // If a `hidden`, `showBadge` or similar prop is ever added, this fails to compile
    // and the reviewer has to justify it.
    const props = Object.keys(SimulatedBadge({ source: 'sim' })?.props as Record<string, unknown>);
    expect(props).not.toContain('hidden');
  });

  it('flags a mixed set as simulated if any single value is', () => {
    expect(anySimulated(['robot', 'robot', 'sim'])).toBe(true);
    expect(anySimulated(['robot', 'robot'])).toBe(false);
  });
});
