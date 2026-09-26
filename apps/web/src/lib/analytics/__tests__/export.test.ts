/**
 * The CSV is a file that outlives this session — it gets mailed to an agronomist and
 * opened in a spreadsheet months later. So the tests are about the things that go wrong
 * quietly: quoting, and whether a simulated reading can lose its label on the way out.
 */
import type { ApiDetection } from '@agri/contracts';
import { describe, expect, it } from 'vitest';

import { csvFilename, detectionsToCsv } from '@/lib/analytics/export';
import detectionsJson from '@/lib/fixtures/detections.json';

const detections = (detectionsJson as { detections: ApiDetection[] }).detections;

function rows(csv: string): string[] {
  return csv.trimEnd().split('\r\n');
}

describe('detectionsToCsv', () => {
  it('writes a header and one row per plant', () => {
    const csv = detectionsToCsv(detections);
    expect(rows(csv)).toHaveLength(detections.length + 1);
  });

  it('still writes a header when there is nothing to export', () => {
    // An empty export is a file that says "nothing found", not a zero-byte download.
    expect(rows(detectionsToCsv([]))).toHaveLength(1);
  });

  it('carries the source through, so a simulated reading cannot pass as a measured one', () => {
    const csv = detectionsToCsv(detections.slice(0, 1));
    expect(rows(csv)[0]).toContain('"source"');
    expect(rows(csv)[1]).toContain('"sim"');
  });

  it('quotes a field containing a comma without splitting the row', () => {
    const awkward: ApiDetection = {
      ...detections[0]!,
      issue: { ...detections[0]!.issue, name: 'Blight, late' },
    };
    const line = rows(detectionsToCsv([awkward]))[1]!;
    expect(line).toContain('"Blight, late"');
    // 13 columns means 12 separating commas; the one inside the name is not one of them.
    expect(line.split('","')).toHaveLength(13);
  });

  it('doubles a quote inside a value, per RFC 4180', () => {
    const awkward: ApiDetection = {
      ...detections[0]!,
      issue: { ...detections[0]!.issue, name: 'The "bad" one' },
    };
    expect(rows(detectionsToCsv([awkward]))[1]).toContain('"The ""bad"" one"');
  });

  it('writes an empty cell for a plant with no position, not a zero', () => {
    // 0,0 is the Gulf of Guinea. A missing coordinate has to stay missing.
    const noPosition: ApiDetection = {
      ...detections[0]!,
      location: null,
      row: null,
      metres_from_edge: null,
    };
    const line = rows(detectionsToCsv([noPosition]))[1]!;
    // row, metres from edge, latitude and longitude, all unknown and all left blank.
    expect(line).toContain('"","","",""');
    expect(line).not.toContain('"0"');
  });

  it('ends every line with CRLF, which is what a spreadsheet expects', () => {
    expect(detectionsToCsv(detections.slice(0, 2))).toMatch(/\r\n$/);
  });
});

describe('csvFilename', () => {
  it('sorts by date and names the field', () => {
    expect(csvFilename('B-4', new Date('2026-09-25T11:00:00Z'))).toBe(
      'b-4-detections-2026-09-25.csv',
    );
  });

  it('survives a field name that is not filename-safe', () => {
    expect(csvFilename('North / Field #2', new Date('2026-01-02T00:00:00Z'))).toBe(
      'north-field-2-detections-2026-01-02.csv',
    );
  });
});
