/**
 * The workspace against the seeded field and the seeded missions. What is checked is that
 * the two modes are genuinely different surfaces, that the route the map draws is the one
 * the planner computed from real geometry, and that nothing on the page claims to have
 * commanded a robot.
 */
import type {
  ApiDetection,
  ApiFieldDetail,
  ApiMissionDetail,
  ApiRobotDetail,
  ApiScoutRun,
} from '@agri/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import detectionsJson from '@/lib/fixtures/detections.json';
import fieldJson from '@/lib/fixtures/field.json';
import missionsJson from '@/lib/fixtures/missions.json';
import robotJson from '@/lib/fixtures/robot.json';
import runsJson from '@/lib/fixtures/scout-runs.json';
import { treatedDetectionIds } from '@/lib/mission/sprayer';
import { detectionsInRun, latestRun } from '@/lib/scout/report';

import { MissionWorkspace } from '../mission-workspace';

const robot = robotJson as ApiRobotDetail;
const field = fieldJson as ApiFieldDetail;
const missions = (missionsJson as { missions: ApiMissionDetail[] }).missions;
const allDetections = (detectionsJson as { detections: ApiDetection[] }).detections;
const run = latestRun((runsJson as { runs: ApiScoutRun[] }).runs);
const flagged = detectionsInRun(allDetections, run);

// The same list the page composes: what the last run flagged, plus what an earlier run
// already sprayed — which is a different set of plants, three weeks of runs apart.
const treated = treatedDetectionIds(missions.flatMap((mission) => mission.spray_events ?? []));
const flaggedIds = new Set(flagged.map((detection) => detection.id));
const plants = [
  ...flagged,
  ...allDetections.filter((d) => treated.has(d.id) && !flaggedIds.has(d.id)),
];

function renderWorkspace() {
  return render(
    <MissionWorkspace robot={robot} field={field} detections={plants} missions={missions} />,
  );
}

/** The plan map's own SVG. The rig illustration has one too, and is not the map. */
function planMap(): SVGSVGElement {
  return document.querySelector('svg[role="img"][aria-label^="Field B-4"]')!;
}

describe('MissionWorkspace', () => {
  it('opens in autonomous mode on a snake of the field’s real rows', () => {
    renderWorkspace();
    expect(screen.getByRole('button', { name: 'Autonomous' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Nine rows, both ends of each.
    expect(screen.getByRole('img', { name: /route of 18 points/ })).toBeInTheDocument();
  });

  it('quotes a distance that covers every row, not a guess', () => {
    renderWorkspace();
    // 9 × 100 m of rows, plus the eight short transits between neighbouring rows.
    expect(screen.getByText('912')).toBeInTheDocument();
  });

  it('switches to a perimeter lap without touching the field geometry', async () => {
    renderWorkspace();
    await userEvent.click(screen.getByRole('button', { name: /follow the edge/i }));
    // Four corners plus the return to the first.
    expect(screen.getByRole('img', { name: /route of 5 points/ })).toBeInTheDocument();
  });

  it('starts a custom route empty, and refuses to send one that goes nowhere', async () => {
    renderWorkspace();
    await userEvent.click(screen.getByRole('button', { name: /draw it yourself/i }));
    expect(screen.getByRole('img', { name: /no route planned/ })).toBeInTheDocument();
    expect(screen.getByText(/no points yet/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /start the mission/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at least two points/i);
  });

  it('builds a custom route from the keyboard, since tapping the map cannot be typed', async () => {
    renderWorkspace();
    await userEvent.click(screen.getByRole('button', { name: /draw it yourself/i }));

    await userEvent.selectOptions(screen.getByLabelText('Row'), '3');
    await userEvent.click(screen.getByRole('button', { name: /add south end/i }));
    await userEvent.click(screen.getByRole('button', { name: /add north end/i }));

    const list = screen.getByRole('list', { name: /route points in order/i });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('img', { name: /route of 2 points/ })).toBeInTheDocument();

    // 100 m up one row, which is the length the seed recorded for it.
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('removes a custom point and renumbers the rest', async () => {
    renderWorkspace();
    await userEvent.click(screen.getByRole('button', { name: /draw it yourself/i }));
    await userEvent.click(screen.getByRole('button', { name: /add south end/i }));
    await userEvent.click(screen.getByRole('button', { name: /add north end/i }));

    const list = screen.getByRole('list', { name: /route points in order/i });
    await userEvent.click(within(list).getAllByRole('button', { name: 'Remove' })[0]!);

    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText(/^1\./)).toBeInTheDocument();
  });

  it('draws the plants the last run already sprayed as treated', () => {
    renderWorkspace();
    // Eleven spray events in the seeded mission, each naming the plant it treated.
    expect(screen.getByRole('img', { name: /11 already treated/ })).toBeInTheDocument();
    expect(planMap().querySelectorAll('circle.fill-primary')).toHaveLength(11);
  });

  it('shows the request it would post, because the backend has to accept exactly that', () => {
    renderWorkspace();
    const body = screen.getByText(/"robot_id": "scout-01"/);
    expect(body).toHaveTextContent(/"pattern": "snake"/);
    expect(body).toHaveTextContent(/"mode": "autonomous"/);
  });

  it('refuses to start a mission it cannot send', async () => {
    renderWorkspace();
    await userEvent.click(screen.getByRole('button', { name: /start the mission/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/nothing was started or sent/i);
  });

  it('swaps the plan for the controls in remote control mode', async () => {
    renderWorkspace();
    await userEvent.click(screen.getByRole('button', { name: 'Remote control' }));

    expect(screen.getByRole('region', { name: /drive the robot/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start the mission/i })).not.toBeInTheDocument();
    // No route is planned when the operator is steering.
    expect(screen.getByRole('img', { name: /no route planned/ })).toBeInTheDocument();
  });

  /**
   * The sentence under each of these was dropped with the rest of the panel's prose. The
   * invariant it guarded was never the sentence though — it is that an unreported figure
   * shows a dash. A zero here would claim the robot is pointing north and has not moved.
   */
  it('shows heading and distance as a dash rather than as zero', async () => {
    renderWorkspace();
    await userEvent.click(screen.getByRole('button', { name: 'Remote control' }));
    for (const label of ['Heading', 'Distance driven']) {
      const metric = screen.getByText(label).closest('div')!;
      expect(metric).toHaveTextContent('—');
      expect(metric).not.toHaveTextContent(/\b0\b/);
    }
  });

  it('lists what the robot has actually run in this field', () => {
    renderWorkspace();
    expect(screen.getByText('B-4 full coverage')).toBeInTheDocument();
    const recorded = screen.getByText('B-4 full coverage').closest('li')!;
    expect(recorded).toHaveTextContent(/11 plants treated with 0\.\d+ L/);
  });
});
