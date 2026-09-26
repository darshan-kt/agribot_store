/**
 * The language list is a factual claim — that these are the twenty-two languages of the
 * Eighth Schedule plus English, each labelled in its own script. These tests hold the
 * shape of that claim so a later edit cannot quietly drop one or leave a Latin-script
 * placeholder where an endonym belongs.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_LANGUAGE, GROUP_ORDER, LANGUAGES, languageFor, languagesIn } from '../languages';

describe('the language set', () => {
  it('offers the twenty-two scheduled languages plus English', () => {
    expect(LANGUAGES).toHaveLength(23);
  });

  it('carries both the languages the brief names', () => {
    for (const code of ['en', 'hi']) {
      expect(LANGUAGES.some((l) => l.code === code)).toBe(true);
    }
  });

  it('carries all four major South Indian languages', () => {
    expect(
      languagesIn('south')
        .map((l) => l.english)
        .sort(),
    ).toEqual(['Kannada', 'Malayalam', 'Tamil', 'Telugu']);
  });

  it('uses a unique BCP-47 code for each', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  /**
   * The endonym is the point of the picker: someone who reads Malayalam should not have
   * to read the Latin alphabet to find Malayalam. Every non-English entry must therefore
   * carry at least one character outside ASCII.
   */
  it('labels every Indian language in its own script', () => {
    const ascii = /^[ -~]*$/;
    for (const language of LANGUAGES.filter((l) => l.code !== 'en')) {
      expect(ascii.test(language.endonym), `${language.english} is not in its own script`).toBe(
        false,
      );
    }
  });

  it('marks the Perso-Arabic languages as right-to-left, and only those', () => {
    expect(
      LANGUAGES.filter((l) => l.dir === 'rtl')
        .map((l) => l.code)
        .sort(),
    ).toEqual(['ks', 'sd', 'ur']);
  });

  it('places every language in exactly one rendered group', () => {
    const grouped = GROUP_ORDER.flatMap((group) => languagesIn(group));
    expect(grouped).toHaveLength(LANGUAGES.length);
  });

  it('falls back to English for a code it does not know', () => {
    expect(languageFor('zz').code).toBe(DEFAULT_LANGUAGE);
    expect(languageFor('ta').english).toBe('Tamil');
  });
});
