// Stage 14 live-browser check (real headless Chrome, production build): Forces & Newton's laws, Work & energy and Momentum &
// collisions, plus Physics navigation. Stage 13 features are covered by stage13LiveCheck.mjs.
//   npm run build && node scripts/browser/stage14LiveCheck.mjs
// Screenshots go to node_modules/.cache/pc-live14 (repository-local and git-ignored) unless SHOT_DIR is set.
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
};
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live14");
const { cdp, url, stop } = await startBrowser({ port: 4300, debugPort: 9460 });
const ev = (expr) => cdp.evaluate(expr);
const click = (label, scope = "document") => ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const choose = (label) => ev(`(() => { const o = [...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; o.querySelector('input').click(); return true; })()`);
const setField = (label, value, nth = 0) => ev(`(() => { const ls = [...document.querySelectorAll('.gc-field label')].filter((x) => x.textContent.trim().startsWith(${q(label)})); const l = ls[${nth}]; if (!l) return false; const el = document.getElementById(l.htmlFor); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const getField = (label, nth = 0) => ev(`(() => { const ls = [...document.querySelectorAll('.gc-field label')].filter((x) => x.textContent.trim().startsWith(${q(label)})); return ls[${nth}] ? document.getElementById(ls[${nth}].htmlFor).value : null; })()`);
const setRangeEl = (selector, value) => ev(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const figure = (label) => ev(`(() => { const f = [...document.querySelectorAll('.ui-figure')].find((x) => x.querySelector('dt').textContent.trim().startsWith(${q(label)})); return f ? f.querySelector('dd').textContent : null; })()`);
const hash = () => ev(`location.hash`);
const SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
const PREFIX = { G: 1e9, M: 1e6, k: 1e3, m: 1e-3, "µ": 1e-6, n: 1e-9 };
/** First number in "49.1 N", "1.5 kJ", "-3×10⁻⁴ J" → base SI units. */
const si = (s, base) => {
  const t = String(s).replace("−", "-");
  const sci = /(-?[\d.]+)\s*×10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/.exec(t);
  if (sci) return Number(sci[1]) * 10 ** Number([...sci[2]].map((c) => SUP[c]).join(""));
  const m = new RegExp(`(-?[\\d.]+(?:e-?\\d+)?)\\s*([GMkmµn]?)${base ?? ""}`).exec(t);
  return m ? Number(m[1]) * (PREFIX[m[2]] ?? 1) : NaN;
};
const nums = (s) => String(s).replace(/−/g, "-").match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)?.map(Number) ?? [];
const near = (a, b, rel, abs = 0) => Number.isFinite(a) && Math.abs(a - b) <= Math.max(rel * Math.abs(b), abs);
const fresh = async (width, scheme = "dark", target = "", opts = {}) => {
  await setViewport(cdp, width, width < 500 ? 812 : width < 1000 ? 1024 : 900, { scheme, ...opts });
  await cdp.send("Page.navigate", { url: url + target });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await sleep(600);
};
const waitSel = (selector, ms = 20000) => waitFor(() => ev(`!!document.querySelector(${q(selector)})`), selector, ms);
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const tabs = () => ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].map((b) => b.textContent.trim()).join('|')`);
const timeSlider = ".ph-timeline input[type=range]";
const bodyText = () => ev(`document.querySelector('main').innerText`);
const saveAs = async (name) => {
  await click("Save Analysis");
  await sleep(300);
  await ev(`(() => { const el = document.querySelector('.synthesis-save-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(name)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`document.body.innerText.includes(${q(`Saved “${name}”`)})`), "save notice", 15000);
};
const openRecord = async (name) => {
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 1`), "saved list", 15000);
  await ev(`(() => { const row = [...document.querySelectorAll('.saved-list li, .saved-item, article, li')].find((x) => x.textContent.includes(${q(name)}) && x.querySelector('button')); const b = row && [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open'); b?.click(); })()`);
  await sleep(1200);
  if (await ev(`!!document.querySelector('[role=alertdialog]')`)) await click("Replace without saving");
  await sleep(800);
};

