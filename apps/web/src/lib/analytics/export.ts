/**
 * Exporting what was found.
 *
 * The contract has `GET /exports/detections` returning CSV, and the backend will serve it.
 * This builds the same file in the browser from the rows already on screen, which is not
 * a workaround: the export is most wanted standing in a field on a phone with one bar of
 * signal, and a file assembled from data the page already holds needs no round trip at
 * all. When the API exists, the button can point at it for exports larger than a page.
 *
 * **PDF is not built.** The brief lists CSV/PDF; only CSV is in the frozen contract, and
 * generating a PDF in the browser needs a library outside the approved stack. Rather than
 * add one unasked or ship a button that prints a blank page, the page is laid out to
 * print — the browser's own "Save as PDF" produces the report, with the charts and the
 * tables and without the controls. See docs/PLAN.md.
 */

import type { ApiDetection } from '@agri/contracts';

/** The columns, in the order someone opening this in a spreadsheet would want them. */
const COLUMNS: Array<{
  header: string;
  of: (detection: ApiDetection) => string | number | null | undefined;
}> = [
  { header: 'detected_at', of: (d) => d.detected_at },
  { header: 'issue', of: (d) => d.issue.name },
  { header: 'issue_code', of: (d) => d.issue.code },
  { header: 'issue_type', of: (d) => d.issue.issue_type },
  { header: 'severity', of: (d) => d.severity },
  { header: 'confidence', of: (d) => d.confidence },
  { header: 'row', of: (d) => d.row },
  { header: 'metres_from_edge', of: (d) => d.metres_from_edge },
  { header: 'latitude', of: (d) => d.location?.lat ?? null },
  { header: 'longitude', of: (d) => d.location?.lon ?? null },
  { header: 'camera', of: (d) => d.camera },
  { header: 'inspection_status', of: (d) => d.inspection_status },
  // Carried into the export for the same reason it is on screen: a row that came from a
  // simulated robot must not become indistinguishable from a measured one in a
  // spreadsheet that outlives this session.
  { header: 'source', of: (d) => d.source },
];

/**
 * RFC 4180 quoting.
 *
 * Every field is quoted rather than only the ones that need it. Issue guidance contains
 * commas and apostrophes, and a rule applied to every field cannot be applied wrongly to
 * one of them.
 */
function quote(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function detectionsToCsv(detections: readonly ApiDetection[]): string {
  const header = COLUMNS.map((column) => quote(column.header)).join(',');
  const rows = detections.map((detection) =>
    COLUMNS.map((column) => quote(column.of(detection))).join(','),
  );
  // CRLF, because the spec says so and because Excel on Windows is where these land.
  return [header, ...rows].join('\r\n') + '\r\n';
}

/** A filename that sorts by date and says which field it came from. */
export function csvFilename(fieldName: string, at: Date): string {
  const day = at.toISOString().slice(0, 10);
  const field = fieldName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${field || 'field'}-detections-${day}.csv`;
}
