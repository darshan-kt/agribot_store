import type { ApiStoreApp } from '@agri/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import storeApps from '@/lib/fixtures/store-apps.json';

import { AppBrowser } from '../app-browser';

const apps = (storeApps as { apps: ApiStoreApp[] }).apps.filter((a) => !a.featured);

describe('AppBrowser', () => {
  it('lists the installed apps', () => {
    render(<AppBrowser apps={apps} />);
    expect(screen.getByRole('link', { name: /Crop Health/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dashboard/ })).toBeInTheDocument();
  });

  it('filters by search text', async () => {
    render(<AppBrowser apps={apps} />);
    await userEvent.type(screen.getByRole('searchbox', { name: /search apps/i }), 'sprayer');
    // Mission Planner's description is the only one that mentions the sprayer.
    expect(screen.getByRole('link', { name: /Mission Planner/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Dashboard/ })).not.toBeInTheDocument();
  });

  it('filters by category chip', async () => {
    render(<AppBrowser apps={apps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Robot' }));
    expect(screen.getByRole('link', { name: /Dashboard/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Crop Health/ })).not.toBeInTheDocument();
  });

  it('offers a way out when nothing matches', async () => {
    render(<AppBrowser apps={apps} />);
    await userEvent.type(screen.getByRole('searchbox', { name: /search apps/i }), 'tractor');
    expect(screen.getByText('No apps match that')).toBeInTheDocument();
  });
});
