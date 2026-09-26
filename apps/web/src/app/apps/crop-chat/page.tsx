import type { Metadata } from 'next';

import { ChatWorkspace } from '@/components/chat/chat-workspace';
import { AppShell } from '@/components/shell/app-shell';
import { advisorContextFrom } from '@/lib/chat/context';
import { data } from '@/lib/data';

export const metadata: Metadata = { title: 'Crop Chat' };

export default async function CropChatPage() {
  const [robot, overview, runs] = await Promise.all([
    data.getRobot('scout-01'),
    // The advisor answers out of the same overview Crop Health renders, so the two
    // screens cannot disagree about how many plants are flagged.
    data.getAnalyticsOverview(),
    data.getScoutRuns(),
  ]);

  return (
    <AppShell robot={robot} title="Crop Chat" subtitle="Ask about this field in your language">
      <ChatWorkspace
        context={advisorContextFrom({ overview, robot, runs: runs.runs })}
        source={robot.source}
      />
    </AppShell>
  );
}
