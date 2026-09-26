/**
 * The bar drives a machine. These tests hold the behaviours that make that safe: a key
 * release stops, losing the tab stops, and with no command service connected the bar
 * says so rather than implying the robot is moving.
 *
 * Real timers throughout. The repeat loop runs at 10 Hz, so waiting for it costs
 * milliseconds — and faking the clock here would mean testing the timer rather than the
 * behaviour that keeps the deadman fed.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { isStopped, type Velocity } from '@/lib/control/teleop';

import { TeleopBar } from '../teleop-bar';

/** The velocity in the most recent command, which is what the robot would be acting on. */
function lastVelocity(onCommand: { mock: { calls: unknown[][] } }): Velocity {
  return onCommand.mock.calls.at(-1)![0] as Velocity;
}

describe('TeleopBar, with no command service', () => {
  it('refuses plainly instead of implying the robot is being driven', () => {
    render(<TeleopBar maxSpeedMps={0.8} />);
    expect(screen.getByRole('status')).toHaveTextContent(/not connected to a robot/i);
    expect(screen.getByRole('status')).toHaveTextContent(/nothing is being sent/i);
  });

  it('opens at the speed the three presets used to call "normal"', () => {
    render(<TeleopBar maxSpeedMps={0.8} />);
    // 0.7 of this robot's configured 0.80 m/s — the default driving feel is unchanged by
    // the move from three buttons to a continuous limit.
    expect(screen.getByRole('slider', { name: /speed/i })).toHaveValue('0.56');
  });

  it('caps the speed slider at the robot’s configured maximum', () => {
    render(<TeleopBar maxSpeedMps={0.5} />);
    expect(screen.getByRole('slider', { name: /speed/i })).toHaveAttribute('max', '0.5');
  });

  it('reports rotation in rad/s, which is the unit the control is set in', () => {
    render(<TeleopBar maxSpeedMps={0.8} />);
    expect(screen.getByRole('slider', { name: /rotation/i })).toBeInTheDocument();
    // Both the limit and the readout are in rad/s; degrees stay on the wire only.
    expect(screen.getAllByText('rad/s').length).toBeGreaterThan(0);
    expect(screen.queryByText(/°\/s/)).not.toBeInTheDocument();
  });

  it('reads out a current speed and a current rotation, and nothing else', () => {
    render(<TeleopBar maxSpeedMps={0.8} />);
    expect(screen.getByText(/current speed/i)).toBeInTheDocument();
    expect(screen.getByText(/current rotation/i)).toBeInTheDocument();
    // At rest both read zero rather than being hidden: a blank box is not a reading.
    expect(screen.getAllByText('+0.00')).toHaveLength(2);
  });

  it('moves the readout when a direction is held', async () => {
    const user = userEvent.setup();
    render(<TeleopBar maxSpeedMps={0.8} />);
    await user.keyboard('{w>}');
    expect(screen.getByText('+0.56')).toBeInTheDocument();
    await user.keyboard('{/w}');
  });
});

describe('TeleopBar, connected', () => {
  it('sends while a key is held and sends a stop when it is released', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<TeleopBar maxSpeedMps={0.8} onCommand={onCommand} />);

    await user.keyboard('{w>}');
    expect(lastVelocity(onCommand).linear_mps).toBeCloseTo(0.56, 5);

    // Repeating is what keeps the robot's deadman fed while a key stays down.
    const sentSoFar = onCommand.mock.calls.length;
    await waitFor(() => expect(onCommand.mock.calls.length).toBeGreaterThan(sentSoFar));

    await user.keyboard('{/w}');
    expect(isStopped(lastVelocity(onCommand))).toBe(true);
  });

  it('stops when the tab is hidden', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<TeleopBar maxSpeedMps={0.8} onCommand={onCommand} />);

    await user.keyboard('{w>}');
    expect(isStopped(lastVelocity(onCommand))).toBe(false);

    // The robot-side deadman is the real guarantee; the browser must not keep asking.
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(isStopped(lastVelocity(onCommand))).toBe(true);

    visibility.mockRestore();
    await user.keyboard('{/w}');
  });

  it('stops on space', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<TeleopBar maxSpeedMps={0.8} onCommand={onCommand} />);
    await user.keyboard('{w>}');
    await user.keyboard('[Space]');
    expect(isStopped(lastVelocity(onCommand))).toBe(true);
    await user.keyboard('{/w}');
  });

  it('never asks for more than the robot’s configured maximum', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<TeleopBar maxSpeedMps={0.5} onCommand={onCommand} />);
    // Dragged all the way to the end of the track, which is the robot's own ceiling.
    fireEvent.change(screen.getByRole('slider', { name: /speed/i }), { target: { value: '0.5' } });
    await user.keyboard('{w>}');

    for (const [velocity] of onCommand.mock.calls as [Velocity][]) {
      expect(Math.abs(velocity.linear_mps)).toBeLessThanOrEqual(0.5);
    }
    await user.keyboard('{/w}');
  });

  it('does not drive the robot while someone is typing', async () => {
    const onCommand = vi.fn();
    render(
      <>
        <input aria-label="Search" />
        <TeleopBar maxSpeedMps={0.8} onCommand={onCommand} />
      </>,
    );
    await userEvent.type(screen.getByLabelText('Search'), 'was');
    expect(onCommand).not.toHaveBeenCalled();
  });
});
