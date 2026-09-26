/**
 * The schemas are the contract. These tests prove they actually constrain payloads:
 * that valid messages pass, that the envelope is mandatory everywhere, and that the
 * safety-relevant bounds reject out-of-range values.
 */
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, isLossyChannel, robotWildcard, topicFor } from '../topics';

const SCHEMA_DIR = join(import.meta.dirname, '..', '..', 'schemas');

let ajv: Ajv2020;

function load(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, rel), 'utf8')) as Record<string, unknown>;
}

beforeAll(() => {
  ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  // Register every schema under the relative path its siblings reference it by.
  ajv.addSchema(load('common/envelope.json'), '../common/envelope.json');
  for (const dir of ['up', 'down']) {
    for (const file of readdirSync(join(SCHEMA_DIR, dir))) {
      ajv.addSchema(load(`${dir}/${file}`), `${dir}/${file}`);
    }
  }
});

const envelope = {
  schema_version: SCHEMA_VERSION,
  robot_id: 'scout-01',
  ts: 1_700_000_000_000_000_000,
  seq: 42,
  source: 'sim',
};

function validate(schema: string, payload: unknown): { ok: boolean; errors: string } {
  const fn = ajv.getSchema(schema);
  if (!fn) throw new Error(`schema not registered: ${schema}`);
  const ok = fn(payload) as boolean;
  return { ok, errors: ajv.errorsText(fn.errors) };
}

describe('every schema compiles', () => {
  it('registers all 14 topic schemas plus the envelope', () => {
    const count = ['up', 'down'].reduce((n, d) => n + readdirSync(join(SCHEMA_DIR, d)).length, 0);
    expect(count).toBe(14);
  });
});

describe('envelope is mandatory', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['up/pose.json', { position: { lat: 52.1, lon: 5.2 }, heading_deg: 90, fix_type: 'rtk_fixed' }],
    ['up/state.json', { online: true, mode: 'idle', estop_engaged: false }],
    ['down/cmd-estop.json', { engage: true, issued_by: '00000000-0000-4000-8000-000000000000' }],
  ];

  it.each(cases)('%s rejects a payload with no envelope', (schema, body) => {
    expect(validate(schema, body).ok).toBe(false);
  });

  it.each(cases)('%s accepts the same payload with one', (schema, body) => {
    const result = validate(schema, { ...envelope, ...body });
    expect(result.errors).toBe('No errors');
    expect(result.ok).toBe(true);
  });
});

describe('source drives the Simulated badge, so it is constrained', () => {
  const pose = {
    ...envelope,
    position: { lat: 52.1, lon: 5.2 },
    heading_deg: 90,
    fix_type: 'rtk_fixed',
  };

  it.each(['sim', 'robot'])('accepts source=%s', (source) => {
    expect(validate('up/pose.json', { ...pose, source }).ok).toBe(true);
  });

  it('rejects an unknown source rather than letting it through unbadged', () => {
    expect(validate('up/pose.json', { ...pose, source: 'trust-me' }).ok).toBe(false);
  });
});

describe('safety bounds are enforced by the schema', () => {
  const uuid = '00000000-0000-4000-8000-000000000000';

  it('rejects a nozzle height below the 20 cm minimum', () => {
    const cmd = {
      ...envelope,
      source: 'cloud',
      action: 'configure',
      issued_by: uuid,
      nozzle_height_cm: 5,
    };
    expect(validate('down/cmd-sprayer.json', cmd).ok).toBe(false);
  });

  it('rejects a spray arc that is neither 180 nor 360', () => {
    const cmd = {
      ...envelope,
      source: 'cloud',
      action: 'configure',
      issued_by: uuid,
      arc_deg: 270,
    };
    expect(validate('down/cmd-sprayer.json', cmd).ok).toBe(false);
  });

  it('rejects a teleop burst longer than the bounded maximum', () => {
    const cmd = {
      ...envelope,
      source: 'cloud',
      action: 'spray_start',
      issued_by: uuid,
      duration_ms: 120_000,
    };
    expect(validate('down/cmd-sprayer.json', cmd).ok).toBe(false);
  });

  it('rejects teleop with no issuing operator, so no command is unattributable', () => {
    const cmd = {
      ...envelope,
      source: 'cloud',
      linear_mps: 0.5,
      angular_dps: 0,
      speed_mode: 'slow',
    };
    expect(validate('down/cmd-teleop.json', cmd).ok).toBe(false);
  });

  it('rejects a bounding box outside the normalised frame', () => {
    const batch = {
      ...envelope,
      camera: 'left',
      frame_ts: envelope.ts,
      plants_scanned: 3,
      detections: [
        {
          detection_id: uuid,
          issue_code: 'late_blight',
          severity: 'critical',
          confidence: 0.91,
          bbox: { x: 0.1, y: 0.1, w: 1.5, h: 0.2 },
        },
      ],
    };
    expect(validate('up/detections.json', batch).ok).toBe(false);
  });

  it('accepts a well-formed detection batch', () => {
    const batch = {
      ...envelope,
      camera: 'left',
      frame_ts: envelope.ts,
      plants_scanned: 3,
      detections: [
        {
          detection_id: uuid,
          issue_code: 'late_blight',
          severity: 'critical',
          confidence: 0.91,
          bbox: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 },
          position: { lat: 52.1, lon: 5.2 },
          row: 7,
          metres_from_edge: 23.5,
        },
      ],
    };
    const result = validate('up/detections.json', batch);
    expect(result.errors).toBe('No errors');
    expect(result.ok).toBe(true);
  });
});

describe('unknown fields are rejected, so a typo cannot silently vanish', () => {
  it('rejects a misspelled property', () => {
    const pose = {
      ...envelope,
      position: { lat: 52.1, lon: 5.2 },
      heading_deg: 90,
      fix_type: 'rtk_fixed',
      headding_deg: 91,
    };
    expect(validate('up/pose.json', pose).ok).toBe(false);
  });
});

describe('topic helpers', () => {
  it('builds a namespaced topic', () => {
    expect(topicFor('scout-01', 'pose')).toBe('agri/v1/scout-01/pose');
    expect(topicFor('scout-01', 'sprayer/state')).toBe('agri/v1/scout-01/sprayer/state');
  });

  it('builds a per-robot wildcard', () => {
    expect(robotWildcard('scout-01')).toBe('agri/v1/scout-01/#');
  });

  it('never marks detections, alerts or acks as droppable', () => {
    expect(isLossyChannel('detections')).toBe(false);
    expect(isLossyChannel('alerts')).toBe(false);
    expect(isLossyChannel('mission')).toBe(false);
    expect(isLossyChannel('telemetry')).toBe(true);
  });
});
