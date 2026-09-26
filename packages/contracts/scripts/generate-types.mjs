/**
 * Generate TypeScript types from the JSON Schemas in schemas/.
 *
 * The schemas are the source of truth (docs/ARCHITECTURE.md §7). Nothing in
 * src/generated/ is hand-edited — run `pnpm gen` instead.
 *
 * All topic schemas are compiled as one document rather than file by file, so the
 * shared definitions (Envelope, Source, Severity, ...) are emitted exactly once
 * instead of being duplicated into every module.
 */
import { compile } from 'json-schema-to-typescript';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaDir = join(root, 'schemas');
const outDir = join(root, 'src', 'generated');
const outFile = join(outDir, 'contracts.ts');

async function topicFiles(dir) {
  return (await readdir(join(schemaDir, dir))).filter((f) => f.endsWith('.json')).sort();
}

async function main() {
  const props = {};
  const topics = [];
  for (const dir of ['up', 'down']) {
    for (const file of await topicFiles(dir)) {
      const key = `${dir}_${basename(file, '.json').replace(/-/g, '_')}`;
      props[key] = { $ref: `./${dir}/${file}` };
      topics.push(key);
    }
  }

  // A wrapper object whose properties are the topic payloads. Compiling the wrapper
  // pulls in every referenced schema and emits each named definition once.
  const wrapper = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://agri.example/contracts/v1/all.json',
    title: 'AgriContracts',
    description:
      'Internal wrapper used only to compile every topic payload into one module. ' +
      'Not a wire format — nothing ever sends an AgriContracts object.',
    type: 'object',
    required: topics,
    properties: props,
    additionalProperties: false,
  };

  const ts = await compile(wrapper, 'AgriContracts', {
    bannerComment: `/**
 * DO NOT EDIT. Generated from packages/contracts/schemas by \`pnpm gen\`.
 *
 * One exported type per MQTT topic payload, plus the shared definitions they
 * reference. The AgriContracts interface itself is a compilation artefact.
 */`,
    additionalProperties: false,
    style: { singleQuote: true, printWidth: 100 },
    cwd: `${schemaDir}/`,
    declareExternallyReferenced: true,
    unreachableDefinitions: false,
  });

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, ts);
  console.log(`generated ${topics.length} topic payload types into src/generated/contracts.ts`);
}

await main();
