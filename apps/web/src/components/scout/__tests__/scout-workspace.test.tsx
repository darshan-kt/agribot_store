/**
 * Crop Scout shows one set of plants three ways. These tests hold the two things that
 * make it one screen rather than three: a selection made anywhere is a selection
 * everywhere, and every panel that cannot show live data says so instead of filling the
 * gap with something invented.
 */
import type { ApiDetection, ApiFieldDetail, ApiRobotDetail, ApiScoutRun } from '@agri/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import detectionsJson from '@/lib/fixtures/detections.json';
import fieldJson from '@/lib/fixtures/field.json';
import robotJson from '@/lib/fixtures/robot.json';
import runsJson from '@/lib/fixtures/scout-runs.json';
import { detectionsInRun, latestRun, summariseRun } from '@/lib/scout/report';

import { ScoutWorkspace } from '../scout-workspace';

const robot = robotJson as ApiRobotDetail;
const field = fieldJson as ApiFieldDetail;
const runs = (runsJson as { runs: ApiScoutRun[] }).runs;
const detections = (detectionsJson as { detections: ApiDetection[] }).detections;

function renderWorkspace() {
  const run = latestRun(runs);
  const report = summariseRun(run, detectionsInRun(detections, run));
  render(<ScoutWorkspace robot={robot} field={field} report={report} />);
  return report;
}

describe('ScoutWorkspace', () => {
  it('reports the run the robot recorded, not the whole week', () => {
    const report = renderWorkspace();
    expect(report.detections).toHaveLength(37);
    // Scanned comes from the run row; flagged is the count the run reported.
    expect(screen.getByText('1,800')).toBeInTheDocument();
    const flagged = screen.getByText('Flagged').closest('div')!;
    expect(within(flagged).getByText('37')).toBeInTheDocument();
  });

  it('selecting a plant in the log selects it on the map too', async () => {
    const report = renderWorkspace();
    const first = report.detections[0]!;

    const log = screen.getByRole('list', { name: /plants flagged/i });
    const row = within(log).getAllByRole('button')[0]!;
    expect(row).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(row);

    expect(row).toHaveAttribute('aria-pressed', 'true');
    const pins = screen
      .getAllByRole('button', { name: new RegExp(first.issue.name, 'i') })
      .filter((node) => node.tagName.toLowerCase() === 'circle');
    expect(pins.some((pin) => pin.getAttribute('aria-pressed') === 'true')).toBe(true);
  });

  it('clicking the same row again clears the selection', async () => {
    renderWorkspace();
    const log = screen.getByRole('list', { name: /plants flagged/i });
    const row = within(log).getAllByRole('button')[0]!;

    await userEvent.click(row);
    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-pressed', 'false');
  });

  it('says there is no video rather than showing a placeholder that looks like one', () => {
    renderWorkspace();
    expect(screen.getAllByText('No video')).toHaveLength(2);
    expect(screen.getAllByText(/video gateway is not running/i)).toHaveLength(2);
  });

  /**
   * The workspace places a stand-in robot on the map. The visible caption that used to
   * qualify it was removed to keep the panel clean, so the accessible name is the only
   * remaining place that says it is not a fix — which makes pinning it here the point.
   */
  it('names the stand-in robot as simulated rather than as a live fix', () => {
    renderWorkspace();
    expect(screen.getByRole('img', { name: /not a satellite fix/i })).toBeInTheDocument();
  });

  it('refuses to start a scouting run it cannot start', async () => {
    renderWorkspace();
    await userEvent.click(screen.getByRole('button', { name: /start scouting/i }));
    // It drives a real machine. Saying "started" when nothing was sent is the failure.
    expect(screen.getByRole('alert')).toHaveTextContent(/nothing was started/i);
  });

  it('labels the run as simulated, from the data rather than a flag', () => {
    renderWorkspace();
    expect(screen.getAllByText('Simulated').length).toBeGreaterThan(0);
  });
});
