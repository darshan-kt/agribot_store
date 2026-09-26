'use client';

import { EstopButton } from '@agri/ui';
import { useState } from 'react';

import { isFixtureMode } from '@/lib/data';

/**
 * The e-stop, wired to the command path.
 *
 * STUBBED: the command service that publishes `cmd/estop` is part of the backend, which
 * is being built separately. Until it exists this control cannot stop anything, and it
 * says so plainly instead of animating a successful stop it did not perform — a stop
 * button that lies is worse than no stop button.
 */
export function EstopControl({ robotOnline }: { robotOnline: boolean }) {
  const [engaged, setEngaged] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function engage() {
    if (isFixtureMode) {
      setNotice('Not connected to a robot — no stop command was sent.');
      return;
    }
    setEngaged(true);
  }

  function release() {
    setEngaged(false);
    setNotice(null);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <EstopButton
        engaged={engaged}
        onEngage={engage}
        onRelease={release}
        robotOnline={robotOnline}
      />
      {notice && (
        <p role="alert" className="text-critical-ink max-w-[22rem] text-right text-xs">
          {notice}
        </p>
      )}
    </div>
  );
}
