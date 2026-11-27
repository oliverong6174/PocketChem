// Stage 20: Reactions results explorer in a real browser with a real engine run (2-butene): overview, groups, row expansion, filtering,
// reachability of every outcome, warnings, save and reopen, then layouts at several widths/themes (no re-run).
//   npm run build && node scripts/browser/stage20ReactionsCheck.mjs      (screenshots: node_modules/.cache/pc-live20)
import fs from "node:fs";
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${String(detail).slice(0, 240)}` : ""}`); };
const outDir = path.join(root, "node_modules", ".cache", "pc-live20");
fs.mkdirSync(outDir, { recursive: true });
const { cdp, url, stop } = await startBrowser({ port: 4393, debugPort: 9553 });
const ev = (e) => cdp.evaluate(e);
const text = (sel) => ev(`(document.querySelector(${q(sel)})?.innerText ?? '').replace(/\\s+/g, ' ').trim()`);
const count = (sel) => ev(`document.querySelectorAll(${q(sel)}).length`);
const metrics = async () => JSON.parse(await ev(`JSON.stringify({ height: document.documentElement.scrollHeight, nodes: document.getElementsByTagName('*').length, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth })`));
const setText = (selector, value) => ev(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return false; const proto = el.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`);
const clickMain = (label) => ev(`(() => { const b = [...document.querySelectorAll('main button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (b) b.click(); return !!b; })()`);

try {
  await setViewport(cdp, 820, 900, { scheme: "light" });
  await cdp.send("Page.navigate", { url: `${url}?n=${Date.now()}` });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await ev(`(() => { const direct = [...document.querySelectorAll('.tool-tabs [role=tab]')].find((x) => x.textContent.trim() === 'Reactions' && x.getClientRects().length); if (direct) direct.click(); else document.querySelector('.shell-menu')?.click(); })()`);
  await sleep(700);
  await ev(`(() => { const t = [...document.querySelectorAll('.sheet-tool')].find((x) => x.querySelector('.sheet-tool-name')?.textContent.trim() === 'Reactions'); if (t) t.click(); })()`);
  await waitFor(() => ev(`Boolean(window.reactionKetcher)`), "Reactions Ketcher", 90000);
  await sleep(1500);
  await ev(`window.reactionKetcher.setMolecule('CC=CC')`); await sleep(1200);
  await clickMain("Predict Products");
  await waitFor(() => ev(`!!document.querySelector('[data-testid=reaction-explorer]')`), "explorer", 120000);
  await sleep(1500);

  // ---- overview and initial compactness
  const outcomes = Number(await text("[data-testid=ov-outcomes]"));
  const products = Number(await text("[data-testid=ov-products]"));
  const families = Number(await text("[data-testid=ov-families]"));
  const groups = await count("[data-testid=rxe-group]");
  const initialRows = await count("[data-testid=rxe-row]");
  const m0 = await metrics();
  console.log("INITIAL", JSON.stringify({ outcomes, products, families, groups, initialRows, ...m0 }));
  check("overview: outcomes, distinct products and families are reported separately", outcomes >= 20 && products > 0 && products < outcomes && families >= 4, `${outcomes}/${products}/${families}`);
  check("overview: states that outcomes are alternatives and predictions are estimates", /alternatives/.test(await text("[data-testid=results-overview]")) && /rule-based estimates, not experimental/.test(await text("[data-testid=results-overview]")));
  check("overview: product status is distinguished (computed vs representative / conceptual)", /computed product/i.test(await text("[data-testid=results-overview]")));
  check("groups: one group per reaction family, count equals the overview", groups === families, `${groups} vs ${families}`);
  check("initial view: only the first group's rows are mounted and no outcome body", initialRows < outcomes && (await count(".rxe-body")) === 0, `${initialRows} rows, ${await count(".rxe-body")} bodies`);
  check("initial page is far shorter than the 13,187 px Stage 19 list at tablet width", m0.height < 4000, `${m0.height}px (was 13187)`);
  check("no page-level horizontal overflow", m0.overflow <= 0);
  await screenshot(cdp, path.join(outDir, "rx-check-initial-820-light.png"));

  // ---- group expansion and aria
  const toggle = await ev(`(() => { const g = [...document.querySelectorAll('.rxe-group-toggle')][1]; const before = g.getAttribute('aria-expanded'); g.click(); return JSON.stringify([before, g.getAttribute('aria-controls')]); })()`);
  await sleep(300);
  const [beforeAria, controls] = JSON.parse(toggle);
  check("group toggle flips aria-expanded and reveals the rows it controls", beforeAria === "false" && (await ev(`document.querySelectorAll('.rxe-group-toggle')[1].getAttribute('aria-expanded')`)) === "true" && (await ev(`!!document.getElementById(${q(controls)})`)));
  await ev(`document.querySelectorAll('.rxe-group-toggle')[1].click()`); await sleep(200);
  check("collapsing a group removes its rows from the DOM", (await ev(`document.getElementById(${q(controls)})`)) === null);

  // ---- row expansion: diagrams only for opened rows
  const svgBefore = await count("main svg");
  await ev(`document.querySelector('.rxe-row-toggle').click()`); await sleep(2000);
  const rowState = await ev(`(() => { const b = document.querySelector('.rxe-row-toggle'); const body = document.getElementById(b.getAttribute('aria-controls')); return JSON.stringify({ expanded: b.getAttribute('aria-expanded'), hasCard: !!body?.querySelector('.reaction-pathway-card'), svgs: body?.querySelectorAll('svg').length ?? 0, region: body?.getAttribute('role') }); })()`);
  const rs = JSON.parse(rowState);
  check("opening a row mounts its full card with structures, as a labelled region", rs.expanded === "true" && rs.hasCard && rs.svgs >= 2 && rs.region === "region", rowState);
  check("opening one row builds only that row's diagrams", (await count("main svg")) - svgBefore < 12, `${(await count("main svg")) - svgBefore} new svgs`);
  const cardText = await text(".rxe-body .reaction-pathway-card");
  check("the opened card keeps reagent, selectivity/limitation text and the product", /Hydrogenation|Pd\/C/i.test(cardText) && cardText.length > 120, cardText.slice(0, 120));
  await screenshot(cdp, path.join(outDir, "rx-check-row-open-820-light.png"));
  await ev(`document.querySelector('.rxe-row-toggle').click()`); await sleep(300);
  check("closing the row removes the card", (await count(".rxe-body")) === 0);

  // ---- warnings stay visible
  const withLimits = await count(".rxe-tag.is-warn");
  check("rows with stated limitations carry a visible text tag (not colour alone)", withLimits >= 1 && /Limitations/.test(await text(".rxe-tag.is-warn")), withLimits);

  // ---- filtering and reachability
  await setText("[data-testid=rxe-query]", "hydrogenation"); await sleep(400);
  const filtered = await count("[data-testid=rxe-row]");
  check("filter: shows matching rows with a 'Showing x of y' count and a way back", filtered >= 1 && filtered < outcomes && new RegExp(`Showing ${filtered} of ${outcomes}`).test(await text("[data-testid=rxe-count]")) && /Clear filters/.test(await text("[data-testid=rxe-count]")), await text("[data-testid=rxe-count]"));
  await setText("[data-testid=rxe-query]", "zzzznothing"); await sleep(300);
  check("filter: no match says so and states that nothing was removed", /hidden by it, not removed/.test(await text("[data-testid=rxe-empty]")));
  await clickMain("Clear filters"); await sleep(300);
  check("clearing restores every outcome", (await text("[data-testid=rxe-count]")).startsWith(`${outcomes} outcomes in ${groups} groups`), await text("[data-testid=rxe-count]"));
  await setText("[data-testid=rxe-status]", "computed"); await sleep(300);
  const computedRows = await count("[data-testid=rxe-row]");
  check("status filter keeps only computed products", computedRows >= 1 && computedRows < outcomes);
  await setText("[data-testid=rxe-status]", "all"); await sleep(300);
  await ev(`document.querySelector('[data-testid=rxe-expand-all]').click()`); await sleep(6000);
  const m2 = await metrics();
  const allRows = await count("[data-testid=rxe-row]");
  const allBodies = await count(".rxe-body");
  check("every outcome is reachable: expand all mounts all rows and bodies", allRows === outcomes && allBodies === outcomes, `${allRows}/${allBodies} of ${outcomes}`);
  console.log("EXPAND-ALL", JSON.stringify(m2));
  await ev(`document.querySelector('[data-testid=rxe-expand-all]').click()`); await sleep(600);
  check("collapse all returns to headers only", (await count(".rxe-body")) === 0);

  // ---- save and reopen
  await clickMain("Save Analysis"); await sleep(500);
  await setText(".synthesis-save-form input", "rx explorer s20"); await sleep(200);
  await ev(`(() => { const f = document.querySelector('.synthesis-save-form'); const b = [...f.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Save'); b?.click(); })()`);
  await waitFor(() => ev(`document.body.innerText.includes('rx explorer s20')`), "save notice", 20000).catch(() => null);
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved')?.click()`); await sleep(1500);
  check("the saved analysis is listed", /rx explorer s20/.test(await ev(`document.body.innerText`)));
  await ev(`(() => { const card = [...document.querySelectorAll('li, article, .saved-analysis, tr')].find((x) => x.innerText.includes('rx explorer s20')); const b = [...(card ?? document).querySelectorAll('button')].find((x) => /^Open/.test(x.innerText.trim())); b?.click(); })()`);
  await waitFor(() => ev(`!!document.querySelector('[data-testid=reaction-explorer]')`), "restored explorer", 30000).catch(() => null);
  await sleep(1500);
  check("reopening restores the same outcomes in the explorer without re-running", Number(await text("[data-testid=ov-outcomes]")) === outcomes && (await count("[data-testid=rxe-group]")) === groups, `${await text("[data-testid=ov-outcomes]")}`);

  // ---- layouts from the populated state
  for (const [w, scheme] of [[1440, "light"], [820, "dark"], [375, "light"], [375, "dark"]]) {
    await setViewport(cdp, w, w < 500 ? 812 : 900, { scheme }); await sleep(700);
    await ev(`document.querySelector('[data-testid=reaction-explorer]')?.scrollIntoView()`); await sleep(300);
    const m = await metrics();
    check(`${w}px ${scheme}: no page overflow`, m.overflow <= 0, m.overflow);
    await screenshot(cdp, path.join(outDir, `rx-check-${w}-${scheme}.png`), { fullPage: false });
  }
} catch (error) {
  check("script completed", false, error instanceof Error ? error.stack : String(error));
} finally {
  stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
