#!/usr/bin/env node
// One-off migration of PocketChem's bundled chemical-name database from the
// legacy schema v1 (records keyed by CHEBI id + flat alias table) to the lean
// schema v3 that src/utils/chemicalNameDatabase.ts loads. Use this when the raw
// ChEBI flat files needed by buildChemicalNameIndex.mjs are not available.
//
// Usage: node scripts/migrateChemicalNameIndexV1ToV3.mjs [input.gz] [output.gz]
// Defaults read and rewrite public/data/chemical-names.index.json.gz in place.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const inputPath = process.argv[2] || 'public/data/chemical-names.index.json.gz';
const outputPath = process.argv[3] || inputPath;

// Must stay identical to normalizeChemicalName in chemicalNameDatabase.ts.
function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[αΑ]/g, 'alpha')
    .replace(/[βΒ]/g, 'beta')
    .replace(/[γΓ]/g, 'gamma')
    .replace(/[δΔ]/g, 'delta')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[’′]/g, "'")
    .replace(/″/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',');
}

// Mirrors addAliasCandidate in the runtime: keys that are empty or too long are
// never indexed there, so they can never be part of the alias table.
const isRuntimeKey = (key) => key.length > 0 && key.length <= 240;

function fail(message) {
  console.error(`Migration aborted: ${message}`);
  process.exit(1);
}

const v1 = JSON.parse(gunzipSync(readFileSync(inputPath)).toString('utf8'));
if (v1?.v !== 1) fail(`expected schema v1 input, found v=${String(v1?.v)}.`);
if (!v1.records || !v1.aliases) fail('input is missing its records or aliases table.');

const recordEntries = Object.entries(v1.records);
const aliasEntries = Object.entries(v1.aliases);

// Invert the alias table: record id -> alias keys that point at it, in v1 order.
const aliasKeysByRecord = new Map();
const unknownTargets = [];
for (const [key, value] of aliasEntries) {
  const targets = Array.isArray(value) ? value : [value];
  for (const target of new Set(targets)) {
    if (!v1.records[target]) {
      unknownTargets.push([key, target]);
      continue;
    }
    let keys = aliasKeysByRecord.get(target);
    if (!keys) aliasKeysByRecord.set(target, (keys = []));
    keys.push(key);
  }
}
if (unknownTargets.length > 0) {
  fail(`${unknownTargets.length} alias edges point at records that do not exist (e.g. ${unknownTargets[0].join(' -> ')}).`);
}

const rows = [];
let droppedInchiKeys = 0;
let extraAliasCount = 0;
let skippedRecords = 0;

for (const [accession, record] of recordEntries) {
  const numeric = accession.match(/^CHEBI:(\d+)$/);
  if (!numeric || !record.s) {
    skippedRecords += 1;
    continue;
  }
  if (record.k) droppedInchiKeys += 1;

  const preferredKey = normalize(record.p);
  const iupacKey = normalize(record.i);
  // The runtime rebuilds preferred/IUPAC keys from the record itself, so only
  // genuine extra aliases are stored beside it (same rule as the v3 builder).
  const extras = (aliasKeysByRecord.get(accession) ?? []).filter(
    (key) => key !== preferredKey && key !== iupacKey,
  );

  const row = [Number(numeric[1]), record.s, record.p || null, record.i || null, record.f || null];
  if (extras.length > 0) {
    row.push(extras);
    extraAliasCount += extras.length;
  }
  rows.push(row);
}

if (skippedRecords > 0) fail(`${skippedRecords} v1 records are not representable in v3; refusing to drop data.`);

// Edge-level coverage check: rebuild the alias edges exactly as the v3 runtime
// would and compare them to the v1 alias edges.
const v1Edges = new Set();
for (const [key, value] of aliasEntries) {
  for (const target of new Set(Array.isArray(value) ? value : [value])) v1Edges.add(`${key}\u0000${target}`);
}
const v3Edges = new Set();
for (const row of rows) {
  const accession = `CHEBI:${row[0]}`;
  for (const name of [row[2], row[3], ...(row[5] ?? [])]) {
    const key = normalize(name);
    if (isRuntimeKey(key)) v3Edges.add(`${key}\u0000${accession}`);
  }
}
const lostEdges = [...v1Edges].filter((edge) => !v3Edges.has(edge));
const addedEdges = [...v3Edges].filter((edge) => !v1Edges.has(edge));
if (lostEdges.length > 0) {
  fail(`${lostEdges.length} v1 alias edges would be lost (e.g. ${lostEdges[0].replace('\u0000', ' -> ')}).`);
}

const payload = {
  v: 3,
  g: v1.generatedAt,
  s: {
    n: v1.source?.name ?? 'ChEBI',
    r: v1.source?.release ?? null,
    u: v1.source?.url ?? 'https://www.ebi.ac.uk/chebi',
  },
  r: rows,
};
writeFileSync(outputPath, gzipSync(JSON.stringify(payload), { level: 9 }));

console.log(`Wrote ${outputPath}`);
console.log(`v1 records: ${recordEntries.length.toLocaleString()} -> v3 records: ${rows.length.toLocaleString()}`);
console.log(`v1 alias keys: ${aliasEntries.length.toLocaleString()}  alias edges: ${v1Edges.size.toLocaleString()}`);
console.log(`v3 stored extra aliases: ${extraAliasCount.toLocaleString()}  runtime alias edges: ${v3Edges.size.toLocaleString()}`);
console.log(`v1 alias edges lost: ${lostEdges.length}`);
console.log(`alias edges the v3 runtime derives that v1 did not have: ${addedEdges.length}`);
for (const edge of addedEdges.slice(0, 5)) console.log(`  + ${edge.replace('\u0000', ' -> ').slice(0, 160)}`);
console.log(`InChIKeys not representable in v3 (runtime pack omits them by design): ${droppedInchiKeys.toLocaleString()}`);
