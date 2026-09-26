import { SimulatedBadge } from '@agri/ui';

import { AppBrowser } from '@/components/store/app-browser';
import { AppCard } from '@/components/store/app-card';
import { FlowStrip } from '@/components/store/flow-strip';
import { RobotStrip } from '@/components/store/robot-strip';
import { ThemeToggle } from '@/components/theme-toggle';
import { data } from '@/lib/data';

export default async function StoreHome() {
  const [{ apps }, robot] = await Promise.all([
    data.getStoreApps('scout-01'),
    data.getRobot('scout-01'),
  ]);

  const featured = apps.find((app) => app.featured);
  const rest = apps.filter((app) => !app.featured);

  return (
    // A <main>, not a <div>: this page has no AppShell around it, so without one the
    // store is the only screen in the product with no landmark to skip to. Lighthouse
    // caught it; a keyboard user would have caught it sooner.
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 sm:py-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold leading-none tracking-tight">
          Agri Robot Store
        </h1>
        <ThemeToggle />
      </header>

      <RobotStrip robot={robot} />

      {/* The featured app is Crop Scout: it is the one an operator opens to do the work,
          and the others exist around it. Given its own row rather than a bigger tile in
          the grid, so the hierarchy is unambiguous at a glance. */}
      {featured && <AppCard app={featured} featured />}

      <AppBrowser apps={rest} />

      <section className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-ink-subtle text-xs font-semibold uppercase tracking-[0.08em]">
            How the work flows
          </h2>
          <FlowStrip apps={apps} />
        </div>
        <p className="text-ink-muted flex items-center gap-2 text-sm">
          <SimulatedBadge source={robot.source} size="xs" />
          values come from the simulated robot
        </p>
      </section>
    </main>
  );
}
