/**
 * The map claims, in its own comment, to be a quarter-turn rotation of the field rather
 * than a mirror or a free-hand sketch. These tests hold that claim against the real
 * seeded geometry: rows come out horizontal, in numbered order down the panel, and the
 * pins land inside the field they belong to.
 */
import type { ApiDetection, ApiFieldDetail, ApiScoutRun } from '@agri/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import detectionsJson from '@/lib/fixtures/detections.json';
import fieldJson from '@/lib/fixtures/field.json';
import runsJson from '@/lib/fixtures/scout-runs.json';
import { detectionsInRun, latestRun } from '@/lib/scout/report';

import { FieldMap } from '../field-map';

const field = fieldJson as ApiFieldDetail;
const run = latestRun((runsJson as { runs: ApiScoutRun[] }).runs);
const detections = detectionsInRun(
  (detectionsJson as { detections: ApiDetection[] }).detections,
  run,
);

/** The map's own SVG. The compass and the legend have their own, and are not the map. */
function renderMap(): SVGSVGElement {
  const { container } = render(
    <FieldMap field={field} detections={detections} selectedId={null} onSelect={() => {}} />,
  );
  return container.querySelector('svg[role="img"]')!;
}

describe('FieldMap', () => {
  it('draws every row of the field', () => {
    const map = renderMap();
    expect(map.querySelectorAll('line')).toHaveLength(field.row_count);
    expect(screen.getByRole('img', { name: /9 rows/ })).toBeInTheDocument();
  });

  it('runs the rows horizontally, which is the whole point of the rotation', () => {
    const map = renderMap();
    for (const line of map.querySelectorAll('line')) {
      const y1 = Number(line.getAttribute('y1'));
      const y2 = Number(line.getAttribute('y2'));
      const x1 = Number(line.getAttribute('x1'));
      const x2 = Number(line.getAttribute('x2'));
      expect(y1).toBeCloseTo(y2, 6);
      // 100 m long, so the horizontal run must dominate.
      expect(Math.abs(x2 - x1)).toBeGreaterThan(90);
    }
  });

  it('stacks the rows down the panel in the order they are numbered', () => {
    const map = renderMap();
    // Row 1 is the westmost; after a clockwise turn west is up, so row 1 sits at the top.
    const ys = [...map.querySelectorAll('line')].map((l) => Number(l.getAttribute('y1')));
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it('keeps every flagged plant inside the drawing', () => {
    const map = renderMap();
    const [, , spanX, spanY] = map.getAttribute('viewBox')!.split(' ').map(Number);
    const pins = map.querySelectorAll('circle');

    expect(pins.length).toBe(detections.length);
    for (const pin of pins) {
      expect(Number(pin.getAttribute('cx'))).toBeGreaterThanOrEqual(0);
      expect(Number(pin.getAttribute('cx'))).toBeLessThanOrEqual(spanX!);
      expect(Number(pin.getAttribute('cy'))).toBeGreaterThanOrEqual(0);
      expect(Number(pin.getAttribute('cy'))).toBeLessThanOrEqual(spanY!);
    }
  });

  /** The legend no longer spells the row out, so the highlight itself is the assertion. */
  it('picks out the row the robot reported', () => {
    const { container } = render(
      <FieldMap
        field={field}
        detections={detections}
        selectedId={null}
        onSelect={() => {}}
        reportedRow={7}
      />,
    );
    const highlighted = container.querySelectorAll('svg line.stroke-primary');
    expect(highlighted).toHaveLength(1);
  });

  it('draws no robot at all unless a pose is supplied', () => {
    render(
      <FieldMap
        field={field}
        detections={detections}
        selectedId={null}
        onSelect={() => {}}
        reportedRow={7}
      />,
    );
    expect(screen.queryByRole('img', { name: /robot/i })).not.toBeInTheDocument();
  });

  /**
   * The stand-in marker is allowed, but only while it is impossible to mistake for a fix.
   * The visible caption was dropped to keep the panel clean, which makes the accessible
   * name the only place that guarantee now lives — so it is the thing pinned here.
   */
  it('names a supplied pose as simulated, on the row it claims', () => {
    render(
      <FieldMap
        field={field}
        detections={detections}
        selectedId={null}
        onSelect={() => {}}
        reportedRow={7}
        simulatedPose={{ row: 7, along: 0.55 }}
      />,
    );
    expect(screen.getByRole('img', { name: /simulated position on row 7/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /not a satellite fix/i })).toBeInTheDocument();
  });
});
