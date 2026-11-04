// Pre-freeze sanity check: every SMILES in the frozen case files must parse in RDKit.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { getRdkit, closeEngine } from "../../../tests/engine.mjs";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cases");
const rd = await getRdkit(); const bad = [];
const ok = (s) => { const m = rd.get_mol(s); if (!m) return false; m.delete(); return true; };
for (const f of fs.readdirSync(dir)) for (const c of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).cases) {
  const smis = [c.smiles, ...(c.reactants ?? []), ...(c.expected?.products?.map?.((p) => p.smiles) ?? []), ...(c.expected?.forbidden ?? []), c.target, ...(c.start?.split(".") ?? []), ...(c.route_must_avoid ?? []), ...(c.expected_order?.flat?.() ?? [])].flat().filter((x) => typeof x === "string");
  for (const s of smis) if (!ok(s)) bad.push(`${f}:${c.id}:${s}`);
}
console.log("unparseable:", bad.length ? bad.join(" | ") : "none");
await closeEngine(); process.exit(0);
