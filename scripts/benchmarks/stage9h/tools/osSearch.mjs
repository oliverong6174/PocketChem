// Authoring helper: search the downloaded OpenStax corpus. Usage: node osSearch.mjs <dir> <regex> [max]
import fs from "node:fs"; import path from "node:path";
const [dir, pattern, max = "5"] = process.argv.slice(2); const re = new RegExp(pattern, "i"); let k = 0;
const strip = (s) => s.replace(/<title>[^<]*<\/title>/g, "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".cnxml")).sort()) {
  const x = fs.readFileSync(path.join(dir, f), "utf8"); const title = (x.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? "";
  for (const s of strip(x).split(/(?<=[.?])\s+(?=[A-Z])/)) if (re.test(s) && s.length > 40 && s.length < 450) { console.log(`[${f.replace(".cnxml", "")} ${title.slice(0, 40)}] ${s.slice(0, 340)}`); if (++k >= Number(max)) process.exit(0); }
}
if (!k) console.log("(no match)");
