/**
 * Crop Chat renders a chat box in a product where no language model exists. These tests
 * hold the two things that makes acceptable: the screen says so unprompted, and nothing
 * it prints came from anywhere but the seeded data.
 */
import type { ApiAnalyticsOverview, ApiRobotDetail, ApiScoutRun } from '@agri/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import overviewJson from '@/lib/fixtures/analytics-overview.json';
import robotJson from '@/lib/fixtures/robot.json';
import runsJson from '@/lib/fixtures/scout-runs.json';
import { advisorContextFrom } from '@/lib/chat/context';
import { LANGUAGES } from '@/lib/chat/languages';

import { ChatWorkspace } from '../chat-workspace';

const overview = overviewJson as ApiAnalyticsOverview;
const robot = robotJson as ApiRobotDetail;
const runs = (runsJson as { runs: ApiScoutRun[] }).runs;
const context = advisorContextFrom({ overview, robot, runs });

function renderChat() {
  return render(<ChatWorkspace context={context} source="sim" />);
}

describe('ChatWorkspace', () => {
  it('says there is no model connected before anything is asked', () => {
    renderChat();
    const banner = screen.getByRole('status', { name: 'Model availability' });
    expect(banner).toHaveTextContent(/no language model is connected/i);
    expect(banner).toHaveTextContent(/matched locally/i);
  });

  it('answers a question with the field’s own numbers', async () => {
    renderChat();
    await userEvent.type(screen.getByLabelText(/ask about this field/i), 'what is wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));

    const thread = screen.getByRole('list', { name: /conversation/i });
    expect(within(thread).getByText(/37 of 1,800 plants scanned/)).toBeInTheDocument();
  });

  it('prints where each answer came from, so a number can be checked', async () => {
    renderChat();
    await userEvent.type(screen.getByLabelText(/ask about this field/i), 'where');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.getByText('Crop Health · hotspots.')).toBeInTheDocument();
  });

  it('will not send an empty question', async () => {
    renderChat();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/ask about this field/i), '   ');
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
  });

  it('offers only questions it can actually answer', async () => {
    renderChat();
    const suggestion = screen.getByRole('button', { name: /what is wrong in the field/i });
    await userEvent.click(suggestion);
    const thread = screen.getByRole('list', { name: /conversation/i });
    expect(within(thread).queryByText(/cannot answer that/i)).not.toBeInTheDocument();
  });

  it('offers every language, each in its own script', () => {
    renderChat();
    const picker = screen.getByLabelText('Language');
    expect(within(picker).getAllByRole('option')).toHaveLength(LANGUAGES.length);
    for (const code of ['hi', 'ta', 'ur']) {
      const language = LANGUAGES.find((l) => l.code === code)!;
      expect(within(picker).getByRole('option', { name: new RegExp(language.endonym) })).toBeInTheDocument();
    }
  });

  /**
   * Choosing a language the advisor cannot reply in must change what the screen promises,
   * not just what the select shows. Silently taking the choice and answering in English
   * anyway is the dishonest version of this feature.
   */
  it('admits it cannot reply in a language once one is chosen', async () => {
    renderChat();
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'ta');
    expect(screen.getByRole('status', { name: 'Model availability' })).toHaveTextContent(
      /need a model/i,
    );
  });

  /** The mic sits in the composer and is honest about jsdom having no Web Speech API. */
  it('offers a microphone in the composer', async () => {
    renderChat();
    expect(
      await screen.findByRole('button', { name: /speak your question|not supported in this browser/i }),
    ).toBeInTheDocument();
  });

  it('sets the composer to the chosen language, and its direction', async () => {
    renderChat();
    const input = screen.getByLabelText(/ask about this field/i);

    await userEvent.selectOptions(screen.getByLabelText('Language'), 'hi');
    expect(input).toHaveAttribute('lang', 'hi');
    expect(input).toHaveAttribute('dir', 'ltr');

    // Urdu is written right to left; the composer has to follow or it is unusable.
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'ur');
    expect(input).toHaveAttribute('dir', 'rtl');
  });
});
