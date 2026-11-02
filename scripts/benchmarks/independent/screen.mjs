// Pre-run screening of the independent benchmark (no PocketChem chemistry is executed):
//  1. every SMILES parses; ids are unique; provenance is complete and consistent
//  2. the expected stereochemistry I wrote is self-consistent (CIP labels of the hand-written SMILES equal
//     the stated CIP lists, checked with RDKit as a parser, not as a predictor)
//  3. overlap with existing test/fixture molecules: a case "overlaps" a test file when ALL of its reactants
//     appear (by canonical constitution) in that file AND the file also names the case's reaction rule or
//     contains its expected product(s), i.e. it is effectively the same reaction. (Common substrates such
//     as toluene appear everywhere; that alone is not an overlap.) Overlapping cases are flagged and
//     excluded from the held-out figures.
//  4. provenance counts by level
// Usage: node scripts/benchmarks/independent/screen.mjs [--json out.json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, getRdkit, loadEngine } from "../../tests/engine.mjs";
import { CASES, SOURCES } from "./cases.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
await loadEngine();
const rd = await getRdkit();

const parse = (smiles) => rd.get_mol(smiles);
const constitution = (smiles) => {
  const mol = parse(smiles);
  if (!mol) return null;
  try {
    return mol.get_smiles(JSON.stringify({ doIsomericSmiles: false }));
  } finally {
    mol.delete();
  }
};
const cipLabels = (smiles) => {
  const mol = parse(smiles);
  try {
    return JSON.parse(mol.get_stereo_tags()).CIP_atoms.map((entry) => String(entry[1]).replace(/[()]/g, "")).sort();
  } finally {
    mol.delete();
  }
};

const problems = [];
const ids = new Set();
const levels = { "verified-primary": 0, "verified-secondary": 0, provisional: 0 };
const categories = {};

for (const testCase of CASES) {
  if (ids.has(testCase.id)) problems.push(`${testCase.id}: duplicate id`);
  ids.add(testCase.id);
  levels[testCase.provenance.level] += 1;
  categories[testCase.category] = (categories[testCase.category] ?? 0) + 1;
  if (!testCase.provenance || !levels.hasOwnProperty(testCase.provenance.level)) problems.push(`${testCase.id}: bad provenance level`);
  for (const source of testCase.provenance.sources) if (!SOURCES[source]) problems.push(`${testCase.id}: unknown source ${source}`);
  if (testCase.provenance.level !== "provisional" && testCase.provenance.sources.length === 0) problems.push(`${testCase.id}: verified without a source`);

  const molecules = [...(testCase.reactants ?? []), ...(testCase.starts ?? []), testCase.start, testCase.target].filter(Boolean);
  for (const smiles of molecules) if (!parse(smiles)) problems.push(`${testCase.id}: cannot parse ${smiles}`);
  for (const product of testCase.expect.products ?? []) {
    if (!parse(product.smiles)) {
      problems.push(`${testCase.id}: cannot parse expected ${product.smiles}`);
      continue;
    }
    if (product.cip && product.smiles.includes("@")) {
      const got = cipLabels(product.smiles).join("");
      const want = [...new Set(product.cip.map((entry) => entry.split("").sort().join("")))];
      // For a racemate the stated labels are the enantiomer pair, e.g. ["RR","SS"]: the hand-written SMILES is one member.
      if (!want.includes(got)) problems.push(`${testCase.id}: expected SMILES ${product.smiles} has CIP ${got}, stated ${JSON.stringify(product.cip)}`);
    }
  }
  for (const smiles of testCase.expect.forbidden ?? []) if (!parse(smiles)) problems.push(`${testCase.id}: cannot parse forbidden ${smiles}`);
}

// ---- overlap with existing tests and fixtures ----
const literalPattern = /(["'`])((?:\\.|(?!\1).){3,120})\1/g;
const testFiles = [];
const collect = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (/\.(mjs|json|js)$/.test(entry.name)) testFiles.push(full);
  }
};
collect(path.join(root, "scripts", "tests"));
for (const extra of ["scripts/benchmarks/baseline", "scripts/benchmarks/multicatalyticBenchmark.mjs", "scripts/benchmarks/results"]) {
  const full = path.join(root, extra);
  if (!fs.existsSync(full)) continue;
  if (fs.statSync(full).isDirectory()) collect(full);
  else testFiles.push(full);
}
const fileText = new Map();
const fileMolecules = new Map();
for (const file of testFiles) {
  const text = fs.readFileSync(file, "utf8");
  const set = new Set();
  for (const match of text.matchAll(literalPattern)) {
    const candidate = match[2].replace(/\\\\/g, "\\");
    if (!/^[A-Za-z0-9@+\-\[\]()=#$\\/%.:*]+$/.test(candidate) || candidate.length < 4) continue;
    for (const part of candidate.split(".")) {
      const key = part.length >= 3 ? constitution(part) : null;
      if (key) set.add(key);
    }
  }
  fileMolecules.set(path.relative(root, file), set);
  fileText.set(path.relative(root, file), text);
}
const overlaps = {};
for (const testCase of CASES) {
  const reactants = (testCase.reactants ?? testCase.starts ?? [testCase.start]).filter(Boolean);
  const keys = reactants.map(constitution).filter(Boolean);
  const ruleIds = [].concat(testCase.rule ?? []);
  const productKeys = (testCase.expect.products ?? []).map((product) => constitution(product.smiles)).filter(Boolean);
  const hits = [];
  for (const [file, set] of fileMolecules) {
    if (!(keys.length > 0 && keys.every((key) => set.has(key)))) continue;
    const text = fileText.get(file);
    const sameRule = ruleIds.some((id) => text.includes(id));
    const sameProducts = productKeys.length > 0 && productKeys.every((key) => set.has(key));
    if (sameRule || sameProducts) hits.push(file);
  }
  if (hits.length > 0) overlaps[testCase.id] = hits;
}

const report = {
  cases: CASES.length,
  byCategory: categories,
  byProvenance: levels,
  problems,
  overlapping: overlaps,
  heldOut: CASES.filter((testCase) => !overlaps[testCase.id]).length,
};
console.log(JSON.stringify(report, null, 2));
const outIndex = process.argv.indexOf("--json");
if (outIndex > -1) fs.writeFileSync(process.argv[outIndex + 1], JSON.stringify(report, null, 2));
await closeEngine();
process.exit(problems.length === 0 ? 0 : 1);
