// Downloads the OpenStax Organic Chemistry CNXML modules (CC BY 4.0) into a scratch directory given as argv[2]; only modules cited by a case are later copied into snapshots/openstax.
import fs from "node:fs"; import path from "node:path";
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const h = { "User-Agent": "PocketChem-eval/1.0" };
const coll = await (await fetch("https://raw.githubusercontent.com/openstax/osbooks-organic-chemistry/main/collections/organic-chemistry.collection.xml", { headers: h })).text();
fs.writeFileSync(path.join(out, "collection.xml"), coll);
const ids = [...new Set([...coll.matchAll(/document="(m\d+)"/g)].map((m) => m[1]))];
console.log("modules", ids.length);
let ok = 0;
for (const id of ids) {
  const f = path.join(out, id + ".cnxml"); if (fs.existsSync(f)) { ok++; continue; }
  const r = await fetch(`https://raw.githubusercontent.com/openstax/osbooks-organic-chemistry/main/modules/${id}/index.cnxml`, { headers: h });
  if (r.ok) { fs.writeFileSync(f, await r.text()); ok++; } else console.log("fail", id, r.status);
}
console.log("saved", ok);
