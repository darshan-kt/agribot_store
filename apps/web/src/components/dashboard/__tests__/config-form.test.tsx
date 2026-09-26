/**
 * Configuration is only "applied" once the robot confirms it. These tests hold that line,
 * and hold the line that the form never claims to have sent something it did not.
 */
import type { ApiConfigVersion } from '@agri/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ConfigForm, ConfigHistory } from '../config-form';

const acked: ApiConfigVersion = {
  id: '00000000-0000-4000-8000-000000000001',
  version: 1,
  created_at: '2026-09-16T07:00:00Z',
  created_by: null,
  acked_at: '2026-09-16T07:00:04Z',
  rejected_reason: null,
  max_speed_mps: 0.8,
  detection_sensitivity: 0.65,
  return_to_base_battery_percent: 20,
  camera_fps: 15,
  obstacle_stop_enabled: true,
};

describe('ConfigForm', () => {
  it('starts from the configuration the robot is actually running', () => {
    render(<ConfigForm config={acked} />);
    expect(screen.getByText('0.8 m/s')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('15 fps')).toBeInTheDocument();
  });

  it('says the version is confirmed only because the robot acknowledged it', () => {
    render(<ConfigForm config={acked} />);
    expect(screen.getByText(/Version 1, confirmed by the robot/)).toBeInTheDocument();
  });

  it('cannot be saved until something changes', () => {
    render(<ConfigForm config={acked} />);
    expect(screen.getByRole('button', { name: /save to robot/i })).toBeDisabled();
  });

  it('enables saving once a setting is edited, and says it is unsaved', async () => {
    render(<ConfigForm config={acked} />);
    await userEvent.click(screen.getByRole('switch', { name: /stop for obstacles/i }));
    expect(screen.getByRole('button', { name: /save to robot/i })).toBeEnabled();
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
  });

  it('refuses honestly when there is no robot to send to', async () => {
    render(<ConfigForm config={acked} />);
    await userEvent.click(screen.getByRole('switch', { name: /stop for obstacles/i }));
    await userEvent.click(screen.getByRole('button', { name: /save to robot/i }));
    // Fixture mode: it must not pretend a pending change is in flight.
    expect(screen.getByRole('status')).toHaveTextContent(/nothing was sent/i);
  });

  it('explains what detection sensitivity will do, not just its number', async () => {
    render(<ConfigForm config={acked} />);
    expect(screen.getByText(/Balanced\./)).toBeInTheDocument();
  });
});

describe('ConfigHistory', () => {
  it('distinguishes a confirmed version from a pending one', () => {
    const pending = { ...acked, id: 'x', version: 2, acked_at: null };
    render(<ConfigHistory versions={[pending, acked]} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Confirmed by the robot')).toBeInTheDocument();
  });
});
