import type { Metadata } from 'next';

import { MissionWorkspace } from '@/components/mission/mission-workspace';
import { AppShell } from '@/components/shell/app-shell';
import { data } from '@/lib/data';
import { treatedDetectionIds } from '@/lib/mission/sprayer';
import { detectionsInRun, latestRun } from '@/lib/scout/report';

export const metadata: Metadata = { title: 'Mission Planner' };

export default async function MissionPlannerPage() {
  const [robot, field, missions, runs, detections] = await Promise.all([
    data.getRobot('scout-01'),
    data.getField(),
    data.getMissions(),
    data.getScoutRuns(),
    data.getDetections(),
  ]);

  // Auto-spray treats what the most recent scouting run flagged, so the plan is scoped to
  // that run rather than to every detection ever recorded in the field.
  const run = latestRun(runs.runs);
  const flagged = detectionsInRun(detections.detections, run);

  // Plants an earlier run already sprayed are carried in as well, so the map can show
  // them treated. They are not part of the plan — the robot has been to those — but
  // leaving them off would draw a field that looks untouched when it is not.
  const treated = treatedDetectionIds(
    missions.missions.flatMap((mission) => mission.spray_events ?? []),
  );
  const flaggedIds = new Set(flagged.map((detection) => detection.id));
  const plants = [
    ...flagged,
    ...detections.detections.filter((d) => treated.has(d.id) && !flaggedIds.has(d.id)),
  ];

  return (
    <AppShell
      robot={robot}
      title="Mission Planner"
      subtitle="Plan a route, or drive it yourself"
      showEstop
    >
      <MissionWorkspace
        robot={robot}
        field={field}
        detections={plants}
        missions={missions.missions}
      />
    </AppShell>
  );
}
