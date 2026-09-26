/**
 * The offline advisor.
 *
 * **This is not a language model, and the interface must never let anyone think it is.**
 * There is no model connected to this product. Rather than render a chat box that sits
 * there refusing every question — which would demonstrate nothing — this answers from the
 * same seeded data every other app reads, by matching the question against a small set of
 * topics it can actually source an answer for.
 *
 * The rules that keep that honest:
 *
 *  1. **Every sentence is derived from `AdvisorContext`.** No agronomy is written into
 *     this file. "Late blight spreads in warm wet weather" is not something this module
 *     knows — it is `issue.whatItIs`, which came out of the database with the detections
 *     that reference it. If the seed changes, the answer changes with it.
 *  2. **Every answer carries where it came from.** `source` is rendered under the reply,
 *     so a number can be checked against the screen that owns it.
 *  3. **A question it cannot source is not answered.** `unmatched` says so and lists what
 *     it can do, instead of producing a plausible sentence — the failure mode that makes
 *     a confident-sounding assistant dangerous around a pesticide rig.
 *
 * `answerFor` is pure and synchronous, which is the point: when a real model is wired in,
 * it becomes the fallback for what the model cannot ground, and these tests still hold.
 */

export type AdvisorTopic =
  | 'greeting'
  | 'overview'
  | 'issue'
  | 'where'
  | 'treatment'
  | 'robot'
  | 'run'
  | 'capabilities'
  | 'unmatched';

export interface AdvisorIssue {
  code: string;
  name: string;
  type: string;
  count: number;
  criticalCount: number;
  whatItIs: string;
  whatToDo: string;
  actionWithinDays: number | null;
}

export interface AdvisorContext {
  field: { name: string; crop: string };
  metrics: {
    plantsScanned: number;
    plantsFlagged: number;
    criticalCount: number;
    infectionRate: number;
  };
  severity: { low: number; moderate: number; critical: number };
  issues: readonly AdvisorIssue[];
  alert: { fromRow: number | null; toRow: number | null; withinDays: number | null } | null;
  robot: { name: string; online: boolean; batteryPercent: number | null; row: number | null };
  lastRunAt: string | null;
}

export interface AdvisorAnswer {
  topic: AdvisorTopic;
  text: string;
  /** Which screen owns the numbers in `text`, so they can be checked rather than trusted. */
  source: string;
}

/** What this can be asked. Printed verbatim when it cannot match, so the list stays true. */
export const ADVISOR_CAPABILITIES: readonly string[] = [
  'What is wrong in the field',
  'Where the worst plants are',
  'What to do about a problem',
  'What a named disease or pest is',
  'How the robot is doing',
];

const GREETING = /\b(hello|hi|hey|namaste|namaskar|vanakkam|namaskara|salaam)\b/i;
const OVERVIEW = /\b(overview|summary|status|how is|how's|what is wrong|what's wrong|problem|problems|issue|issues|disease|pest|flagged|health)\b/i;
const WHERE = /\b(where|which row|which rows|row|rows|location|locate|find)\b/i;
const TREATMENT = /\b(treat|treatment|spray|spraying|pesticide|fungicide|cure|control|fix|remedy|what should i do|what do i do|action)\b/i;
const ROBOT = /\b(robot|battery|charge|power|online|offline|machine)\b/i;
const RUN = /\b(when|last run|last scan|scanned|latest run|recent)\b/i;
const CAPABILITIES = /\b(help|what can you|what do you|capabilit|commands?)\b/i;

/**
 * The answer to one question.
 *
 * Order is deliberate: a named issue wins over the generic topics, because "what do I do
 * about late blight" is a treatment question about a *specific* thing and answering it
 * with the whole-field summary would be a worse answer to a better question.
 */
export function answerFor(question: string, context: AdvisorContext): AdvisorAnswer {
  const asked = question.trim();
  if (asked.length === 0) {
    return { topic: 'unmatched', text: capabilityText(), source: 'Nothing was asked.' };
  }

  const named = namedIssue(asked, context);
  if (named) return issueAnswer(asked, named, context);

  if (CAPABILITIES.test(asked)) {
    return { topic: 'capabilities', text: capabilityText(), source: 'This app.' };
  }
  if (ROBOT.test(asked)) return robotAnswer(context);
  if (TREATMENT.test(asked)) return treatmentAnswer(context);
  if (WHERE.test(asked)) return whereAnswer(context);
  if (RUN.test(asked)) return runAnswer(context);
  if (OVERVIEW.test(asked)) return overviewAnswer(context);
  // Greeting last: "hi, what is wrong with my tomatoes" is a question, not a hello.
  if (GREETING.test(asked)) return greetingAnswer(context);

  return {
    topic: 'unmatched',
    text: `I cannot answer that from this robot's data. ${capabilityText()}`,
    source: 'No matching data.',
  };
}

function greetingAnswer(context: AdvisorContext): AdvisorAnswer {
  const { field } = context;
  return {
    topic: 'greeting',
    text: `I can answer questions about ${field.name}, which is planted with ${field.crop.toLowerCase()}. ${capabilityText()}`,
    source: `Field ${field.name}.`,
  };
}

