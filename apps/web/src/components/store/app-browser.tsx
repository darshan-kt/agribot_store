'use client';

import type { ApiStoreApp } from '@agri/contracts';
import { cn, EmptyState } from '@agri/ui';
import { useMemo, useState } from 'react';

import { AppCard } from './app-card';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'field_ops', label: 'Field ops' },
  { id: 'insights', label: 'Insights' },
  { id: 'robot', label: 'Robot' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

/**
 * Search and category filtering over the catalog.
 *
 * Filtering happens on the client against an already-loaded list: there are four apps,
 * and a round trip per keystroke would be slower and would break in the field the moment
 * the link drops. The result count is announced politely so the filter is usable without
 * sight of the grid.
 */
export function AppBrowser({ apps }: { apps: ApiStoreApp[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId>('all');

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return apps.filter((app) => {
      if (category !== 'all' && app.category !== category) return false;
      if (!needle) return true;
      return (
        app.name.toLowerCase().includes(needle) ||
        app.tagline.toLowerCase().includes(needle) ||
        app.description.toLowerCase().includes(needle)
      );
    });
  }, [apps, category, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchField value={query} onChange={setQuery} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          {CATEGORIES.map((c) => {
            const active = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(c.id)}
                className={cn(
                  'h-9 rounded-full border px-3.5 text-sm font-medium',
                  'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2',
                  'motion-safe:duration-fast motion-safe:transition-colors',
                  active
                    ? 'bg-primary text-on-primary border-primary'
                    : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {results.length} {results.length === 1 ? 'app' : 'apps'} shown
      </p>

      {results.length === 0 ? (
        <EmptyState
          title="No apps match that"
          body="Try a different word, or choose All to see everything installed on this robot."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((app) => (
            <li key={app.id} className="contents">
              <AppCard app={app} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative flex-1">
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="text-ink-subtle pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
      >
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search apps"
        aria-label="Search apps"
        className={cn(
          'border-line bg-surface h-11 w-full rounded-sm border pl-9 pr-3 text-base',
          'placeholder:text-ink-subtle',
          'focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-1',
        )}
      />
    </div>
  );
}
