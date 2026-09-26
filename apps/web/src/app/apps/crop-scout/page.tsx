import type { Metadata } from 'next';

import { ScoutWorkspace } from '@/components/scout/scout-workspace';
import { AppShell } from '@/components/shell/app-shell';
import { data } from '@/lib/data';
import { detectionsInRun, latestRun, summariseRun } from '@/lib/scout/report';

export const metadata: Metadata = { title: 'Crop Watch' };

export default async function CropScoutPage() {
  const [robot, field, runs, detections] = await Promise.all([
    data.getRobot('scout-01'),
    data.getField(),
    data.getScoutRuns(),
    // The whole set, then scoped to the run below. The REST contract can filter by
    // run_id server-side; the fixture source cannot, because a detection row does not
    // carry its run in the response shape.
    data.getDetections(),
  ]);

  const run = latestRun(runs.runs);
  const report = summariseRun(run, detectionsInRun(detections.detections, run));

  return (
    <AppShell
      robot={robot}
      title="Crop Watch"
      subtitle="Drive the robot and spot problems as it goes"
      showEstop
    >
      <ScoutWorkspace robot={robot} field={field} report={report} />
    </AppShell>
  );
}
