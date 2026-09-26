/**
 * E-stop behaviour. Each of these encodes a safety decision, not a preference.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EstopButton } from '../components/estop';

describe('EstopButton', () => {
  it('stops on a single tap, with no confirmation in the way', async () => {
    const onEngage = vi.fn();
    render(<EstopButton engaged={false} onEngage={onEngage} onRelease={vi.fn()} robotOnline />);
    await userEvent.click(screen.getByRole('button', { name: /emergency stop/i }));
    expect(onEngage).toHaveBeenCalledOnce();
  });

  it('stays pressable when the robot is offline', async () => {
    // A greyed-out e-stop teaches operators the control is unreliable. The robot has
    // already stopped via the deadman; the button still reports the attempt.
    const onEngage = vi.fn();
    render(
      <EstopButton engaged={false} onEngage={onEngage} onRelease={vi.fn()} robotOnline={false} />,
    );
    const button = screen.getByRole('button', { name: /emergency stop/i });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onEngage).toHaveBeenCalledOnce();
  });

  it('requires a deliberate confirmation before releasing', async () => {
    const onRelease = vi.fn();
    render(<EstopButton engaged onEngage={vi.fn()} onRelease={onRelease} robotOnline />);

    await userEvent.click(screen.getByRole('button', { name: /release stop/i }));
    expect(onRelease).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /yes, release/i }));
    expect(onRelease).toHaveBeenCalledOnce();
  });

  it('lets the operator back out of a release', async () => {
    const onRelease = vi.fn();
    render(<EstopButton engaged onEngage={vi.fn()} onRelease={onRelease} robotOnline />);
    await userEvent.click(screen.getByRole('button', { name: /release stop/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onRelease).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /release stop/i })).toBeInTheDocument();
  });

  it('announces the stopped state, not just colours it', () => {
    render(<EstopButton engaged onEngage={vi.fn()} onRelease={vi.fn()} robotOnline />);
    expect(screen.getByRole('status')).toHaveTextContent('Stopped');
  });
});
