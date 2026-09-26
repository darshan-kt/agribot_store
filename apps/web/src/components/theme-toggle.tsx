'use client';

import { cn } from '@agri/ui';
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'agri-theme';

/**
 * Light / dark / follow-system.
 *
 * Three states, not two, because "follow the device" is what most people actually want
 * and a two-way toggle silently overrides it. Light is the product default: these
 * screens are read in daylight far more often than at night.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const stored = readStoredTheme();
    if (stored) setTheme(stored);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    if (next === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', next);
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing or blocked storage: the choice just will not persist.
    }
  }

  const options: Array<{ id: Theme; label: string }> = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'system', label: 'Auto' },
  ];

  return (
    <div
      className="border-line bg-surface inline-flex rounded-full border p-0.5"
      role="group"
      aria-label="Colour theme"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={theme === option.id}
          onClick={() => apply(option.id)}
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium',
            'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-1',
            'motion-safe:duration-fast motion-safe:transition-colors',
            theme === option.id ? 'bg-primary text-on-primary' : 'text-ink-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Applies the stored theme before first paint.
 *
 * Inlined in <head> deliberately: doing this in an effect would show a flash of the
 * wrong theme on every load, which is worse than the small inline script.
 */
export const themeInitScript = `
(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');
if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();
`;
