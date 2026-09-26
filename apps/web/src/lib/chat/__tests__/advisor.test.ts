/**
 * The advisor answers about a pesticide-sprayed food crop, one tab away from a control
 * that arms the sprayer. The property that matters is therefore not "it replies" but
 * **it never says anything it cannot source**. These tests hold that from both ends: the
 * numbers it quotes are the seeded ones, and a question it has no data for is refused
 * rather than answered plausibly.
 */
import type { ApiAnalyticsOverview, ApiRobotDetail, ApiScoutRun } from '@agri/contracts';
import { describe, expect, it } from 'vitest';

import overviewJson from '@/lib/fixtures/analytics-overview.json';
import robotJson from '@/lib/fixtures/robot.json';
import runsJson from '@/lib/fixtures/scout-runs.json';

import { ADVISOR_CAPABILITIES, answerFor } from '../advisor';
import { advisorContextFrom } from '../context';

const overview = overviewJson as ApiAnalyticsOverview;
const robot = robotJson as ApiRobotDetail;
const runs = (runsJson as { runs: ApiScoutRun[] }).runs;
const context = advisorContextFrom({ overview, robot, runs });

describe('answerFor', () => {
  it('quotes the seeded counts rather than a number of its own', () => {
    const { text } = answerFor('what is wrong in my field', context);
    expect(text).toContain(String(overview.metrics.plants_flagged));
    expect(text).toContain(String(overview.metrics.critical_count));
    expect(text).toContain(overview.metrics.plants_scanned.toLocaleString());
  });

  it('names the worst problem by critical count, not by API order', () => {
    const { topic, text } = answerFor('give me a summary', context);
    expect(topic).toBe('overview');
    // Late blight carries all 14 criticals in the seed.
    expect(text.toLowerCase()).toContain('late blight');
  });

  it('answers about a named disease with the seeded description, not invented agronomy', () => {
    const { topic, text } = answerFor('what is late blight', context);
    expect(topic).toBe('issue');
    const seeded = overview.issues.find((i) => i.issue.code === 'late_blight')!.issue;
    expect(text).toContain(seeded.what_it_is);
  });

  it('gives the seeded treatment when asked what to do about a named disease', () => {
    const seeded = overview.issues.find((i) => i.issue.code === 'late_blight')!.issue;
    const { text } = answerFor('how do I treat late blight', context);
    expect(text).toContain(seeded.what_to_do);
    expect(text).not.toContain(seeded.what_it_is);
  });

  it('points at the rows the alert names when asked where', () => {
    const { topic, text } = answerFor('where are the worst plants', context);
    expect(topic).toBe('where');
    expect(text).toContain(`rows ${overview.alert!.from_row} to ${overview.alert!.to_row}`);
  });

  it('reads the robot out of robot state, not out of the field data', () => {
    const { topic, text } = answerFor('how is the battery', context);
    expect(topic).toBe('robot');
    expect(text).toContain(String(Math.round(robot.battery_percent!)));
    expect(text).toContain(robot.name);
  });

  /**
   * The important one. A confident, plausible answer to a question it cannot ground is
   * the failure mode that makes an assistant dangerous here — so it must refuse.
   */
  it('refuses a question it cannot source instead of inventing an answer', () => {
    const { topic, text } = answerFor('what fertiliser brand should I buy next season', context);
    expect(topic).toBe('unmatched');
    expect(text).toMatch(/cannot answer that/i);
  });

  it('refuses an empty question', () => {
    expect(answerFor('   ', context).topic).toBe('unmatched');
  });

  it('treats a greeting that carries a question as the question', () => {
    // "hi" matches the greeting rule too; the question has to win.
    expect(answerFor('hi, what is wrong with my crop', context).topic).toBe('overview');
    expect(answerFor('hello', context).topic).toBe('greeting');
  });

  it('attributes every answer to the screen that owns its numbers', () => {
    for (const question of ['what is wrong', 'where', 'how is the robot', 'what is late blight']) {
      expect(answerFor(question, context).source.length).toBeGreaterThan(0);
    }
  });

  /** Each offered question must be one it can actually answer, or the empty state lies. */
  it('can answer every question it offers as a suggestion', () => {
    for (const suggestion of ADVISOR_CAPABILITIES) {
      expect(answerFor(suggestion, context).topic).not.toBe('unmatched');
    }
  });
});

describe('advisorContextFrom', () => {
  it('sorts issues worst-first so "the biggest problem" is true', () => {
    const criticals = context.issues.map((issue) => issue.criticalCount);
    expect(criticals).toEqual([...criticals].sort((a, b) => b - a));
  });

  it('carries the seeded severity mix through unchanged', () => {
    const mix = Object.fromEntries(overview.severity_mix.map((s) => [s.severity, s.count]));
    expect(context.severity).toEqual({
      low: mix.low,
      moderate: mix.moderate,
      critical: mix.critical,
    });
  });
});
