/**
 * The voice layer's job is to be honest about a capability that varies by browser, by
 * device and by installed language pack. These tests hold the two halves of that: it
 * detects rather than assumes, and every error code it can receive becomes a sentence
 * that names what to do rather than echoing the code.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { messageForSpeechError, speechRecognition, speechSupported, transcriptOf } from '../voice';

const win = window as unknown as Record<string, unknown>;

afterEach(() => {
  delete win.SpeechRecognition;
  delete win.webkitSpeechRecognition;
});

describe('speechRecognition', () => {
  /** jsdom ships no Web Speech API, which is the same position Firefox is in. */
  it('reports nothing available when the browser has no API', () => {
    expect(speechRecognition()).toBeNull();
    expect(speechSupported()).toBe(false);
  });

  it('finds the unprefixed constructor', () => {
    class Fake {}
    win.SpeechRecognition = Fake;
    expect(speechRecognition()).toBe(Fake);
    expect(speechSupported()).toBe(true);
  });

  it('falls back to the webkit-prefixed one, which is what Safari and Chrome expose', () => {
    class Fake {}
    win.webkitSpeechRecognition = Fake;
    expect(speechRecognition()).toBe(Fake);
  });

  it('prefers the standard constructor when a browser has both', () => {
    class Standard {}
    class Prefixed {}
    win.SpeechRecognition = Standard;
    win.webkitSpeechRecognition = Prefixed;
    expect(speechRecognition()).toBe(Standard);
  });
});

describe('messageForSpeechError', () => {
  /**
   * The one that matters most: a refused microphone is a permission the person can
   * grant, so the message has to say so. Reading "not-allowed" teaches them nothing.
   */
  it('tells someone how to fix a refused microphone', () => {
    const message = messageForSpeechError('not-allowed');
    expect(message).toMatch(/allow it/i);
    expect(message).not.toContain('not-allowed');
  });

  it('says a language is unsupported without blaming the person', () => {
    expect(messageForSpeechError('language-not-supported')).toMatch(/cannot listen in that language/i);
  });

  it('always offers typing as the way through', () => {
    for (const code of ['service-not-allowed', 'language-not-supported', 'something-new']) {
      expect(messageForSpeechError(code)).toMatch(/typ/i);
    }
  });

  it('degrades to a readable sentence for a code it has never seen', () => {
    const message = messageForSpeechError('quantum-flux');
    expect(message).toContain('quantum-flux');
    expect(message).toMatch(/^Speech recognition stopped/);
  });

  it('has a sentence for every code the API can emit', () => {
    // The set defined by the Web Speech spec's SpeechRecognitionErrorCode.
    const codes = [
      'no-speech',
      'aborted',
      'audio-capture',
      'network',
      'not-allowed',
      'service-not-allowed',
      'language-not-supported',
    ];
    for (const code of codes) {
      expect(messageForSpeechError(code), code).not.toMatch(/^Speech recognition stopped/);
    }
  });
});

describe('transcriptOf', () => {
  function event(...chunks: Array<[string, boolean]>) {
    return {
      resultIndex: 0,
      results: chunks.map(([transcript, isFinal]) =>
        Object.assign([{ transcript }], { isFinal }),
      ),
    };
  }

  it('joins the chunks the engine has produced so far', () => {
    expect(transcriptOf(event(['what is wrong ', true], ['in the field', false]))).toBe(
      'what is wrong in the field',
    );
  });

  it('includes interim results, so the composer fills while someone is still speaking', () => {
    expect(transcriptOf(event(['late bli', false]))).toBe('late bli');
  });

  it('is empty when nothing has been heard', () => {
    expect(transcriptOf(event())).toBe('');
  });
});
