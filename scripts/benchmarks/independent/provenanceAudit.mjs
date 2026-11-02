// Stage 9E Phase A: provenance overlay for the frozen independent benchmark.
//   node scripts/benchmarks/independent/provenanceAudit.mjs
// Reads cases.mjs (frozen; never modified), results/source-audit.json (auditSources.mjs) and the frozen
// pre-fix / post-fix result files, and writes results/provenance-audit.json and provenance-audit.md.
// Ground truth and the recorded engine predictions are untouched: only the *label* saying how well a case's
// reference was verified, and whether the case can count as held-out, is recomputed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CASES } from "./cases.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(fs.readFileSync(path.join(here, "results", name), "utf8"));
const audit = read("source-audit.json");
const pre = read("independent-results-run2b-pre-fix-engine-final-scorer.json");
const post = read("independent-results-run4-final.json");

// Sources whose automated check failed for access reasons but that were read by hand this session.
const MANUAL = {
  "reusch-e2": { status: "supported", note: "Read at the mirror https://chemserv.centre.edu/muzyka/Reusch/jsmol/e2steric.htm (www2.chemistry.msu.edu is behind a WAF): methoxide 80% 2,3-dimethyl-2-butene / 20% 2,3-dimethyl-1-butene; tert-butoxide 25:75." },
};
// Journal papers cited as primary. The URLs available are scanned PDFs, bot-walled publisher pages or
// secondary summaries, so none of them counts as an inspected primary source.
const PRIMARY_PAPERS = new Set(["suzuki-1979", "sonogashira-1975", "corey-suggs-1975", "katsuki-sharpless-1980", "heck-1979"]);

// Rules whose behaviour was changed in Stage 9D Phase B, before the benchmark was frozen, after probing the
// same reaction classes; and cases whose failure led directly to a later engine fix.
const DEV_INFORMED_RULES = new Set([
  "alkene-halogenation-bromine", "alkene-epoxidation", "alkene-syn-dihydroxylation", "alkene-anti-dihydroxylation",
  "aromatic-friedel-crafts-acylation", "aromatic-friedel-crafts-alkylation", "heck-coupling", "pinacol-rearrangement",
]);
const DEV_GUIDED_CASES = new Set(["OM-02", "OM-03"]);

const effective = Object.fromEntries(audit.results.map((r) => [r.id, { ...r, ...(MANUAL[r.id] ?? {}) }]));
const RANK = { supported: 3, partial: 2, "not-supported": 1, unreadable: 0, unreachable: 0 };
const bestSource = (ids) => ids.map((id) => effective[id]?.status ?? "unreachable").sort((a, b) => RANK[b] - RANK[a])[0] ?? "none";
const post4 = Object.fromEntries(post.records.map((r) => [r.id, r]));
const pre4 = Object.fromEntries(pre.records.map((r) => [r.id, r]));

const rows = CASES.map((testCase) => {
  const claimed = testCase.provenance.level;
  const sources = testCase.provenance.sources;
  const statusOfSources = sources.length ? bestSource(sources) : "none";
  const rules = [testCase.rule, ...(testCase.steps ?? []).map((s) => s.rule)].filter(Boolean);
  const devInformed = rules.some((rule) => DEV_INFORMED_RULES.has(rule));
  const overlap = Boolean(post4[testCase.id]?.overlapsFixtures);
  const primaryOnly = sources.length > 0 && sources.every((id) => PRIMARY_PAPERS.has(id) && effective[id]?.status !== "supported");

  let audited;
  if (claimed === "provisional") audited = "provisional";
  else if (statusOfSources === "supported") audited = "verified-secondary";
  else if (statusOfSources === "partial") audited = "source-partial";
  else audited = "source-not-inspected";

  let category;
  if (overlap) category = "existing-fixture-overlap";
  else if (DEV_GUIDED_CASES.has(testCase.id)) category = "development-guided";
  else if (testCase.kind === "unsupported") category = "unsupported-probe";
  else if (audited === "provisional") category = "provisional";
  else if (audited !== "verified-secondary") category = "source-unconfirmed";
  else if (devInformed) category = "verified-development-informed";
  else category = "independent-held-out";

  return {
    id: testCase.id,
    claimed,
    audited,
    category,
    sources: sources.map((id) => `${id}:${effective[id]?.status ?? "?"}`),
    changed: claimed !== audited && !(claimed === "verified-secondary" && audited === "verified-secondary"),
    note: claimed === "verified-primary" ? (primaryOnly ? "Labelled primary; no primary-paper text could be read (scanned PDF, bot-wall or secondary summary)." : "Labelled primary; the readable source is a secondary page.") : "",
  };
});

