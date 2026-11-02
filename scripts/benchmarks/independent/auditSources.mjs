// Stage 9E Phase A: re-checks every cited source of the (frozen) independent benchmark.
//   node scripts/benchmarks/independent/auditSources.mjs
// For each source it fetches the URL and measures how much of the claim vocabulary in SOURCES[x].says occurs in
// the readable text. It never edits cases.mjs; results/source-audit.json is read by provenanceAudit.mjs.
// Keyword coverage is evidence that the page was read and discusses the claim, not proof the claim is stated
// correctly; borderline results are flagged "partial" for manual judgement.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES } from "./cases.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const STOP = new Set(["with", "that", "this", "from", "gives", "give", "which", "their", "using", "into", "when", "than", "both", "about", "other", "only", "same", "have", "does", "very", "also", "more", "most", "such", "each", "then"]);
const tokens = (text) => [...new Set((text.toLowerCase().match(/[a-z][a-z0-9-]{4,}/g) ?? []).filter((t) => !STOP.has(t)))];
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").toLowerCase();

async function audit(id, source) {
  const base = { id, url: source.url, cite: source.cite };
  try {
    const response = await fetch(source.url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (PocketChem provenance audit)" }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) return { ...base, status: "unreachable", detail: `HTTP ${response.status}` };
    const type = response.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (/pdf/i.test(type) || buffer.subarray(0, 5).toString() === "%PDF-") {
      // No PDF text extractor is available offline; look for plain (unfiltered) text objects only.
      const raw = buffer.toString("latin1");
      const readable = (raw.match(/\(([ -~]{6,})\)\s*T[jJ]/g) ?? []).join(" ").toLowerCase();
      if (readable.length < 400) return { ...base, status: "unreadable", detail: `PDF without extractable text (${buffer.length} bytes; scanned or compressed)` };
      return scoreText(base, source, readable);
    }
    const text = strip(buffer.toString("utf8"));
    if (/protecting .* from malicious requests|enable javascript|just a moment|access denied|captcha/.test(text.slice(0, 3000)) && text.length < 4000) {
      return { ...base, status: "unreachable", detail: "bot-wall / challenge page" };
    }
    return scoreText(base, source, text);
  } catch (error) {
    return { ...base, status: "unreachable", detail: String(error?.cause?.code ?? error?.message ?? error) };
  }
}

function scoreText(base, source, text) {
  const wanted = tokens(source.says ?? "");
  const found = wanted.filter((token) => text.includes(token));
  const coverage = wanted.length ? found.length / wanted.length : 0;
  const status = coverage >= 0.6 ? "supported" : coverage >= 0.35 ? "partial" : "not-supported";
  return { ...base, status, coverage: Number(coverage.toFixed(2)), missing: wanted.filter((t) => !found.includes(t)).slice(0, 12), readableChars: text.length };
}

const results = [];
for (const [id, source] of Object.entries(SOURCES)) {
  const result = await audit(id, source);
  results.push(result);
  console.log(id.padEnd(26), result.status.padEnd(14), result.coverage ?? "", result.detail ?? "");
}
fs.mkdirSync(path.join(here, "results"), { recursive: true });
fs.writeFileSync(path.join(here, "results", "source-audit.json"), JSON.stringify({ auditedOn: new Date().toISOString().slice(0, 10), results }, null, 1));
const counts = {};
for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
console.log(counts);
