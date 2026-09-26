/**
 * The panel that opens a pesticide valve. These tests hold the two rules that matter:
 * arming takes a deliberate second action, and the spray button is enabled only when the
 * robot has reported every interlock satisfied — never merely because nothing is known
 * to be wrong.
 */
import type { SprayerState } from '@agri/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SPRAYER_SETTINGS } from '@/lib/mission/sprayer';

import { SprayerPanel } from '../sprayer-panel';

function allClear(overrides: Partial<SprayerState> = {}): SprayerState {
  return {
    schema_version: '1.0.0',
    robot_id: 'scout-01',
    ts: 0,
    seq: 1,
    source: 'sim',
    armed: true,
    spraying: false,
    nozzle_height_cm: 45,
    arc_deg: 180,
    flow_lpm: 1.8,
    tank_litres: 12,
    tank_capacity_litres: 20,
    interlocks: {
      armed: true,
      inside_geofence: true,
      speed_ok: true,
      tank_ok: true,
      estop_clear: true,
    },
    ...overrides,
  } as SprayerState;
}

function renderPanel(reported: SprayerState | null = null) {
  return render(
    <SprayerPanel
      settings={DEFAULT_SPRAYER_SETTINGS}
      onSettingsChange={() => {}}
      autoSpray={false}
      onAutoSprayChange={() => {}}
      flaggedCount={14}
      reported={reported}
    />,
  );
}

describe('SprayerPanel with no robot reporting', () => {
  it('will not spray, and says which condition it cannot confirm', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /hold to spray/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/has not reported/i);
  });

  it('shows the sprayer as not armed', () => {
    renderPanel();
    expect(screen.getByText('Not armed')).toBeInTheDocument();
  });

  it('marks every interlock as not reported rather than as satisfied', () => {
    renderPanel();
    // Five interlocks, none of them a pass. A tick here would be the dangerous bug.
    expect(screen.getAllByRole('img', { name: 'Not reported' })).toHaveLength(5);
    expect(screen.queryByRole('img', { name: 'Satisfied' })).not.toBeInTheDocument();
  });

  it('does not claim a tank level it was never told', () => {
    renderPanel();
    expect(screen.getByText('Not reported')).toBeInTheDocument();
    // No meter at all, rather than a meter reading zero: a meter has to carry a value,
    // and the only value available would say "empty" — the one thing this must not claim
    // wrongly, since an empty tank is also a reason the sprayer refuses.
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });

  it('asks for a confirmation before arming, and names what is being armed', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /arm the sprayer/i }));
    expect(screen.getByText(/opens the pesticide valve/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /yes, arm it/i })).toBeInTheDocument();
  });

  it('can be backed out of without arming', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /arm the sprayer/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('button', { name: /yes, arm it/i })).not.toBeInTheDocument();
    expect(screen.getByText('Not armed')).toBeInTheDocument();
  });

  it('refuses the arm it cannot send, instead of showing itself as armed', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /arm the sprayer/i }));
    await userEvent.click(screen.getByRole('button', { name: /yes, arm it/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/was not armed and nothing was sent/i);
    expect(screen.getByText('Not armed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hold to spray/i })).toBeDisabled();
  });
});

describe('SprayerPanel with the robot reporting', () => {
  it('enables spraying only when all five interlocks pass', () => {
    renderPanel(allClear());
    expect(screen.getByRole('button', { name: /hold to spray/i })).toBeEnabled();
    expect(screen.getAllByRole('img', { name: 'Satisfied' })).toHaveLength(5);
  });

  it('disables spraying again the moment one interlock fails', () => {
    const state = allClear();
    renderPanel(allClear({ interlocks: { ...state.interlocks, inside_geofence: false } }));
    expect(screen.getByRole('button', { name: /hold to spray/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/outside the field boundary/i);
  });

  it('warns on a low tank while still allowing the spray the robot permits', () => {
    renderPanel(allClear({ tank_litres: 2, tank_capacity_litres: 20 }));
    expect(screen.getByText(/tank low/i)).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /tank level/i })).toHaveAttribute(
      'aria-valuenow',
      '10',
    );
  });
});