const g = 9.81;
try {
  // ---------------- navigation ----------------
  await fresh(1440, "dark", "#/physics/overview");
  check("Physics tabs: Overview, four mechanics tools, two electricity tools, Saved", (await tabs()) === "Overview|Mechanics & motion|Forces & Newton's laws|Work & energy|Momentum & collisions|DC circuits|RC transient|Saved", await tabs());
  check("the tab bar is grouped (Mechanics, Electricity, Library labels)", await ev(`[...document.querySelectorAll('.tool-group-label')].map((x) => x.textContent.trim()).join('|')`) === "Analyze|Mechanics|Electricity|Library", await ev(`[...document.querySelectorAll('.tool-group-label')].map((x) => x.textContent.trim()).join('|')`));
  const ov = await ev(`({ headings: [...document.querySelectorAll('.ph-group-heading')].map((h) => h.textContent), buttons: [...document.querySelectorAll('.gc-tool-card button')].map((b) => b.textContent.trim()), planned: [...document.querySelectorAll('.gc-planned li > span:first-child')].map((l) => l.textContent), plannedButtons: document.querySelectorAll('.gc-planned button').length })`);
  check("overview: six working labs grouped under Mechanics and Electricity, four non-interactive planned areas", ov.buttons.length === 6 && ov.headings.join() === "Mechanics,Electricity" && ov.plannedButtons === 0 && ov.planned.length === 4 && !ov.planned.some((p) => /Forces|Energy and momentum/.test(p)), `${ov.buttons.join(" | ")} / ${ov.planned.join(" | ")}`);
  await screenshot(cdp, path.join(outDir, "overview-1440-dark.png"), { fullPage: false });
  for (const [label, slug, sel] of [["Forces & Newton's laws", "forces", ".ph-force"], ["Work & energy", "energy", ".ph-bars"], ["Momentum & collisions", "collisions", "[data-body=A]"]]) {
    await click(`Open ${label}`);
    await waitSel(sel);
    check(`Open button reaches ${label}; hash is #/physics/${slug}`, (await hash()) === `#/physics/${slug}`, await hash());
    await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Overview').click()`);
    await sleep(600);
  }

  // ---------------- forces: horizontal system and static friction ----------------
  await fresh(1440, "dark", "#/physics/forces");
  await waitSel(".ph-force");
  const N = 5 * g;
  check("forces default: 5 kg on a flat floor, N = mg = 49.05 N", near(si(await figure("Normal force"), "N"), N, 0.002), await figure("Normal force"));
  check("static equilibrium: a 20 N push is below μₛN = 24.5 N, so static friction is 20 N (not μₛN), acceleration 0, state at rest", (await figure("Static friction")) !== null && near(si(await figure("Static friction"), "N"), -20, 0.002) && si(await figure("Acceleration"), "m") === 0 && /at rest/.test(await ev(`document.querySelector('.ui-callout').textContent`)), `${await figure("Static friction")} / ${await figure("Acceleration")}`);
  check("diagram: weight, normal, applied force and friction arrows are drawn, net force is zero", await ev(`['weight','normal','applied','friction'].every((id) => !!document.querySelector('[data-force=' + id + ']')) && /F_net = 0/.test(document.querySelector('.ph-svg').textContent)`));
  const label20 = await ev(`document.querySelector('[data-force=applied] text').textContent`);
  await setField("Force magnitude", 24);
  await sleep(300);
  check("a 24 N push is still static (limit 24.525 N); friction follows the push (24 N)", near(si(await figure("Static friction"), "N"), -24, 0.003), await figure("Static friction"));
  await setField("Force magnitude", 30);
  await sleep(300);
  const a30 = (30 - 0.3 * N) / 5;
  check("changing the force to 30 N updates the diagram label (F = 30 N)", /30 N/.test(await ev(`document.querySelector('[data-force=applied] text').textContent`)) && label20 !== (await ev(`document.querySelector('[data-force=applied] text').textContent`)), label20);
  check("30 N exceeds the static limit: sliding with kinetic friction μₖN = 14.7 N and a = (30 − 14.7)/5 = 3.06 m/s²", (await figure("Kinetic friction")) !== null && near(si(await figure("Kinetic friction"), "N"), -0.3 * N, 0.003) && near(si(await figure("Acceleration"), "m"), a30, 0.004), `${await figure("Kinetic friction")} / ${await figure("Acceleration")}`);
  check("the net-force arrow and the table agree (net = 15.3 N)", near(si(await figure("Net force"), "N"), 30 - 0.3 * N, 0.004) && (await ev(`/F_net = 15\\.3 N/.test(document.querySelector('.ph-svg').textContent)`)), await figure("Net force"));
  await setRangeEl(timeSlider, 333);
  await sleep(250);
  const tShown = si(await figure("Time"), "s");
  const vp = nums(await figure("Velocity / position"));
  check("sliding-body simulation: at t ≈ 2 s the position and velocity follow x = ½at², v = at", near(tShown, 2, 0.01) && near(vp[0], a30 * tShown, 0.006) && near(si(await ev(`document.querySelectorAll('.ui-figure')[5].querySelector('small').textContent`), "m"), 0.5 * a30 * tShown * tShown, 0.01), `${tShown} ${await figure("Velocity / position")}`);
  const cur = await ev(`[...document.querySelectorAll('.gc-current[role=slider]')].map((g) => Number(g.getAttribute('aria-valuenow')))`);
  check("the three graph markers sit at the same time as the readout", cur.length === 3 && cur.every((c) => near(c, cur[0], 1e-9, 1e-9)) && near(cur[0], tShown, 0.01), cur.join(", "));
  await click("Reset", "document.querySelector('.ph-controls')");
  await sleep(300);
  await choose("Normal 6 s");
  await click("▶ Play");
  await sleep(1500);
  const tp = si(await figure("Time"), "s");
  check("Play advances the clock (Normal speed is 6 s for the whole 6 s window → about 1.5 s after 1.5 s)", tp > 0.9 && tp < 2.2, String(tp));
  await click("❚❚ Pause");
  await sleep(150);
  const p1 = await figure("Velocity / position");
  await sleep(400);
  check("Pause freezes the simulation", (await figure("Velocity / position")) === p1);
  await click("Reset", "document.querySelector('.ph-controls')");
  await sleep(200);
  await screenshot(cdp, path.join(outDir, "forces-1440-dark.png"));

  // force table and inspector
  await ev(`[...document.querySelectorAll('.ph-table .ph-row-button')].find((b) => b.textContent === 'Weight').click()`);
  await sleep(250);
  check("selecting a force shows its components (weight: along 0, perpendicular −49.05 N)", await ev(`/Inspector: Weight/.test(document.querySelector('[data-testid=force-inspector]')?.textContent ?? '') && /-49\\.1 N|-49\\.05 N/.test(document.querySelector('[data-testid=force-inspector]').textContent)`), await ev(`document.querySelector('[data-testid=force-inspector]')?.textContent.slice(0, 160) ?? ''`));
  await ev(`document.querySelector('[data-force=friction]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await sleep(250);
  check("clicking an arrow in the diagram selects the same force", await ev(`document.querySelector('[data-force=friction]').classList.contains('is-selected') && /Inspector: Kinetic friction/.test(document.body.innerText)`), await ev(`(document.querySelector('[data-force=friction]')?.getAttribute('class') ?? 'no arrow') + ' | ' + (document.querySelector('[data-testid=force-inspector] h4')?.textContent ?? 'no inspector')`));

  // ---------------- forces: inclined plane with friction ----------------
  await click("Block on a rough incline");
  await sleep(350);
  const W = 10 * g;
  check("incline 30°, 10 kg: N = mg cos30 = 84.96 N, not the weight 98.1 N", near(si(await figure("Normal force"), "N"), W * Math.cos(Math.PI / 6), 0.003) && !near(si(await figure("Normal force"), "N"), W, 0.05), await figure("Normal force"));
  check("μₛ = 0.7: the 49.05 N pull down the slope is below μₛN = 59.5 N, so it rests with static friction 49.05 N up the slope", near(si(await figure("Static friction"), "N"), W * 0.5, 0.003) && /at rest/.test(await ev(`document.querySelector('.ui-callout').textContent`)), await figure("Static friction"));
  await click("Sliding down a slope");
  await sleep(350);
  const aInc = (-W * 0.5 + 0.4 * W * Math.cos(Math.PI / 6)) / 10;
  check("μₛ = 0.5: tanθ > μₛ so it slides; a = (−49.05 + 0.4·84.96)/10 = −1.51 m/s² (down the slope), kinetic friction up the slope", near(si(await figure("Acceleration"), "m"), aInc, 0.005) && near(si(await figure("Kinetic friction"), "N"), 0.4 * W * Math.cos(Math.PI / 6), 0.004), `${await figure("Acceleration")} / ${await figure("Kinetic friction")}`);
  check("the weight splits on the diagram table into −49.05 N along and −84.96 N perpendicular", await ev(`(() => { const row = [...document.querySelectorAll('.ph-table tbody tr')].find((r) => r.querySelector('th').textContent.trim() === 'Weight'); const c = [...row.children].map((x) => x.textContent); return /-49(\.\d+)? N/.test(c[2]) && /-8[45](\.\d+)? N/.test(c[3]); })()`), await ev(`[...document.querySelectorAll('.ph-table tbody tr')].find((r) => r.querySelector('th').textContent.trim() === 'Weight')?.textContent ?? ''`));
  await screenshot(cdp, path.join(outDir, "forces-incline-1440-dark.png"));
  await click("Up the slope, then back");
  await sleep(350);
  await setRangeEl(timeSlider, 500);
  await sleep(250);
  const wasKinetic = await figure("Kinetic friction");
  check("up the slope then back: at 3 s the body is sliding down with kinetic friction pointing up the slope (force reversal)", /sliding|accelerating/.test(await ev(`document.querySelector('.ui-callout').textContent`)) && si(wasKinetic, "N") > 0 && si(await figure("Velocity / position"), "m") < 0, `${wasKinetic} / ${await figure("Velocity / position")}`);
  await click("Constant velocity");
  await sleep(350);
  check("net force zero while moving: constant velocity, acceleration 0 and v = 4 m/s", /constant velocity/.test(await ev(`document.querySelector('.ui-callout').textContent`)) && si(await figure("Acceleration"), "m") === 0 && near(nums(await figure("Velocity / position"))[0], 4, 0.002));
  // contact lost
  await click("Push on a rough floor");
  await setField("Mass of the body", 1);
  await setField("Force magnitude", 30);
  await setField("Force direction", 90);
  await sleep(350);
  check("contact lost (30 N straight up on 1 kg): no normal force, no friction row, explanation shown", await ev(`/no longer touching/.test(document.querySelector('.ui-callout').textContent) && !document.querySelector('[data-force=normal]') && !document.querySelector('[data-force=friction]') && /contact lost/.test(document.body.innerText)`));
  await click("Push on a rough floor");
  await sleep(250);
  // pulley
  await choose("Block + hanging mass");
  await sleep(300);
  await click("Block with a hanging mass");
  await sleep(350);
  const aP = (3 * g - 0.3 * 4 * g) / 7;
  check("pulley (4 kg block, 3 kg hanging, μₖ = 0.3): a = (m₂g − μₖmg)/(m + m₂) = 2.52 m/s² and T = m₂(g − a) = 21.9 N", near(si(await figure("Acceleration"), "m"), aP, 0.004) && (await ev(`new RegExp(String(${(3 * (g - aP)).toFixed(1)}).replace('.', '\\\\.')).test(document.body.innerText)`)), `${await figure("Acceleration")} T=${(3 * (g - aP)).toFixed(2)}`);
  await screenshot(cdp, path.join(outDir, "forces-pulley-1440-dark.png"));
  await choose("Body on a surface");
  await sleep(300);
  await click("Push on a rough floor");
  await sleep(300);

  // forces practice
  await choose("Practice");
  await sleep(350);
  check("Practice hides the arrows and asks which forces act", await ev(`!document.querySelector('[data-force]') && /Which forces act on the body/.test(document.body.innerText)`));
  await ev(`[...document.querySelectorAll('.gc-predict .gc-check')].filter((l) => /^(Weight|Normal force|Static friction|Applied force)/.test(l.textContent.trim())).forEach((l) => l.querySelector('input').click())`);
  await ev(`[...document.querySelectorAll('.gc-predict .gc-check')].find((l) => /Force of motion|“Force of motion”/.test(l.textContent))?.querySelector('input').click()`);
  await setField("Predict the acceleration", 0);
  await click("Check my answer");
  await sleep(400);
  check("the free-body check names the wrong ‘force of motion’ and the diagram appears with the answer", await ev(`/force of motion/i.test(document.querySelector('.gc-reveal')?.textContent ?? '') && !!document.querySelector('[data-force=weight]')`), await ev(`document.querySelector('.gc-reveal')?.textContent.slice(0, 160) ?? ''`));
  await ev(`[...document.querySelectorAll('.gc-predict .gc-check')].find((l) => /Force of motion|“Force of motion”/.test(l.textContent))?.querySelector('input').click()`);
  await click("Check my answer");
  await sleep(300);
  check("with the correct four forces the diagram is called complete and a 0 m/s² prediction is accepted", await ev(`/complete/.test(document.querySelector('.gc-reveal')?.textContent ?? '') && /within 2 %/.test(document.querySelector('.gc-reveal')?.textContent ?? '')`), await ev(`document.querySelector('.gc-reveal')?.textContent.slice(0, 200) ?? ''`));
  await ev(`[...document.querySelectorAll('.gc-predict')].pop().scrollIntoView()`);
  await ev(`[...document.querySelectorAll('.gc-predict .gc-scenario-pick button')][0]?.click()`);
  await ev(`[...document.querySelectorAll('.gc-predict .ui-seg-option')].find((o) => /Lower|Higher|same/.test(o.textContent))?.querySelector('input').click()`);
  await sleep(300);
  check("forces Practice: predict-then-observe reveals a model-based explanation", await ev(`document.querySelectorAll('.gc-reveal').length >= 1`));
  await choose("Explore");
  await sleep(300);
  check("forces Explore: lessons cover vectors, normal ≠ weight, static vs kinetic friction, zero net force, inclines", await ev(`['Why are forces vectors', 'normal force not always equal', 'static and kinetic friction', 'zero net force mean zero velocity', 'inclined plane'].every((s) => document.body.innerText.includes(s))`));

  // save / restore forces
  await click("Sliding down a slope");
  await setField("Mass of the body", 12);
  await setRangeEl(timeSlider, 400);
  await sleep(300);
  const fSaved = [await figure("Acceleration"), await figure("Time"), await figure("Velocity / position")];
  await saveAs("S14 forces");
  await setField("Mass of the body", 3);
  await sleep(300);
  await openRecord("S14 forces");
  await waitSel(".ph-force");
  check("forces: saved analysis reopens with mass 12 kg, 30° incline, the same acceleration, time and motion", (await getField("Mass of the body")) === "12" && (await getField("Incline angle")) === "30" && (await figure("Acceleration")) === fSaved[0] && (await figure("Time")) === fSaved[1] && (await figure("Velocity / position")) === fSaved[2], `${await getField("Mass of the body")} ${await figure("Acceleration")} vs ${fSaved[0]}`);
  check("a notice says results were recalculated from the saved values", await ev(`/recalculated from the saved values/.test(document.body.innerText)`));

  // ---------------- work and energy ----------------
  await fresh(1440, "dark", "#/physics/energy");
  await waitSel(".ph-bars");
  await click("Frictionless slide");
  await sleep(350);
  const eStart = 2 * g * 2.5;
  check("frictionless incline (2 kg, 5 m at 30°): starting PE = mgh = 49.05 J at the top", near(si(await figure("Potential energy"), "J"), eStart, 0.003) && near(si(await figure("Kinetic energy"), "J"), 0, 1, 1e-9), await figure("Potential energy"));
  await setRangeEl(timeSlider, 1000);
  await sleep(300);
  check("… at the bottom KE = 49.05 J, PE = 0, heat 0, speed √(2gh) = 7.00 m/s", near(si(await figure("Kinetic energy"), "J"), eStart, 0.003) && near(si(await figure("Potential energy"), "J"), 0, 1, 0.01) && near(si(await figure("Heat"), "J"), 0, 1, 1e-6) && near(si(await ev(`document.querySelectorAll('.ui-figure')[2].querySelector('small').textContent`), "m"), Math.sqrt(2 * g * 2.5), 0.003), `${await figure("Kinetic energy")}`);
  const barVals = await ev(`['KE', 'PEg', 'PEs', 'Q'].map((id) => document.querySelector('[data-bar=' + id + '] .ph-val').textContent)`);
  const barSum = barVals.map((v) => si(v, "J")).reduce((a, b) => a + b, 0);
  const totalBar = nums(await ev(`document.querySelector('[data-bar=total] .ph-comp-label').textContent`))[0];
  check("the energy bars add up to the ledger total drawn below them and to the starting energy", near(barSum, totalBar, 0.01) && near(totalBar, eStart, 0.01), `${barVals.join(" | ")} total ${totalBar}`);
  await screenshot(cdp, path.join(outDir, "energy-incline-1440-dark.png"));
  // dissipative
  await click("Rough slide");
  await sleep(350);
  await setRangeEl(timeSlider, 1000);
  await sleep(300);
  const Q = 0.2 * 2 * g * Math.cos(Math.PI / 6) * 5;
  check("rough incline (μₖ = 0.2): heat = μₖ m g cos30 · L = 17.0 J, KE = 49.05 − 17.0 = 32.1 J; mechanical energy fell but KE + PE + heat is still 49.05 J", near(si(await figure("Heat"), "J"), Q, 0.004) && near(si(await figure("Kinetic energy"), "J"), eStart - Q, 0.004) && near(si(await figure("Total with heat"), "J"), eStart, 0.003) && near(si(await figure("Mechanical energy"), "J"), eStart - Q, 0.004), `${await figure("Heat")} ${await figure("Kinetic energy")} ${await figure("Total with heat")}`);
  const wtab = await ev(`[...document.querySelectorAll('.ph-table tbody tr')].map((r) => r.textContent).join(' / ')`);
  check("work–energy theorem: the table's total work equals the change in kinetic energy", await ev(`(() => { const t = document.querySelector('[data-testid=work-check]').textContent; const n = t.replace(/−/g, '-').match(/-?[\\d.]+(?:e-?\\d+)?/g).map(Number); return Math.abs(n[0] - n[1]) < 1e-6 * Math.max(1, Math.abs(n[1])); })()`), await ev(`document.querySelector('[data-testid=work-check]').textContent`));
  check("the ledger is the same at three different times (KE + PE + heat constant)", await (async () => { const vals = []; for (const s of [100, 450, 900]) { await setRangeEl(timeSlider, s); await sleep(200); vals.push(si(await figure("Total with heat"), "J")); } return vals.every((v) => near(v, eStart, 0.003)); })());
  // spring
  await choose("Spring launch");
  await sleep(350);
  await click("Frictionless launch");
  await sleep(350);
  check("spring: ½kx² = ½·200·0.5² = 25 J stored at release", near(si(await figure("Potential energy"), "J"), 25, 0.003), await figure("Potential energy"));
  await setRangeEl(timeSlider, 40);
  await sleep(300);
  check("after leaving the spring the 25 J is kinetic: v = x₀√(k/m) = 5 m/s, PE 0", near(si(await figure("Kinetic energy"), "J"), 25, 0.003) && near(Math.abs(nums(await figure("Velocity"))[0]), 5, 0.003), `${await figure("Kinetic energy")} ${await figure("Velocity")}`);
  await click("Rough floor");
  await sleep(350);
  await setRangeEl(timeSlider, 1000);
  await sleep(300);
  check("spring on a rough floor: the block stops after sliding v²/2μg = 23/(2·0.2·9.81·…)", near(si(await figure("Kinetic energy"), "J"), 0, 1, 1e-6) && near(si(await figure("Heat"), "J"), 25, 0.01), `${await figure("Heat")}`);
  await click("Spring too weak");
  await sleep(350);
  check("a spring that cannot overcome friction: the block stops still compressed (explained), heat equals the energy lost", await ev(`/still compressed/.test(document.querySelector('.ui-callout').textContent)`));
  await screenshot(cdp, path.join(outDir, "energy-spring-1440-dark.png"));
  // height
  await choose("Height under gravity");
  await sleep(350);
  await click("Thrown up at 10 m/s");
  await sleep(350);
  await setRangeEl(timeSlider, 500);
  await sleep(300);
  check("thrown up at 10 m/s (1 kg): at the top (t = 1.02 s) KE ≈ 0 and PE = mgh = 50.9 J", near(si(await figure("Kinetic energy"), "J"), 0, 1, 0.05) && near(si(await figure("Potential energy"), "J"), 50, 0.03), `${await figure("Kinetic energy")} ${await figure("Potential energy")}`);
  // reachability
  await choose("Block on an incline");
  await sleep(350);
  await click("Launched up a rough slope");
  await sleep(350);
  await setField("Position to ask about", 9);
  await sleep(300);
  const stopD = 100 / (2 * g * (0.5 + 0.2 * Math.cos(Math.PI / 6)));
  check("“Can it get there?”: 9 m up a slope it only climbs 7.57 m, so the tool refuses with the energy reason (no negative KE)", await ev(`/never reaches 9/.test(document.body.innerText) && /negative/.test(document.querySelector('[data-testid=reach-result]').textContent)`) && (await ev(`document.querySelector('[data-testid=reach-result]').textContent.includes(${q(stopD.toFixed(2))}) || document.querySelector('[data-testid=reach-result]').textContent.includes(${q(stopD.toFixed(1))})`)), await ev(`document.querySelector('[data-testid=reach-result]')?.textContent.slice(0, 120) ?? ''`));
  await setField("Position to ask about", 5);
  await sleep(300);
  const aDec = g * (0.5 + 0.2 * Math.cos(Math.PI / 6));
  const v5 = Math.sqrt(100 - 2 * aDec * 5);
  check("… and 5 m up it reaches with speed √(v₀² − 2·a·d) = 5.83 m/s", near(nums(await ev(`document.querySelector('[data-testid=reach-result]').textContent`))[0], v5, 0.004), await ev(`document.querySelector('[data-testid=reach-result]').textContent.slice(0, 80)`));
  await setField("Incline angle", 0);
  await sleep(250);
  check("an invalid incline angle (0°) is refused with a reason", await ev(`!!document.querySelector('.gc-field-error')`));
  await setField("Incline angle", 30);
  // energy practice / explore
  await choose("Practice");
  await sleep(350);
  check("energy Practice: predict-then-observe questions appear", await ev(`!!document.querySelector('.gc-predict')`));
  await ev(`[...document.querySelectorAll('.gc-predict .ui-seg-option')].find((o) => /Lower/.test(o.textContent))?.querySelector('input').click()`);
  await sleep(300);
  check("… and the answer is shown only after a prediction", await ev(`!!document.querySelector('.gc-reveal')`));
  await choose("Explore");
  await sleep(300);
  check("energy Explore: lessons on work, conservative forces, heat, power", await ev(`['What is work', 'conservative and nonconservative', 'mechanical energy decrease', 'force, energy and power'].every((s) => document.body.innerText.includes(s))`));
  await click("Frictionless slide");
  await setField("Initial velocity", 0);
  await setField("Start distance from the bottom", 2);
  await setRangeEl(timeSlider, 400);
  await sleep(300);
  const eSaved = [await figure("Kinetic energy"), await figure("Time")];
  await saveAs("S14 energy");
  await setField("Mass", 9);
  await sleep(300);
  await openRecord("S14 energy");
  await waitSel(".ph-bars");
  check("energy: saved analysis reopens with the same start distance, time and kinetic energy", (await getField("Start distance from the bottom")) === "2" && (await figure("Kinetic energy")) === eSaved[0] && (await figure("Time")) === eSaved[1], `${await getField("Start distance from the bottom")} ${await figure("Kinetic energy")} vs ${eSaved[0]}`);

  // ---------------- collisions ----------------
  await fresh(1440, "dark", "#/physics/collisions");
  await waitSel("[data-body=A]");
  const rows = () => ev(`[...document.querySelectorAll('[data-testid=before-after] tbody tr')].map((r) => [...r.children].map((c) => c.textContent))`);
  let tb = await rows();
  check("elastic collision, 2 kg at +4 and 3 kg at −1: v_A′ = −2 m/s and v_B′ = +3 m/s", nums(tb[0][3])[0] === -2 && nums(tb[1][3])[0] === 3, JSON.stringify(tb.slice(0, 2)));
  check("momentum is conserved (5 kg·m/s before and after) and kinetic energy is unchanged (17.5 J)", tb[2][4] === "5" && tb[2][5] === "5" && /17\.5 J/.test(tb[2][6]) && /17\.5 J/.test(tb[2][7]) && /0 J/.test(await ev(`document.querySelector('[data-testid=ke-loss]').textContent`)), JSON.stringify(tb[2]));
  check("impulse J = Δp_B = 12 N·s and no average force is invented without a duration", /12 N·s/.test(await ev(`document.querySelector('[data-testid=impulse]').textContent`)) && !(await ev(`!!document.querySelector('[data-testid=avg-force]')`)) && /No average force/.test(await bodyText()));
  await screenshot(cdp, path.join(outDir, "collisions-1440-dark.png"));
  // playback and scrubbing
  const aria0 = await ev(`document.querySelector('.ph-svg').getAttribute('aria-label')`);
  check("at t = 0 the bodies are before the collision", /before the collision/.test(aria0), aria0);
  await setRangeEl(timeSlider, 300);
  await sleep(250);
  const tc = 6 / 5;
  const tEnd = tc + 4;
  const tNow = si(await figure("Time"), "s");
  check("scrubbing past the contact time (1.2 s) shows the velocities after the collision and 'after the collision'", near(tNow, 0.3 * tEnd, 0.01) && /after the collision/.test(await ev(`document.querySelector('.ph-svg').getAttribute('aria-label')`)) && near(nums(await figure("Velocity of A"))[0], -2, 0.001) && near(nums(await figure("Velocity of B"))[0], 3, 0.001), `${await figure("Velocity of A")} ${await figure("Velocity of B")}`);
  await setRangeEl(timeSlider, 100);
  await sleep(250);
  check("scrubbing back before the contact restores the incoming velocities (+4, −1) and the same total momentum", near(nums(await figure("Velocity of A"))[0], 4, 0.001) && near(nums(await figure("Velocity of B"))[0], -1, 0.001) && near(nums(await figure("Total momentum"))[0], 5, 0.001));
  const curC = await ev(`[...document.querySelectorAll('.gc-current[role=slider]')].map((g) => Number(g.getAttribute('aria-valuenow')))`);
  check("all four graphs share the selected time", curC.length === 4 && curC.every((c) => near(c, curC[0], 1e-9, 1e-9)), curC.join(", "));
  await click("Reset", "document.querySelector('.ph-controls')");
  await sleep(250);
  await choose("Normal 6 s");
  await click("▶ Play");
  await sleep(1200);
  const tc1 = si(await figure("Time"), "s");
  await click("❚❚ Pause");
  await sleep(150);
  const f1 = await figure("Time");
  await sleep(400);
  check("playback advances and pausing freezes the collision state", tc1 > 0.3 && (await figure("Time")) === f1, `${tc1} ${f1}`);
  await click("Reset", "document.querySelector('.ph-controls')");
  // types
  await click("Perfectly inelastic (stick)");
  await sleep(350);
  tb = await rows();
  check("perfectly inelastic: both bodies leave at p/M = 1 m/s; kinetic energy 17.5 J → 2.5 J, 15 J lost", nums(tb[0][3])[0] === 1 && nums(tb[1][3])[0] === 1 && /2\.5 J/.test(tb[2][7]) && /15 J/.test(await ev(`document.querySelector('[data-testid=ke-loss]').textContent`)), JSON.stringify(tb));
  await setRangeEl(timeSlider, 1000);
  await sleep(250);
  check("… and after the collision they stay together (same velocity)", near(nums(await figure("Velocity of A"))[0], nums(await figure("Velocity of B"))[0], 1e-9));
  await click("Partly elastic, e = 0.5");
  await sleep(350);
  tb = await rows();
  check("e = 0.5: v_A′ = −0.5 and v_B′ = 2 m/s; separation speed 2.5 = e × approach speed 5; KE 6.25 J (36 % of 17.5 J kept, not 50 %)", nums(tb[0][3])[0] === -0.5 && nums(tb[1][3])[0] === 2 && /6\.25 J/.test(tb[2][7]));
  const cmp = await ev(`[...document.querySelectorAll('.ph-table')].pop().textContent`);
  check("the comparison table ranks e = 0 > e = 0.5 > e = 1 for kinetic energy lost (15 J, 11.3 J, 0 J)", /15 J/.test(cmp) && /11.[23] J/.test(cmp) && /0 J/.test(cmp), cmp.slice(0, 160));
  await click("Heavy hits light at rest");
  await sleep(350);
  tb = await rows();
  check("heavy (10 kg at 3 m/s) hits light (1 kg at rest), elastic: B leaves at 2·10·3/11 = 5.45 m/s, A barely slows to 2.45 m/s", near(nums(tb[1][3])[0], 60 / 11, 0.005) && near(nums(tb[0][3])[0], 27 / 11, 0.005), JSON.stringify(tb.slice(0, 2)));
  await click("Light hits heavy at rest");
  await sleep(350);
  tb = await rows();
  check("light (1 kg) hits heavy (10 kg) at rest, elastic: A rebounds at −2.45 m/s and B creeps at 0.545 m/s", near(nums(tb[0][3])[0], -27 / 11, 0.005) && near(nums(tb[1][3])[0], 6 / 11, 0.01), JSON.stringify(tb.slice(0, 2)));
  await click("Equal masses swap velocities");
  await sleep(350);
  tb = await rows();
  check("equal masses at e = 1 exchange velocities (+3, −1 → −1, +3)", nums(tb[0][3])[0] === -1 && nums(tb[1][3])[0] === 3);
  await click("No collision (separating)");
  await sleep(350);
  check("separating bodies: no collision is created, velocities unchanged, no impulse or loss", await ev(`/No collision/.test(document.querySelector('.ui-callout').textContent) && /No collision, so no impulse/.test(document.body.innerText)`) && nums((await rows())[0][3])[0] === 1);
  await setField("Position of B", -3.5);
  await sleep(250);
  check("overlapping bodies are refused with a reason", await ev(`!!document.querySelector('.gc-field-error') && /overlap|cannot overlap/.test(document.body.innerText)`));
  await setField("Position of B", 3);
  await click("Elastic, unequal masses");
  await sleep(250);
  await ev(`[...document.querySelectorAll('.gc-check')].find((l) => /how long the collision lasts/.test(l.textContent)).querySelector('input').click()`);
  await sleep(300);
  check("an average force appears only after a duration is given: J/Δt = 12/0.05 = 240 N", await ev(`/240 N/.test(document.querySelector('[data-testid=avg-force]')?.textContent ?? '')`), await ev(`document.querySelector('[data-testid=avg-force]')?.textContent ?? ''`));
  await ev(`[...document.querySelectorAll('.gc-check')].find((l) => /how long the collision lasts/.test(l.textContent)).querySelector('input').click()`);
  // collisions practice
  await choose("Practice");
  await sleep(350);
  check("collisions Practice: predict-then-observe", await ev(`!!document.querySelector('.gc-predict')`));
  await ev(`[...document.querySelectorAll('.gc-scenario-pick button')].find((b) => /perfectly inelastic/.test(b.textContent))?.click()`);
  await ev(`[...document.querySelectorAll('.gc-predict .ui-seg-option')].find((o) => /Lower/.test(o.textContent))?.querySelector('input').click()`);
  await sleep(300);
  check("making it perfectly inelastic lowers the kinetic energy afterwards (confirmed)", await ev(`/Your prediction matches/.test(document.querySelector('.gc-reveal')?.textContent ?? '')`), await ev(`document.querySelector('.gc-reveal')?.textContent.slice(0, 120) ?? ''`));
  await choose("Explore");
  await sleep(300);
  check("collisions Explore: lessons on momentum, kinetic energy, restitution, perfectly inelastic, mass ratio, impulse", await ev(`['total momentum conserved', 'kinetic energy not be conserved', 'coefficient of restitution', 'share a final velocity', 'mass ratio', 'impulse and change in momentum'].every((s) => document.body.innerText.includes(s))`));
  await click("Partly elastic, e = 0.5");
  await setField("Mass of A", 5);
  await setRangeEl(timeSlider, 600);
  await sleep(300);
  const cSaved = [await figure("Velocity of A"), await figure("Time")];
  await saveAs("S14 collisions");
  await setField("Mass of A", 1);
  await sleep(300);
  await openRecord("S14 collisions");
  await waitSel("[data-body=A]");
  check("collisions: saved analysis reopens with mass 5 kg, e = 0.5, same velocities and time", (await getField("Mass of A")) === "5" && (await getField("Coefficient of restitution e", 0)) === "0.5" && (await figure("Velocity of A")) === cSaved[0] && (await figure("Time")) === cSaved[1], `${await getField("Mass of A")} ${await figure("Velocity of A")} vs ${cSaved[0]}`);

  // Saved list labels and cross-subject open
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 3`), "saved list", 15000);
  const badges = await ev(`[...document.querySelectorAll('.saved-badge')].map((b) => b.textContent.trim())`);
  check("Saved list labels the new records with Physics and the tool name", ["Forces & Newton's laws", "Work & energy", "Momentum & collisions"].every((t) => badges.some((b) => b.includes(`Physics · ${t}`))), badges.join(" | "));
  await ev(`document.querySelector('.subject-trigger').click()`);
  await sleep(250);
  await ev(`[...document.querySelectorAll('.subject-popover .subject-item')].find((b) => b.querySelector('.subject-item-name').textContent.trim() === 'Organic Chemistry')?.click()`);
  await sleep(700);
  check("Organic Chemistry navigation is unchanged (Properties selected; eight tabs, no Mechanics/Electricity labels)", (await ev(`document.querySelector('.tool-tabs [aria-selected=true]')?.textContent.trim()`)) === "Properties" && (await ev(`document.querySelectorAll('.tool-tabs [role=tab]').length`)) === 8 && !(await ev(`/Mechanics|Electricity/.test(document.querySelector('.tool-tabs').textContent)`)));
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved')?.click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 3`), "saved list (organic)", 15000);
  await ev(`(() => { const row = [...document.querySelectorAll('li, article')].find((x) => x.textContent.includes('S14 energy') && x.querySelector('button')); [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open')?.click(); })()`);
  await waitFor(() => ev(`location.hash === '#/physics/energy'`), "cross-subject open", 15000);
  check("opening an energy record from the Organic Saved page switches to Physics › Work & energy", (await hash()) === "#/physics/energy");
  await fresh(1440, "dark", "#/general/overview");
  check("General Chemistry tabs are unchanged", (await tabs()) === "Overview|Acid–base & titration|Chemical equilibrium|Reaction kinetics|Thermodynamics|Saved", await tabs());

  // autosave
  await fresh(1440, "dark", "#/physics/collisions");
  await waitSel("[data-body=A]");
  await setField("Mass of B", 7);
  await sleep(1600);
  await fresh(1440, "dark", "#/physics/collisions");
  await waitSel("[data-body=A]");
  await sleep(800);
  check("autosave: reloading Collisions restores the last masses (B = 7 kg)", (await getField("Mass of B")) === "7");

  // reduced motion
  await fresh(1440, "light", "#/physics/energy", { reducedMotion: true });
  await waitSel(".ph-bars");
  check("reduced motion: Step replaces Play on the new tools", await ev(`!![...document.querySelectorAll('button')].find((b) => /Step/.test(b.textContent)) && ![...document.querySelectorAll('button')].find((b) => /Play/.test(b.textContent))`));

  // ---------------- layouts ----------------
  const layouts = [[1440, "dark"], [1440, "light"], [820, "light"], [820, "dark"], [375, "light"], [375, "dark"]];
  for (const [name, target, ready] of [["forces", "#/physics/forces", ".ph-svg"], ["energy", "#/physics/energy", ".ph-bars"], ["collisions", "#/physics/collisions", "[data-body=A]"]]) {
    for (const [width, scheme] of layouts) {
      await fresh(width, scheme, target);
      await waitSel(ready);
      await setRangeEl(timeSlider, 450);
      await sleep(300);
      const info = await ev(`(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, vw: innerWidth, charts: [...document.querySelectorAll('.gc-chart-svg')].map((c) => Math.round(c.getBoundingClientRect().width)), frames: [...document.querySelectorAll('.ph-diagram')].map((d) => Math.round(d.getBoundingClientRect().width)), svgs: [...document.querySelectorAll('.ph-svg')].map((s) => Math.round(s.getBoundingClientRect().width)), paper: [...document.querySelectorAll('.ph-sky, .ph-paper')].map((r) => getComputedStyle(r).fill) }))()`);
      const fits = info.charts.every((w) => w <= info.vw) && info.frames.every((w) => w <= info.vw);
      const light = info.paper.every((c) => /rgb\((24\d|25\d), (24\d|25\d), (2[34]\d|25\d)\)/.test(c));
      check(`${name} ${width}px ${scheme}: no horizontal page overflow; charts and diagram frames fit; diagrams on light paper`, info.over <= 0 && fits && light, JSON.stringify({ over: info.over, vw: info.vw, charts: info.charts.slice(0, 2), frames: info.frames }));
      if (width === 375 || (width === 820 && scheme === "light") || (width === 1440 && scheme === "light")) await screenshot(cdp, path.join(outDir, `${name}-${width}-${scheme}.png`));
      if (width === 375) { await ev(`document.querySelector('.ui-diagram')?.scrollIntoView({ block: 'start' })`); await sleep(200); await screenshot(cdp, path.join(outDir, `${name}-375-${scheme}-view.png`), { fullPage: false }); }
    }
  }
  // every mode and scenario at 375 px
  for (const [label, target, ready, steps] of [
    ["forces pulley", "#/physics/forces", ".ph-svg", [() => choose("Block + hanging mass")]],
    ["forces practice", "#/physics/forces", ".ph-svg", [() => choose("Body on a surface"), () => choose("Practice")]],
    ["forces incline sliding", "#/physics/forces", ".ph-svg", [() => choose("Body on a surface"), () => click("Sliding down a slope")]],
    ["energy spring", "#/physics/energy", ".ph-bars", [() => choose("Spring launch")]],
    ["energy height", "#/physics/energy", ".ph-bars", [() => choose("Height under gravity")]],
    ["energy flat", "#/physics/energy", ".ph-bars", [() => choose("Rough horizontal surface")]],
    ["energy practice", "#/physics/energy", ".ph-bars", [() => choose("Practice")]],
    ["collisions inelastic", "#/physics/collisions", "[data-body=A]", [() => click("Perfectly inelastic (stick)")]],
    ["collisions no-collision", "#/physics/collisions", "[data-body=A]", [() => click("No collision (separating)")]],
    ["collisions practice", "#/physics/collisions", "[data-body=A]", [() => choose("Practice")]],
  ]) {
    await fresh(375, "dark", target);
    await waitSel(ready);
    for (const step of steps) await step();
    await sleep(450);
    check(`${label} at 375px: no horizontal overflow`, (await overflow()) <= 0, String(await overflow()));
  }
  check("no uncaught page exceptions", cdp.errors.length === 0, cdp.errors.slice(0, 3).join(" | "));
} catch (error) {
  console.log(`FAIL  script error: ${error?.stack ?? error}`);
  results.push(false);
} finally {
  stop();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
