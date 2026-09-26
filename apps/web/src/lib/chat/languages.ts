/**
 * The languages Crop Chat will hold a conversation in.
 *
 * The set is the twenty-two languages of the Eighth Schedule to the Constitution of
 * India, plus English. That is a defined, citable list rather than a judgement call about
 * which languages "count" — which matters, because any hand-picked subset of Indian
 * languages is a statement about the ones left out.
 *
 * Each entry carries its **endonym**: the name of the language in that language, in its
 * own script. A picker that offers "Malayalam" in Latin letters to someone who reads
 * Malayalam has made them read a foreign script to find their own. The English name is
 * kept alongside for search and for screen readers announcing in an English context.
 *
 * `dir: 'rtl'` is set for the three written in Perso-Arabic script. It is applied to the
 * composer and to the message that answers it, not to the page — mixing directions at
 * the page level breaks the rest of the layout.
 */

export type LanguageGroup = 'primary' | 'south' | 'other';

export interface ChatLanguage {
  /** BCP-47 tag. Used for the `lang` attribute, so the browser picks the right font. */
  code: string;
  /**
   * The locale handed to speech recognition, which wants a region the bare tag does not
   * carry. Indian regional tags throughout, because that is the audience this list is
   * for — including English, where `en-IN` recognises an Indian speaker markedly better
   * than `en-GB` does. Nepali is the exception: `ne-NP` is the tag engines actually ship.
   *
   * Whether an engine supports a given locale is a property of the browser and the
   * device, not of this file, so nothing here claims it does. The mic asks for the
   * locale and reports what the engine says back.
   */
  speech: string;
  /** The language's own name, in its own script. */
  endonym: string;
  /** The English name, for search and for an English-language screen reader. */
  english: string;
  dir?: 'rtl';
  group: LanguageGroup;
}

/**
 * Grouped so the two named in the brief come first and the South Indian languages are a
 * block rather than four entries scattered through an alphabetical list of twenty-three.
 * Within each group, ordered by English name.
 */
export const LANGUAGES: readonly ChatLanguage[] = [
  { code: 'en', speech: 'en-IN', endonym: 'English', english: 'English', group: 'primary' },
  { code: 'hi', speech: 'hi-IN', endonym: 'हिन्दी', english: 'Hindi', group: 'primary' },

  { code: 'kn', speech: 'kn-IN', endonym: 'ಕನ್ನಡ', english: 'Kannada', group: 'south' },
  { code: 'ml', speech: 'ml-IN', endonym: 'മലയാളം', english: 'Malayalam', group: 'south' },
  { code: 'ta', speech: 'ta-IN', endonym: 'தமிழ்', english: 'Tamil', group: 'south' },
  { code: 'te', speech: 'te-IN', endonym: 'తెలుగు', english: 'Telugu', group: 'south' },

  { code: 'as', speech: 'as-IN', endonym: 'অসমীয়া', english: 'Assamese', group: 'other' },
  { code: 'bn', speech: 'bn-IN', endonym: 'বাংলা', english: 'Bengali', group: 'other' },
  { code: 'brx', speech: 'brx-IN', endonym: 'बर’', english: 'Bodo', group: 'other' },
  { code: 'doi', speech: 'doi-IN', endonym: 'डोगरी', english: 'Dogri', group: 'other' },
  { code: 'gu', speech: 'gu-IN', endonym: 'ગુજરાતી', english: 'Gujarati', group: 'other' },
  { code: 'ks', speech: 'ks-IN', endonym: 'کٲشُر', english: 'Kashmiri', dir: 'rtl', group: 'other' },
  { code: 'kok', speech: 'kok-IN', endonym: 'कोंकणी', english: 'Konkani', group: 'other' },
  { code: 'mai', speech: 'mai-IN', endonym: 'मैथिली', english: 'Maithili', group: 'other' },
  { code: 'mni', speech: 'mni-IN', endonym: 'ꯃꯤꯇꯩ ꯂꯣꯟ', english: 'Manipuri', group: 'other' },
  { code: 'mr', speech: 'mr-IN', endonym: 'मराठी', english: 'Marathi', group: 'other' },
  { code: 'ne', speech: 'ne-NP', endonym: 'नेपाली', english: 'Nepali', group: 'other' },
  { code: 'or', speech: 'or-IN', endonym: 'ଓଡ଼ିଆ', english: 'Odia', group: 'other' },
  { code: 'pa', speech: 'pa-IN', endonym: 'ਪੰਜਾਬੀ', english: 'Punjabi', group: 'other' },
  { code: 'sa', speech: 'sa-IN', endonym: 'संस्कृतम्', english: 'Sanskrit', group: 'other' },
  { code: 'sat', speech: 'sat-IN', endonym: 'ᱥᱟᱱᱛᱟᱲᱤ', english: 'Santali', group: 'other' },
  { code: 'sd', speech: 'sd-IN', endonym: 'سنڌي', english: 'Sindhi', dir: 'rtl', group: 'other' },
  { code: 'ur', speech: 'ur-IN', endonym: 'اردو', english: 'Urdu', dir: 'rtl', group: 'other' },
];

export const GROUP_LABEL: Record<LanguageGroup, string> = {
  primary: 'English and Hindi',
  south: 'South Indian languages',
  other: 'Other Indian languages',
};

export const GROUP_ORDER: readonly LanguageGroup[] = ['primary', 'south', 'other'];

export const DEFAULT_LANGUAGE = 'en';

export function languageFor(code: string): ChatLanguage {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0]!;
}

export function languagesIn(group: LanguageGroup): ChatLanguage[] {
  return LANGUAGES.filter((language) => language.group === group);
}
