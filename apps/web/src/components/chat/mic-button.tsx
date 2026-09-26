'use client';

import { cn } from '@agri/ui';
import { useEffect, useRef, useState } from 'react';

import type { ChatLanguage } from '@/lib/chat/languages';
import {
  messageForSpeechError,
  speechRecognition,
  type SpeechRecognitionLike,
  transcriptOf,
} from '@/lib/chat/voice';

/**
 * Speak the question instead of typing it.
 *
 * Listens in whichever language the picker is set to, and writes what it hears into the
 * composer — it does not ask on the operator's behalf. See lib/chat/voice.ts for why.
 *
 * The button never pretends. Before the browser is known it renders inert; a browser with
 * no Web Speech API gets a disabled mic that says what is missing rather than one that
 * does nothing when pressed; and every engine error is reported in a sentence that names
 * the fix. A microphone that silently fails is worse than no microphone, because the
 * person keeps talking to it.
 */
export function MicButton({
  language,
  onTranscript,
  onStatus,
}: {
  language: ChatLanguage;
  onTranscript: (text: string) => void;
  /** Surfaced by the parent in its live region, so a refusal is announced, not just drawn. */
  onStatus: (message: string | null) => void;
}) {
  // Resolved after mount: the server has no `window`, and rendering a working button on
  // the server that turns out to be unsupported on the client is a hydration mismatch.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const engine = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(speechRecognition() !== null);
  }, []);

  // Stop the microphone if this unmounts mid-sentence. An engine left running holds the
  // device's mic indicator on after the page that opened it is gone.
  useEffect(() => {
    return () => engine.current?.abort();
  }, []);

  function stop() {
    engine.current?.stop();
    setListening(false);
  }

  function start() {
    const Recognition = speechRecognition();
    if (!Recognition) return;

    const recognition = new Recognition();
    engine.current = recognition;
    recognition.lang = language.speech;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      onStatus(`Listening in ${language.english}.`);
    };
    recognition.onresult = (event) => onTranscript(transcriptOf(event));
    recognition.onerror = (event) => {
      setListening(false);
      // A deliberate stop is not a failure and does not need announcing as one.
      onStatus(event.error === 'aborted' ? null : messageForSpeechError(event.error));
    };
    recognition.onend = () => {
      setListening(false);
      onStatus(null);
    };

    try {
      recognition.start();
    } catch {
      // Chrome throws if start() is called while an earlier session is still closing.
      setListening(false);
      onStatus('The microphone was still busy. Try again.');
    }
  }

  const unsupported = supported === false;
  const label = listening
    ? 'Stop listening'
    : unsupported
      ? 'Speaking is not supported in this browser'
      : `Speak your question in ${language.english}`;

  return (
    <button
      type="button"
      onClick={() => (listening ? stop() : start())}
      disabled={supported !== true}
      aria-label={label}
      aria-pressed={listening}
      title={label}
      className={cn(
        'relative inline-flex size-11 shrink-0 items-center justify-center rounded-sm border',
        'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-45',
        'motion-safe:duration-fast motion-safe:transition-colors',
        listening
          ? 'bg-danger border-danger text-on-critical'
          : 'bg-surface border-line-strong text-ink hover:bg-primary-soft',
      )}
    >
      {/* The ring says "the microphone is open", which is the one thing that must be
          unmissable. It is the same ping the status dot uses, and stops under
          prefers-reduced-motion like every other animation here. */}
      {listening && (
        <span
          aria-hidden
          className="bg-danger motion-safe:animate-ping-slow absolute inset-0 rounded-sm opacity-40"
        />
      )}
      <MicGlyph className="relative size-5" muted={unsupported} />
    </button>
  );
}

function MicGlyph({ className, muted }: { className?: string; muted: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
      {/* A struck-through mic for a browser that cannot listen, so the disabled state
          reads as "not available" rather than as "not yet pressed". */}
      {muted && <path d="M4 20 20 4" />}
    </svg>
  );
}
