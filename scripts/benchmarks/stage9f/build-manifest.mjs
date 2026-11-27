// Freezes the Stage 9F benchmark: validates the independently authored case files, copies them and their source snapshots into
// this folder, assigns every case to the development or blind-holdout set BY A FIXED HASH RULE (never by looking at engine output),
// and records SHA-256 hashes plus the engine commit. Run once per authoring batch, BEFORE any engine evaluation.
//
//   node scripts/benchmarks/stage9f/build-manifest.mjs <authoring-out-dir> <authoring-snapshots-dir> <exclude-smiles.txt>
//
// Split rule (fixed here, before any run): holdout iff the first 8 hex digits of sha256("stage9f-v1|" + id), read as an integer,
// are < 2 modulo 5, i.e. about 40% of cases. The authors did not know the rule.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { closeEngine, getRdkit, loadEngine } from "../../tests/engine.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const [outDir, snapDir, excludeFile] = process.argv.slice(2);
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const splitOf = (id) => (parseInt(sha(`stage9f-v1|${id}`).slice(0, 8), 16) % 5 < 2 ? "holdout" : "dev");

await loadEngine();
const rd = await getRdkit();
const canon = (s) => { const m = rd.get_mol(s); if (!m) return null; try { return m.get_smiles(JSON.stringify({ doIsomericSmiles: false })); } finally { m.delete(); } };
const excluded = new Set(fs.readFileSync(excludeFile, "utf8").split(/\r?\n/).filter(Boolean).map(canon).filter(Boolean));

const manifestPath = path.join(here, "manifest.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { files: {}, split: {}, snapshots: {}, problems: [] };
fs.mkdirSync(path.join(here, "cases"), { recursive: true });
fs.mkdirSync(path.join(here, "snapshots"), { recursive: true });

const smilesFields = (c) => [c.smiles, ...(c.smiles && Array.isArray(c.smiles) ? c.smiles : []), ...(c.reactants ?? []), c.start, c.target, ...(c.expected?.products ?? []).map((p) => p.smiles)].flat().filter((s) => typeof s === "string");
// Pre-freeze audit downgrades (decided from reading the authored files and saved snapshots, before any engine run): evidence verified -> inferred.
const AUDIT_DOWNGRADES = {
  "RX-11": "the cited page gives the bulky-base rule and a homologous example, not this substrate or a ratio",
  "NM-02": "the stereo-defined name does not literally occur in the saved PubChem records (author replaced the original candidate)",
};
const problems = [];
for (const file of fs.readdirSync(outDir).filter((f) => f.endsWith(".json"))) {
  const data = JSON.parse(fs.readFileSync(path.join(outDir, file), "utf8"));
  const capability = data.capability;
  for (const c of data.cases) if (AUDIT_DOWNGRADES[c.id]) { c.evidence = "inferred"; c.audit = "downgraded before freeze: " + AUDIT_DOWNGRADES[c.id]; }
  const kept = [];
  const ids = new Set();
  for (const testCase of data.cases) {
    const issue = [];
    if (ids.has(testCase.id)) issue.push("duplicate id");
    ids.add(testCase.id);
    for (const s of smilesFields(testCase)) {
      for (const part of s.split(".")) if (!canon(part)) issue.push(`unparsable SMILES ${part}`);
    }
    const main = [testCase.smiles, testCase.reactants, testCase.start, testCase.target].flat(2).filter((s) => typeof s === "string");
    for (const s of main) for (const part of s.split(".")) if (canon(part) && excluded.has(canon(part)) && capability === "reactions") issue.push(`uses excluded molecule ${part}`);
    for (const sid of testCase.source_ids ?? []) if (!data.sources?.[sid]) issue.push(`unknown source ${sid}`);
    if (testCase.evidence === "verified" && (testCase.source_ids ?? []).some((sid) => !data.sources?.[sid]?.fetched)) issue.push("evidence verified but a cited source was not fetched");
    if (issue.length) { problems.push({ id: testCase.id, capability, issue }); if (issue.some((i) => /unparsable|duplicate|unknown source/.test(i))) continue; }
    kept.push(testCase);
  }
  const out = { ...data, cases: kept };
  const text = JSON.stringify(out, null, 1);
  const rel = `cases/${capability}.json`;
  fs.writeFileSync(path.join(here, rel), text);
  manifest.files[capability] = { path: rel, sha256: sha(text), cases: kept.length, authored: data.cases.length };
  for (const c of kept) manifest.split[c.id] = splitOf(c.id);
  for (const [sid, src] of Object.entries(data.sources ?? {})) {
    const snap = path.join(snapDir, src.snapshot ?? "");
    if (src.fetched && src.snapshot && fs.existsSync(snap)) {
      const buf = fs.readFileSync(snap);
      fs.writeFileSync(path.join(here, "snapshots", src.snapshot), buf);
      manifest.snapshots[sid] = { file: `snapshots/${src.snapshot}`, sha256: sha(buf), url: src.url };
    } else manifest.snapshots[sid] = { file: null, sha256: null, url: src.url, note: "not fetched or snapshot missing" };
  }
}
manifest.problems.push(...problems);
manifest.splitRule = "holdout iff parseInt(sha256('stage9f-v1|'+id).slice(0,8),16) % 5 < 2";
manifest.engineCommitAtFreeze = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
manifest.frozenOn = new Date().toISOString();
manifest.counts = Object.fromEntries(Object.entries(manifest.files).map(([cap, f]) => {
  const data = JSON.parse(fs.readFileSync(path.join(here, f.path), "utf8"));
  const by = { dev: 0, holdout: 0, verified: 0, inferred: 0 };
  for (const c of data.cases) { by[manifest.split[c.id]] += 1; by[c.evidence === "verified" ? "verified" : "inferred"] += 1; }
  return [cap, by];
}));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
console.log(JSON.stringify({ counts: manifest.counts, problems }, null, 1));
await closeEngine();
process.exit(0);
