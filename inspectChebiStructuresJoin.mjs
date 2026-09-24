#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import readline from "node:readline";

const rawDir = process.argv[2] || "data/chebi-flat";
const compoundsPath = `${rawDir}/compounds.tsv.gz`;
const structuresPath = `${rawDir}/structures.tsv.gz`;
const TARGET = "15843";
const SAMPLE_LIMIT = 20000;

function split(line) {
  return line.replace(/\r$/, "").split("\t");
}

function normHeader(v) {
  return String(v ?? "").replace(/^\uFEFF/, "").trim();
}

async function readCompounds() {
  const ids = new Set();
  const accessions = new Set();
  const input = createReadStream(compoundsPath).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let headers = null;
  let idCol = -1;
  let accessionCol = -1;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = split(line);

    if (!headers) {
      headers = row.map(normHeader);
      idCol = headers.findIndex(h => h.toLowerCase() === "id");
      accessionCol = headers.findIndex(h => h.toLowerCase() === "chebi_accession");
      continue;
    }

    if (idCol >= 0) {
      const id = String(row[idCol] ?? "").trim();
      if (id) ids.add(id);
    }
    if (accessionCol >= 0) {
      const accession = String(row[accessionCol] ?? "").trim().toUpperCase();
      if (accession) accessions.add(accession);
    }
  }

  return { ids, accessions };
}

function matchesCompound(value, compounds) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  if (compounds.ids.has(raw)) return true;
  const upper = raw.toUpperCase();
  if (compounds.accessions.has(upper)) return true;
  if (/^CHEBI:\d+$/i.test(raw)) {
    return compounds.ids.has(raw.replace(/^CHEBI:/i, ""));
  }
  return false;
}

const compounds = await readCompounds();

console.log("=== Structures join diagnostic ===");
console.log("Known compound IDs:", compounds.ids.size.toLocaleString());
console.log("Known CHEBI accessions:", compounds.accessions.size.toLocaleString());

const input = createReadStream(structuresPath).pipe(createGunzip());
const rl = readline.createInterface({ input, crlfDelay: Infinity });

let headers = null;
let counts = [];
let nonEmpty = [];
let sampled = 0;
let targetRows = [];
let firstRows = [];

for await (const line of rl) {
  if (!line.trim()) continue;
  const row = split(line);

  if (!headers) {
    headers = row.map(normHeader);
    counts = headers.map(() => 0);
    nonEmpty = headers.map(() => 0);

    console.log("\nstructures.tsv.gz header:");
    headers.forEach((h, i) => console.log(`  [${i}] ${JSON.stringify(h)}`));
    continue;
  }

  if (firstRows.length < 3) firstRows.push(row);

  if (sampled < SAMPLE_LIMIT) {
    sampled += 1;
    for (let i = 0; i < headers.length; i++) {
      const value = String(row[i] ?? "").trim();
      if (value) nonEmpty[i] += 1;
      if (matchesCompound(value, compounds)) counts[i] += 1;
    }
  }

  const hasTarget = row.some(v => {
    const x = String(v ?? "").trim().toUpperCase();
    return x === TARGET || x === `CHEBI:${TARGET}`;
  });

  if (hasTarget && targetRows.length < 20) {
    targetRows.push(row);
  }
}

console.log(`\nSampled ${sampled.toLocaleString()} structure rows.`);
console.log("Columns ranked by exact match against compounds.tsv IDs/accessions:");

const ranked = headers
  .map((header, i) => ({
    i,
    header,
    matches: counts[i],
    nonEmpty: nonEmpty[i],
    ratio: nonEmpty[i] ? counts[i] / nonEmpty[i] : 0,
  }))
  .sort((a, b) => b.matches - a.matches || b.ratio - a.ratio);

for (const item of ranked.slice(0, Math.min(12, ranked.length))) {
  console.log(
    `  [${item.i}] ${item.header}: ${item.matches.toLocaleString()} matches / ` +
    `${item.nonEmpty.toLocaleString()} non-empty (${(item.ratio * 100).toFixed(2)}%)`
  );
}

console.log("\nFirst 3 structure rows (column => value):");
for (let r = 0; r < firstRows.length; r++) {
  console.log(`\nROW ${r + 1}`);
  headers.forEach((h, i) => {
    const value = String(firstRows[r][i] ?? "").trim();
    if (value) console.log(`  [${i}] ${h} = ${JSON.stringify(value)}`);
  });
}

console.log(`\nRows containing ${TARGET} or CHEBI:${TARGET}: ${targetRows.length}`);
for (let r = 0; r < targetRows.length; r++) {
  console.log(`\nTARGET ROW ${r + 1}`);
  headers.forEach((h, i) => {
    const value = String(targetRows[r][i] ?? "").trim();
    if (value) console.log(`  [${i}] ${h} = ${JSON.stringify(value)}`);
  });
}

console.log("\n=== What to send back ===");
console.log("Paste everything from 'structures.tsv.gz header' through the target rows.");
