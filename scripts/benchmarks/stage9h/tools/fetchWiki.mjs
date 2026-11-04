// Saves raw wikitext of Wikipedia articles (secondary sources) under snapshots/wikipedia. Usage: node fetchWiki.mjs Title [Title...]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "snapshots", "wikipedia"); fs.mkdirSync(dir, { recursive: true });
for (const title of process.argv.slice(2)) {
  const file = path.join(dir, title + ".wikitext");
  if (fs.existsSync(file)) { console.log("exists", title); continue; }
  const r = await fetch(`https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`, { headers: { "User-Agent": "PocketChem-eval/1.0 (research benchmark)" } });
  if (!r.ok) { console.log("FAIL", title, r.status); continue; }
  const t = await r.text(); fs.writeFileSync(file, t); console.log("saved", title, t.length);
}