function overviewAnswer(context: AdvisorContext): AdvisorAnswer {
  const { field, metrics, severity, issues } = context;
  const worst = issues[0];
  const parts = [
    `${metrics.plantsFlagged} of ${metrics.plantsScanned.toLocaleString()} plants scanned in ${field.name} are flagged — ${severity.critical} critical, ${severity.moderate} moderate, ${severity.low} low.`,
  ];
  if (worst) {
    parts.push(
      `The biggest problem is ${worst.name.toLowerCase()} (${worst.type}), on ${worst.count} plants${
        worst.criticalCount > 0 ? `, ${worst.criticalCount} of them critical` : ''
      }.`,
    );
  }
  return { topic: 'overview', text: parts.join(' '), source: 'Crop Health · this field.' };
}

function issueAnswer(asked: string, issue: AdvisorIssue, context: AdvisorContext): AdvisorAnswer {
  // The same named issue answers two different questions. Which one was asked decides
  // whether the reply leads with what it is or with what to do about it.
  const wantsTreatment = TREATMENT.test(asked);
  const lead = wantsTreatment ? issue.whatToDo : issue.whatItIs;
  const deadline =
    issue.actionWithinDays != null
      ? ` Act within ${issue.actionWithinDays} ${issue.actionWithinDays === 1 ? 'day' : 'days'}.`
      : '';
  const scope = `${issue.name} is on ${issue.count} plant${issue.count === 1 ? '' : 's'} in ${context.field.name}${
    issue.criticalCount > 0 ? `, ${issue.criticalCount} critical` : ''
  }.`;
  return {
    topic: 'issue',
    text: `${scope} ${lead}${wantsTreatment ? deadline : ''}`,
    source: `Crop Health · ${issue.name}.`,
  };
}

function whereAnswer(context: AdvisorContext): AdvisorAnswer {
  const { alert, field, severity } = context;
  if (alert?.fromRow != null && alert.toRow != null) {
    return {
      topic: 'where',
      text: `The worst of it is in rows ${alert.fromRow} to ${alert.toRow} of ${field.name}. That is where the ${severity.critical} critical plants are concentrated${
        alert.withinDays != null ? `, and they want checking within ${alert.withinDays} days` : ''
      }.`,
      source: 'Crop Health · hotspots.',
    };
  }
  return {
    topic: 'where',
    text: `No hotspot has been identified in ${field.name}. Crop Health maps every flagged plant to its row.`,
    source: 'Crop Health · hotspots.',
  };
}

function treatmentAnswer(context: AdvisorContext): AdvisorAnswer {
  const worst = context.issues.find((issue) => issue.criticalCount > 0) ?? context.issues[0];
  if (!worst) {
    return {
      topic: 'treatment',
      text: `Nothing is flagged in ${context.field.name}, so there is nothing to treat.`,
      source: 'Crop Health · this field.',
    };
  }
  const deadline =
    worst.actionWithinDays != null
      ? ` Act within ${worst.actionWithinDays} ${worst.actionWithinDays === 1 ? 'day' : 'days'}.`
      : '';
  return {
    topic: 'treatment',
    text: `Start with ${worst.name.toLowerCase()}, the worst problem here. ${worst.whatToDo}${deadline} Mission Planner arms the sprayer and can treat flagged plants on the next run.`,
    source: `Crop Health · ${worst.name}.`,
  };
}

function robotAnswer(context: AdvisorContext): AdvisorAnswer {
  const { robot } = context;
  const battery =
    robot.batteryPercent != null
      ? `Battery is at ${Math.round(robot.batteryPercent)}%.`
      : 'It has not reported a battery level.';
  const where = robot.row != null ? ` It last reported being in row ${robot.row}.` : '';
  return {
    topic: 'robot',
    text: `${robot.name} is ${robot.online ? 'online' : 'offline'}. ${battery}${where} The Dashboard has its sensors and onboard computer.`,
    source: 'Dashboard · robot state.',
  };
}

function runAnswer(context: AdvisorContext): AdvisorAnswer {
  if (!context.lastRunAt) {
    return {
      topic: 'run',
      text: `No scouting run has been recorded in ${context.field.name} yet.`,
      source: 'Crop Watch · runs.',
    };
  }
  const when = new Date(context.lastRunAt);
  return {
    topic: 'run',
    text: `The last scouting run of ${context.field.name} was on ${when.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
    })}, and it scanned ${context.metrics.plantsScanned.toLocaleString()} plants.`,
    source: 'Crop Watch · this run.',
  };
}

function capabilityText(): string {
  return `Ask me: ${ADVISOR_CAPABILITIES.map((c) => c.toLowerCase()).join('; ')}.`;
}

/** The issue a question names, if it names one. Matched on the name and on the code. */
function namedIssue(asked: string, context: AdvisorContext): AdvisorIssue | null {
  const haystack = asked.toLowerCase();
  return (
    context.issues.find((issue) => {
      const name = issue.name.toLowerCase();
      const code = issue.code.toLowerCase().replace(/_/g, ' ');
      return haystack.includes(name) || haystack.includes(code);
    }) ?? null
  );
}
