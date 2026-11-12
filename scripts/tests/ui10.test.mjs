// Stage 10: UI architecture tests (source-level + pure modules). Visual behaviour is covered by scripts/browser/stage10LiveCheck.mjs.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8").replace(/\r\n/g, "\n");

test("subject registry: five branches, two modes; Organic, General Chemistry and Physics available, two planned", async () => {
  const src = read("src", "navigation", "subjects.ts");
  for (const id of ["organic", "general", "physics", "biology", "biochemistry"]) assert.match(src, new RegExp(`id: "${id}"`));
  assert.equal((src.match(/status: "available",/g) ?? []).length, 3);
  assert.equal((src.match(/status: "planned",/g) ?? []).length, 2);
  assert.match(src, /id: "biology", slug: "biology", label: "Biology", mode: "learning"/);
  assert.match(src, /id: "physics", slug: "physics", label: "Physics", mode: "workbench"/);
});

test("every organic tool id is an App page and keeps its tab/panel ids", () => {
  const nav = read("src", "navigation", "subjects.ts");
  const app = read("src", "App.tsx");
  const organic = nav.slice(nav.indexOf("export const ORGANIC_TOOLS"), nav.indexOf("export type GeneralToolId"));
  const ids = [...organic.matchAll(/\{ id: "(\w+)", slug: "[a-z-]+", label: "[^"]+", summary/g)].map((m) => m[1]);
  assert.equal(ids.length, 8);
  for (const id of ids) assert.ok(app.includes(`"${id}"`), id);
  const shell = read("src", "components", "shell", "AppShell.tsx");
  assert.match(shell, /id=\{`page-tab-\$\{tool\.id\}`\}/);
  assert.match(shell, /aria-controls=\{`page-panel-\$\{tool\.id\}`\}/);
});

test("themes: both defined, tokens carry the same role names, no webfont request", () => {
  const tokens = read("src", "styles", "tokens.css");
  assert.match(tokens, /:root\[data-theme="light"\]/);
  assert.match(tokens, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(read("src", "App.css"), /fonts\.googleapis/);
  assert.match(read("index.html"), /pocketchem\.theme/);
});

test("planned subjects never render tool controls", () => {
  const dlg = read("src", "components", "shell", "PlannedSubjectDialog.tsx");
  assert.match(dlg, /Not available yet/);
  assert.doesNotMatch(dlg, /<input|<select|Ketcher/);
});

test("chair morph: endpoints are the real chairs", async () => {
  const { morphConformer, easeInOut } = await import("../../src/components/conformations/morph.ts");
  const mk = (x) => ({ flipped: false, label: "Chair A", ringPoints: [{ x, y: 0, z: 0 }], substituents: [{ slot: {}, orientation: "axial", point: { x, y: 1, z: 0 } }] });
  const a = mk(0), b = mk(10);
  assert.equal(morphConformer(a, b, 0), a);
  assert.equal(morphConformer(a, b, 1), b);
  assert.equal(morphConformer(a, b, 0.5).ringPoints[0].x, 5);
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
});
