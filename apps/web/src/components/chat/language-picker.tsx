'use client';

import { GROUP_LABEL, GROUP_ORDER, LANGUAGES, languagesIn } from '@/lib/chat/languages';

/**
 * Choosing the conversation language.
 *
 * A native `<select>`, not a custom listbox. Twenty-three options is exactly the size at
 * which a bespoke dropdown starts costing more than it gives: the native control is
 * already keyboard-operable, already type-to-find, already a full-screen wheel on a phone,
 * and already renders every script correctly. Rebuilding that badly is the common way a
 * language picker becomes the least accessible control on the page.
 *
 * Each option shows its endonym first and the English name after it, so the list can be
 * scanned by someone reading either.
 */
export function LanguagePicker({
  value,
  onChange,
  id = 'chat-language',
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-ink-subtle text-xs font-semibold uppercase tracking-[0.08em]">
        Language
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-line-strong bg-surface text-ink focus-visible:outline-focus h-9 max-w-[14rem] rounded-sm border px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1"
      >
        {GROUP_ORDER.map((group) => (
          <optgroup key={group} label={GROUP_LABEL[group]}>
            {languagesIn(group).map((language) => (
              <option key={language.code} value={language.code} lang={language.code}>
                {language.endonym}
                {language.endonym === language.english ? '' : ` · ${language.english}`}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="sr-only">{LANGUAGES.length} languages available</span>
    </div>
  );
}
