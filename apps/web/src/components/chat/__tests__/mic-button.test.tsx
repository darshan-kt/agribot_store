/**
 * The microphone against a fake engine.
 *
 * What is pinned here is the behaviour that makes voice input trustworthy rather than
 * merely present: it asks in the chosen language, it writes into the composer instead of
 * asking on the operator's behalf, it says so out loud when it is refused, and in a
 * browser that cannot listen it is visibly unavailable rather than inert.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { languageFor } from '@/lib/chat/languages';

import { MicButton } from '../mic-button';

const win = window as unknown as Record<string, unknown>;

/** Stands in for the browser engine, so the component's own wiring is what is tested. */
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  started = false;
  aborted = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started = true;
    this.onstart?.();
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.aborted = true;
  }
  hear(transcript: string, isFinal = true) {
    this.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript }], { isFinal })],
    });
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
}

function renderMic(code = 'hi') {
  const onTranscript = vi.fn();
  const onStatus = vi.fn();
  render(
    <MicButton language={languageFor(code)} onTranscript={onTranscript} onStatus={onStatus} />,
  );
  return { onTranscript, onStatus };
}

afterEach(() => {
  delete win.SpeechRecognition;
  FakeRecognition.last = null;
});

describe('MicButton, in a browser that can listen', () => {
  function enable() {
    win.SpeechRecognition = FakeRecognition;
  }

  it('listens in the language the picker is set to', async () => {
    enable();
    renderMic('ta');
    await userEvent.click(await screen.findByRole('button', { name: /speak your question/i }));
    // The locale, not the bare tag — an engine given "ta" does not know which Tamil.
    expect(FakeRecognition.last?.lang).toBe('ta-IN');
  });

  it('writes what it hears into the composer rather than asking for you', async () => {
    enable();
    const { onTranscript } = renderMic();
    await userEvent.click(await screen.findByRole('button', { name: /speak your question/i }));
    FakeRecognition.last!.hear('what is wrong in the field');
    expect(onTranscript).toHaveBeenCalledWith('what is wrong in the field');
  });

  it('fills the composer while someone is still speaking', async () => {
    enable();
    const { onTranscript } = renderMic();
    await userEvent.click(await screen.findByRole('button', { name: /speak your question/i }));
    FakeRecognition.last!.hear('late bli', false);
    expect(onTranscript).toHaveBeenCalledWith('late bli');
  });

  it('shows that the microphone is open, and can be pressed again to close it', async () => {
    enable();
    renderMic();
    const button = await screen.findByRole('button', { name: /speak your question/i });
    await userEvent.click(button);

    const listening = screen.getByRole('button', { name: /stop listening/i });
    expect(listening).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(listening);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /speak your question/i })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
  });

  /** A refused permission is recoverable, so it must be said, not swallowed. */
  it('reports a refused microphone in words that name the fix', async () => {
    enable();
    const { onStatus } = renderMic();
    await userEvent.click(await screen.findByRole('button', { name: /speak your question/i }));
    FakeRecognition.last!.fail('not-allowed');
    expect(onStatus).toHaveBeenCalledWith(expect.stringMatching(/allow it/i));
  });

  it('reports a language the engine cannot hear', async () => {
    enable();
    const { onStatus } = renderMic('sat');
    await userEvent.click(await screen.findByRole('button', { name: /speak your question/i }));
    FakeRecognition.last!.fail('language-not-supported');
    expect(onStatus).toHaveBeenCalledWith(expect.stringMatching(/cannot listen in that language/i));
  });

  it('does not report a deliberate stop as a failure', async () => {
    enable();
    const { onStatus } = renderMic();
    await userEvent.click(await screen.findByRole('button', { name: /speak your question/i }));
    onStatus.mockClear();
    FakeRecognition.last!.fail('aborted');
    expect(onStatus).toHaveBeenCalledWith(null);
  });

  /** An engine left running holds the device's mic indicator on after the page is gone. */
  it('releases the microphone when it unmounts mid-sentence', async () => {
    enable();
    const { unmount } = render(
      <MicButton language={languageFor('hi')} onTranscript={vi.fn()} onStatus={vi.fn()} />,
    );
    await userEvent.click(await screen.findByRole('button', { name: /speak your question/i }));
    unmount();
    expect(FakeRecognition.last?.aborted).toBe(true);
  });
});

describe('MicButton, in a browser that cannot', () => {
  /** jsdom has no Web Speech API, which is exactly Firefox's position. */
  it('is visibly unavailable and says why, rather than doing nothing when pressed', async () => {
    renderMic();
    const button = await screen.findByRole('button', { name: /not supported in this browser/i });
    expect(button).toBeDisabled();
  });
});
