/**
 * Crop Health against the seeded field.
 *
 * The overview's numbers all come from one server-computed snapshot, so what is worth
 * testing is not the arithmetic but the joins: that the sentence and the figures beside it
 * are the same story, that selecting a hotspot opens the right plant, and that the two
 * things this page cannot do — record an inspection, show a photograph nobody uploaded —
 * say so.
 */
import type { ApiAnalyticsOverview, ApiDetection, ApiFieldDetail } from '@agri/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { clusterHotspots } from '@/lib/analytics/hotspots';
import analyticsJson from '@/lib/fixtures/analytics-overview.json';
import detectionsJson from '@/lib/fixtures/detections.json';
import fieldJson from '@/lib/fixtures/field.json';

import { AnalyticsWorkspace } from '../analytics-workspace';

const overview = analyticsJson as ApiAnalyticsOverview;
const field = fieldJson as ApiFieldDetail;
const detections = (detectionsJson as { detections: ApiDetection[] }).detections;
const hotspots = clusterHotspots(detections);

function renderWorkspace() {
  return render(
    <AnalyticsWorkspace
      overview={overview}
      field={field}
      detections={detections}
      hotspots={hotspots}
    />,
  );
}

describe('the overview', () => {
  it('leads with the sentence the backend assembled, not one composed here', () => {
    renderWorkspace();
    expect(screen.getByText(overview.alert!.sentence)).toBeInTheDocument();
    // The tone is announced as a word too, because two of the three severity colours sit
    // under 3:1 against a card.
    expect(screen.getByRole('img', { name: 'Urgent' })).toBeInTheDocument();
  });

  it('shows figures that agree with the sentence above them', () => {
    renderWorkspace();
    expect(screen.getByText('1,800')).toBeInTheDocument();
    // The rate appears twice on purpose: as the headline figure and as the last row of
    // the trend's table. They are the same number because they are the same snapshot.
    expect(screen.getAllByText('2.1%')).toHaveLength(2);
    // 14 critical, the same 14 the alert tells the operator to check.
    expect(overview.alert!.critical_count).toBe(14);
    const criticalCard = screen.getByText('Need attention first.').closest('div')!;
    expect(criticalCard).toHaveTextContent('14');
  });

  it('says which way the rate moved rather than only where it is', () => {
    renderWorkspace();
    expect(screen.getByText(/up 0\.5 points on the last run/i)).toBeInTheDocument();
  });

  it('names each problem in plain language, with its type', () => {
    renderWorkspace();
    expect(screen.getAllByText('Late blight').length).toBeGreaterThan(0);
    expect(screen.getAllByText('(fungus)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('(insect)').length).toBeGreaterThan(0);
  });

  it('publishes the trend as numbers as well as a line', () => {
    renderWorkspace();
    // A chart drawn in colours this palette cannot push over 3:1 owes the reader a table.
    const table = screen.getByRole('table', { name: /infection rate by scouting run/i });
    expect(within(table).getAllByRole('row')).toHaveLength(overview.trend.points.length + 1);
  });

  it('marks the runs that crossed the level worth acting on', () => {
    renderWorkspace();
    expect(
      screen.getByRole('img', { name: /the level worth acting on is 4\.0%/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/below the level worth acting on/i)).toBeInTheDocument();
  });
});

describe('the map and the hotspots', () => {
  it('puts every flagged plant on the map', () => {
    renderWorkspace();
    const located = detections.filter((detection) => detection.location != null);
    expect(
      screen.getByRole('img', { name: new RegExp(`${located.length} flagged plants`) }),
    ).toBeInTheDocument();
  });

  it('opens the sample plant when a hotspot is chosen', async () => {
    renderWorkspace();
    expect(screen.getByText(/pick a hotspot or tap a plant/i)).toBeInTheDocument();

    const list = screen.getByRole('list', { name: /hotspots/i });
    await userEvent.click(within(list).getAllByRole('button')[0]!);

    const worst = hotspots[0]!;
    const sample = detections.find((d) => d.id === worst.sample_detection_id)!;
    expect(screen.getByText('Flagged plant')).toBeInTheDocument();
    expect(screen.getAllByText(sample.issue.name).length).toBeGreaterThan(0);
  });

  it('filters the list by severity, and says how many are in each', async () => {
    renderWorkspace();
    const criticalCount = hotspots.filter((h) => h.severity === 'critical').length;

    await userEvent.click(screen.getByRole('button', { name: `Critical ${criticalCount}` }));
    const list = screen.getByRole('list', { name: /hotspots/i });
    expect(within(list).getAllByRole('listitem')).toHaveLength(criticalCount);
  });

  it('sends the operator to rows, not to coordinates', () => {
    renderWorkspace();
    const list = screen.getByRole('list', { name: /hotspots/i });
    expect(within(list).getAllByText(/Rows? \d/).length).toBeGreaterThan(0);
  });
});

describe('one plant', () => {
  it('gives the walk: row, distance from the edge, and the coordinates', async () => {
    renderWorkspace();
    const list = screen.getByRole('list', { name: /hotspots/i });
    await userEvent.click(within(list).getAllByRole('button')[0]!);

    expect(screen.getByText('Row')).toBeInTheDocument();
    expect(screen.getByText('From the field edge')).toBeInTheDocument();
    expect(screen.getByText('GPS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy GPS' })).toBeInTheDocument();
  });

  it('gives the guidance in the catalogue’s own words', async () => {
    renderWorkspace();
    const list = screen.getByRole('list', { name: /hotspots/i });
    await userEvent.click(within(list).getAllByRole('button')[0]!);

    const sample = detections.find((d) => d.id === hotspots[0]!.sample_detection_id)!;
    expect(screen.getByText('What it is')).toBeInTheDocument();
    expect(screen.getByText(sample.issue.what_it_is)).toBeInTheDocument();
    expect(screen.getByText(sample.issue.what_to_do)).toBeInTheDocument();
  });

  it('says the photograph was never stored instead of showing a placeholder for one', async () => {
    renderWorkspace();
    const list = screen.getByRole('list', { name: /hotspots/i });
    await userEvent.click(within(list).getAllByRole('button')[0]!);

    expect(screen.getByText(/no photograph was stored/i)).toBeInTheDocument();
    // What *is* recorded — where in the frame the plant sat — is drawn, and labelled as a
    // diagram so it cannot be mistaken for the plant.
    expect(screen.getByRole('img', { name: /where in the .* camera frame/i })).toBeInTheDocument();
    expect(screen.getByText(/not a picture of the plant/i)).toBeInTheDocument();
  });

  it('refuses to record an inspection it cannot save', async () => {
    renderWorkspace();
    const list = screen.getByRole('list', { name: /hotspots/i });
    await userEvent.click(within(list).getAllByRole('button')[0]!);
    await userEvent.click(screen.getByRole('button', { name: /mark inspected/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/was not recorded/i);
  });

  it('closes back to the empty state', async () => {
    renderWorkspace();
    const list = screen.getByRole('list', { name: /hotspots/i });
    await userEvent.click(within(list).getAllByRole('button')[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText(/pick a hotspot or tap a plant/i)).toBeInTheDocument();
  });
});
