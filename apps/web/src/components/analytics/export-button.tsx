'use client';

import type { ApiDetection } from '@agri/contracts';
import { Button } from '@agri/ui';
import { useState } from 'react';

import { csvFilename, detectionsToCsv } from '@/lib/analytics/export';

/**
 * Take the findings away.
 *
 * Built in the browser from the rows already on screen, so it works with no connection —
 * which is the condition this is most often wanted in. `GET /exports/detections` serves
 * the same CSV for exports larger than a page, and the button can point at it once the
 * backend answers.
 *
 * PDF is deliberately absent; the page prints instead. See lib/analytics/export.ts.
 */
export function ExportButton({
  detections,
  fieldName,
}: {
  detections: readonly ApiDetection[];
  fieldName: string;
}) {
  const [notice, setNotice] = useState<string | null>(null);

  function download() {
    if (detections.length === 0) {
      setNotice('There is nothing to export yet.');
      return;
    }

    const blob = new Blob([detectionsToCsv(detections)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = csvFilename(fieldName, new Date());
    document.body.append(link);
    link.click();
    link.remove();
    // Freed on the next tick: revoking synchronously races the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice(`Exported ${detections.length} rows.`);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" onClick={download}>
        Export CSV
      </Button>
      {notice && (
        <p role="status" className="text-ink-muted text-xs">
          {notice}
        </p>
      )}
    </div>
  );
}
