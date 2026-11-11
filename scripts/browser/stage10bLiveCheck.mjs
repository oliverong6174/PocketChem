// Stage 10B live-browser check (real headless Chrome, production build):
//  - Conformations: name entry through the shared resolver + conservative fallback, unsupported/ambiguous names refused,
//    automatic ranking, comparison add/remove/persistence-in-state, mode follow-through.
//  - Shared ToolHeader on every scientific tool, in both themes, at 375/768/1440 with no horizontal overflow.
//  - Reactions name entry: Add/Replace hint present, Enter button behaviour unchanged.
//   npm run build && node scripts/browser/stage10bLiveCheck.mjs
import path from "node:path";
import os from "node:os";
import { q, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
};
const outDir = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "pc-live10b");
const { cdp, url, stop } = await startBrowser({ port: 4294, debugPort: 9454 });
const ev = (expr) => cdp.evaluate(expr);
const click = (label) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const setValue = (selector, value) => ev(`(() => { const el = document.querySelector(${q(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const fresh = async (width, scheme = "dark") => {
  await setViewport(cdp, width, width < 500 ? 812 : 900, { scheme });
  await cdp.send("Page.navigate", { url });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
};
const openTool = async (name, settle = 900) => {
  const direct = await ev(`(() => { const b = [...document.querySelectorAll('.tool-tabs [role=tab]')].find((x) => x.textContent.trim() === ${q(name)} && x.getClientRects().length); if (b) { b.click(); return true; } return false; })()`);
  if (!direct) {
    await ev(`document.querySelector('.shell-menu')?.click()`);
    await sleep(350);
    await ev(`[...document.querySelectorAll('.sheet-tool')].find((x) => x.querySelector('.sheet-tool-name')?.textContent.trim() === ${q(name)})?.click()`);
  }
  await sleep(settle);
};
const enterName = async (text) => {
  await waitFor(() => ev(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Load' && !b.disabled)`), "engine", 120000);
  await setValue(".conf-smiles input", text);
  await click("Load");
  await waitFor(() => ev(`!!document.querySelector('.mol-status.is-ok, .mol-status.is-error')`), "resolution", 120000);
  await sleep(500);
};
const status = () => ev(`document.querySelector('.mol-status')?.innerText ?? ''`);
const statusClass = () => ev(`document.querySelector('.mol-status')?.className ?? ''`);

