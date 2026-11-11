// Stage 12 live-browser check (real headless Chrome, production build): Chemical equilibrium, Reaction kinetics and
// Thermodynamics, with the acid-base tool and Organic navigation as regressions.
//   npm run build && node scripts/browser/stage12LiveCheck.mjs
// Screenshots go to node_modules/.cache/pc-live12 (repository-local and git-ignored) unless SHOT_DIR is set.
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
};
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live12");
const { cdp, url, stop } = await startBrowser({ port: 4298, debugPort: 9458 });
const ev = (expr) => cdp.evaluate(expr);
const click = (label, scope = "document") => ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const choose = (label, scope = "document") => ev(`(() => { const o = [...${scope}.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; o.querySelector('input').click(); return true; })()`);
const setField = (label, value) => ev(`(() => { const l = [...document.querySelectorAll('.gc-field label')].find((x) => x.textContent.trim().startsWith(${q(label)})); if (!l) return false; const el = document.getElementById(l.htmlFor); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const getField = (label) => ev(`(() => { const l = [...document.querySelectorAll('.gc-field label')].find((x) => x.textContent.trim().startsWith(${q(label)})); return l ? document.getElementById(l.htmlFor).value : null; })()`);
const setRange = (id, value) => ev(`(() => { const el = document.getElementById(${q(id)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const figure = (label) => ev(`(() => { const f = [...document.querySelectorAll('.ui-figure')].find((x) => x.querySelector('dt').textContent.trim().startsWith(${q(label)})); return f ? f.querySelector('dd').textContent : null; })()`);
const text = () => ev(`document.querySelector('main')?.innerText ?? document.body.innerText`);
const testid = (id) => ev(`document.querySelector('[data-testid=${id}]')?.textContent ?? ''`);
const hash = () => ev(`location.hash`);
const SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
/** "1.23×10⁻⁵" or "0.0203" → number. */
const num = (s) => {
  const m = /(-?[\d.]+)\s*×10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/.exec(String(s).replace("−", "-"));
  if (m) return Number(m[1]) * 10 ** Number([...m[2]].map((c) => SUP[c]).join(""));
  const n = /-?[\d.]+(?:e-?\d+)?/i.exec(String(s).replace("−", "-"));
  return n ? Number(n[0]) : NaN;
};
const near = (a, b, rel) => Number.isFinite(a) && Math.abs(a - b) <= rel * Math.abs(b);
const iceRow = (name) => ev(`(() => { const r = [...document.querySelectorAll('.gc-ice tbody tr')].find((x) => x.querySelector('th').textContent.trim().startsWith(${q(name)})); return r ? [...r.querySelectorAll('td')].map((c) => c.textContent.trim()) : null; })()`);
const fresh = async (width, scheme = "dark", target = "") => {
  await setViewport(cdp, width, width < 500 ? 812 : 900, { scheme });
  await cdp.send("Page.navigate", { url: url + target });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await sleep(600);
};
const waitTool = (selector) => waitFor(() => ev(`!!document.querySelector(${q(selector)})`), selector, 20000);
const R = 8.314462618;

try {
  // ---------------- navigation ----------------
  await fresh(1440, "dark", "#/general/overview");
  const tabs = await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].map((b) => b.textContent.trim()).join('|')`);
  check("General Chemistry tabs: Overview, Acid–base & titration, Chemical equilibrium, Reaction kinetics, Thermodynamics, Saved", tabs === "Overview|Acid–base & titration|Chemical equilibrium|Reaction kinetics|Thermodynamics|Saved", tabs);
  const ov = await ev(`({ buttons: [...document.querySelectorAll('.gc-tool-card button')].map((b) => b.textContent.trim()), planned: [...document.querySelectorAll('.gc-planned li')].map((l) => l.querySelector('span').textContent.trim()), plannedButtons: document.querySelectorAll('.gc-planned button, .gc-planned a').length })`);
  check("overview: four working tools with Open buttons", ov.buttons.length === 4 && ov.buttons.every((b) => /^Open /.test(b)), ov.buttons.join(" | "));
  check("overview: planned items are non-interactive and no longer include thermochemistry", ov.plannedButtons === 0 && ov.planned.length === 4 && !ov.planned.some((p) => /thermo/i.test(p)), ov.planned.join(" | "));
  await screenshot(cdp, path.join(outDir, "overview-1440-dark.png"), { fullPage: false });
  await click("Open Chemical equilibrium");
  await waitTool(".gc-ice");
  check("Open button reaches the equilibrium tool; hash is #/general/equilibrium", (await hash()) === "#/general/equilibrium", await hash());

  // ---------------- equilibrium ----------------
  const K0 = 4.6e-3; const c0 = 0.1;
  const x0 = (-K0 + Math.sqrt(K0 * K0 + 16 * K0 * c0)) / 8;
  check("N₂O₄ ⇌ 2 NO₂ (Kc 4.6×10⁻³, 0.100 M): extent matches the closed-form quadratic root", near(num(await figure("Reaction extent")), x0, 0.01), `${await figure("Reaction extent")} vs ${x0.toPrecision(4)}`);
  const noRow = await iceRow("NO₂");
  const n2Row = await iceRow("N₂O₄");
  check("ICE table: [NO₂] = 2x, [N₂O₄] = 0.100 − x", near(num(noRow[2]), 2 * x0, 0.01) && near(num(n2Row[2]), c0 - x0, 0.01), `${noRow.join("/")} ${n2Row.join("/")}`);
  check("ICE rows: initial + change = equilibrium", near(num(noRow[0]) + num(noRow[1]), num(noRow[2]), 0.02) && near(num(n2Row[0]) + num(n2Row[1]), num(n2Row[2]), 0.02));
  check("Q₀ for a mixture with no product is shown as 0, not 'undefined'", /^0 [(]no product yet[)]/.test((await figure("Q₀ versus K")) ?? ""), await figure("Q₀ versus K"));
  check("starting Q₀ is below K, so the net reaction goes forward", /forward/.test((await figure("Q₀ versus K")) + (await text())));
  check("two graphs are drawn and the composition legend names the species", await ev(`document.querySelectorAll('.gc-chart-svg').length >= 2 && /N₂O₄/.test(document.querySelector('.ui-legend')?.textContent ?? '') && /NO₂/.test(document.querySelector('.ui-legend')?.textContent ?? '')`));
  check("the equilibrium marker is on the composition graph", await ev(`document.querySelectorAll('.gc-marker').length >= 1`));
  const xiPathA = await ev(`document.querySelector('.gc-line')?.getAttribute('d')?.length ?? 0`);
  check("the composition curves are polylines with many points", xiPathA > 400, String(xiPathA));
  check("at progress 0 the readout compares Q with K (Q < K)", await ev(`/At this progress: Q < K/.test(document.body.innerText)`));
  await click("Equilibrium", "document.querySelector('.gc-jumps')");
  await sleep(300);
  check("jumping to equilibrium reads Q = K", await ev(`/Q = K \\(equilibrium\\)/.test(document.body.innerText)`));
  await setRange("gc-xi-slider", 0.05);
  await sleep(300);
  check("moving the progress slider past equilibrium reads Q > K", await ev(`/At this progress: Q > K/.test(document.body.innerText)`));
  const xiVal = await ev(`document.querySelectorAll('.gc-current')[0].getAttribute('aria-valuenow')`);
  check("the graph's selected marker follows the slider (0.05)", near(Number(xiVal), 0.05, 0.05), xiVal);
  check("Kp for gases: Kc (RT)^Δν with Δν = +1 → Kp = 4.6e-3 × 24.79 = 0.114", await ev(`/0\\.11[34]/.test(document.body.innerText) && /Kp/.test(document.body.innerText)`));
  check("Explore mode lists the explanations (Q vs K, ICE, dynamic equilibrium, K constant, volume)", (await ev(`document.querySelectorAll('.ui-disclosure, details').length`)) >= 5);
  check("worked solution is available and uses this system's numbers", await ev(`(() => { const d = [...document.querySelectorAll('details')].find((x) => /Worked solution/.test(x.textContent)); if (d) d.open = true; return !!d && /Compare Q with K/.test(d.textContent); })()`));

  // change values
  await setField("Reactant 1 initial", 0.5);
  await sleep(300);
  const x1 = (-K0 + Math.sqrt(K0 * K0 + 16 * K0 * 0.5)) / 8;
  check("raising the initial N₂O₄ to 0.500 M recomputes the extent (closed form)", near(num(await figure("Reaction extent")), x1, 0.01), `${await figure("Reaction extent")} vs ${x1.toPrecision(4)}`);
  await click("H₂ + I₂ ⇌ 2 HI");
  await sleep(300);
  const s = Math.sqrt(54.3);
  const xHI = (0.1 * s) / (2 + s);
  check("preset H₂ + I₂ ⇌ 2 HI (K = 54.3): [HI] = 2x with x = 0.1√K/(2+√K)", near(num((await iceRow("HI"))[2]), 2 * xHI, 0.01), (await iceRow("HI")).join("/"));
  check("Δν = 0: Kp equals Kc", await ev(`/Δν = 0/.test(document.body.innerText)`));

  // errors
  await setField("Equilibrium constant", "abc");
  await sleep(250);
  check("a non-numeric K gives an explicit error and no results", await ev(`!!document.querySelector('.gc-field-error') && !document.querySelector('.gc-ice')`));
  await setField("Equilibrium constant", 54.3);
  await setField("Reactant 1 coefficient", 0);
  await sleep(250);
  check("a zero coefficient is refused with a reason", await ev(`/whole number from 1 to 6/.test(document.body.innerText)`));
  await setField("Reactant 1 coefficient", 1);
  await sleep(250);
  check("fixing the values brings the results back", await ev(`!!document.querySelector('.gc-ice') && !document.querySelector('.gc-field-error')`));

  // Le Châtelier
  await click("N₂ + 3 H₂ ⇌ 2 NH₃");
  await sleep(300);
  await choose("Disturb (Le Châtelier)");
  await sleep(300);
  await choose("Change volume");
  await sleep(250);
  await setField("Volume factor", 2);
  await sleep(300);
  check("N₂ + 3H₂ ⇌ 2NH₃ (Δν = −2): expanding the volume ×2 shifts toward reactants (left)", /To the left/.test((await figure("Net shift")) ?? ""), await figure("Net shift"));
  await setField("Volume factor", 0.5);
  await sleep(300);
  check("compressing ×0.5 shifts toward products (right)", /To the right/.test((await figure("Net shift")) ?? ""), await figure("Net shift"));
  const qImm = num(await figure("Q right after"));
  check("Q right after compression = K × 2^|Δν| (×4) and K is stated unchanged", await ev(`/0\\.5/.test(document.body.innerText)`) && qImm > 0 && /unchanged/.test((await ev(`document.querySelectorAll('.ui-figure')[0].textContent`))), String(qImm));
  await click("H₂ + I₂ ⇌ 2 HI");
  await sleep(300);
  await choose("Change volume");
  await setField("Volume factor", 3);
  await sleep(300);
  check("Δν = 0 reaction: a volume change gives no shift", /None/.test((await figure("Net shift")) ?? ""), await figure("Net shift"));
  await choose("Add a species");
  await sleep(250);
  await setField("Amount to add", 0.05);
  await sleep(300);
  check("adding reactant H₂ shifts right; the table has before/right-after/new columns", /To the right/.test((await figure("Net shift")) ?? "") && (await ev(`document.querySelectorAll('.gc-shift-table thead th').length`)) === 4);
  await choose("Remove a species");
  await sleep(250);
  await choose("HI");
  await setField("Amount to remove", 0.01);
  await sleep(300);
  check("removing product HI shifts right", /To the right/.test((await figure("Net shift")) ?? ""), await figure("Net shift"));
  await setField("Amount to remove", 5);
  await sleep(300);
  check("removing more than is present is refused", await ev(`/cannot remove more/.test(document.body.innerText)`));
  await choose("Add inert gas");
  await sleep(250);
  check("inert gas: no shift", /None/.test((await figure("Net shift")) ?? ""));

  // practice
  await choose("Practice");
  await sleep(300);
  check("Practice mode shows predict-the-shift without the answer", await ev(`!!document.querySelector('.gc-predict') && !document.querySelector('.gc-reveal .ui-callout')`));
  await ev(`[...document.querySelectorAll('.gc-predict .ui-seg-option')].find((o) => /Right/.test(o.textContent))?.querySelector('input').click()`);
  await sleep(300);
  check("after predicting, the model reveals the shift with Q and K", await ev(`/Q = |Q </.test(document.querySelector('.gc-reveal')?.textContent ?? '') || /shift/.test(document.querySelector('.gc-reveal')?.textContent ?? '')`), await ev(`document.querySelector('.gc-reveal')?.textContent.slice(0, 100) ?? ''`));
  await choose("Equilibrium composition");
  await sleep(300);
  await ev(`[...document.querySelectorAll('.gc-predict .ui-seg-option')].find((o) => /Forward/.test(o.textContent))?.querySelector('input').click()`);
  await sleep(300);
  check("practice 'which way does it go?': Mixture 1 has Q = K/10 and the answer is forward", await ev(`/Correct/.test(document.querySelector('.gc-reveal')?.textContent ?? '')`));
  await choose("Explore");

  // save and restore
  await click("N₂O₄ ⇌ 2 NO₂");
  await setField("Reactant 1 initial", 0.25);
  await sleep(300);
  const savedExtent = await figure("Reaction extent");
  await click("Save Analysis");
  await sleep(300);
  await ev(`(() => { const el = document.querySelector('.synthesis-save-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'S12 equilibrium'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`/Saved “S12 equilibrium”/.test(document.body.innerText)`), "save notice", 15000);
  check("equilibrium: Save Analysis stores the analysis", true);
  await setField("Reactant 1 initial", 0.9);
  await click("Reset");
  await sleep(300);
  check("Reset restores the example values (N₂O₄ 0.1 M)", (await getField("Reactant 1 initial")) === "0.1");

  // ---------------- kinetics ----------------
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Reaction kinetics').click()`);
  await waitTool("[data-testid=half-life]");
  check("hash is #/general/kinetics", (await hash()) === "#/general/kinetics", await hash());
  check("first order k = 0.05 s⁻¹: half-life = ln 2 / k = 13.9 s", near(num(await testid("half-life")), Math.LN2 / 0.05, 0.005), await testid("half-life"));
  check("units: first-order k in s⁻¹", await ev(`/\\(s⁻¹\\)/.test([...document.querySelectorAll('.gc-field label')].find((l) => l.textContent.startsWith('Rate constant'))?.textContent ?? '')`));
  check("concentration–time and linearized graphs are both drawn", (await ev(`document.querySelectorAll('.gc-chart-svg').length`)) === 2);
  const cx = await ev(`[...document.querySelectorAll('.gc-current circle')].map((c) => Number(c.getAttribute('cx')).toFixed(1))`);
  check("both graphs mark the same time", cx.length === 2 && cx[0] === cx[1], cx.join(" vs "));
  await setRange("gc-t-slider", 13.86);
  await sleep(300);
  const cA = num(await figure("[A] at"));
  check("at t = t½ the concentration is half of [A]₀ (0.5 mol/L)", near(cA, 0.5, 0.01), await figure("[A] at"));
  const cx2 = await ev(`[...document.querySelectorAll('.gc-current circle')].map((c) => Number(c.getAttribute('cx')).toFixed(1))`);
  check("the two graphs still agree after moving the slider, and it moved", cx2[0] === cx2[1] && cx2[0] !== cx[0], cx2.join(" vs "));
  await choose("Second order");
  await sleep(250);
  await setField("Rate constant k", 0.5);
  await setField("Initial concentration", 0.2);
  await sleep(300);
  check("second order k = 0.5 L/(mol s), [A]₀ = 0.2 M: half-life 1/(k[A]₀) = 10 s", near(num(await testid("half-life")), 10, 0.005), await testid("half-life"));
  check("second-order k has units L mol⁻¹ s⁻¹", await ev(`/L mol⁻¹ s⁻¹/.test([...document.querySelectorAll('.gc-field label')].find((l) => l.textContent.startsWith('Rate constant'))?.textContent ?? '')`));
  const hl = await ev(`[...document.querySelectorAll('.gc-table tbody tr')].map((r) => Number(r.children[2].textContent))`);
  check("successive half-lives double for second order (10, 20, 40, 80)", hl.length === 4 && near(hl[1] / hl[0], 2, 0.01) && near(hl[3] / hl[2], 2, 0.01), hl.join(","));
  await choose("Zero order");
  await sleep(250);
  await setField("Rate constant k", 0.01);
  await setField("Initial concentration", 0.5);
  await sleep(300);
  check("zero order k = 0.01 M/s, [A]₀ = 0.5 M: half-life = [A]₀/2k = 25 s", near(num(await testid("half-life")), 25, 0.005), await testid("half-life"));
  const hl0 = await ev(`[...document.querySelectorAll('.gc-table tbody tr')].map((r) => Number(r.children[2].textContent))`);
  check("successive half-lives halve for zero order (25, 12.5, 6.25, 3.125)", hl0.length === 4 && near(hl0[1] / hl0[0], 0.5, 0.01), hl0.join(","));
  await setField("Rate constant k", -1);
  await sleep(250);
  check("a negative rate constant is refused", await ev(`!!document.querySelector('.gc-field-error') && !document.querySelector('[data-testid=half-life]')`));
  await click("First-order example");
  await sleep(300);
  check("an example button restores a valid model", near(num(await testid("half-life")), Math.LN2 / 0.05, 0.005));
  await choose("Practice");
  await sleep(300);
  check("kinetics Practice: predict-then-observe replaces the lessons", await ev(`!!document.querySelector('.gc-predict')`));
  await ev(`[...document.querySelectorAll('.gc-predict .ui-seg-option')].find((o) => /same/.test(o.textContent))?.querySelector('input').click()`);
  await sleep(300);
  check("doubling [A]₀ for first order: half-life about the same is confirmed", await ev(`/Your prediction matches/.test(document.querySelector('.gc-reveal')?.textContent ?? '')`), await ev(`document.querySelector('.gc-reveal')?.textContent.slice(0, 120) ?? ''`));
  await choose("Explore");

  await choose("Fit data");
  await sleep(400);
  check("fit: the default first-order data are identified as first order and 'supported'", await ev(`/Best fit: first-order \\(supported\\)/.test(document.body.innerText)`), await ev(`document.querySelector('.ui-callout')?.textContent.slice(0, 100) ?? ''`));
  const kFit = await ev(`(() => { const r = document.querySelector('.gc-fit-table tr.is-best td'); return r ? r.textContent : ''; })()`);
  check("the fitted k is about 0.05 s⁻¹", near(parseFloat(kFit), 0.05, 0.03), kFit);
  check("the table states the fitting criterion and lists all three orders", (await ev(`document.querySelectorAll('.gc-fit-table tbody tr').length`)) === 3 && (await ev(`/root-mean-square/.test(document.body.innerText)`)));
  await click("Second-order data");
  await sleep(400);
  check("second-order data are identified as second order", await ev(`/Best fit: second-order/.test(document.body.innerText)`));
  await click("Too little decay");
  await sleep(400);
  check("data covering only 10 % decay are NOT called supported; the tool says why", await ev(`!/\\(supported\\)/.test(document.body.innerText) && /conversion|distinguish/i.test(document.querySelector('.ui-callout')?.textContent ?? '')`), await ev(`document.querySelector('.ui-callout')?.textContent.slice(0, 140) ?? ''`));
  await setField("Rows of", "0, 1\n1, 0.9");
  await sleep(300);
  check("too few rows are refused with a reason", await ev(`/at least 4/i.test(document.body.innerText)`));
  await click("Zero-order data");
  await sleep(400);
  check("zero-order data: first/second order are marked not usable only if a concentration is zero; the best is zero order", await ev(`/Best fit: zero-order/.test(document.body.innerText)`));
  check("the data and fitted curves are plotted (dots present)", await ev(`document.querySelectorAll('.gc-dot').length >= 6`));

  await choose("Arrhenius");
  await sleep(400);
  const kExpected = 2e-3 * Math.exp((60000 / R) * (1 / 300 - 1 / 320));
  check("Arrhenius: Ea = 60 kJ/mol, k = 2×10⁻³ at 300 K → k(320 K) matches exp(−Ea/R(1/T − 1/T₁))", near(num(await figure("k at")), kExpected, 0.01), `${await figure("k at")} vs ${kExpected.toPrecision(3)}`);
  check("Arrhenius plot and k–T graph are drawn", (await ev(`document.querySelectorAll('.gc-chart-svg').length`)) === 2);
  await choose("Two measurements");
  await sleep(300);
  await setField("Rate constant k₁", 1e-3);
  await setField("Temperature T₁", 300);
  await setField("Rate constant k₂", 1e-2);
  await setField("Temperature T₂", 320);
  await sleep(300);
  check("two measurements (1e-3 at 300 K, 1e-2 at 320 K) → Ea = 91.9 kJ/mol", near(num(await figure("Activation energy")), 91.89, 0.005), await figure("Activation energy"));
  await choose("Table of data");
  await sleep(300);
  check("a table of data gives Ea ≈ 60 kJ/mol with a fit quality", near(num(await figure("Activation energy")), 60, 0.01) && /R² = /.test((await ev(`document.querySelector('.ui-figures')?.textContent ?? ''`))), await figure("Activation energy"));
  await setField("Temperature of interest", -5);
  await sleep(250);
  check("a non-physical temperature is refused", await ev(`!!document.querySelector('.gc-field-error') || /kelvin/.test(document.body.innerText)`));
  await setField("Temperature of interest", 320);
  await sleep(250);

  await click("Save Analysis");
  await sleep(300);
  await ev(`(() => { const el = document.querySelector('.synthesis-save-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'S12 kinetics'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`/Saved “S12 kinetics”/.test(document.body.innerText)`), "save notice", 15000);
  check("kinetics: Save Analysis stores the analysis", true);

  // ---------------- thermodynamics ----------------
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Thermodynamics').click()`);
  await waitTool("[data-testid=dg-now]");
  check("hash is #/general/thermodynamics", (await hash()) === "#/general/thermodynamics", await hash());
  const dg400 = -92.2 + 400 * 0.1987;
  check("Haber (ΔH −92.2 kJ, ΔS −198.7 J/K) at 400 K: ΔG° = ΔH − TΔS = −12.7 kJ/mol", near(num(await testid("dg-now")), dg400, 0.005), `${await testid("dg-now")} vs ${dg400.toFixed(2)}`);
  check("the crossover temperature ΔH/ΔS = 464 K is stated and marked on the graph", await ev(`/46[34]\\.?\\d* K/.test(document.body.innerText) && document.querySelectorAll('.gc-marker').length >= 1`));
  check("the graph shows ΔG°, ΔH° and TΔS° and shades the favourable region", await ev(`document.querySelectorAll('.gc-line').length >= 4 && document.querySelectorAll('.gc-band').length >= 1 && /TΔS/.test(document.querySelector('.ui-legend')?.textContent ?? '')`));
  check("the four sign cases are listed and this reaction's row is highlighted", await ev(`document.querySelectorAll('.gc-case-table tbody tr').length === 4 && document.querySelectorAll('.gc-case-table tr.is-here').length === 1`));
  check("favourable ≠ fast is stated", await ev(`/not the same as fast|does not say how quickly/i.test(document.body.innerText)`));
  await setRange("gc-T-slider", 600);
  await sleep(300);
  check("moving the temperature slider to 600 K gives ΔG° ≈ +27 kJ/mol (unfavourable)", near(num(await testid("dg-now")), -92.2 + 600 * 0.1987, 0.01), await testid("dg-now"));
  await click("CaCO₃ → CaO + CO₂");
  await sleep(300);
  check("CaCO₃ preset: crossover at ΔH/ΔS = 1111 K", await ev(`/111[01]\\.?\\d* K/.test(document.body.innerText)`));
  await click("C + O₂ → CO₂");
  await sleep(300);
  check("always-favourable preset: no crossover in range, explained", await ev(`/none in range/.test(document.body.innerText) && /every temperature/.test(document.body.innerText)`));
  await setField("ΔS°", 1e6);
  await sleep(250);
  check("a ΔS° given in the wrong unit (1×10⁶ J/(mol·K)) is refused with a hint", await ev(`/joules, not kilojoules/.test(document.body.innerText)`));
  await setField("ΔS°", 2.9);
  await click("N₂ + 3 H₂ → 2 NH₃");
  await sleep(250);
  await ev(`(() => { const c = document.querySelector('.gc-check input'); c.click(); })()`);
  await sleep(300);
  check("nonstandard Q: a Q field appears and ΔG = ΔG° + RT ln Q is shown", (await getField("Reaction quotient Q")) === "1" && await ev(`/Nonstandard ΔG/i.test(document.querySelector('main').textContent)`));
  await setField("Reaction quotient Q", 100);
  await sleep(300);
  const dgNon = num(await figure("Nonstandard ΔG"));
  const expectNon = (-92.2 + 400 * 0.1987) + (R * 400 * Math.log(100)) / 1000;
  check("ΔG at Q = 100 equals ΔG° + RT ln Q = −12.7 + 15.3 = 2.6 kJ/mol", near(dgNon, expectNon, 0.03), `${dgNon} vs ${expectNon.toFixed(2)}`);
  await setField("ΔCp", 80);
  await sleep(300);
  check("entering ΔCp changes the model (ΔG° at 400 K differs from the constant-ΔH, ΔS value) and the amber 'far from T₀' band logic is dropped", Math.abs(num(await testid("dg-now")) - dg400) > 0.05);
  await setField("ΔCp", 0);
  await choose("Practice");
  await sleep(300);
  await ev(`[...document.querySelectorAll('.gc-predict .ui-seg-option')].find((o) => /Higher/.test(o.textContent))?.querySelector('input').click()`);
  await sleep(300);
  check("thermo Practice: predict then observe reveals ΔG° before/after (raising T for ΔS < 0 raises ΔG°)", await ev(`/Your prediction matches/.test(document.querySelector('.gc-reveal')?.textContent ?? '')`), await ev(`document.querySelector('.gc-reveal')?.textContent.slice(0, 120) ?? ''`));
  await choose("Explore");
  check("Explore lessons separate favourability from kinetic accessibility", await ev(`[...document.querySelectorAll('.ui-disclosure summary, details summary')].some((s) => /fast/.test(s.textContent))`));

  await choose("Hess's law");
  await sleep(400);
  check("Hess: C + ½O₂ → CO from the two combustion equations gives −110.5 kJ", near(num(await testid("hess-total")), -110.5, 0.001), await testid("hess-total"));
  check("Hess accounting shows reversal of equation 2 and a cancellation table", await ev(`/Reverse it/.test(document.querySelector('.gc-ledger')?.textContent ?? '') && document.querySelectorAll('tbody tr').length >= 3`));
  await setField("Target equation", "C(s) + O2(g) -> CO(g)");
  await sleep(300);
  check("an unbalanced target is refused with the reason", await ev(`/not balanced/.test(document.body.innerText)`));
  await setField("Target equation", "2 C(s) + O2(g) -> 2 CO(g)");
  await sleep(300);
  check("doubling the target doubles ΔH (−221 kJ) with scaling in the accounting", near(num(await testid("hess-total")), -221.0, 0.001) && await ev(`/multiply by 2/.test(document.querySelector('.gc-ledger')?.textContent ?? '')`), await testid("hess-total"));
  await setField("Equation 2", "CO(g) + 1/2 O2(g) -> CO2(l)");
  await sleep(300);
  check("states matter: CO₂(l) vs CO₂(g) is reported", await ev(`/states|No combination|not balanced/i.test(document.body.innerText)`));
  await click("Reset");
  await sleep(300);
  await choose("Hess's law");
  await choose("Practice");
  await sleep(300);
  check("Hess practice asks for the learner's own ΔH", await ev(`/Practice: do the accounting/.test(document.body.innerText)`));
  await setField("Your ΔH for the target", -110.5);
  await click("Check my answer");
  await sleep(250);
  check("a correct hand answer is confirmed", await ev(`/Matches the model/.test(document.body.innerText)`));
  await choose("Explore");

  await choose("Calorimetry");
  await sleep(400);
  const dhCal = -(100 * 4.184 * 6.5) / 0.05 / 1000;
  check("calorimetry: 100 g, +6.5 K, 0.050 mol → ΔH = −54.4 kJ/mol", near(num(await testid("cal-main")), dhCal, 0.005), `${await testid("cal-main")} vs ${dhCal.toFixed(2)}`);
  check("the energy-balance steps are listed and the process is called exothermic", (await ev(`document.querySelectorAll('.gc-calc-steps li').length`)) >= 4 && (await ev(`/Exothermic/.test(document.body.innerText)`)));
  await setField("Calorimeter heat capacity", 150);
  await sleep(300);
  check("adding C_cal = 150 J/K gives ΔH = −73.9 kJ/mol", near(num(await testid("cal-main")), -(2719.6 + 975) / 50, 0.005), await testid("cal-main"));
  await setField("Final T", 18);
  await sleep(300);
  check("a temperature drop is endothermic (ΔH > 0)", num(await testid("cal-main")) > 0 && await ev(`/Endothermic/.test(document.body.innerText)`));
  await click("Mix two samples");
  await sleep(300);
  check("mixing equal water masses at 80 °C and 20 °C → 50 °C", near(num(await testid("cal-main")), 50, 0.001), await testid("cal-main"));
  await click("Specific heat of a metal");
  await sleep(300);
  check("specific heat of a metal: 0.558 J/(g·K)", near(num(await testid("cal-main")), 0.558, 0.005), await testid("cal-main"));
  await setField("Final T", 120);
  await sleep(250);
  check("a final temperature outside the two start temperatures is refused", await ev(`/strictly between/.test(document.body.innerText)`));
  await setField("Final T", 25);
  await click("Reaction in a calorimeter");
  await sleep(250);
  await click("Save Analysis");
  await sleep(300);
  await ev(`(() => { const el = document.querySelector('.synthesis-save-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'S12 thermo'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`/Saved “S12 thermo”/.test(document.body.innerText)`), "save notice", 15000);
  check("thermodynamics: Save Analysis stores the analysis", true);

  // ---------------- saved list: labels, restore, cross-subject ----------------
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 3`), "saved list", 15000);
  const badges = await ev(`[...document.querySelectorAll('.saved-badge')].map((b) => b.textContent.trim())`);
  check("Saved list labels each record with its subject and tool", ["Chemical equilibrium", "Reaction kinetics", "Thermodynamics"].every((t) => badges.some((b) => b.includes(`General Chemistry · ${t}`))), badges.join(" | "));
  const openRecord = async (name) => {
    await ev(`(() => { const row = [...document.querySelectorAll('.saved-list li, .saved-item, article, li')].find((x) => x.textContent.includes(${q(name)}) && x.querySelector('button')); const b = row && [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open'); b?.click(); })()`);
    await sleep(1200);
    if (await ev(`!!document.querySelector('[role=alertdialog]')`)) await click("Replace without saving");
    await sleep(800);
  };
  await openRecord("S12 equilibrium");
  await waitTool(".gc-ice");
  check("opening the equilibrium record restores N₂O₄ = 0.25 M and the same extent", (await getField("Reactant 1 initial")) === "0.25" && (await figure("Reaction extent")) === savedExtent, `${await getField("Reactant 1 initial")} ${await figure("Reaction extent")} vs ${savedExtent}`);
  check("a notice says results were recalculated from the saved values", await ev(`/recalculated from the saved values/.test(document.body.innerText)`));
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 3`), "saved list", 15000);
  await openRecord("S12 kinetics");
  await waitTool(".gc-field");
  check("opening the kinetics record restores the Arrhenius view and its data table", /Arrhenius|Activation energy/.test(await text()) && (await getField('Rows of "T (K), k"'))?.includes("0.000873"), await hash());
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 3`), "saved list", 15000);
  await openRecord("S12 thermo");
  await waitTool(".gc-field");
  check("opening the thermodynamics record restores the calorimetry view", /Energy balance/.test(await text()) && (await getField("Calorimeter heat capacity")) === "150", await hash());

  // cross-subject: organic Saved lists General records and switches subject
  await ev(`document.querySelector('.subject-trigger').click()`);
  await sleep(250);
  await ev(`[...document.querySelectorAll('.subject-popover .subject-item')].find((b) => b.querySelector('.subject-item-name').textContent.trim() === 'Organic Chemistry')?.click()`);
  await sleep(700);
  check("Organic Chemistry navigation is unchanged (Properties selected; eight tabs)", (await ev(`document.querySelector('.tool-tabs [aria-selected=true]')?.textContent.trim()`)) === "Properties" && (await ev(`document.querySelectorAll('.tool-tabs [role=tab]').length`)) === 8);
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved')?.click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 3`), "saved list (organic)", 15000);
  await ev(`(() => { const row = [...document.querySelectorAll('li, article')].find((x) => x.textContent.includes('S12 kinetics') && x.querySelector('button')); [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open')?.click(); })()`);
  await waitFor(() => ev(`location.hash === '#/general/kinetics'`), "cross-subject open", 15000);
  check("opening a kinetics record from the Organic Saved page switches subject and tool", (await hash()) === "#/general/kinetics");

  // ---------------- persistence across reload (autosave) ----------------
  await fresh(1440, "dark", "#/general/equilibrium");
  await waitTool(".gc-ice");
  await setField("Reactant 1 initial", 0.375);
  await sleep(1600);
  await cdp.send("Page.reload");
  await waitFor(() => ev(`document.readyState === 'complete'`), "reload");
  await waitTool(".gc-ice");
  await sleep(600);
  check("equilibrium: after a reload the last values come back", (await getField("Reactant 1 initial")) === "0.375", await getField("Reactant 1 initial"));
  await fresh(1440, "dark", "#/general/thermodynamics");
  await waitTool(".gc-field");
  await choose("Gibbs energy vs T");
  await waitTool("[data-testid=dg-now]");
  await setField("ΔH°", -50);
  await sleep(1600);
  await cdp.send("Page.reload");
  await waitFor(() => ev(`document.readyState === 'complete'`), "reload");
  await waitTool(".gc-field");
  await sleep(600);
  await choose("Gibbs energy vs T");
  await sleep(300);
  check("thermodynamics: after a reload the last values come back", (await getField("ΔH°")) === "-50", await getField("ΔH°"));

  // ---------------- regressions: acid-base ----------------
  await fresh(1440, "dark", "#/general/acid-base-titration");
  await waitTool("[data-testid=ph-now]");
  check("acid–base tool still works: default weak acid at half-equivalence reads pH ≈ 4.76", near(num(await testid("ph-now")), 4.76, 0.005), await testid("ph-now"));

  // ---------------- layout and themes ----------------
  const audit = async (route, width, scheme, name) => {
    await fresh(width, scheme, route);
    await waitFor(() => ev(`!!document.querySelector('.gc-chart-svg')`), "chart", 20000).catch(() => {});
    const info = await ev(`(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, charts: [...document.querySelectorAll('.gc-chart-svg')].map((c) => Math.round(c.getBoundingClientRect().width)), vw: innerWidth, paper: getComputedStyle(document.querySelector('.ui-diagram') ?? document.body).backgroundColor, smallText: [...document.querySelectorAll('.gc-tick, .gc-axis-label')].filter((t) => parseFloat(getComputedStyle(t).fontSize) < 11).length }))()`);
    check(`${name} ${width}px ${scheme}: no horizontal overflow, charts fit`, info.over <= 0 && info.charts.every((w) => w <= info.vw), JSON.stringify(info));
    return info;
  };
  const routes = [["#/general/equilibrium", "equilibrium"], ["#/general/kinetics", "kinetics"], ["#/general/thermodynamics", "thermo"]];
  for (const [route, name] of routes) {
    for (const [width, scheme] of [[375, "dark"], [375, "light"], [768, "dark"], [1440, "light"], [1440, "dark"]]) {
      const info = await audit(route, width, scheme, name);
      const paperOk = (c) => (c.match(/\d+/g) ?? []).slice(0, 3).every((n) => Number(n) >= 245);
      if (!paperOk(info.paper)) check(`${name} ${width}px ${scheme}: chart paper is light`, false, info.paper);
      await screenshot(cdp, path.join(outDir, `${name}-${width}-${scheme}.png`), { fullPage: width < 500 });
    }
  }
  // every view and mode of every tool at phone width (the layouts differ per view)
  const overflowNow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  const viewAudit = async (route, views, label) => {
    await fresh(375, "light", route);
    await waitTool(".gc-field");
    for (const v of views) {
      await choose(v);
      await sleep(450);
      for (const mode of ["Explore", "Practice"]) {
        await choose(mode);
        await sleep(300);
        const over = await overflowNow();
        const bad = over <= 0 ? [] : await ev(`[...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > 376).slice(0, 4).map((e) => e.tagName + '.' + (e.className?.baseVal ?? e.className))`);
        check(`${label} / ${v} / ${mode} at 375px: no horizontal overflow`, over <= 0, bad.join(" "));
      }
    }
  };
  await viewAudit("#/general/equilibrium", ["Equilibrium composition", "Disturb (Le Châtelier)"], "equilibrium");
  await viewAudit("#/general/kinetics", ["Rate-law model", "Fit data", "Arrhenius"], "kinetics");
  await viewAudit("#/general/thermodynamics", ["Gibbs energy vs T", "Hess's law", "Calorimetry"], "thermodynamics");
  check("overview at 375px has no horizontal overflow", await (async () => { await fresh(375, "dark", "#/general/overview"); return (await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`)) <= 0; })());
  check("mobile navigation reaches the new tools (sheet lists them)", await (async () => { await ev(`document.querySelector('.shell-menu')?.click()`); await sleep(400); const names = await ev(`[...document.querySelectorAll('.sheet-tool .sheet-tool-name')].map((x) => x.textContent.trim()).join('|')`); return /Chemical equilibrium/.test(names) && /Reaction kinetics/.test(names) && /Thermodynamics/.test(names); })());

  check("no uncaught page exceptions", cdp.errors.length === 0, cdp.errors.slice(0, 3).join(" | "));
} catch (error) {
  check("script completed", false, `${error.message}\n${error.stack?.split("\n").slice(1, 3).join("\n")}`);
} finally {
  stop();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