const DIMENSIONS = ["structure", "connectivity", "regiochemistry", "stereochemistry", "classification", "conditions", "ambiguity", "unsupported", "routeDiscovery", "routeVerification", "routePlausibility", "workspace"];
const tally = (ids, data, dimension) => {
  const counts = {};
  for (const id of ids) {
    const verdict = data[id]?.dimensions[dimension];
    if (!verdict || verdict.status === "n/a") continue;
    counts[verdict.status] = (counts[verdict.status] ?? 0) + 1;
  }
  return Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ");
};
const idsOf = (...categories) => rows.filter((r) => categories.includes(r.category)).map((r) => r.id);

const summary = {};
for (const row of rows) (summary[row.category] ??= []).push(row.id);
const strict = idsOf("independent-held-out");
const looseOriginal = CASES.filter((c) => c.provenance.level !== "provisional" && !post4[c.id]?.overlapsFixtures).map((c) => c.id);

const lines = ["# Provenance audit of the frozen independent benchmark (Stage 9E Phase A)", ""];
lines.push(`Source audit date: ${audit.auditedOn}. Cases are not modified; this overlay only re-labels how well each reference was verified and whether the case may count as held-out.`, "");
lines.push("## Source audit (automated fetch + claim-vocabulary coverage; manual overrides noted)", "", "| source | result | detail |", "|---|---|---|");
for (const r of Object.values(effective)) lines.push(`| ${r.id}${PRIMARY_PAPERS.has(r.id) ? " (journal paper)" : ""} | ${r.status}${r.coverage !== undefined ? ` (${r.coverage})` : ""} | ${r.note ?? r.detail ?? (r.missing?.length ? `missing: ${r.missing.join(", ")}` : "")} |`);
lines.push("", "## Case classification", "", "| category | n | cases |", "|---|---|---|");
for (const [category, ids] of Object.entries(summary)) lines.push(`| ${category} | ${ids.length} | ${ids.join(", ")} |`);
lines.push("", `Original 9D headline set (non-provisional, non-overlapping): **${looseOriginal.length}** cases. After this audit the strictly independent held-out set is **${strict.length}** cases.`, "");
lines.push("### Relabelled cases", "", "| id | claimed | audited | sources | note |", "|---|---|---|---|---|");
for (const row of rows.filter((r) => r.claimed !== r.audited || r.note)) lines.push(`| ${row.id} | ${row.claimed} | ${row.audited} | ${row.sources.join(", ")} | ${row.note} |`);
lines.push("", "## Dimension tallies by category (pre-fix engine, then post-development engine)", "");
for (const [title, ids] of [["Strictly independent held-out", strict], ["Original 9D headline set (for comparison)", looseOriginal], ["Verified but development-informed", idsOf("verified-development-informed")], ["Development-guided", idsOf("development-guided")]]) {
  lines.push(`### ${title} (${ids.length} cases)`, "", "| dimension | pre-fix | post-development |", "|---|---|---|");
  for (const dimension of DIMENSIONS) {
    const a = tally(ids, pre4, dimension);
    const b = tally(ids, post4, dimension);
    if (a || b) lines.push(`| ${dimension} | ${a || "-"} | ${b || "-"} |`);
  }
  lines.push("");
}
fs.writeFileSync(path.join(here, "results", "provenance-audit.json"), JSON.stringify({ rows, summary, strict, looseOriginal }, null, 1));
fs.writeFileSync(path.join(here, "provenance-audit.md"), lines.join("\n"));
console.log(Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, v.length])));
console.log("strict:", strict.length, "original:", looseOriginal.length);
