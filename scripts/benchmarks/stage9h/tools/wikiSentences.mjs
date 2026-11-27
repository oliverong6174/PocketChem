// Helper for authoring: prints candidate sentences (cleaned of wiki markup) from saved Wikipedia snapshots. Usage: node wikiSentences.mjs Page regex [max]
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const [page, pattern, max = "6"] = process.argv.slice(2);
const t = fs.readFileSync(path.join(here, "..", "snapshots", "wikipedia", page + ".wikitext"), "utf8");
const clean = (s) => s.replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/g, "").replace(/\{\{[^{}]*\}\}/g, "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/'''?/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
const sentences = clean(t).split(/(?<=[.;])\s+(?=[A-Z])/);
const re = new RegExp(pattern, "i"); let k = 0;
for (const s of sentences) { if (re.test(s) && s.length > 30 && s.length < 400) { console.log("-", s.slice(0, 330)); if (++k >= Number(max)) break; } }
if (!k) console.log("(no match)");
