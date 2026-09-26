'use client';

import { Card, cn, SimulatedBadge } from '@agri/ui';
import type { ApiSource } from '@agri/contracts';
import { useEffect, useId, useRef, useState } from 'react';

import { type AdvisorAnswer, type AdvisorContext, ADVISOR_CAPABILITIES, answerFor } from '@/lib/chat/advisor';
import { DEFAULT_LANGUAGE, languageFor } from '@/lib/chat/languages';

import { LanguagePicker } from './language-picker';
import { MicButton } from './mic-button';

const STORAGE_KEY = 'agri-chat-language';

interface Turn {
  id: number;
  question: string;
  answer: AdvisorAnswer;
  /** The language the question was asked in, kept per turn so a mid-thread switch is
   *  visible in the transcript rather than retroactively rewriting earlier messages. */
  lang: string;
}

/**
 * Crop Chat.
 *
 * **No language model is connected to this product, and this screen says so on its face.**
 * Every reply is matched locally from the same seeded data Crop Health and the Dashboard
 * read — see lib/chat/advisor.ts, which carries the rules that keep that honest. The
 * alternative, a chat box that invents plausible agronomy, is the worst thing this product
 * could ship: it sits one tab away from a control that arms a pesticide sprayer.
 *
 * So the composer is real, the language choice is real and persisted, the transcript is
 * real, and each answer prints the screen its numbers came from. What is absent is the
 * model, and the banner above the thread is the first thing on the page.
 */
export function ChatWorkspace({
  context,
  source,
}: {
  context: AdvisorContext;
  source: ApiSource;
}) {
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const nextId = useRef(1);
  const threadEnd = useRef<HTMLDivElement>(null);
  const logId = useId();

  // Restored after mount rather than during render: the server has no localStorage, and
  // reading it in render would hydrate to different markup than it served.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && languageFor(stored).code === stored) setLanguage(stored);
    } catch {
      // Private browsing or blocked storage: the choice just will not persist.
    }
  }, []);

  function chooseLanguage(code: string) {
    setLanguage(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // As above.
    }
  }

  // Only on a new turn, and only `nearest`: yanking the thread on every render would
  // fight someone scrolling back through what they already asked.
  useEffect(() => {
    if (turns.length === 0) return;
    threadEnd.current?.scrollIntoView?.({ block: 'nearest' });
  }, [turns.length]);

  function ask(question: string) {
    const asked = question.trim();
    if (asked.length === 0) return;
    setTurns((current) => [
      ...current,
      { id: nextId.current++, question: asked, answer: answerFor(asked, context), lang: language },
    ]);
    setDraft('');
    setVoiceStatus(null);
  }

  const chosen = languageFor(language);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold leading-tight">
            {context.field.name} · {context.field.crop}
          </h2>
          <p className="text-ink-muted text-sm">
            {context.metrics.plantsFlagged} plants flagged · {context.metrics.criticalCount} critical
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SimulatedBadge source={source} />
          <LanguagePicker value={language} onChange={chooseLanguage} />
        </div>
      </Card>

      <Card className="flex min-h-[26rem] flex-col">
        {/* Named, because the microphone below is a live region too and a screen reader
            announcing two unlabelled ones gives no clue which just spoke. */}
        <p
          role="status"
          aria-label="Model availability"
          className="border-line text-ink-muted border-b px-4 py-2.5 text-xs"
        >
          <span className="text-critical-ink font-semibold">No language model is connected.</span>{' '}
          Answers are matched locally from this robot&rsquo;s own data and are written in English.
          {chosen.code !== DEFAULT_LANGUAGE && (
            <>
              {' '}
              {/* <bdi> isolates the name from the sentence around it. Without it a
                  right-to-left endonym reorders its LTR neighbours — "Replies in اردو
                  need" renders as "Replies inاردوI need". This is the element for it. */}
              Replies in{' '}
              <bdi lang={chosen.code} dir={chosen.dir ?? 'ltr'}>
                {chosen.endonym}
              </bdi>{' '}
              need a model, which is not wired up yet.
            </>
          )}
        </p>

        <div className="relative min-h-0 flex-1 overflow-y-auto">
          {turns.length === 0 ? (
            <Suggestions onPick={ask} />
          ) : (
            <ol className="flex flex-col gap-4 px-4 py-4" aria-label="Conversation" id={logId}>
              {turns.map((turn) => (
                <li key={turn.id} className="flex flex-col gap-2">
                  <Bubble
                    who="You"
                    text={turn.question}
                    lang={turn.lang}
                    dir={languageFor(turn.lang).dir}
                    mine
                  />
                  <Bubble who="Advisor" text={turn.answer.text} lang="en" source={turn.answer.source} />
                </li>
              ))}
              <div ref={threadEnd} />
            </ol>
          )}
        </div>

        <form
          className="border-line flex items-end gap-2 border-t px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            ask(draft);
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Ask about this field
          </label>
          <input
            id="chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about this field"
            autoComplete="off"
            lang={chosen.code}
            dir={chosen.dir ?? 'ltr'}
            className={cn(
              'border-line bg-surface h-11 min-w-0 flex-1 rounded-sm border px-3 text-base',
              'placeholder:text-ink-subtle',
              'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-1',
            )}
          />
          <MicButton
            language={chosen}
            onTranscript={setDraft}
            onStatus={setVoiceStatus}
          />
          <button
            type="submit"
            disabled={draft.trim().length === 0}
            className={cn(
              'bg-primary text-on-primary h-11 rounded-sm px-4 text-base font-medium',
              'hover:bg-primary-hover active:translate-y-px',
              'disabled:cursor-not-allowed disabled:opacity-45',
              'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
              'motion-safe:duration-fast motion-safe:transition-colors',
            )}
          >
            Ask
          </button>
        </form>

        {/* What the microphone is doing, in words. The button's colour says it too, but
            colour alone is not a state — and a refused permission has to be readable. */}
        <p
          role="status"
          aria-live="polite"
          aria-label="Microphone"
          className="text-ink-muted px-4 pb-3 text-xs empty:hidden"
        >
          {voiceStatus}
        </p>
      </Card>
    </div>
  );
}

