import type { Metadata } from 'next';

import { AnalyticsWorkspace } from '@/components/analytics/analytics-workspace';
import { AppShell } from '@/components/shell/app-shell';
import { data } from '@/lib/data';

export const metadata: Metadata = { title: 'Crop Health' };

export default async function CropHealthPage() {
  const [robot, field, overview, detections, hotspots] = await Promise.all([
    data.getRobot('scout-01'),
    data.getField(),
    data.getAnalyticsOverview(),
    data.getDetections(),
    data.getHotspots(),
  ]);

  return (
    <AppShell robot={robot} title="Crop Health" subtitle="What was found, where, and what to do">
      <AnalyticsWorkspace
        overview={overview}
        field={field}
        detections={detections.detections}
        hotspots={hotspots.hotspots}
      />
    </AppShell>
  );
}
