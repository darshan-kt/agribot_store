'use client';

import type {
  ApiAnalyticsOverview,
  ApiDetection,
  ApiFieldDetail,
  ApiHotspot,
  ApiSeverity,
} from '@agri/contracts';
import { Card, CardHeader, Metric, SeverityBar } from '@agri/ui';
import { useState } from 'react';

import { aboveThreshold, formatChange, formatRate, severityCounts } from '@/lib/analytics/overview';

import { AlertBanner } from './alert-banner';
import { DetectionDetail } from './detection-detail';
import { ExportButton } from './export-button';
import { HealthMap } from './health-map';
import { HotspotList } from './hotspot-list';
import { IssueBars } from './issue-bars';
import { TrendChart } from './trend-chart';

/**
 * Crop Health.
 *
 * Read top to bottom the way the question is asked: **what is wrong** (one sentence),
 * **how bad and getting worse or better** (the numbers and the trend), **where** (the
 * map), **what exactly, and what do I do** (the hotspots and one plant's detail).
 *
 * The brief asks for this to work for technical and non-technical readers alike, and the
 * resolution is not two modes — it is that the plain-language answer is always first and
 * the evidence is always underneath it, so neither reader has to pass through the other's
 * version. This is also the one app specified for a phone, so it is a single column that
 * widens rather than a dashboard that shrinks.
 *
 * One selection is shared by the map, the hotspot list and the detail panel: tapping a
 * dot opens that plant, tapping a hotspot opens its sample plant.
 */
export function AnalyticsWorkspace({
  overview,
  field,
  detections,
  hotspots,
}: {
  overview: ApiAnalyticsOverview;
  field: ApiFieldDetail;
  /** Every outstanding flagged plant in the field, newest first. */
  detections: readonly ApiDetection[];
  hotspots: readonly ApiHotspot[];
}) {
  const [severity, setSeverity] = useState<ApiSeverity | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = detections.find((detection) => detection.id === selectedId) ?? null;
  const selectedHotspot =
    hotspots.find((hotspot) => hotspot.sample_detection_id === selectedId) ?? null;
  const counts = severityCounts(overview);
  const urgent = aboveThreshold(overview);
  const change = formatChange(overview.metrics.change_vs_previous_run);

  return (
    <div className="flex flex-col gap-4">
      <AlertBanner alert={overview.alert} />

      <Card className="flex flex-col gap-4 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-display text-lg font-semibold leading-tight">
              {overview.field.name ?? field.name} · {overview.field.crop ?? field.crop}
            </h2>
            <p className="text-ink-muted text-sm">From the scouting runs of the last two weeks.</p>
          </div>
          <ExportButton detections={detections} fieldName={overview.field.name ?? field.name} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Plants scanned" value={overview.metrics.plants_scanned.toLocaleString()} />
          <Metric label="Flagged" value={overview.metrics.plants_flagged} />
          <Metric
            label="Infection rate"
            value={formatRate(overview.metrics.infection_rate)}
            tone={urgent ? 'critical' : 'default'}
            {...(change ? { hint: change } : {})}
          />
          <Metric
            label="Critical"
            value={overview.metrics.critical_count}
            tone={overview.metrics.critical_count > 0 ? 'critical' : 'default'}
            hint="Need attention first."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="text-ink-muted flex flex-wrap justify-between gap-x-4 text-xs">
            <span>Severity mix</span>
            <span>
              {counts.critical ?? 0} critical · {counts.moderate ?? 0} moderate · {counts.low ?? 0}{' '}
              low
            </span>
          </div>
          <SeverityBar counts={counts} className="h-3" />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader title="What was found" eyebrow="By problem" />
          <div className="px-4 pb-4">
            <IssueBars issues={overview.issues} />
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Across scouting runs"
            eyebrow="Trend"
            action={
              <span className="text-ink-muted text-xs">
                {urgent ? 'Above the level worth acting on' : 'Below the level worth acting on'}
              </span>
            }
          />
          <div className="px-4 pb-4">
            <TrendChart
              points={overview.trend.points}
              threshold={overview.trend.action_threshold}
            />
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-3 p-3">
        <HealthMap
          field={field}
          detections={detections}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <p className="text-ink-muted text-xs">
          Every flagged plant still outstanding. Tap one to see what it is and what to do.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex max-h-[34rem] flex-col">
          <CardHeader
            title="Hotspots"
            eyebrow="Where to walk"
            action={
              <span className="text-ink-muted font-mono text-xs tabular-nums">
                {hotspots.length}
              </span>
            }
          />
          <HotspotList
            hotspots={hotspots}
            severity={severity}
            onSeverityChange={setSeverity}
            selectedId={selectedHotspot?.id ?? null}
            onSelect={(id) => {
              const hotspot = hotspots.find((candidate) => candidate.id === id);
              setSelectedId(hotspot?.sample_detection_id ?? null);
            }}
            className="min-h-0 flex-1"
          />
        </Card>

        {selected ? (
          <DetectionDetail detection={selected} onClose={() => setSelectedId(null)} />
        ) : (
          <Card className="flex flex-col">
            <CardHeader title="Nothing selected" eyebrow="Plant detail" />
            <p className="text-ink-muted px-4 pb-4 text-sm">
              Pick a hotspot or tap a plant on the map to see its photograph, its exact position and
              what to do about it.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
