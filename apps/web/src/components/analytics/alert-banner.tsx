import type { ApiAlert } from '@agri/contracts';
import { cn } from '@agri/ui';

/**
 * The one sentence at the top of the page.
 *
 * It is the whole product for a farmer who opens this on a phone at the edge of a field:
 * what is happening, where, and by when. Everything below it is the evidence.
 *
 * The sentence is **assembled by the backend from the same snapshot as the numbers**, not
 * composed here from the numbers on screen — the contract is explicit about that, because
 * a sentence written in the browser can disagree with the figures beside it after a
 * re-fetch. This component chooses a tone and a shape for it, and nothing else.
 */
export function AlertBanner({ alert, className }: { alert: ApiAlert | null; className?: string }) {
  if (!alert) {
    return (
      <div
        className={cn('border-line bg-surface rounded-md border px-4 py-3', className)}
        role="status"
      >
        <p className="text-ink text-base">
          Nothing needs attention in this field right now. The last scouting run found no plants
          serious enough to act on.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-md border px-4 py-3.5',
        alert.tone === 'critical' && 'border-critical bg-critical-soft',
        alert.tone === 'warning' && 'border-moderate bg-moderate-soft',
        alert.tone === 'info' && 'border-info bg-info-soft',
        className,
      )}
      role="status"
    >
      <div className="flex items-start gap-3">
        <ToneMark tone={alert.tone} />
        <p className="text-ink font-display text-balance text-lg font-semibold leading-snug">
          {alert.sentence}
        </p>
      </div>
    </div>
  );
}

/**
 * Tone as a shape, not only a colour.
 *
 * The three tones are the severity scale, and two of its three steps sit under 3:1
 * against a card. A banner that said "this is urgent" in colour alone would say nothing
 * at all in greyscale or in bright sun.
 */
function ToneMark({ tone }: { tone: ApiAlert['tone'] }) {
  const label = tone === 'critical' ? 'Urgent' : tone === 'warning' ? 'Warning' : 'Note';
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        tone === 'critical' && 'bg-critical text-on-critical',
        tone === 'warning' && 'bg-moderate text-on-moderate',
        tone === 'info' && 'bg-info text-on-info',
      )}
    >
      {tone === 'info' ? 'i' : '!'}
    </span>
  );
}