/**
 * The empty state.
 *
 * The list is `ADVISOR_CAPABILITIES` itself, not a prettier copy of it — so a question
 * offered here is by construction one the advisor can actually source an answer for.
 */
function Suggestions({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-6">
      <p className="text-ink-muted text-sm">Ask about this field, or start with one of these.</p>
      <ul className="flex flex-wrap gap-2">
        {ADVISOR_CAPABILITIES.map((question) => (
          <li key={question}>
            <button
              type="button"
              onClick={() => onPick(question)}
              className={cn(
                'border-line bg-surface hover:border-primary hover:text-primary rounded-full border px-3 py-1.5 text-sm',
                'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
                'motion-safe:duration-fast motion-safe:transition-colors',
              )}
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bubble({
  who,
  text,
  lang,
  dir,
  source,
  mine = false,
}: {
  who: string;
  text: string;
  lang: string;
  dir?: 'rtl' | undefined;
  source?: string;
  mine?: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-1', mine && 'items-end')}>
      <span className="text-ink-subtle text-2xs font-semibold uppercase tracking-[0.08em]">
        {who}
      </span>
      <div
        lang={lang}
        dir={dir ?? 'ltr'}
        className={cn(
          'max-w-[46ch] rounded-md border px-3 py-2 text-sm',
          mine
            ? 'bg-primary-soft border-primary-soft text-ink'
            : 'bg-surface-sunk border-line text-ink',
        )}
      >
        {text}
      </div>
      {source && <span className="text-ink-subtle text-2xs">{source}</span>}
    </div>
  );
}
