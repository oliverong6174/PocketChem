// Stage 24 live-browser check (real headless Chrome, production build): Electric fields & potential, Magnetic fields & forces,
// Electromagnetic induction. Expected values are derived in this script from the textbook formulas, from the numbers the page shows
// as its own inputs, never from the page's results.
//   npm run build && node scripts/browser/stage24LiveCheck.mjs            (SECTIONS=nav,efield,... to run a subset)
// Screenshots go to node_modules/.cache/pc-live24 (repository-local, git-ignored) unless SHOT_DIR is set.
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
};
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live24");
const want = (s) => !process.env.SECTIONS || process.env.SECTIONS.split(",").includes(s);
const { cdp, url, stop } = await startBrowser({ port: 4304, debugPort: 9464 });
const ev = (expr) => cdp.evaluate(expr);
const click = (label, scope = "document") => ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const clickStarts = (label) => ev(`(() => { const b = [...document.querySelectorAll('main button')].find((x) => x.innerText.trim().startsWith(${q(label)}) && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const choose = (label) => ev(`(() => { const o = [...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; o.querySelector('input').click(); return true; })()`);
const NATIVE = `const set = (el, v) => { const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };`;
const setField = (label, value, nth = 0) => ev(`(() => { ${NATIVE} const ls = [...document.querySelectorAll('.gc-field label')].filter((x) => x.textContent.trim().startsWith(${q(label)})); const l = ls[${nth}]; if (!l) return false; set(document.getElementById(l.htmlFor), ${q(String(value))}); return true; })()`);
const getField = (label, nth = 0) => ev(`(() => { const ls = [...document.querySelectorAll('.gc-field label')].filter((x) => x.textContent.trim().startsWith(${q(label)})); return ls[${nth}] ? document.getElementById(ls[${nth}].htmlFor).value : null; })()`);
const numField = async (label, nth = 0) => Number(await getField(label, nth));
const setSlider = (label, value) => ev(`(() => { ${NATIVE} const l = [...document.querySelectorAll('.gc-slider label')].find((x) => x.textContent.trim().startsWith(${q(label)})); if (!l) return false; set(document.getElementById(l.htmlFor), ${q(String(value))}); return true; })()`);
const sliderText = (label) => ev(`(() => { const l = [...document.querySelectorAll('.gc-slider label')].find((x) => x.textContent.trim().startsWith(${q(label)})); return l ? l.textContent : null; })()`);
const setTime = (frac) => ev(`(() => { ${NATIVE} const el = document.querySelector('input[type=range][id$="-t"]'); if (!el) return false; const lo = Number(el.min), hi = Number(el.max); set(el, String(lo + (hi - lo) * ${frac})); return true; })()`);
const figure = (label) => ev(`(() => { const f = [...document.querySelectorAll('.ui-figure')].find((x) => x.querySelector('dt').textContent.trim().startsWith(${q(label)})); if (!f) return null; const dd = f.querySelector('dd'); return [...dd.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(); })()`);
const figureNote = (label) => ev(`(() => { const f = [...document.querySelectorAll('.ui-figure')].find((x) => x.querySelector('dt').textContent.trim().startsWith(${q(label)})); return f?.querySelector('dd small')?.textContent ?? ''; })()`);
const figureAll = async (label) => `${await figure(label)} ${await figureNote(label)}`;
const text = (selector) => ev(`document.querySelector(${q(selector)})?.innerText ?? ''`);
const has = (t) => ev(`document.querySelector('main').innerText.includes(${q(t)})`);
const hash = () => ev(`location.hash`);
const aria = (sel = ".ph-svg") => ev(`document.querySelector(${q(sel)})?.getAttribute('aria-label') ?? ''`);
const status = () => ev(`document.querySelector('[data-testid=challenge-status]')?.textContent ?? ''`);
const SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
const PREFIX = { G: 1e9, M: 1e6, k: 1e3, m: 1e-3, "µ": 1e-6, n: 1e-9, p: 1e-12 };
/** First number of "49.1 mN" / "-3×10⁻⁴ J" in base units (`base` is the unit symbol without prefix). */
const si = (s, base) => {
  const t = String(s).replace(/−/g, "-");
  const sci = new RegExp(`(-?[\\d.]+)×10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)\\s*([GMkmµnp]?)${base}`).exec(t);
  if (sci) return Number(sci[1]) * 10 ** Number([...sci[2]].map((c) => SUP[c]).join("")) * (PREFIX[sci[3]] ?? 1);
  const m = new RegExp(`(-?[\\d.]+(?:e-?\\d+)?)\\s*([GMkmµnp]?)${base}(?![A-Za-z])`).exec(t);
  return m ? Number(m[1]) * (PREFIX[m[2]] ?? 1) : NaN;
};
const nums = (s) => String(s).replace(/−/g, "-").match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)?.map(Number) ?? [];
const near = (a, b, rel, abs = 0) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(rel * Math.abs(b), abs);
const f3 = (x) => (Number.isFinite(x) ? Number(x.toPrecision(4)) : x);
const K = 8.9875517923e9, MU0 = 4e-7 * Math.PI, QE = 1.602176634e-19;
/** Pair "(a unit, b unit)" → numbers in base units. */
const pair = (s, base) => { const m = /\(([^,]+),\s*([^)]+)\)/.exec(String(s)); return m ? [si(m[1].trim().replace(/\)$/, ""), base), si(m[2].trim(), base)] : [NaN, NaN]; };
const angDiff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
const clearStorage = () => ev(`(async () => { try { localStorage.clear(); sessionStorage.clear(); const dbs = (await indexedDB.databases?.()) ?? []; await Promise.all(dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); }))); } catch { /* ignore */ } })()`);
let nav = 0;
const fresh = async (width, scheme = "dark", target = "", { keep = false, ...viewport } = {}) => {
  await setViewport(cdp, width, width < 500 ? 812 : width < 1000 ? 1024 : 900, { scheme, ...viewport });
  if (!keep) {
    nav += 1;
    await cdp.send("Page.navigate", { url: `${url}?n=${nav}#/physics/overview` });
    await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
    await sleep(300);
    await clearStorage();
  }
  nav += 1;
  await cdp.send("Page.navigate", { url: `${url}?n=${nav}${target}` });
  await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
  await sleep(800);
};
const waitSel = (selector, ms = 20000) => waitFor(() => ev(`!!document.querySelector(${q(selector)})`), selector, ms);
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const tabs = () => ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].map((b) => b.textContent.trim()).join('|')`);
const shot = async (name, full = true) => { await sleep(350); await screenshot(cdp, path.join(outDir, name), { fullPage: full }); };
const saveAs = async (name) => {
  await click("Save Analysis");
  await sleep(300);
  await ev(`(() => { ${NATIVE} set(document.querySelector('.synthesis-save-form input'), ${q(name)}); })()`);
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`document.body.innerText.includes(${q(`Saved “${name}”`)})`), "save notice", 15000);
};
const openRecord = async (name) => {
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 1`), "saved list", 15000);
  await ev(`(() => { const row = [...document.querySelectorAll('.saved-list li, .saved-item, article, li')].find((x) => x.textContent.includes(${q(name)}) && x.querySelector('button')); const b = row && [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open'); b?.click(); })()`);
  await sleep(1200);
  if (await ev(`!!document.querySelector('[role=alertdialog]')`)) await click("Replace without saving");
  await sleep(900);
};
const keyDown = (selector, k, extra = {}) => ev(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return false; el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: ${q(k)}, bubbles: true, ...${JSON.stringify(extra)} })); return true; })()`);
const cdpKey = async (k, code, vk, modifiers = 0) => {
  await cdp.send("Input.dispatchKeyEvent", { type: k === "Enter" ? "keyDown" : "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(k === "Enter" ? { text: String.fromCharCode(13) } : {}) });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
};
const rows = (sel) => ev(`[...document.querySelectorAll(${q(sel)} + ' tbody tr, ' + ${q(sel)} + ' tr')].filter((r) => r.querySelector('td')).map((r) => [...r.children].map((c) => c.textContent.trim()))`);

const EF = "#/physics/electric-fields", MG = "#/physics/magnetic-fields", IN = "#/physics/induction";

// ---------- independent physics used by the checks ----------
/** E, V of point charges [{q (nC), x, y}] at (px, py), from Coulomb's law. */
const coulomb = (cs, px, py) => {
  let ex = 0, ey = 0, V = 0;
  for (const c of cs) { const dx = px - c.x, dy = py - c.y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2), qq = c.q * 1e-9; ex += (K * qq * dx) / (r2 * r); ey += (K * qq * dy) / (r2 * r); V += (K * qq) / r; }
  return { ex, ey, V, E: Math.hypot(ex, ey), ang: (Math.atan2(ey, ex) * 180) / Math.PI };
};
const readCharges = () => ev(`[...document.querySelectorAll('[data-testid=efield-table] tbody tr')].map((r) => [...r.children].map((c) => c.textContent.trim()))`).then((rs) => rs.map((r) => ({ id: r[0], q: nums(r[0].replace(/^[A-Za-z]\s*/, ""))[0], pos: nums(r[1]) })).map((c) => ({ q: c.q, x: c.pos[0], y: c.pos[1], id: c.id })));
const efieldCheck = async (label) => {
  const cs = await readCharges();
  const px = await numField("Probe x"), py = await numField("Probe y");
  const ex = coulomb(cs, px, py);
  const E = si(await figure("Field E at P"), "N/C"), V = si(await figure("Potential V at P"), "V");
  const angT = nums(await figure("Direction of E"))[0];
  check(`${label}: |E| at P = Σ kq/r² vector sum (${f3(ex.E)} N/C)`, near(E, ex.E, 0.006), `page ${await figure("Field E at P")}, expected ${f3(ex.E)} at probe (${px}, ${py}) from ${cs.length} charges`);
  check(`${label}: direction of E = ${f3(ex.ang)}° and V = Σ kq/r = ${f3(ex.V)} V`, (ex.E < 1e-6 || angDiff(angT, ex.ang) < 1) && (near(V, ex.V, 0.006, 1e-6)), `page ${angT}° / ${await figure("Potential V at P")}`);
  return { cs, px, py, ex, E, V };
};
const clickChip = (starts) => ev(`(() => { const b = [...document.querySelectorAll('.gc-chip')].find((x) => x.textContent.trim().startsWith(${q(starts)})); if (!b) return false; b.click(); return true; })()`);
const chargeAria = () => ev(`[...document.querySelectorAll('g.ph-charge')].map((g) => g.getAttribute('aria-label'))`);

try {
  // ====================== 1. navigation ======================
  if (want("nav")) {
    await fresh(1440, "dark", "#/physics/overview");
    const tb = await tabs();
    check("nav: Physics tabs list the three laboratories between Interference and DC circuits", tb === "Overview|Mechanics & motion|Forces & Newton's laws|Work & energy|Momentum & collisions|Waves & sound|Geometric optics|Interference & diffraction|Electric fields & potential|Magnetic fields & forces|Electromagnetic induction|DC circuits|RC transient|Saved", tb);
    const groups = await ev(`[...document.querySelectorAll('.tool-group-label')].map((x) => x.textContent.trim()).join('|')`);
    check("nav: an 'Electromagnetism' group sits between 'Waves & optics' and 'Electricity'", /Waves & optics\|Electromagnetism\|Electricity/.test(groups), groups);
    const ov = await ev(`({ headings: [...document.querySelectorAll('.ph-group-heading')].map((h) => h.textContent), buttons: [...document.querySelectorAll('.gc-tool-card button')].map((b) => b.textContent.trim()), plannedButtons: document.querySelectorAll('.gc-planned button').length, planned: [...document.querySelectorAll('.gc-planned li')].map((x) => x.textContent) })`);
    check("nav: overview has twelve laboratories under an Electromagnetism heading; none of the new ones is still 'planned'", ov.buttons.length === 12 && ov.headings.includes("Electromagnetism") && ov.plannedButtons === 0 && !ov.planned.some((p) => /Electric|Magnetic|induction/i.test(p)), JSON.stringify(ov));
    await shot("overview-1440-dark.png", false);
    for (const [label, slug] of [["Electric fields & potential", "electric-fields"], ["Magnetic fields & forces", "magnetic-fields"], ["Electromagnetic induction", "induction"]]) {
      await click(`Open ${label}`);
      await waitSel(".ph-svg");
      check(`nav: Open button reaches ${label}; hash is #/physics/${slug}`, (await hash()) === `#/physics/${slug}`, await hash());
      await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Overview').click()`);
      await sleep(500);
    }
    await fresh(1440, "dark", EF);
    await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Magnetic fields & forces').click()`);
    await sleep(1200);
    await waitSel(".ph-svg");
    check("nav: switching tabs from Electric fields to Magnetic fields changes the hash and page", (await hash()) === MG && /Magnetic fields/.test(await text("main h1, main h2")), await hash());
  }

  // ====================== 2. electric fields ======================
  if (want("efield")) {
    await fresh(1440, "dark", EF);
    await waitSel(".ph-svg");
    check("E default: two charges, the probe at P, the diagram labelled for assistive technology", /Electric field of 2 point charges/.test(await aria()), await aria());
    const d0 = await efieldCheck("E default dipole");
    check("E dipole: the field on the perpendicular bisector points from the + charge toward the − charge (toward −y or +x per the geometry)", d0.cs.length === 2 && Math.sign(d0.cs[0].q) !== Math.sign(d0.cs[1].q), JSON.stringify(d0.cs));

    await click("Single positive charge");
    await sleep(300);
    const s1 = await efieldCheck("E single + charge");
    const c = s1.cs[0];
    const away = (Math.atan2(s1.py - c.y, s1.px - c.x) * 180) / Math.PI;
    check("E positive charge: E points directly away from it", angDiff(nums(await figure("Direction of E"))[0], away) < 1, `${nums(await figure("Direction of E"))[0]} vs ${f3(away)}`);
    await setField("Probe x", 1.5);
    await setField("Probe y", -0.7);
    await sleep(300);
    await efieldCheck("E single + charge, moved probe (1.5, −0.7)");
    // negative charge: select the charge and reverse its sign
    await clickChip("a:");
    await sleep(250);
    await setField("Charge q", -3);
    await sleep(300);
    const sn = await efieldCheck("E single −3 nC charge");
    const toward = (Math.atan2(sn.cs[0].y - sn.py, sn.cs[0].x - sn.px) * 180) / Math.PI;
    check("E negative charge: E points directly toward it", angDiff(nums(await figure("Direction of E"))[0], toward) < 1, `${nums(await figure("Direction of E"))[0]} vs ${f3(toward)}`);

    for (const preset of ["Two equal positive charges", "Three charges (+, +, −)", "Dipole (+2 nC and −2 nC)"]) {
      await click(preset);
      await sleep(300);
      await efieldCheck(`E preset "${preset}"`);
    }
    // superposition with a user-added charge and a moved probe
    await click("Three charges (+, +, −)");
    await sleep(300);
    const nBefore = (await readCharges()).length;
    await click("+ Add charge");
    await sleep(350);
    const nAdd = (await readCharges()).length;
    await setField("Charge q", -4.5);
    await setField("Position x", 2.2);
    await setField("Position y", -1.3);
    await setField("Probe x", -1.1);
    await setField("Probe y", 0.9);
    await sleep(350);
    check("E add charge: the table grows by one row", nAdd === nBefore + 1, `${nBefore} → ${nAdd}`);
    const sup = await efieldCheck("E superposition, 4 charges incl. a −4.5 nC added at (2.2, −1.3), probe (−1.1, 0.9)");
    check("E add charge: the added charge sits where it was put", sup.cs.some((x) => near(x.x, 2.2, 0.01, 0.01) && near(x.y, -1.3, 0.01, 0.01) && near(x.q, -4.5, 0.01)), JSON.stringify(sup.cs.map((x) => [x.q, x.x, x.y])));
    // test charge: force = qE, direction reverses for a negative test charge
    await setField("Test charge", 5);
    await sleep(250);
    const f1 = await figure("Force on test charge"), f1n = await figureNote("Force on test charge");
    check("E test charge +5 nC: F = qE in magnitude and along E", near(si(f1, "N"), 5e-9 * sup.E, 0.01) && angDiff(nums(f1n)[0] ?? NaN, sup.ex.ang) < 1.5, `${f1} ${f1n} vs ${f3(5e-9 * sup.E)} N at ${f3(sup.ex.ang)}°`);
    await setField("Test charge", -2);
    await sleep(250);
    const f2 = await figure("Force on test charge"), f2n = await figureNote("Force on test charge");
    check("E test charge −2 nC: force is opposite to E and |F| = |q|E", near(si(f2, "N"), 2e-9 * sup.E, 0.01) && angDiff(nums(f2n)[0] ?? NaN, sup.ex.ang + 180) < 1.5, `${f2} ${f2n}`);
    const U = si(await figure("Potential energy U"), "J");
    check("E potential energy U = qV for the test charge", near(U, -2e-9 * sup.V, 0.01, 1e-15), `${await figure("Potential energy U")} vs ${f3(-2e-9 * sup.V)} J`);
    // keyboard movement
    const ariaBefore = (await chargeAria())[0];
    const [bx, by] = nums(/at \(([^)]*)\)/.exec(ariaBefore)[1]);
    await keyDown("g.ph-charge", "ArrowRight");
    await sleep(250);
    const ariaR = (await chargeAria())[0];
    const [rx] = nums(/at \(([^)]*)\)/.exec(ariaR)[1]);
    check("E keyboard: ArrowRight moves the first charge +0.1 m in x", near(rx, bx + 0.1, 0.001, 0.011), `${bx} → ${rx}`);
    await keyDown("g.ph-charge", "ArrowUp", { shiftKey: true });
    await sleep(250);
    const [, uy] = nums(/at \(([^)]*)\)/.exec((await chargeAria())[0])[1]);
    check("E keyboard: Shift+ArrowUp moves it +0.5 m in y", near(uy, by + 0.5, 0.001, 0.011), `${by} → ${uy}`);
    await keyDown("g.ph-charge", "Enter");
    await sleep(250);
    check("E keyboard: Enter selects the charge (aria-pressed) and its editor fields appear", (await ev(`document.querySelector('g.ph-charge').getAttribute('aria-pressed')`)) === "true" && (await getField("Charge q")) !== null);
    await efieldCheck("E after keyboard moves");
    await keyDown("g.ph-probe", "ArrowLeft");
    await sleep(250);
    check("E keyboard: ArrowLeft moves the probe by −0.1 m", near(await numField("Probe x"), -1.2, 0.001, 0.011), String(await getField("Probe x")));
    await click("Remove selected");
    await sleep(300);
    check("E remove selected: the table shrinks again", (await readCharges()).length === nAdd - 1);

    // equipotentials
    await click("Single positive charge");
    await choose("Potential");
    await sleep(350);
    const lines0 = await ev(`document.querySelectorAll('.ph-contour').length`);
    await click("Add contour through P");
    await sleep(400);
    const lines1 = await ev(`document.querySelectorAll('.ph-contour').length`);
    const Vp = si(await figure("Potential V at P"), "V");
    const labelsTxt = await ev(`[...document.querySelectorAll('.ph-contour-label')].map((t) => t.textContent).join('|')`);
    check("E equipotential: 'Add contour through P' draws a contour whose label is the potential at P", lines1 > lines0 && labelsTxt.split("|").some((t) => near(si(t, "V"), Vp, 0.02, 0.6)), `${lines0}→${lines1} segments, labels ${labelsTxt}, V at P ${f3(Vp)}`);
    const rr = await ev(`[...document.querySelectorAll('.ph-contour')].slice(0, 80).map((l) => [+l.getAttribute('x1'), +l.getAttribute('y1')])`);
    const cEl = await ev(`(() => { const c = document.querySelector('g.ph-charge circle:nth-of-type(2)'); const g = [...document.querySelectorAll('g.ph-charge circle')].find((x) => x.getAttribute('r') === '14'); return g ? [+g.getAttribute('cx'), +g.getAttribute('cy')] : null; })()`);
    const radii = rr.map((p) => Math.hypot(p[0] - cEl[0], p[1] - cEl[1]));
    check("E equipotential of a point charge is a circle centred on it (all drawn points equidistant)", radii.length > 8 && Math.max(...radii) - Math.min(...radii) < 0.03 * Math.max(...radii), `radius ${f3(Math.min(...radii))}–${f3(Math.max(...radii))} px`);
    await click("Dipole (+2 nC and −2 nC)");
    await click("Add contour through P");
    await sleep(300);
    check("E potential profile: the line-through-P chart is present with a keyboard slider", await ev(`!!document.querySelector('[role=slider][aria-label*="Potential along the line"]')`));
    await choose("Field & force");

    // uniform-field motion
    await choose("Uniform-field motion");
    await sleep(400);
    const motionCheck = async (label, t) => {
      await setTime(t);
      await sleep(350);
      const qq = await numField("Charge q"), m = await numField("Mass m"), Ex = await numField("Field Ex"), Ey = await numField("Field Ey");
      const vx0 = await numField("Initial velocity vx"), vy0 = await numField("Initial velocity vy"), dur = await numField("Duration");
      const tt = nums(await figure("Time"))[0] ? si(await figure("Time"), "s") : 0;
      const ax = (qq * Ex) / m, ay = (qq * Ey) / m;
      const pos = pair(await figure("Position"), "m"), vel = pair(await figure("Velocity"), "m/s");
      const ex = [vx0 * tt + 0.5 * ax * tt * tt, vy0 * tt + 0.5 * ay * tt * tt], ev2 = [vx0 + ax * tt, vy0 + ay * tt];
      check(`E motion ${label}: position = v₀t + ½at² at t = ${f3(tt)} s`, near(pos[0], ex[0], 0.012, 1e-9 * Math.abs(ex[0]) + 1e-6) && near(pos[1], ex[1], 0.012, 1e-6), `page ${pos.map(f3)} expected ${ex.map(f3)}`);
      check(`E motion ${label}: velocity = v₀ + at`, near(vel[0], ev2[0], 0.012, 2) && near(vel[1], ev2[1], 0.012, 2), `page ${vel.map(f3)} expected ${ev2.map(f3)}`);
      const ke = si(await figure("Kinetic energy"), "J"), keE = 0.5 * m * (ev2[0] ** 2 + ev2[1] ** 2);
      const w = si(await figure("Work done by the field"), "J"), w0 = keE - 0.5 * m * (vx0 ** 2 + vy0 ** 2);
      check(`E motion ${label}: kinetic energy = ½mv² and work by the field = ΔKE`, near(ke, keE, 0.015) && near(w, w0, 0.03, 1e-22), `KE ${await figure("Kinetic energy")} vs ${keE.toExponential(3)}; W ${await figure("Work done by the field")} vs ${w0.toExponential(3)}`);
      return { qq, ax, ay, dur };
    };
    const pr = await motionCheck("proton default", 1);
    check("E motion: a proton (default) is accelerated along E, and the path diagram says positive", pr.qq > 0 && /positive/.test(await aria()), await aria());
    await motionCheck("proton mid-flight", 0.5);
    await click("Electron");
    await sleep(350);
    const el = await motionCheck("electron", 1);
    check("E motion: an electron accelerates opposite to the field, far more strongly than the proton", el.qq < 0 && Math.sign(el.ay) === -Math.sign(pr.ay) && Math.abs(el.ay) > 1000 * Math.abs(pr.ay) && /negative/.test(await aria()), `${el.ay.toExponential(2)} vs ${pr.ay.toExponential(2)}; ${await aria()}`);
    await click("Alpha particle");
    await sleep(350);
    await setField("Field Ey", 3000);
    await setField("Initial velocity vy", -20000);
    await setField("Duration", 4e-7);
    await sleep(350);
    await motionCheck("alpha, E = (5000, 3000) V/m, v₀ = (1e5, −2e4) m/s, 0.4 µs", 1);
    await choose("Challenge");
    await sleep(300);
    check("E motion: Challenge view shows a status line", (await status()).length > 3, await status());
    await choose("Explore");
  }

  // ====================== 3. magnetic fields ======================
  if (want("magnetic")) {
    await fresh(1440, "dark", MG);
    await waitSel(".ph-svg");
    /** Straight wires: reads each chip (current sign from ⊙/⊗, magnitude from the text, position from the editor) and checks B at P. */
    const wireCheck = async (label) => {
      const chips = await ev(`[...document.querySelectorAll('[aria-label="Wires (select one to edit it)"] .gc-chip')].map((b) => b.textContent.trim())`);
      const wires = [];
      for (const chip of chips) {
        await clickChip(chip.slice(0, 2));
        await sleep(200);
        const sl = await sliderText("Current");
        const I = nums(sl.replace(/^[^:]*:/, ""))[0];
        const px = await ev(`(() => { const ls = [...document.querySelectorAll('.gc-field label, .gc-slider label')].filter((l) => /^(Position )?[xy]\\b/.test(l.textContent.trim()) && !/Probe/.test(l.textContent)); return ls.map((l) => [l.textContent.trim(), document.getElementById(l.htmlFor)?.value]); })()`);
        wires.push({ chip, I, px });
      }
      return wires;
    };
    check("M wire default: one wire, out of the screen, diagram label states it", /1 straight wire.*out of the screen/.test(await aria()), await aria());
    const b0 = si(await figure("Field B at P"), "T");
    const pxd = await numField("Probe x"), pyd = await numField("Probe y");
    const rd = Math.hypot(pxd, pyd) / 100;
    check("M wire: B = μ₀I/2πr for 10 A at the probe distance", near(b0, (MU0 * 10) / (2 * Math.PI * rd), 0.01), `${await figure("Field B at P")} vs ${f3((MU0 * 10) / (2 * Math.PI * rd))} T, r = ${rd} m`);
    const dirNote = await figure("Direction");
    const [dx, dy] = nums(dirNote.replace(/^[^(]*\(/, "(")).slice(0, 2);
    check("M wire: B is perpendicular to the radius and circles counter-clockwise for current out of the screen (B = ẑ × r̂)", near(dx, -pyd / Math.hypot(pxd, pyd), 0.01, 0.01) && near(dy, pxd / Math.hypot(pxd, pyd), 0.01, 0.01), `${dirNote} vs (${f3(-pyd / Math.hypot(pxd, pyd))}, ${f3(pxd / Math.hypot(pxd, pyd))}) for probe (${pxd}, ${pyd}) cm`);
    check("M wire: chip and symbol show the current out of the screen (⊙)", (await ev(`document.querySelector('[aria-label="Wires (select one to edit it)"]')?.textContent ?? ''`)).includes("⊙"));
    await click("One wire, current into the screen");
    await sleep(350);
    const b1 = si(await figure("Field B at P"), "T");
    const dirNote1 = await figure("Direction");
    const [dx1, dy1] = nums(dirNote1.replace(/^[^(]*\(/, "(")).slice(0, 2);
    check("M current reversal: same |B|, direction reversed, ⊗ symbol and 'into the screen' label", near(b1, b0, 0.005) && near(dx1, -dx, 0.01, 0.01) && near(dy1, -dy, 0.01, 0.01) && /into the screen/.test(await aria()) && (await ev(`document.querySelector('[aria-label="Wires (select one to edit it)"]').textContent`)).includes("⊗"), `${dirNote1}; ${await aria()}`);
    // two wires: opposite currents double the field between them, same-direction currents cancel it midway
    await setField("Probe x", 0);
    await setField("Probe y", 0);
    await click("Two wires, same direction");
    await sleep(350);
    const bsame = si(await figure("Field B at P"), "T");
    await click("Two wires, opposite directions");
    await sleep(350);
    const bopp = si(await figure("Field B at P"), "T");
    check("M two wires: at the midpoint same-direction currents cancel and opposite currents add (≈ 2 × one wire)", bsame < 1e-9 && bopp > 1e-6, `same ${f3(bsame)} T, opposite ${f3(bopp)} T; ${await aria()}`);
    await click("Three wires");
    await sleep(350);
    check("M three wires: diagram label counts three wires and field is finite", /3 straight wires/.test(await aria()) && Number.isFinite(si(await figure("Field B at P"), "T")), await aria());
    await ev(`(() => { ${NATIVE} })()`);
    await setField("Probe x", 7);
    await setField("Probe y", -4);
    await sleep(300);
    const w3 = await ev(`[...document.querySelectorAll('[aria-label="Wires (select one to edit it)"] .gc-chip')].filter((b) => /^[a-z]:/.test(b.textContent.trim())).length`);
    check("M three wires, probe (7, −4) cm: three chips and a field figure", w3 === 3 && Number.isFinite(si(await figure("Field B at P"), "T")), String(w3));

    // loop
    await choose("Current loop");
    await sleep(400);
    const loopB0 = async () => { const I = await numField("Current I"), a = (await numField("Loop radius a")) / 100, N = await numField("Turns N"); return (MU0 * N * I) / (2 * a); };
    check("M loop default: centre field = μ₀NI/2a", near(si(await figure("Field at the centre"), "T"), await loopB0(), 0.006), `${await figure("Field at the centre")} vs ${f3(await loopB0())}`);
    await setField("Turns N", 10);
    await setField("Loop radius a", 10);
    await setField("Current I", 4);
    await sleep(350);
    check("M loop N = 10, a = 10 cm, I = 4 A: B = μ₀NI/2a = 251 µT", near(si(await figure("Field at the centre"), "T"), (MU0 * 10 * 4) / 0.2, 0.006), `${await figure("Field at the centre")}`);
    await setSlider("Field point on the axis", 0.1);
    await sleep(350);
    const ratio = nums(await figure("Ratio to the centre"))[0];
    check("M loop: on the axis at x = a the field is (1 + 1)^(−3/2) = 0.354 of the centre value", near(ratio, 2 ** -1.5, 0.006) && near(si(await figure("Field at x"), "T"), ((MU0 * 10 * 4) / 0.2) * 2 ** -1.5, 0.01), `${ratio}; ${await figure("Field at x")}`);
    check("M loop: positive current is counter-clockwise from +x with the axial field along +x", /counter-clockwise/.test(await aria()) && /\+x/.test(await figureNote("Field at x")), await aria());
    await setField("Current I", -4);
    await sleep(350);
    check("M loop: reversing the current makes it clockwise and the axial field along −x", /clockwise/.test((await aria()).replace("counter-clockwise", "")) && /−x|-x/.test(await figureNote("Field at x")), `${await aria()} / ${await figureAll("Field at x")}`);
    // solenoid
    await choose("Solenoid");
    await sleep(400);
    await setField("Turns per metre n", 2000);
    await setField("Current I", 2);
    await sleep(350);
    check("M solenoid: ideal interior field = μ₀nI = 5.03 mT", near(si(await figure("Ideal interior field"), "T"), MU0 * 2000 * 2, 0.006), await figure("Ideal interior field"));
    const sL = await numField("Length L"), sR = (await numField("Radius R")) / 100, sn = await numField("Turns per metre n"), sI = await numField("Current I");
    const exact0 = MU0 * sn * sI * ((sL / 2) / Math.sqrt((sL / 2) ** 2 + sR ** 2));
    check("M solenoid: exact on-axis field at the centre = μ₀nI·(L/2)/√((L/2)²+R²)", near(si(await figure("Exact on-axis field"), "T"), exact0, 0.01), `${await figure("Exact on-axis field")} vs ${f3(exact0)}`);
    await setSlider("Field point on the axis", 0);
    await setField("Length L", 0.05);
    await setField("Radius R", 5);
    await sleep(350);
    const exactS = MU0 * 2000 * 2 * (0.025 / Math.sqrt(0.025 ** 2 + 0.05 ** 2));
    check("M solenoid: a short fat solenoid (L = 5 cm, R = 5 cm) falls far below the ideal value (exact 2.25 mT)", near(si(await figure("Exact on-axis field"), "T"), exactS, 0.01) && si(await figure("Exact on-axis field"), "T") < 0.6 * si(await figure("Ideal interior field"), "T"), `${await figure("Exact on-axis field")} (L ${await getField("Length L")} m, R ${await getField("Radius R")} cm, n ${await getField("Turns per metre n")}, I ${await getField("Current I")}; ideal ${await figure("Ideal interior field")}); ${await aria()}`);

    // Lorentz force
    await choose("Lorentz force");
    await sleep(400);
    check("M Lorentz default: proton moving +x in B out of the screen is pushed −y (F = qv × B)", /F points −y/.test(await aria()) && /v points \+x/.test(await aria()) && /B points \+z/.test(await aria()), await aria());
    await click("Electron");
    await sleep(350);
    check("M Lorentz: for an electron the force reverses to +y", /F points \+y/.test(await aria()), await aria());
    await click("Flip the sign of q");
    await sleep(300);
    check("M Lorentz: 'Flip the sign of q' returns the force to −y", /F points −y/.test(await aria()), await aria());
    await click("Proton");
    await setField("x (m/s)", 300000);
    await setField("y (m/s)", 400000);
    await setField("z (out +) (m/s)", 0);
    await setField("x (T)", 0);
    await setField("y (T)", 0);
    await setField("z (out +) (T)", 0.2);
    await sleep(350);
    const Fx = QE * (400000 * 0.2), Fy = -QE * (300000 * 0.2);
    check("M Lorentz, v = (3, 4, 0)×10⁵ m/s, B = 0.2 T ẑ: |F| = |q|vB = 1.60×10⁻¹⁴ N, F = q(vyBz, −vxBz, 0)", near(si(await figure("Magnetic force"), "N"), Math.hypot(Fx, Fy), 0.01) && near(nums(await figure("Angle between"))[0], 90, 0.001), `${await figure("Magnetic force")} ${await figure("Angle between")}`);
    const trow = (await ev(`[...document.querySelectorAll('[data-testid=lorentz-table] tbody tr')].map((r) => [...r.children].map((c) => c.textContent.trim()))`));
    const fr = trow.find((r) => /F total/.test(r[0]));
    const funit = /\((.*)\)/.exec(fr?.[0] ?? "")?.[1] ?? "N";
    check("M Lorentz table: the F total row shows the force components in a readable unit (not 0)", !!fr && near(si(`${fr[1]} ${funit}`, "N"), Fx, 0.01) && near(si(`${fr[2]} ${funit}`, "N"), Fy, 0.01), JSON.stringify(fr));
    check("M Lorentz: the magnetic force does no work (power 0 W)", /^0 W/.test(await figure("Power of the magnetic force")), await figure("Power of the magnetic force"));
    check("M Lorentz: acceleration = F/m", near(si(await figure("Acceleration"), "m/s²"), Math.hypot(Fx, Fy) / 1.67262192369e-27, 0.01), await figure("Acceleration"));
    await setField("x (m/s)", 0);
    await setField("y (m/s)", 0);
    await setField("z (out +) (m/s)", 200000);
    await setField("z (out +) (T)", 0.3);
    await sleep(350);
    check("M Lorentz: velocity along B gives zero magnetic force (angle 0°)", /^0 N|^0 [a-zµ]*N/.test(await figure("Magnetic force")) && nums(await figure("Angle between"))[0] === 0, `${await figure("Magnetic force")} ${await figure("Angle between")}`);
    await setField("x (V/m)", 1000);
    await sleep(350);
    check("M Lorentz: an added electric field adds qE to the total force (1.60×10⁻¹⁶ N here)", near(si(await figure("Total force"), "N"), QE * 1000, 0.01), `${await figure("Total force")}`);
    await setField("x (V/m)", 0);

    // particle motion
    await choose("Particle motion");
    await sleep(500);
    const rad = (1.67262192369e-27 * 1e5) / (QE * 0.5);
    check("M motion default proton: r = mv/|q|B = 2.09 mm and T = 2πm/|q|B = 131 ns", near(si(await figure("Radius"), "m"), rad, 0.01) && near(si(await figure("Period"), "s"), (2 * Math.PI * 1.67262192369e-27) / (QE * 0.5), 0.01), `${await figure("Radius")} ${await figure("Period")}`);
    check("M motion: a positive particle in B out of the screen circles clockwise", /positive/.test(await aria()) && /clockwise/.test(String(await ev(`document.querySelector('.ph-callout, [class*=callout]')?.innerText ?? ''`)).replace(/counter-?clockwise/, "")), await aria());
    await shot("magnetic-motion-1440-dark.png", false);
    await setField("Magnetic field Bz", -0.5);
    await sleep(350);
    check("M motion: reversing B (into the screen) makes the proton circle counter-clockwise", /counter-?clockwise/.test(await ev(`document.querySelector('main').innerText`)) && /into the screen/.test(await aria()), await aria());
    await click("Electron");
    await sleep(400);
    const rE = (9.1093837015e-31 * 1e5) / (QE * 0.5);
    check("M motion: an electron (B into the screen) has r = m_e v/|q|B = 1.14 µm and circles the opposite way (clockwise)", near(si(await figure("Radius"), "m"), rE, 0.01) && /negative/.test(await aria()), `${await figure("Radius")}; ${await aria()}`);
    await click("Proton");
    await setField("Magnetic field Bz", 0.5);
    await setField("Velocity vz", 50000);
    await sleep(400);
    const T0 = (2 * Math.PI * 1.67262192369e-27) / (QE * 0.5);
    check("M motion with a velocity component along B: helical path (pitch = v∥T) and an oblique helix diagram", near(si(await figure("Pitch"), "m"), 50000 * T0, 0.01) && (await ev(`!!document.querySelector('svg[aria-label="Helical path"], [aria-label="Helical path"]')`) || (await has("Helix"))), `${await figure("Pitch")} vs ${f3(50000 * T0)}`);
    await setField("Velocity vz", 0);
    await setField("Electric field Ey (optional)", 50000);
    await sleep(400);
    check("M motion: crossed E and B drift (callout names E × B drift)", await has("E × B drift"), "");
    await setField("Electric field Ey (optional)", 0);
    await setTime(0.5);
    await sleep(300);
    check("M motion: speed stays constant while the proton circles (E = 0): speed readout 100 km/s at mid-time", near(si(await figure("Speed now"), "m/s"), 1e5, 0.002), await figure("Speed now"));
    const fnow = await figureAll("Force now");
    check("M motion: the force now is |q|vB = 8.01×10⁻³ pN (and shown in pN, not rounded to 0)", near(si(await figure("Force now"), "N"), QE * 1e5 * 0.5, 0.01) && !/\(0, 0, 0\)/.test(fnow), fnow);

    // force on a conductor
    await choose("Force on a conductor");
    await sleep(400);
    const cI = await numField("Current I");
    const Lx = await numField("x (m)"), Ly = await numField("y (m)"), Lz = await numField("z (out +) (m)");
    const Bx = await numField("x (T)"), By = await numField("y (T)"), Bz = await numField("z (out +) (T)");
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const Fc = cross([Lx, Ly, Lz], [Bx, By, Bz]).map((x) => x * cI);
    check("M conductor default: F = I L × B in magnitude", near(si(await figure("Force F"), "N"), Math.hypot(...Fc), 0.01), `${await figure("Force F")} vs ${f3(Math.hypot(...Fc))}`);
    check("M conductor default: current +x, B out of the screen ⇒ force −y (down the screen)", /F points −y/.test(await aria()), await aria());
    await setField("Current I", -5);
    await sleep(350);
    check("M conductor: reversing the current reverses the force (up the screen)", /F points \+y/.test(await aria()), await aria());
    await setField("Current I", 3);
    await setField("x (m)", 0.1);
    await setField("y (m)", 0.1);
    await setField("x (T)", 0.2);
    await setField("y (T)", -0.1);
    await setField("z (out +) (T)", 0.4);
    await sleep(350);
    const F2 = cross([0.1, 0.1, Lz], [0.2, -0.1, 0.4]).map((x) => x * 3);
    check("M conductor, I = 3 A, L = (0.1, 0.1, 0) m, B = (0.2, −0.1, 0.4) T: |F| = |I L × B|", near(si(await figure("Force F"), "N"), Math.hypot(...F2), 0.01) && /agrees/.test(await figureNote("Check")), `${await figure("Force F")} vs ${f3(Math.hypot(...F2))}; ${await figure("Check")}`);
    await setField("x (T)", 0.2);
    await setField("y (T)", 0.2);
    await setField("z (out +) (T)", 0);
    await sleep(350);
    check("M conductor: wire parallel to B feels no force", /^0 [a-zµ]*N/.test(await figure("Force F")), await figure("Force F"));

    // practice and challenges
    await choose("Practice");
    await sleep(300);
    check("M Practice shows the predict-then-observe panel", await has("Predict, then observe"));
    await choose("Challenge");
    await sleep(300);
    const mch = await ev(`[...document.querySelectorAll('[aria-label="Choose a challenge"] button')].map((b) => b.textContent.trim())`);
    check("M Challenge lists four challenges and the status starts as not yet", mch.length === 4 && !/Goal met/.test(await status()), JSON.stringify(mch));
    await click(mch[1]); // solenoid 5 mT
    await sleep(250);
    await setField("Turns per metre n", 2000);
    await setField("Current I", 2);
    await sleep(350);
    check("M Challenge '5 mT solenoid': n = 2000/m, I = 2 A meets the goal", await has("Goal met"), await status());
  }

  // ====================== 4. induction ======================
  if (want("induction")) {
    await fresh(1440, "dark", IN);
    await waitSel(".ph-svg");
    // flux
    await choose("Magnetic flux");
    await sleep(400);
    const fluxCheck = async (label) => {
      const B = await numField("Field B"), A = await numField("Loop area A"), N = await numField("Turns N"), th = await numField("Angle θ");
      const phi = B * A * Math.cos((th * Math.PI) / 180);
      const page = si(await figure("Flux per turn"), "Wb");
      check(`I flux ${label}: Φ = BA cosθ = ${f3(phi * 1e3)} mWb and NΦ = ${f3(N * phi * 1e3)} mWb`, near(page, phi, 0.01, 1e-9) && near(si(await figure("Flux linkage"), "Wb"), N * phi, 0.01, 1e-9), `${await figure("Flux per turn")} / ${await figure("Flux linkage")}`);
    };
    await fluxCheck("default");
    await setField("Angle θ", 90);
    await sleep(300);
    check("I flux: loop plane along the field (θ = 90°) gives zero flux", Math.abs(si(await figure("Flux per turn"), "Wb")) < 1e-9, await figure("Flux per turn"));
    await setField("Angle θ", 150);
    await setField("Field B", 0.8);
    await setField("Loop area A", 0.03);
    await setField("Turns N", 25);
    await sleep(300);
    await fluxCheck("θ = 150°, B = 0.8 T, A = 0.03 m², N = 25");
    check("I flux: for θ > 90° the flux is negative (cos θ < 0)", si(await figure("Flux per turn"), "Wb") < 0, await figure("Flux per turn"));
    await setField("Angle θ", 180);
    await sleep(300);
    check("I flux: θ = 180° gives −BA (the most negative flux)", near(si(await figure("Flux per turn"), "Wb"), -0.8 * 0.03, 0.01), await figure("Flux per turn"));

    // Faraday and Lenz
    await choose("Faraday & Lenz");
    await sleep(400);
    const faradayCheck = async (label, frac) => {
      await setTime(frac);
      await sleep(350);
      const B0 = await numField("Initial field B₀"), b = await numField("Field rate dB/dt"), A0 = await numField("Initial area A₀"), a = await numField("Area rate dA/dt");
      const N = await numField("Turns N"), th0 = ((await numField("Initial angle θ₀")) * Math.PI) / 180, w = await numField("Rotation rate ω"), R = await numField("Circuit resistance R");
      const tt = si(await figure("Time"), "s");
      const B = B0 + b * tt, A = A0 + a * tt, th = th0 + w * tt;
      const phi = B * A * Math.cos(th);
      const dphi = b * A * Math.cos(th) + B * a * Math.cos(th) - B * A * w * Math.sin(th);
      const emf = -N * dphi;
      const pagePhi = si(await figure("Flux Φ"), "Wb"), pageEmf = si(await figure("EMF ε"), "V");
      check(`I Faraday ${label} (t = ${f3(tt)} s): Φ = BA cosθ and ε = −N dΦ/dt`, near(pagePhi, phi, 0.015, 2e-6) && near(pageEmf, emf, 0.02, 2e-4), `Φ ${await figure("Flux Φ")} vs ${f3(phi)}; ε ${await figure("EMF ε")} vs ${f3(emf)}`);
      const cur = await figure("Current"), curNote = await figureNote("Current");
      const word = emf > 1e-9 ? "counter-clockwise" : emf < -1e-9 ? "clockwise" : "";
      check(`I Lenz ${label}: current = ε/R = ${f3(emf / R)} A, ${word || "none"} (positive EMF ⇒ counter-clockwise)`, near(si(cur, "A"), emf / R, 0.03, 2e-4) && (word === "" || (word === "clockwise" ? /^clockwise/.test(curNote) : /counter-clockwise/.test(curNote))), `${cur} ${curNote}`);
      return { emf, tt };
    };
    await faradayCheck("default (dB/dt > 0)", 0);
    await click("Field decreasing");
    await sleep(350);
    const dec = await faradayCheck("field decreasing", 0.4);
    check("I Lenz: decreasing flux induces a counter-clockwise (positive) EMF", dec.emf > 0 && /counter-clockwise/.test(await figureNote("Current")), await figureAll("Current"));
    check("I Lenz: the diagram's alt text reports the induced current direction", /counter-clockwise|clockwise|No induced/.test(await aria()), await aria());
    await click("Constant field: no EMF");
    await sleep(350);
    const con = await faradayCheck("constant field", 0.5);
    check("I Faraday: constant flux gives zero EMF and no current", Math.abs(con.emf) < 1e-12 && Math.abs(si(await figure("EMF ε"), "V")) < 1e-9 && /No induced/.test(await aria()), await aria());
    await click("Loop expanding in a steady field");
    await sleep(350);
    await faradayCheck("expanding loop", 0.6);
    await click("Loop turning in a steady field");
    await sleep(350);
    await faradayCheck("turning loop", 0.3);
    await click("Open loop (EMF, no current)");
    await sleep(350);
    check("I open loop: the EMF still appears but the current is zero", /loop is open, so no current flows; its EMF would drive a (counter-)?clockwise current/.test(await aria()) && (await figure("Current")).startsWith("none (open)") && /would be/.test(await figureNote("Current")) && !(await ev(`[...document.querySelectorAll('main svg text')].some((t) => /induced current:/.test(t.textContent))`)) && (await ev(`[...document.querySelectorAll('main svg text')].some((t) => /open loop: no current flows/.test(t.textContent))`)), `${await figureAll("Current")}; ${await aria()}`);
    // nondefault: everything changing at once
    await click("Field increasing");
    await setField("Initial field B₀", 0.3);
    await setField("Field rate dB/dt", 0.1);
    await setField("Initial area A₀", 0.04);
    await setField("Area rate dA/dt", 0.02);
    await setField("Turns N", 30);
    await setField("Initial angle θ₀", 40);
    await setField("Rotation rate ω", 0.5);
    await setField("Circuit resistance R", 3);
    await setField("Duration", 4);
    await sleep(400);
    await faradayCheck("B, A and θ all changing, N = 30, R = 3 Ω", 0.5);
    await faradayCheck("same, t = end", 1);
    await shot("induction-faraday-1440-dark.png", false);

    // motional EMF
    await choose("Motional EMF");
    await sleep(400);
    const motional = async (label) => {
      const Bz = await numField("Field Bz"), L = await numField("Rod length L"), al = ((await numField("Rod direction")) * Math.PI) / 180, v = await numField("Speed v"), be = ((await numField("Velocity direction")) * Math.PI) / 180, R = await numField("Circuit resistance R");
      const emf = Bz * v * L * Math.sin(be - al);
      const pageEmf = si(await figure("EMF ε"), "V");
      check(`I motional ${label}: ε = (v × B)·L = Bvl sin(ψ − α) = ${f3(emf)} V`, near(pageEmf, emf, 0.01, 2e-4), `${await figure("EMF ε")}`);
      const pos = await figure("Positive end");
      check(`I motional ${label}: positive end is the ${emf > 1e-9 ? "tip" : emf < -1e-9 ? "tail" : "neither"} (ε > 0 ⇒ tip)`, emf > 1e-9 ? /tip/.test(pos) : emf < -1e-9 ? /tail/.test(pos) : !/tip|tail/.test(pos) || /neither|none/i.test(pos), pos);
      const perp = Math.abs(Math.abs(Math.sin(be - al)) - 1) < 1e-9;
      if (perp) check(`I motional ${label}: rod ⟂ v, so power = ε²/R and braking force = |B I L|`, near(si(await figure("Power"), "W"), (emf * emf) / R, 0.02, 1e-6) && near(si(await figure("Braking force"), "N"), Math.abs((emf / R) * L * Bz), 0.02, 1e-6), `${await figure("Power")} / ${await figure("Braking force")} vs ${f3((emf * emf) / R)} W, ${f3(Math.abs((emf / R) * L * Bz))} N`);
      else check(`I motional ${label}: rod not ⟂ v, so the rails figures are withheld ("—") and say a perpendicular rod is needed`, (await figure("Power")) === "—" && (await figure("Rails current")) === "—" && /perpendicular/.test(await figureNote("Rails current")), `${await figureAll("Rails current")}`);
      return emf;
    };
    const m0 = await motional("default");
    check("I motional default: rod ⟂ velocity gives the maximum |ε| = BLv (0.6 V)", near(Math.abs(m0), 0.6, 0.01), String(m0));
    await setField("Field Bz", -0.3);
    await setField("Rod length L", 0.5);
    await setField("Rod direction", 30);
    await setField("Speed v", 4);
    await setField("Velocity direction", 75);
    await setField("Circuit resistance R", 5);
    await sleep(400);
    const m1 = await motional("nondefault (B = −0.3 T, L = 0.5 m, α = 30°, v = 4 m/s, ψ = 75°, R = 5 Ω)");
    check("I motional: ε = −0.3·4·0.5·sin 45° = −0.424 V; field into the screen with this geometry", near(m1, -0.42426, 0.01) && /into the screen/.test(await aria()), `${m1}; ${await aria()}`);
    await setField("Rod direction", 75);
    await sleep(350);
    const m2 = await motional("rod parallel to v");
    check("I motional: a rod moving along its own length (α = ψ) has zero EMF", Math.abs(m2) < 1e-9, String(m2));
    await setField("Field Bz", 0.5);
    await setField("Rod direction", 90);
    await setField("Velocity direction", 180);
    await setField("Speed v", 5);
    await setField("Rod length L", 0.4);
    await sleep(350);
    const m3 = await motional("moving left");
    check("I motional: velocity 180° (moving left), vertical rod ⇒ +BLv = +1.0 V, tip positive", near(m3, 1.0, 0.01), String(m3));

    // generator
    await choose("AC generator");
    await sleep(400);
    const generator = async (label, frac) => {
      await setTime(frac);
      await sleep(350);
      const B = await numField("Field B"), A = await numField("Coil area A"), N = await numField("Turns N"), f = await numField("Rotation frequency");
      const w = 2 * Math.PI * f, peak = N * B * A * w;
      const th = nums(await figure("Angle θ"))[0], thr = (th * Math.PI) / 180;
      check(`I generator ${label}: peak ε = NBAω = ${f3(peak)} V, RMS = peak/√2, period = 1/f`, near(si(await figure("Peak EMF"), "V"), peak, 0.01) && near(si(await figure("RMS EMF"), "V"), peak / Math.SQRT2, 0.01) && near(si(await figure("Period"), "s"), 1 / f, 0.01), `${await figure("Peak EMF")} ${await figure("RMS EMF")} ${await figure("Period")}`);
      check(`I generator ${label}: at θ = ${th}° flux = BA cosθ and ε = NBAω sinθ (flux max ⇒ ε = 0; flux 0 ⇒ ε max)`, near(si(await figure("Flux per turn"), "Wb"), B * A * Math.cos(thr), 0.02, 2e-5 * 1000 / 1000) && near(si(await figure("EMF ε"), "V"), peak * Math.sin(thr), 0.02, peak * 0.01), `${await figure("Flux per turn")} / ${await figure("EMF ε")}; expected ${f3(B * A * Math.cos(thr))} Wb / ${f3(peak * Math.sin(thr))} V`);
      return { th, peak, B, A, f };
    };
    const g0 = await generator("t = 0", 0);
    check("I generator: at t = 0 the flux is maximum and the EMF zero", g0.th === 0 && si(await figure("EMF ε"), "V") === 0, await figure("EMF ε"));
    const periods = await numField("Periods shown").catch(() => NaN);
    const g1 = await generator("quarter period", 1 / (4 * (Number.isFinite(periods) && periods > 0 ? periods : 2)));
    check("I generator: a quarter of a period later θ ≈ 90°, flux ≈ 0 and ε ≈ +peak (flux and EMF are 90° out of phase)", near(g1.th, 90, 0.05, 3) && near(si(await figure("EMF ε"), "V"), g1.peak, 0.02, 20) && Math.abs(si(await figure("Flux per turn"), "Wb")) < 0.02 * g1.B * g1.A, `θ ${g1.th}; ${await figure("EMF ε")}; ${await figure("Flux per turn")}`);
    await generator("half period", 1 / (2 * (Number.isFinite(periods) && periods > 0 ? periods : 2)));
    await generator("three quarters", 3 / (4 * (Number.isFinite(periods) && periods > 0 ? periods : 2)));
    await setField("Field B", 0.15);
    await setField("Coil area A", 0.12);
    await setField("Turns N", 80);
    await setField("Rotation frequency", 60);
    await sleep(400);
    await generator("nondefault: B = 0.15 T, A = 0.12 m², N = 80, 60 Hz, t = 0.3", 0.3);
    const gc = await ev(`[...document.querySelectorAll('main svg[aria-label]')].map((s) => s.getAttribute('aria-label') || '')`);
    check("I generator: the coil diagram, flux graph and EMF graph all have labels", gc.filter(Boolean).length >= 3, JSON.stringify(gc).slice(0, 200));
    await shot("induction-generator-1440-dark.png", false);

    // RL circuit
    await choose("RL circuit");
    await sleep(400);
    const rl = async (label, frac) => {
      await setTime(frac);
      await sleep(350);
      const Vs = await numField("Source voltage Vs"), i0 = await numField("Initial current i₀"), R = await numField("Resistance R"), L = await numField("Inductance L");
      const tau = L / R, tt = si(await figure("Time"), "s");
      const iF = Vs / R, i = iF + (i0 - iF) * Math.exp(-tt / tau);
      const pi = si(await figure("Current i"), "A"), vl = si(await figure("Inductor voltage"), "V"), vr = si(await figure("Resistor voltage"), "V"), U = si(await figure("Stored energy"), "J");
      check(`I RL ${label}: i = Vs/R + (i₀ − Vs/R)e^(−t/τ) = ${f3(i)} A at t = ${f3(tt / tau)} τ (τ = L/R = ${f3(tau)} s)`, near(pi, i, 0.012, 1e-5), `${await figure("Current i")}`);
      check(`I RL ${label}: vR = iR, vL = Vs − iR (KVL), U = ½Li²`, near(vr, i * R, 0.02, 2e-4) && near(vl, Vs - i * R, 0.02, 2e-3) && near(U, 0.5 * L * i * i, 0.02, 1e-9), `vR ${await figure("Resistor voltage")}, vL ${await figure("Inductor voltage")}, U ${await figure("Stored energy")}`);
      return { i, tau, tt };
    };
    await rl("switch on, t = 0", 0);
    const r1 = await rl("switch on, mid", 0.25);
    await rl("switch on, late", 1);
    await click("Switch off (current decays)");
    await sleep(350);
    await rl("switch off, mid", 0.25);
    await click("Large inductor, slow");
    await sleep(350);
    const rbig = await rl("large inductor", 0.5);
    check("I RL: the large inductor has a longer time constant than the default", rbig.tau > r1.tau, `${f3(rbig.tau)} vs ${f3(r1.tau)} s`);
    await click("Reverse the source");
    await sleep(350);
    const rrev = await rl("reversed source", 0.4);
    check("I RL: reversing the source drives the current negative", rrev.i < 0 || /^-|−/.test(await figure("Current i")), await figure("Current i"));
    await setField("Source voltage Vs", 9);
    await setField("Initial current i₀", 0.1);
    await setField("Resistance R", 12);
    await setField("Inductance L", 0.3);
    await sleep(400);
    await rl("nondefault: Vs = 9 V, i₀ = 0.1 A, R = 12 Ω, L = 0.3 H", 0.35);
    await shot("induction-rl-1440-dark.png", false);

    // practice & challenge
    await choose("Practice");
    await sleep(300);
    check("I Practice shows the predict-then-observe panel", await has("Predict, then observe"));
    await choose("Challenge");
    await sleep(300);
    const ich = await ev(`[...document.querySelectorAll('[aria-label="Choose a challenge"] button')].map((b) => b.textContent.trim())`);
    check("I Challenge lists the induction challenges and starts not met", ich.length >= 3 && !/Goal met/.test(await status()), JSON.stringify(ich));
    await click(ich.find((x) => /counter-clockwise/i.test(x)) ?? ich[0]);
    await sleep(250);
    check("I Challenge 'counter-clockwise': not met at the default settings", !/Goal met/.test(await status()) && /Not yet|clockwise|loop/i.test(await status()), await status());
    await choose("Faraday & Lenz");
    await sleep(250);
    await click("Field increasing");
    await sleep(250);
    await setField("Field rate dB/dt", -0.8);
    await sleep(350);
    check("I Challenge 'counter-clockwise': dB/dt = −0.8 T/s (i = 1.0 A ccw) meets the goal", await has("Goal met"), await status());
    await click(ich.find((x) => /tip positive|1\.0 V/i.test(x)) ?? ich[1]);
    await sleep(250);
    await choose("Motional EMF");
    await setField("Velocity direction", 180);
    await setField("Speed v", 5);
    await setField("Rod length L", 0.4);
    await setField("Field Bz", 0.5);
    await setField("Rod direction", 90);
    await sleep(350);
    check("I Challenge 'tip positive at 1.0 V': v = 5 m/s at 180°, B = 0.5 T, L = 0.4 m meets the goal", await has("Goal met"), await status());
  }

  // ====================== 4b. robustness: odd values in every field must never unmount the page ======================
  if (want("fuzz")) {
    const modesOf = { [EF]: ["Field & force", "Uniform-field motion"], [MG]: ["Straight wires", "Current loop", "Solenoid", "Lorentz force", "Particle motion", "Force on a conductor"], [IN]: ["Magnetic flux", "Faraday & Lenz", "Motional EMF", "AC generator", "RL circuit"] };
    for (const [target, modes] of Object.entries(modesOf)) {
      await fresh(1440, "light", target);
      await waitSel(".ph-svg");
      for (const mode of modes) {
        await choose(mode);
        await sleep(400);
        const n = await ev(`document.querySelectorAll('.gc-field label').length`);
        const bad = [];
        for (let i = 0; i < n; i += 1) {
          const info = await ev(`(() => { const l = document.querySelectorAll('.gc-field label')[${i}]; const el = l && document.getElementById(l.htmlFor); return el ? { label: l.textContent.trim(), value: el.value } : null; })()`);
          if (!info) continue;
          for (const val of ["0", "", "-1", "1e9", "0.0000001"]) {
            const errBefore = cdp.errors.length;
            await ev(`(() => { ${NATIVE} const l = document.querySelectorAll('.gc-field label')[${i}]; const el = l && document.getElementById(l.htmlFor); if (el) set(el, ${q(val)}); })()`);
            await sleep(110);
            const alive = await ev(`!!document.querySelector('main') && document.body.innerText.length > 200`);
            if (!alive || cdp.errors.length > errBefore) { bad.push(`${info.label}=${JSON.stringify(val)}: ${cdp.errors.slice(errBefore)[0]?.split("\n")[0] ?? "page unmounted"}`); if (!alive) break; }
          }
          if (!(await ev(`!!document.querySelector('main')`))) break;
          await ev(`(() => { ${NATIVE} const l = document.querySelectorAll('.gc-field label')[${i}]; const el = l && document.getElementById(l.htmlFor); if (el) set(el, ${q(info.value)}); })()`);
          await sleep(80);
        }
        check(`F ${mode}: ${n} fields set to 0, empty, −1, 1e9 and 1e-7 one at a time: the page stays mounted with no exceptions`, bad.length === 0, bad.slice(0, 4).join(" | "));
        if (bad.length) { await fresh(1440, "light", target); await waitSel(".ph-svg"); }
      }
    }
  }

  // ====================== 5. save, reopen, invalid state, search, related learning ======================
  if (want("integration")) {
    // save and reopen each laboratory with a nondefault state
    await fresh(1440, "dark", EF);
    await waitSel(".ph-svg");
    await click("Three charges (+, +, −)");
    await setField("Probe x", 1.4);
    await setField("Probe y", -0.6);
    await setField("Test charge", -3);
    await sleep(350);
    const efBefore = { E: await figure("Field E at P"), V: await figure("Potential V at P"), chargesRows: JSON.stringify(await readCharges()) };
    await saveAs("S24 efield");
    await fresh(1440, "dark", EF, { keep: true });
    await openRecord("S24 efield");
    await waitSel(".ph-svg");
    check("S save/open Electric fields: three charges, probe and test charge restored; E and V identical", (await hash()) === EF && (await figure("Field E at P")) === efBefore.E && (await figure("Potential V at P")) === efBefore.V && JSON.stringify(await readCharges()) === efBefore.chargesRows && (await getField("Test charge")) === "-3", `${await hash()} ${await figure("Field E at P")} vs ${efBefore.E}`);

    await fresh(1440, "dark", MG, { keep: true });
    await waitSel(".ph-svg");
    await choose("Particle motion");
    await click("Electron");
    await setField("Magnetic field Bz", -0.35);
    await setField("Velocity vz", 30000);
    await sleep(350);
    const mgBefore = { r: await figure("Radius"), p: await figure("Pitch") };
    await saveAs("S24 magnetic");
    await fresh(1440, "dark", MG, { keep: true });
    await openRecord("S24 magnetic");
    await waitSel(".ph-svg");
    check("S save/open Magnetic fields: electron-in-helix state restored (scenario, Bz, vz, radius, pitch)", (await figure("Radius")) === mgBefore.r && (await figure("Pitch")) === mgBefore.p && (await getField("Magnetic field Bz")) === "-0.35" && /negative/.test(await aria()), `${await figure("Radius")} ${await figure("Pitch")}`);

    await fresh(1440, "dark", IN, { keep: true });
    await waitSel(".ph-svg");
    await choose("RL circuit");
    await setField("Source voltage Vs", 9);
    await setField("Resistance R", 12);
    await setField("Inductance L", 0.3);
    await setTime(0.4);
    await sleep(350);
    const inBefore = { i: await figure("Current i"), t: await figure("Time") };
    await saveAs("S24 induction");
    await fresh(1440, "dark", IN, { keep: true });
    await openRecord("S24 induction");
    await waitSel(".ph-svg");
    check("S save/open Induction: RL state restored (inputs and the selected time)", (await getField("Resistance R")) === "12" && (await getField("Inductance L")) === "0.3" && (await figure("Current i")) === inBefore.i, `${await figure("Current i")} vs ${inBefore.i}; time ${await figure("Time")} vs ${inBefore.t}`);

    // invalid saved state is rejected without disturbing the page
    await ev(`(async () => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('pocketchem-workspace'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const tx = db.transaction('analyses', 'readwrite'); const st = tx.objectStore('analyses');
      const keys = await new Promise((res) => { const r = st.getAllKeys(); r.onsuccess = () => res(r.result); });
      const vals = await new Promise((res) => { const r = st.getAll(); r.onsuccess = () => res(r.result); });
      let n = 0;
      keys.forEach((k, i) => { const raw = vals[i]; const isStr = typeof raw === 'string'; const v = isStr ? JSON.parse(raw) : raw; if (JSON.stringify(v).includes('S24 efield')) { const bad = (o) => { if (o && typeof o === 'object') { for (const key of Object.keys(o)) { if (key === 'charges' && Array.isArray(o[key]) && o[key][0]) { o[key][0].q = 'not a number'; n += 1; } else bad(o[key]); } } }; bad(v); st.put(isStr ? JSON.stringify(v) : v, k); } });
      await new Promise((res) => { tx.oncomplete = res; });
      window.__corrupted = n;
    })()`);
    const corrupted = await ev(`window.__corrupted`);
    await fresh(1440, "dark", EF, { keep: true });
    await waitSel(".ph-svg");
    const beforeBad = await figure("Field E at P");
    await openRecord("S24 efield");
    await sleep(800);
    const afterBad = await figure("Field E at P");
    const bodyAfter = await ev(`document.body.innerText`);
    check("S invalid saved state (a charge value replaced by text) is rejected: a notice is shown and the page is not corrupted", corrupted >= 1 && /could not|cannot|can't|invalid|unsupported|damaged|not be opened|failed/i.test(bodyAfter) && !/NaN|undefined/.test(bodyAfter), `corrupted fields: ${corrupted}; E before ${beforeBad}, after ${afterBad}; notice: ${(/(could not|cannot|can't|invalid|unsupported|damaged|not be opened|failed)[^.\n]*/i.exec(bodyAfter) ?? [""])[0]}`);

    // concept search
    await fresh(1440, "dark", "#/general/overview");
    await cdpKey("k", "KeyK", 75, 2);
    await sleep(500);
    check("S Ctrl+K opens concept search", await ev(`!!document.querySelector('.concept-search[role=dialog]')`));
    const setInput = (selector, value) => ev(`(() => { ${NATIVE} set(document.querySelector(${q(selector)}), ${q(value)}); })()`);
    const results1 = () => ev(`[...document.querySelectorAll('[data-testid=concept-result]')].map((li) => ({ title: li.querySelector('.concept-result-title').textContent, subject: li.querySelector('.concept-subject').textContent }))`);
    for (const [query, part] of [["Coulomb", "Electric fields"], ["electric field", "Electric fields"], ["equipotential", "Electric fields"], ["Lorentz force", "Magnetic fields"], ["right-hand rule", "Magnetic fields"], ["solenoid", "Magnetic fields"], ["Faraday", "Electromagnetic induction"], ["Lenz", "Electromagnetic induction"], ["motional EMF", "Electromagnetic induction"], ["generator", "Electromagnetic induction"], ["inductor", "Inductors and RL circuits"], ["magnetic flux", "Electromagnetic induction"]]) {
      await setInput("[data-testid=concept-input]", query);
      await sleep(300);
      const res = await results1();
      check(`S concept search "${query}" finds the Physics page "${part}" in the top five`, res.slice(0, 5).some((x) => x.title.toLowerCase().includes(part.toLowerCase()) && /Physics/.test(x.subject)), JSON.stringify(res.slice(0, 3)));
    }
    await setInput("[data-testid=concept-input]", "Lenz");
    await sleep(300);
    await cdpKey("Enter", "Enter", 13);
    await sleep(1500);
    check("S Enter on the Lenz result opens Electromagnetic induction", (await hash()) === IN, await hash());
    const relI = await text("[data-testid=related-concepts]");
    check("S Induction page lists related learning (Magnetic fields and RC transient)", /Magnetic fields/.test(relI) && /RC transient/.test(relI), relI.replace(/\s+/g, " ").slice(0, 240));
    await ev(`(() => { const b = [...document.querySelectorAll('[data-testid=related-concepts] button, [data-testid=related-concepts] a')].find((x) => /Magnetic fields/.test(x.textContent)); b?.click(); })()`);
    await sleep(1200);
    check("S related-learning link from Induction opens Magnetic fields & forces", (await hash()) === MG, await hash());
    const relM = await text("[data-testid=related-concepts]");
    check("S Magnetic fields page links to Electric fields and to Induction", /Electric fields/.test(relM) && /induction/i.test(relM), relM.replace(/\s+/g, " ").slice(0, 240));
    await fresh(1440, "dark", EF);
    await waitSel(".ph-svg");
    const relE = await text("[data-testid=related-concepts]");
    check("S Electric fields page links onward to Magnetic fields", /Magnetic fields/.test(relE), relE.replace(/\s+/g, " ").slice(0, 240));
  }

  // ====================== 6. layouts, themes, challenge solutions ======================
  if (want("layout")) {
    for (const [label, target] of [["efield", EF], ["magnetic", MG], ["induction", IN]]) {
      for (const [width, scheme] of [[375, "light"], [375, "dark"], [820, "light"], [820, "dark"], [1440, "light"], [1440, "dark"]]) {
        await fresh(width, scheme, target);
        await waitSel(".ph-svg");
        await sleep(500);
        const ofl = await overflow();
        check(`L ${label} at ${width}px ${scheme}: no page overflow`, ofl <= 0, `overflow ${ofl}`);
        await shot(`${label}-${width}-${scheme}.png`, width < 500);
      }
    }
    // other views at phone width, dark
    for (const [label, target, steps] of [
      ["efield potential", EF, [() => choose("Potential"), () => click("Add contour through P")]],
      ["efield motion", EF, [() => choose("Uniform-field motion"), () => setTime(1)]],
      ["efield challenge", EF, [() => choose("Challenge")]],
      ["magnetic loop", MG, [() => choose("Current loop")]],
      ["magnetic solenoid", MG, [() => choose("Solenoid")]],
      ["magnetic lorentz", MG, [() => choose("Lorentz force")]],
      ["magnetic motion helix", MG, [() => choose("Particle motion"), () => setField("Velocity vz", 40000)]],
      ["magnetic conductor", MG, [() => choose("Force on a conductor")]],
      ["induction flux", IN, [() => choose("Magnetic flux")]],
      ["induction motional", IN, [() => choose("Motional EMF")]],
      ["induction generator", IN, [() => choose("AC generator"), () => setTime(0.3)]],
      ["induction rl", IN, [() => choose("RL circuit"), () => setTime(0.4)]],
    ]) {
      for (const [w, scheme] of [[375, "dark"], [820, "light"]]) {
        await fresh(w, scheme, target);
        await waitSel(".ph-svg");
        for (const step of steps) { await step(); await sleep(250); }
        await sleep(450);
        check(`L ${label} at ${w}px ${scheme}: no horizontal overflow`, (await overflow()) <= 0, String(await overflow()));
        await shot(`${label.replace(/ /g, "-")}-${w}-${scheme}.png`, w < 500);
      }
    }
    // reduced motion
    await fresh(1440, "light", IN, { reducedMotion: true });
    await choose("RL circuit");
    await waitSel(".ph-svg");
    check("L reduced motion: the Induction transport offers Step instead of Play", await ev(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Step')) && ![...document.querySelectorAll('button')].some((b) => b.textContent.includes('▶ Play'))`));
  }

  // ====================== 7. challenge solutions for the Electric fields lab ======================
  if (want("efchallenge")) {
    await fresh(1440, "dark", EF);
    await waitSel(".ph-svg");
    await choose("Challenge");
    await sleep(300);
    const ech = await ev(`[...document.querySelectorAll('[aria-label="Choose a challenge"] button')].map((b) => b.textContent.trim())`);
    check("C Electric fields Challenge lists three challenges, all unmet by default", ech.length === 3 && !/Goal met/.test(await status()), JSON.stringify(ech));
    await click(ech[0]);
    await sleep(250);
    await choose("Field & force");
    await click("Two equal positive charges");
    await setField("Probe x", 0);
    await setField("Probe y", 0);
    await sleep(350);
    check("C 'zero field': two equal + charges, probe at the midpoint, meets the goal", await has("Goal met"), await status());
    await click(ech[2]);
    await sleep(250);
    await choose("Uniform-field motion");
    await setField("Field Ex", -8000);
    await sleep(350);
    check("C 'turn the proton around': Ex = −8000 V/m meets the goal", await has("Goal met"), await status());
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
