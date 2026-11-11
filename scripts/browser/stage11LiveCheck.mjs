// Stage 11 live-browser check (real headless Chrome, production build): General Chemistry acid-base / titration tool.
//   npm run build && node scripts/browser/stage11LiveCheck.mjs
import path from "node:path";
import os from "node:os";
import { q, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
};
const outDir = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "pc-live11");
const { cdp, url, stop } = await startBrowser({ port: 4297, debugPort: 9457 });
const ev = (expr) => cdp.evaluate(expr);
const click = (label, scope = "document") => ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const choose = (label) => ev(`(() => { const o = [...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; o.querySelector('input').click(); return true; })()`);
const setField = (label, value) => ev(`(() => { const l = [...document.querySelectorAll('.gc-field label')].find((x) => x.textContent.trim().startsWith(${q(label)})); if (!l) return false; const el = document.getElementById(l.htmlFor); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const getField = (label) => ev(`(() => { const l = [...document.querySelectorAll('.gc-field label')].find((x) => x.textContent.trim().startsWith(${q(label)})); return l ? document.getElementById(l.htmlFor).value : null; })()`);
const phNow = async () => Number(await ev(`document.querySelector('[data-testid=ph-now]')?.textContent ?? 'NaN'`));
const linePath = () => ev(`document.querySelector('.gc-line')?.getAttribute('d') ?? ''`);
const hash = () => ev(`location.hash`);
const fresh = async (width, scheme = "dark", target = "") => {
  await setViewport(cdp, width, width < 500 ? 812 : 900, { scheme });
  await cdp.send("Page.navigate", { url: url + target });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await sleep(500);
};
const pickSubject = async (name) => {
  const desktop = await ev(`!!document.querySelector('.subject-trigger')?.getClientRects().length`);
  if (desktop) {
    await ev(`document.querySelector('.subject-trigger').click()`);
    await sleep(250);
    await ev(`[...document.querySelectorAll('.subject-popover .subject-item')].find((b) => b.querySelector('.subject-item-name').textContent.trim() === ${q(name)})?.click()`);
  } else {
    await ev(`document.querySelector('.shell-menu').click()`);
    await sleep(350);
    await ev(`[...document.querySelectorAll('.sheet .subject-item')].find((b) => b.querySelector('.subject-item-name').textContent.trim() === ${q(name)})?.click()`);
  }
  await sleep(600);
};
const openGeneralTool = async (label) => {
  const direct = await ev(`(() => { const b = [...document.querySelectorAll('.tool-tabs [role=tab]')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (b) { b.click(); return true; } return false; })()`);
  if (!direct) {
    await ev(`document.querySelector('.shell-menu')?.click()`);
    await sleep(350);
    await ev(`[...document.querySelectorAll('.sheet-tool')].find((x) => x.querySelector('.sheet-tool-name')?.textContent.trim() === ${q(label)})?.click()`);
  }
  await sleep(700);
};
const analyzerReady = () => waitFor(() => ev(`!!document.querySelector('[data-testid=ph-now]')`), "analyzer", 20000);

try {
  // ---------------- navigation and honesty of the landing page ----------------
  await fresh(1440);
  check("starts on Organic Chemistry as before (Properties tab selected)", await ev(`document.querySelector('.tool-tabs [aria-selected=true]')?.textContent.trim() === 'Properties'`));
  check("the URL hash follows the tool (#/organic/properties)", (await hash()) === "#/organic/properties", await hash());

  await ev(`document.querySelector('.subject-trigger').click()`);
  await sleep(250);
  const subjects = await ev(`[...document.querySelectorAll('.subject-popover .subject-item')].map((b) => b.querySelector('.subject-item-name').textContent.trim() + ':' + b.querySelector('.subject-badge').textContent.trim()).join('|')`);
  check("picker shows Organic and General as Available, the other three as Planned", subjects === "Organic Chemistry:Available|General Chemistry:Available|Physics:Planned|Biology:Planned|Biochemistry:Planned", subjects);
  await ev(`[...document.querySelectorAll('.subject-popover .subject-item')].find((b) => b.textContent.includes('Physics'))?.click()`);
  await sleep(500);
  check("a planned subject opens an informational dialog and does not replace the working tool", await ev(`!!document.querySelector('[role=dialog]') && document.querySelector('.tool-tabs [aria-selected=true]')?.textContent.trim() === 'Properties'`));
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);

  await pickSubject("General Chemistry");
  check("General Chemistry opens its own tool tabs (Overview, Acid–base & titration, Saved)", (await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].map((b) => b.textContent.trim()).join('|')`)) === "Overview|Acid–base & titration|Saved");
  check("hash is #/general/overview", (await hash()) === "#/general/overview", await hash());
  const overview = await ev(`(() => { const planned = [...document.querySelectorAll('.gc-planned li')]; return { planned: planned.length, plannedButtons: document.querySelectorAll('.gc-planned button, .gc-planned a, .gc-planned input').length, openButtons: [...document.querySelectorAll('.gc-tool-card button')].map((b) => b.textContent.trim()), badges: planned.every((li) => /Planned/.test(li.textContent)) }; })()`);
  check("landing page lists planned areas as non-interactive 'Planned' items", overview.planned >= 4 && overview.plannedButtons === 0 && overview.badges, JSON.stringify(overview));
  check("landing page offers exactly one working tool with an Open button", overview.openButtons.length === 1 && /Open Acid–base/.test(overview.openButtons[0]), overview.openButtons.join());
  await screenshot(cdp, path.join(outDir, "overview-dark.png"), { fullPage: false });

  await ev(`history.back()`);
  await sleep(700);
  check("browser Back returns to Organic Chemistry", (await hash()) === "#/organic/properties" && (await ev(`document.querySelector('.tool-tabs [aria-selected=true]')?.textContent.trim()`)) === "Properties", await hash());
  await ev(`history.forward()`);
  await sleep(700);
  check("browser Forward returns to General Chemistry", (await hash()) === "#/general/overview", await hash());

  // ---------------- the analyzer: values, graph, interaction ----------------
  await click("Open Acid–base & titration");
  await analyzerReady();
  check("hash is #/general/acid-base-titration", (await hash()) === "#/general/acid-base-titration", await hash());
  const ph0 = await phNow();
  check("default weak-acid system at half-equivalence reads pH ≈ pKa (4.76)", Math.abs(ph0 - 4.76) < 0.01, String(ph0));
  const path0 = await linePath();
  check("the titration curve is drawn", path0.length > 500, `${path0.length} chars`);
  check("legend, equivalence and half-equivalence markers are shown", await ev(`document.querySelectorAll('.gc-marker').length === 2 && /Half-equivalence/.test(document.querySelector('.ui-legend')?.textContent ?? '') && !!document.querySelector('.gc-band')`));

  await setField("Added titrant volume", 25);
  await sleep(300);
  const phEq = await phNow();
  check("25.0 mL of titrant (equivalence) gives pH 8.73 for 0.100 M acetic acid", Math.abs(phEq - 8.73) < 0.02, String(phEq));
  check("the region readout says Equivalence point", await ev(`/Equivalence point/.test(document.querySelector('.ui-figures')?.textContent ?? '')`));
  check("the explanation says the equivalence pH is not 7", await ev(`/not 7/.test(document.querySelector('.ui-explain')?.textContent ?? '')`));
  check("the slider and the chart marker agree with the field", (await ev(`Number(document.getElementById('gc-vt-slider').value)`)) === 25 && /8\.73|8\.72/.test(await ev(`document.querySelector('.gc-current')?.getAttribute('aria-valuetext') ?? ''`)));

  await setField("Analyte concentration", 0.2);
  await sleep(300);
  const path1 = await linePath();
  check("changing the concentration redraws the curve (new equivalence volume)", path1 !== path0 && (await ev(`/50\\.00 mL/.test(document.querySelector('.ui-figures')?.textContent ?? '')`)));
  check("the added volume was clamped into the new range (no invalid state)", await ev(`!document.querySelector('.gc-field-error')`));

  await click("HCl + NaOH");
  await sleep(300);
  await click("Equivalence");
  await sleep(300);
  check("strong acid + strong base at equivalence is pH 7.00", Math.abs((await phNow()) - 7) < 0.005, String(await phNow()));
  check("no buffer band is drawn for a strong analyte", await ev(`!document.querySelector('.gc-band')`));
  await click("Start");
  await sleep(200);
  check("0.100 M HCl starts at pH 1.00", Math.abs((await phNow()) - 1) < 0.005);

  // keyboard on the chart
  await ev(`document.querySelector('.gc-current').focus()`);
  const before = await ev(`document.querySelector('.gc-current').getAttribute('aria-valuenow')`);
  await ev(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }))`);
  await sleep(250);
  const after = await ev(`document.querySelector('.gc-current').getAttribute('aria-valuenow')`);
  check("chart marker is a keyboard slider: PageUp advances the titrant volume", Number(after) > Number(before), `${before} → ${after}`);

  // pointer drag on the plot
  const box = await ev(`(() => { const r = document.querySelector('.gc-chart-svg').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const px = box.x + 52 + (box.w - 52 - 16) * 0.75;
  const py = box.y + box.h / 2;
  for (const [type, extra] of [["mousePressed", { button: "left", clickCount: 1, buttons: 1 }], ["mouseReleased", { button: "left", clickCount: 1 }]]) {
    await cdp.send("Input.dispatchMouseEvent", { type, x: px, y: py, ...extra });
  }
  await sleep(300);
  const vtAfterClick = Number(await ev(`document.querySelector('.gc-current').getAttribute('aria-valuenow')`));
  check("clicking the plot at 75 % of the x-range moves the selected point there (≈ 1.5 × equivalence = 37.5 mL)", Math.abs(vtAfterClick - 37.5) < 1.2, String(vtAfterClick));
  check("past equivalence the readout says so and pH is basic", (await phNow()) > 11 && (await ev(`/Past equivalence/.test(document.querySelector('.ui-figures')?.textContent ?? '')`)));

  // ---------------- invalid and unsupported input ----------------
  await setField("Analyte concentration", -1);
  await sleep(300);
  check("a negative concentration shows an explicit error and no results", await ev(`!!document.querySelector('.gc-field-error') && !document.querySelector('[data-testid=ph-now]') && /cannot be used/.test(document.body.innerText)`));
  await setField("Analyte concentration", "abc");
  await sleep(250);
  check("non-numeric input is refused with a reason", await ev(`/must be a number/.test(document.querySelector('.gc-field-error')?.textContent ?? '')`));
  await setField("Analyte concentration", 0.1);
  await sleep(300);
  check("fixing the value brings the results back", await ev(`!!document.querySelector('[data-testid=ph-now]') && !document.querySelector('.gc-field-error')`));
  await choose("Weak acid");
  await sleep(200);
  await setField("pKa", 40);
  await sleep(250);
  check("an out-of-range pKa is refused", await ev(`/pKa must be between/.test(document.querySelector('.gc-field-error')?.textContent ?? '')`));
  await setField("pKa", 4.76);
  await sleep(250);
  check("all four analyte types are offered; unsupported polyprotic/mixed chemistry is named in the scope notes", await ev(`document.querySelectorAll('[aria-label=Analyte] input').length === 4 && /polyprotic/i.test(document.querySelector('.gc-assumptions')?.textContent ?? '')`));

  // ---------------- single solution and buffer views ----------------
  await choose("Single solution");
  await sleep(300);
  await setField("Concentration", 0.1);
  await sleep(300);
  check("single solution: 0.100 M weak acid (pKa 4.76) → pH 2.88 and 1.3 % ionized", Math.abs((await phNow()) - 2.88) < 0.01 && (await ev(`/1\\.3\\d? %/.test(document.querySelector('.ui-figures')?.textContent ?? '')`)));
  check("dilution result is shown with the ΔpH and increased ionization", await ev(`/After dilution/.test(document.body.innerText) && /was 1\\.3/.test(document.body.innerText)`));
  await choose("Buffer");
  await sleep(300);
  check("buffer: equal weak acid and conjugate → pH = pKa (4.76) and HH is declared valid", Math.abs((await phNow()) - 4.76) < 0.01 && (await ev(`/Henderson–Hasselbalch is valid/.test(document.body.innerText)`)));
  await setField("Weak acid (HA)", 0.001);
  await sleep(300);
  check("buffer: a 100:1 ratio flags Henderson–Hasselbalch as outside its regime", await ev(`/outside its regime/.test(document.body.innerText)`));
  await setField("Weak acid (HA)", 0.1);

  // ---------------- explain and practice ----------------
  await choose("Titration");
  await sleep(300);
  check("Explore mode lists five 'why' explanations built from the current numbers", (await ev(`document.querySelectorAll('.gc-lessons details, .gc-lessons .ui-disclosure').length`)) >= 5);
  await ev(`[...document.querySelectorAll('.gc-lessons summary')].find((s) => /equivalence-point pH/.test(s.textContent))?.click()`);
  await sleep(200);
  await choose("Practice");
  await sleep(300);
  check("Practice mode replaces the explanations with predict-then-observe", await ev(`!!document.querySelector('.gc-predict') && !document.querySelector('.gc-lessons')`));
  check("the answer is hidden until the learner commits", await ev(`!document.querySelector('.gc-reveal .ui-callout, .gc-reveal [role=note], .gc-reveal [role=status]')`));
  await ev(`[...document.querySelectorAll('.gc-predict .ui-seg-option input')].find((i) => i.value === 'higher')?.click()`);
  await sleep(300);
  check("after predicting, the model reveals before/after values", await ev(`/goes from/.test(document.querySelector('.gc-reveal')?.textContent ?? '')`), await ev(`document.querySelector('.gc-reveal')?.textContent.slice(0, 120) ?? ''`));
  await choose("Explore");

  // ---------------- save, restore, cross-subject open ----------------
  await click("HCl + NaOH");
  await sleep(200);
  await choose("Weak acid");
  await setField("pKa", 5.5);
  await setField("Analyte concentration", 0.05);
  await setField("Added titrant volume", 10);
  await sleep(300);
  const savedPH = await phNow();
  await click("Save Analysis");
  await sleep(300);
  await ev(`(() => { const el = document.querySelector('.synthesis-save-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'Stage11 weak acid'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`/Saved “Stage11 weak acid”/.test(document.body.innerText)`), "save notice", 15000);
  check("Save Analysis stores the analysis", true);

  await setField("Analyte concentration", 0.5);
  await sleep(250);
  await openGeneralTool("Saved");
  await waitFor(() => ev(`!!document.querySelector('.saved-badge')`), "saved list", 15000);
  const badge = await ev(`document.querySelector('.saved-badge')?.textContent ?? ''`);
  check("Saved list labels the record with its subject and tool", /General Chemistry · Acid–base & titration/.test(badge), badge);
  await click("Open");
  await sleep(1200);
  check("opening it returns to the analyzer", (await hash()) === "#/general/acid-base-titration", await hash());
  const promptShown = await ev(`!!document.querySelector('[role=alertdialog]')`);
  if (promptShown) await click("Replace without saving");
  await sleep(800);
  check("the saved values are restored exactly (concentration, pKa) and the pH matches", (await getField("Analyte concentration")) === "0.05" && (await getField("pKa")) === "5.5" && Math.abs((await phNow()) - savedPH) < 0.005, `${await getField("Analyte concentration")} ${await getField("pKa")} ${await phNow()} vs ${savedPH}`);
  check("a notice says results were recalculated from the saved values", await ev(`/recalculated from the saved values/.test(document.body.innerText)`));

  // organic Saved tab sees it too, and opening from Organic switches subject
  await pickSubject("Organic Chemistry");
  await sleep(600);
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved')?.click()`);
  await waitFor(() => ev(`!!document.querySelector('.saved-badge')`), "saved list (organic)", 15000);
  await setField("x", 0).catch(() => {});
  await click("Open");
  await waitFor(() => ev(`location.hash === '#/general/acid-base-titration'`), "cross-subject open", 15000);
  await analyzerReady();
  const afterCross = await getField("Analyte concentration");
  check("opening a General Chemistry record from the Organic Saved page switches subject and restores it", afterCross === "0.05" || afterCross === "0.5", String(afterCross));

  // reload keeps the workspace
  await setField("Analyte concentration", 0.123);
  await sleep(1500);
  await cdp.send("Page.reload");
  await waitFor(() => ev(`document.readyState === 'complete'`), "reload");
  await analyzerReady();
  check("after a reload the deep link reopens the analyzer with the last values", (await hash()) === "#/general/acid-base-titration" && (await getField("Analyte concentration")) === "0.123", `${await hash()} ${await getField("Analyte concentration")}`);

  // ---------------- themes and layout ----------------
  const audit = async (width, scheme) => {
    await fresh(width, scheme, "#/general/acid-base-titration");
    await analyzerReady();
    const info = await ev(`(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, chart: document.querySelector('.gc-chart-svg').getBoundingClientRect().width, vw: innerWidth, paper: getComputedStyle(document.querySelector('.ui-diagram')).backgroundColor, smallTargets: [...document.querySelectorAll('.gc-page button, .gc-page input')].filter((e) => e.getClientRects().length && e.type !== 'radio' && e.type !== 'range' && (e.getBoundingClientRect().height < 30)).length }))()`);
    check(`${width}px ${scheme}: no horizontal overflow and the chart fits the viewport`, info.over <= 0 && info.chart <= info.vw, JSON.stringify(info));
    return info;
  };
  const dark = await audit(375, "dark");
  const light = await audit(375, "light");
  const paperOk = (c) => (c.match(/d+/g) ?? []).slice(0, 3).every((n) => Number(n) >= 245);
  check("the chart sits on a light paper surface in both themes", paperOk(dark.paper) && paperOk(light.paper), `${dark.paper} / ${light.paper}`);
  await screenshot(cdp, path.join(outDir, "analyzer-375-light.png"), { fullPage: true });
  await audit(768, "dark");
  await audit(1440, "light");
  await screenshot(cdp, path.join(outDir, "analyzer-1440-light.png"), { fullPage: false });
  await fresh(1440, "dark", "#/general/acid-base-titration");
  await analyzerReady();
  await screenshot(cdp, path.join(outDir, "analyzer-1440-dark.png"), { fullPage: false });
  await fresh(375, "dark", "#/general/overview");
  check("overview at 375px has no horizontal overflow", (await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`)) <= 0);
  await cdp.send("Page.navigate", { url: "about:blank" });
  await sleep(300);
  await fresh(1440, "dark", "#/physics");
  check("a planned-subject deep link is ignored and Organic Chemistry opens", (await ev(`document.querySelector('.tool-tabs [aria-selected=true]')?.textContent.trim()`)) === "Properties");

  check("no uncaught page exceptions", cdp.errors.length === 0, cdp.errors.slice(0, 2).join(" | "));
} catch (error) {
  check("script completed", false, error.message);
} finally {
  stop();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