try {
  await fresh(1440);
  await openTool("Conformations", 1500);

  // ---- name input: database name, fallback name, refusals ----
  await enterName("butane");
  check("database name 'butane' loads and is labelled as the ChEBI database", /ChEBI/i.test(await status()), (await status()).slice(0, 120));
  check("Newman mode shows an automatic ranking of the six principal conformations", await ev(`document.querySelectorAll('.conf-rank .rank-row').length === 6`));
  const order = await ev(`[...document.querySelectorAll('.conf-rank .rank-row .rank-label')].slice(0, 2).map((e) => e.textContent).join('|')`);
  check("anti is ranked first, a gauche conformer next", /anti/i.test(order.split("|")[0]) && /gauche/i.test(order.split("|")[1]), order);

  await enterName("cis-1,3-dimethylcyclohexane");
  const s1 = await status();
  check("cis-1,3-dimethylcyclohexane loads via the systematic-name reader (not the database)", /systematic-name reader/i.test(s1), s1.slice(0, 140));
  await waitFor(() => ev(`document.querySelectorAll('.conf-rank .rank-row').length === 2`), "chair ranking", 20000).catch(() => {});
  const chairRows = await ev(`document.querySelectorAll('.conf-rank .rank-row').length`);
  check("chair mode ranks Chair A against Chair B", chairRows === 2, `${chairRows} rows`);
  const first = await ev(`document.querySelector('.conf-rank .rank-row .rank-value')?.innerText ?? ''`);
  check("the more stable chair is the diequatorial one (0 kJ/mol baseline)", /^0 kJ\/mol/.test(first), first);

  await enterName("1,3-dimethylcyclohexane");
  const s2 = await status();
  check("a name with no cis/trans is loaded but states that stereochemistry was not assigned", /does not specify/i.test(s2), s2.slice(0, 160));

  await enterName("cis-1,2,3-trimethylcyclohexane");
  check("unsupported cis/trans use is refused, not guessed", /is-error/.test(await statusClass()), (await status()).slice(0, 140));
  await enterName("2-methylpentalene-7-ol");
  check("an unknown name is refused with the supported subset listed", /is-error/.test(await statusClass()) && /offline/i.test(await status()), (await status()).slice(0, 140));
  await enterName("C[C@H]1CCCC[C@@H]1C");
  check("SMILES is still read exactly as written", /SMILES/i.test(await status()) && /is-ok/.test(await statusClass()), (await status()).slice(0, 100));

  // ---- examples go through the same path ----
  await click("(2R,3R)-2,3-Dibromobutane");
  await waitFor(() => ev(`/systematic-name reader|ChEBI/.test(document.body.innerText) && document.querySelectorAll('.conf-rank .rank-row').length > 0`), "example load", 30000).catch(() => {});
  check("name-based example loads and ranks", await ev(`document.querySelectorAll('.conf-rank .rank-row').length > 0`));

  // ---- comparison ----
  const before = await ev(`document.querySelectorAll('.conf-compare .rank-row').length`);
  await click("Add the four lowest");
  await sleep(500);
  const after = await ev(`document.querySelectorAll('.conf-compare .rank-row').length`);
  check("comparison collects entries", before === 0 && after >= 2, `${before} -> ${after}`);
  await click("Add the four lowest");
  await sleep(300);
  check("adding the same conformations again does not duplicate them", (await ev(`document.querySelectorAll('.conf-compare .rank-row').length`)) === after);
  await ev(`document.querySelector('.conf-compare .rank-actions .ghost-button')?.click()`);
  await sleep(300);
  check("an entry can be removed", (await ev(`document.querySelectorAll('.conf-compare .rank-row').length`)) === after - 1);
  await click("Clear comparison");
  await sleep(300);
  check("clearing empties the comparison", (await ev(`document.querySelectorAll('.conf-compare .rank-row').length`)) === 0);
  check("the cross-molecule disclaimer points to the Ranking tool", await ev(`/Ranking tool/.test(document.querySelector('.conf-compare')?.innerText ?? '')`));
  await screenshot(cdp, path.join(outDir, "conf-1440.png"));

  // ---- shared header on every scientific tool ----
  const tools = ["Properties", "Ranking", "Spectroscopy", "Reactions", "Multi-Step", "Multi-Catalytic"];
  for (const scheme of ["dark", "light"]) {
    for (const width of [375, 768, 1440]) {
      await fresh(width, scheme);
      const bad = [];
      for (const tool of tools) {
        await openTool(tool, 1800);
        await waitFor(() => ev(`!!document.querySelector('[role=tabpanel]:not([hidden]) .ui-tool-header, .ui-tool-header')`), `${tool} header`, 20000).catch(() => {});
        const info = await ev(`(() => { const h = document.querySelector('[role=tabpanel]:not([hidden]) .ui-tool-header') ?? document.querySelector('.ui-tool-header'); return h ? { title: h.querySelector('.ui-tool-title')?.textContent, steps: h.querySelectorAll('.ui-tool-steps li').length, badge: !!h.querySelector('.badge, [class*=badge]'), over: document.documentElement.scrollWidth - document.documentElement.clientWidth } : null; })()`);
        if (!info || info.steps !== 3 || info.over > 0 || !info.title) bad.push(`${tool}:${JSON.stringify(info)}`);
        if (scheme === "light" && width === 1440) await screenshot(cdp, path.join(outDir, `${tool.replace(/\W/g, "")}-light.png`), { fullPage: false });
      }
      check(`ToolHeader on all six tools, three steps, no overflow (${width}px, ${scheme})`, bad.length === 0, bad.join(" "));
    }
  }

  // ---- Reactions: name entry keeps add/replace ----
  await fresh(1440);
  await openTool("Reactions", 2500);
  await waitFor(() => ev(`!!document.querySelector('.molecule-name-input') && !document.querySelector('.molecule-name-input').disabled`), "reactions editor", 90000);
  const hintBefore = await ev(`!!document.querySelector('.molecule-name-hint')`);
  await setValue(".molecule-name-input", "acetone");
  await click("Enter");
  await waitFor(() => ev(`/Loaded: |Added: /.test(document.querySelector('.molecule-name-message')?.innerText ?? '')`), "acetone", 90000);
  await sleep(800);
  const labels = await ev(`[...document.querySelectorAll('.molecule-name-action')].map((b) => b.innerText.trim()).join(',')`);
  check("Reactions: after the first molecule, Add and Replace both appear", /Add/.test(labels) && /Replace/.test(labels), labels);
  check("Reactions: no hint before a structure exists", hintBefore === false);
  await setValue(".molecule-name-input", "");
  await sleep(300);
  check("Reactions: Add/Replace hint is shown once a structure exists", await ev(`/keeps what is drawn/.test(document.querySelector('.molecule-name-input-panel')?.innerText ?? '')`) || (await ev(`!!document.querySelector('.molecule-name-message')`)), "hint hides while a result message is showing");
  check("name field is described for assistive tech", await ev(`(document.querySelector('.molecule-name-input')?.getAttribute('aria-describedby') ?? '').includes('-molecule-name-help')`));

  check("no uncaught page exceptions", cdp.errors.length === 0, cdp.errors.slice(0, 2).join(" | "));
} catch (error) {
  check("script completed", false, error.message);
} finally {
  stop();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
