/**
 * Speaking a question instead of typing it.
 *
 * Voice is the input this app most wants: the person asking is standing in a field,
 * wearing gloves, holding a phone at arm's length in the sun. Typing "what should I do
 * about late blight" on glass in that position is the worst part of the interaction.
 *
 * Two things this module deliberately does **not** do:
 *
 *  1. **It does not ship a support matrix.** Which of the twenty-three locales an engine
 *     can actually hear is a property of the browser, the OS and the installed language
 *     packs — it changes between two phones in the same pocket. Hard-coding "Santali is
 *     unsupported" would be a guess printed as a fact. Instead the locale is requested
 *     and whatever the engine says back is reported, including `language-not-supported`.
 *  2. **It does not send what it heard.** The transcript lands in the composer for the
 *     operator to read before asking. Speech-to-text mishears, and a misheard question
 *     that answers itself is how someone ends up acting on advice about the wrong
 *     disease.
 *
 * The Web Speech API is unprefixed in some browsers and `webkit`-prefixed in others, and
 * absent entirely in Firefox. `speechRecognition()` resolves that in one place and
 * returns null when there is nothing to use, so the button can say so rather than
 * appearing to work.
 */

/** The slice of the Web Speech API this app uses. Typed here; it is not in lib.dom for
 *  every TS version, and the prefixed constructor is not typed at all. */
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

export interface SpeechResultEventLike {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal: boolean }
  >;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** The constructor this browser has, or null if it has none. */
export function speechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return speechRecognition() !== null;
}

/**
 * A plain sentence for a Web Speech error code.
 *
 * Each one names what to do about it, rather than restating the code. "not-allowed" is
 * the one that matters most: it is almost always a permission the person can grant, and
 * an error that does not say so reads as "this feature is broken".
 */
const MESSAGES: Record<string, string> = {
  'not-allowed':
    'Microphone access was refused. Allow it for this site in your browser settings, then try again.',
  'service-not-allowed':
    'This browser would not start its speech service. Typing the question still works.',
  'no-speech': 'Nothing was heard. Try again, closer to the microphone.',
  'audio-capture': 'No microphone was found on this device.',
  'network': 'Speech recognition needs a connection, and there is none right now.',
  'language-not-supported':
    'This browser cannot listen in that language yet. Choose another, or type the question.',
  'aborted': 'Listening stopped.',
};

export function messageForSpeechError(code: string): string {
  return MESSAGES[code] ?? `Speech recognition stopped: ${code}. Typing the question still works.`;
}

/** Joins the result list into one string. Interim results included, so the composer
 *  fills as the person speaks rather than staying blank until they stop. */
export function transcriptOf(event: SpeechResultEventLike): string {
  let text = '';
  for (let i = 0; i < event.results.length; i += 1) {
    const result = event.results[i];
    const alternative = result?.[0];
    if (alternative) text += alternative.transcript;
  }
  return text.trim();
}
