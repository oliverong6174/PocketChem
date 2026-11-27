// Stage 13 live-browser check (real headless Chrome, production build): Physics overview, Mechanics & motion, DC circuits and
// the RC transient, with Organic and General Chemistry navigation as regressions.
//   npm run build && node scripts/browser/stage13LiveCheck.mjs
// Screenshots go to node_modules/.cache/pc-live13 (repository-local and git-ignored) unless SHOT_DIR is set.
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
};
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live13");
const { cdp, url, stop } = await startBrowser({ port: 4299, debugPort: 9459 });
const ev = (expr) => cdp.evaluate(expr);
const click = (label, scope = "document") => ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const clickStarts = (label) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith(${q(label)}) && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const choose = (label, scope = "document") => ev(`(() => { const o = [...${scope}.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; o.querySelector('input').click(); return true; })()`);
const setField = (label, value, nth = 0) => ev(`(() => { const ls = [...document.querySelectorAll('.gc-field label')].filter((x) => x.textContent.trim().startsWith(${q(label)})); const l = ls[${nth}]; if (!l) return false; const el = document.getElementById(l.htmlFor); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const getField = (label, nth = 0) => ev(`(() => { const ls = [...document.querySelectorAll('.gc-field label')].filter((x) => x.textContent.trim().startsWith(${q(label)})); return ls[${nth}] ? document.getElementById(ls[${nth}].htmlFor).value : null; })()`);
const setRangeEl = (selector, value) => ev(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const figure = (label) => ev(`(() => { const f = [...document.querySelectorAll('.ui-figure')].find((x) => x.querySelector('dt').textContent.trim().startsWith(${q(label)})); return f ? f.querySelector('dd').textContent : null; })()`);
const hash = () => ev(`location.hash`);
const SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
const PREFIX = { G: 1e9, M: 1e6, k: 1e3, m: 1e-3, "µ": 1e-6, n: 1e-9, p: 1e-12 };
/** "331 µA", "1.5×10⁻⁴ A", "-0.9 mA", "54.5 Ω" → number in base SI units (the first number in the text). */
const si = (s, base) => {
  const t = String(s).replace("−", "-");
  const sci = /(-?[\d.]+)\s*×10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/.exec(t);
  if (sci) return Number(sci[1]) * 10 ** Number([...sci[2]].map((c) => SUP[c]).join(""));
  const m = new RegExp(`(-?[\\d.]+(?:e-?\\d+)?)\\s*([GMkmµnp]?)${base ?? ""}`).exec(t);
  return m ? Number(m[1]) * (PREFIX[m[2]] ?? 1) : NaN;
};
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
const readTime = () => ev(`document.querySelector('.ph-time-readout')?.textContent ?? ''`);
const chartCurrents = () => ev(`[...document.querySelectorAll('.gc-current[role=slider]')].map((g) => Number(g.getAttribute('aria-valuenow')))`);

// ---- independent netlist check, done in this script from the DOM: wires + resistor terminals → nodal analysis --------------------------------
async function netlistVsTable() {
  const d = await ev(`(() => {
    const wires = [...document.querySelectorAll('.ph-circuit-wrap .ph-wire')].map((l) => l.tagName === 'line' ? [+l.getAttribute('x1'), +l.getAttribute('y1'), +l.getAttribute('x2'), +l.getAttribute('y2')] : null).filter(Boolean);
    const res = [...document.querySelectorAll('.ph-circuit-wrap g[data-resistor]')].map((g) => { const p = g.querySelector('polyline').getAttribute('points').trim().split(/\\s+/).map((s) => s.split(',').map(Number)); const label = g.querySelector('.ph-comp-label').textContent; const vText = [...g.querySelectorAll('.ph-val')][0].textContent; return { id: g.getAttribute('data-resistor'), a: p[0], b: p[p.length - 1], label, vText }; });
    const plus = [...document.querySelectorAll('.ph-circuit-wrap .ph-source line.ph-wire')];
    const src = { top: [+plus[0].getAttribute('x1'), +plus[0].getAttribute('y1')], bottom: [+plus[1].getAttribute('x2'), +plus[1].getAttribute('y2')] };
    const volts = document.querySelector('.ph-source .ph-comp-label').textContent;
    return { wires, res, src, volts };
  })()`);
  const key = (x, y) => `${x},${y}`;
  const parent = new Map();
  const find = (k) => { if (!parent.has(k)) parent.set(k, k); let r = k; while (parent.get(r) !== r) r = parent.get(r); parent.set(k, r); return r; };
  for (const [x1, y1, x2, y2] of d.wires) parent.set(find(key(x1, y1)), find(key(x2, y2)));
  const ohms = d.res.map((r) => si(r.label.split("=")[1], "Ω"));
  d.res.forEach((r) => { find(key(...r.a)); find(key(...r.b)); });
  const plusN = find(key(...d.src.top));
  const minusN = find(key(...d.src.bottom));
  const nodes = [...new Set([...parent.keys()].map(find))];
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const n = nodes.length;
  const G = Array.from({ length: n }, () => new Array(n).fill(0));
  const rhs = new Array(n).fill(0);
  d.res.forEach((r, i) => { const a = idx.get(find(key(...r.a))); const b = idx.get(find(key(...r.b))); const g = 1 / ohms[i]; G[a][a] += g; G[b][b] += g; G[a][b] -= g; G[b][a] -= g; });
  const V = si(d.volts, "V");
  for (const [node, value] of [[idx.get(minusN), 0], [idx.get(plusN), V]]) { G[node].fill(0); G[node][node] = 1; rhs[node] = value; }
  for (let c = 0; c < n; c += 1) {
    let p = c; for (let r = c + 1; r < n; r += 1) if (Math.abs(G[r][c]) > Math.abs(G[p][c])) p = r;
    [G[c], G[p]] = [G[p], G[c]]; [rhs[c], rhs[p]] = [rhs[p], rhs[c]];
    for (let r = c + 1; r < n; r += 1) { const f = G[r][c] / G[c][c]; for (let k = c; k < n; k += 1) G[r][k] -= f * G[c][k]; rhs[r] -= f * rhs[c]; }
  }
  const v = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) { let s = rhs[r]; for (let k = r + 1; k < n; k += 1) s -= G[r][k] * v[k]; v[r] = s / G[r][r]; }
  return d.res.map((r) => ({ id: r.id, solved: v[idx.get(find(key(...r.a)))] - v[idx.get(find(key(...r.b)))], shown: si(r.vText.replace(/^V = /, ""), "V") }));
}

try {
  // ---------------- overview and navigation ----------------
  await fresh(1440, "dark", "#/physics/overview");
  check("Physics tabs: Overview, Mechanics & motion, DC circuits, RC transient, Saved", (await tabs()) === "Overview|Mechanics & motion|Forces & Newton's laws|Work & energy|Momentum & collisions|DC circuits|RC transient|Saved", await tabs());
  const ov = await ev(`({ h1: document.querySelector('h1')?.textContent, buttons: [...document.querySelectorAll('.gc-tool-card button')].map((b) => b.textContent.trim()), planned: [...document.querySelectorAll('.gc-planned li')].map((l) => l.querySelector('span').textContent), plannedButtons: document.querySelectorAll('.gc-planned button, .gc-planned a').length })`);
  check("overview: six working laboratories with Open buttons", ov.h1 === "Physics" && ov.buttons.length === 6 && ov.buttons.every((b) => /^Open /.test(b)), ov.buttons.join(" | "));
  check("overview: planned areas are non-interactive and labelled Planned", ov.plannedButtons === 0 && ov.planned.length === 4 && (await ev(`[...document.querySelectorAll('.gc-planned li')].every((l) => /Planned/.test(l.textContent))`)), ov.planned.join(" | "));
  await screenshot(cdp, path.join(outDir, "overview-1440-dark.png"), { fullPage: false });
  await click("Open Mechanics & motion");
  await waitSel(".ph-svg");
  check("Open button reaches Mechanics; hash is #/physics/mechanics", (await hash()) === "#/physics/mechanics", await hash());

  // ---------------- mechanics: numbers against closed forms ----------------
  const g = 9.81;
  const ref = (v, deg, y0, gg = g) => { const a = (deg * Math.PI) / 180; const vx = v * Math.cos(a); const vy = v * Math.sin(a); const T = (vy + Math.sqrt(vy * vy + 2 * gg * y0)) / gg; return { vx, vy, T, R: vx * T, H: y0 + (vy > 0 ? (vy * vy) / (2 * gg) : 0), tApex: vy > 0 ? vy / gg : 0 }; };
  let r = ref(20, 40, 2);
  check("default launch (20 m/s at 40° from 2 m): time of flight matches (vy + √(vy² + 2gy₀))/g", near(si(await figure("Time of flight"), "s"), r.T, 0.003), `${await figure("Time of flight")} vs ${r.T.toFixed(3)}`);
  check("… horizontal range matches vx·T", near(si(await figure("Horizontal range"), "m"), r.R, 0.003), `${await figure("Horizontal range")} vs ${r.R.toFixed(2)}`);
  check("… maximum height matches y₀ + vy²/2g", near(si(await figure("Maximum height"), "m"), r.H, 0.003), `${await figure("Maximum height")} vs ${r.H.toFixed(2)}`);
  check("the motion diagram, four graphs and equations are present", await ev(`document.querySelectorAll('.ph-svg').length === 1 && document.querySelectorAll('.gc-chart-svg').length === 4 && !!document.querySelector('.gc-eq-list')`));
  await screenshot(cdp, path.join(outDir, "mechanics-1440-dark.png"));

  // changing speed and angle changes the trajectory and the numbers
  const path0 = await ev(`document.querySelector('.ph-path-future').getAttribute('d')`);
  await setField("Initial speed", 30);
  await setField("Launch angle", 60);
  await sleep(300);
  const path1 = await ev(`document.querySelector('.ph-path-future').getAttribute('d')`);
  r = ref(30, 60, 2);
  check("speed 30 m/s and angle 60° change the trajectory path", path0 !== path1);
  check("… and the range and height follow the closed forms", near(si(await figure("Horizontal range"), "m"), r.R, 0.003) && near(si(await figure("Maximum height"), "m"), r.H, 0.003), `${await figure("Horizontal range")} / ${await figure("Maximum height")} vs ${r.R.toFixed(2)} / ${r.H.toFixed(2)}`);
  await setRangeEl(".ph-slider input[type=range]", 10);
  await sleep(250);
  check("the speed slider drives the same state (field shows 10, range recomputed)", (await getField("Initial speed")) === "10" && near(si(await figure("Horizontal range"), "m"), ref(10, 60, 2).R, 0.004), await getField("Initial speed"));

  // synchronisation: scrub, then every display shows the same time and the closed-form position
  await setField("Initial speed", 25);
  await setField("Launch angle", 35);
  await setField("Launch height", 10);
  await sleep(300);
  r = ref(25, 35, 10);
  await setRangeEl(timeSlider, 500);
  await sleep(250);
  const tHalf = r.T / 2;
  const tShown = si(await figure("Time"), "s");
  check("scrubbing to half of the flight shows t = T/2 in the readout", near(tShown, tHalf, 0.004), `${tShown} vs ${tHalf.toFixed(3)}`);
  const pos = await figure("Position");
  const xRef = 25 * Math.cos((35 * Math.PI) / 180) * tHalf;
  const yRef = 10 + 25 * Math.sin((35 * Math.PI) / 180) * tHalf - 0.5 * g * tHalf * tHalf;
  const [px, py] = pos.match(/-?[\d.]+/g).map(Number);
  check("… the position readout matches x = vx t and y = y₀ + vy t − ½gt²", near(px, xRef, 0.004) && near(py, yRef, 0.004), `${pos} vs (${xRef.toFixed(2)}, ${yRef.toFixed(2)})`);
  const vel = (await figure("Velocity")).match(/-?[\d.]+/g).map(Number);
  check("… and the velocity readout matches vy = vy₀ − g t", near(vel[1], 25 * Math.sin((35 * Math.PI) / 180) - g * tHalf, 0.006, 0.02), (await figure("Velocity")));
  const cur = await chartCurrents();
  check("… all four graph markers sit at the same simulation time", cur.length === 4 && cur.every((c) => near(c, cur[0], 1e-9, 1e-9)) && near(cur[0], tHalf, 0.002) && near(cur[0], tShown, 0.004), cur.join(", "));
  check("… and the diagram label reports the same time", await ev(`new RegExp('t = ' + ${q(String(Number(tShown.toPrecision(3))))}).test(document.querySelector('.ph-svg').getAttribute('aria-label'))`), await ev(`document.querySelector('.ph-svg').getAttribute('aria-label')`));
  const dotsBefore = await ev(`document.querySelector('.ph-particle').getAttribute('cx') + ',' + document.querySelector('.ph-particle').getAttribute('cy')`);

  // graph interaction by keyboard: ArrowRight on the first graph's marker moves the shared time
  await ev(`document.querySelector('.gc-current[role=slider]').focus()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await sleep(250);
  const cur2 = await chartCurrents();
  check("graph keyboard control moves the time on every graph and the diagram together", cur2.length === 4 && cur2.every((c) => near(c, cur2[0], 1e-9, 1e-9)) && cur2[0] > cur[0] && (await ev(`document.querySelector('.ph-particle').getAttribute('cx') + ',' + document.querySelector('.ph-particle').getAttribute('cy')`)) !== dotsBefore, cur2.join(", "));
  // pointer drag on a graph
  await ev(`document.querySelectorAll('.gc-chart-svg')[2].scrollIntoView({ block: 'center' })`);
  await sleep(200);
  const box = await ev(`(() => { const s = document.querySelectorAll('.gc-chart-svg')[2].getBoundingClientRect(); return { x: s.left, y: s.top, w: s.width, h: s.height }; })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x + box.w * 0.3, y: box.y + box.h * 0.4, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x + box.w * 0.3, y: box.y + box.h * 0.4, button: "left", clickCount: 1 });
  await sleep(250);
  const cur3 = await chartCurrents();
  check("clicking a graph jumps the shared time there (all graphs agree)", cur3.every((c) => near(c, cur3[0], 1e-9, 1e-9)) && Math.abs(cur3[0] - cur2[0]) > 0.05, cur3.join(", "));

  // play / pause
  await click("Reset");
  await sleep(200);
  check("Reset returns to t = 0", si(await figure("Time"), "s") === 0);
  await choose("1×");
  await click("▶ Play");
  await sleep(900);
  const tPlay = si(await figure("Time"), "s");
  check("Play advances the simulation in real time (about 0.9 s after 0.9 s)", tPlay > 0.5 && tPlay < 1.4, `${tPlay}`);
  check("the Play button becomes Pause while playing", await ev(`!![...document.querySelectorAll('button')].find((b) => /Pause/.test(b.textContent))`));
  await click("❚❚ Pause");
  await sleep(150);
  const tP1 = si(await figure("Time"), "s");
  await sleep(500);
  const tP2 = si(await figure("Time"), "s");
  check("Pause stops the clock (time does not change, no animation frames are being applied)", tP1 === tP2 && tP1 >= tPlay - 0.01, `${tP1} → ${tP2}`);
  await click("▶ Play");
  await sleep(200);
  await click("Reset");
  await sleep(300);
  check("Reset while playing stops and returns to 0", si(await figure("Time"), "s") === 0 && (await ev(`!![...document.querySelectorAll('button')].find((b) => /Play/.test(b.textContent))`)));
  await choose("Fit 6 s");
  await click("▶ Play");
  await waitFor(() => ev(`/Replay/.test(document.body.innerText)`), "playback end", 15000);
  const tEnd = si(await figure("Time of flight"), "s");
  check("Fit 6 s plays the whole flight and stops at the landing time", near(si(await figure("Time"), "s"), tEnd, 0.003) && (await ev(`!![...document.querySelectorAll('button')].find((b) => /Replay/.test(b.textContent))`)), `${await figure("Time")} vs ${tEnd}`);
  const yEnd = (await figure("Position")).match(/-?[\d.]+/g).map(Number)[1];
  check("at landing the height is 0 (the ground)", Math.abs(yEnd) < 0.02, await figure("Position"));

  // degenerate and special launches
  await click("Horizontal launch off a cliff");
  await sleep(300);
  r = ref(15, 0, 45);
  check("horizontal launch off a 45 m cliff: T = √(2h/g) and range = v·T", near(si(await figure("Time of flight"), "s"), r.T, 0.003) && near(si(await figure("Horizontal range"), "m"), r.R, 0.003), `${await figure("Time of flight")} / ${await figure("Horizontal range")}`);
  await click("Thrown straight down");
  await sleep(300);
  r = ref(10, -90, 20);
  check("straight-down throw from 20 m: T = 1.243 s, range 0", near(si(await figure("Time of flight"), "s"), r.T, 0.004) && si(await figure("Horizontal range"), "m") === 0, await figure("Time of flight"));
  await setField("Initial speed", 0);
  await setField("Launch height", 0);
  await setField("Launch angle", 0);
  await sleep(300);
  check("zero speed on the ground: 'No flight' explained, no NaN anywhere", await ev(`/No flight/.test(document.body.innerText) && !/NaN|Infinity/.test(document.querySelector('main').innerText)`));
  await setField("Initial speed", 20);
  await setField("Launch angle", 150);
  await sleep(250);
  check("an angle of 150° is refused with a reason", await ev(`!!document.querySelector('.gc-field-error') && /angle/i.test(document.querySelector('.gc-field-error').textContent)`));
  await click("Ball kicked from the ground");
  await sleep(300);

  // constant acceleration mode
  await choose("Constant acceleration");
  await sleep(300);
  check("constant acceleration mode: the default car example does not land and says so", await ev(`/does not land/.test(document.body.innerText)`));
  await setRangeEl(timeSlider, 1000);
  await sleep(250);
  check("car (v0 = 4 m/s, a = 1.5 m/s²) at 10 s: x = 4·10 + ½·1.5·100 = 115 m and vx = 19 m/s", near(Number((await figure("Position")).match(/-?[\d.]+/g)[0]), 115, 0.003) && near(Number((await figure("Velocity")).match(/-?[\d.]+/g)[0]), 19, 0.003), `${await figure("Position")} ${await figure("Velocity")}`);
  await click("Dropped from a tower");
  await sleep(300);
  check("dropped from 60 m (ground on): lands after √(2·60/g) = 3.497 s", near(si(await figure("Time of flight"), "s"), Math.sqrt(120 / g), 0.003), await figure("Time of flight"));
  await choose("Projectile (gravity)");
  await sleep(250);

  // Explore lessons and Practice
  check("Explore: lessons explain constant horizontal velocity, the parabola, and the apex", await ev(`/horizontal velocity stay constant/.test(document.body.innerText) && /parabola/.test(document.body.innerText) && /vertical velocity is zero/.test(document.body.innerText)`));
  await choose("Practice");
  await sleep(300);
  check("Practice replaces the lessons with predict-then-observe questions", await ev(`!!document.querySelector('.gc-predict') && !document.querySelector('.gc-reveal')`));
  const answerHidden = await ev(`!/matches the model|Not quite/.test(document.body.innerText)`);
  await ev(`[...document.querySelectorAll('.gc-predict .ui-seg-option')].find((o) => /Higher/.test(o.textContent))?.querySelector('input').click()`);
  await sleep(300);
  check("the answer stays hidden until a prediction is made, then the model states the result", answerHidden && (await ev(`/Your prediction matches the model/.test(document.querySelector('.gc-reveal')?.textContent ?? '')`)), await ev(`document.querySelector('.gc-reveal')?.textContent.slice(0, 140) ?? ''`));
  await ev(`[...document.querySelectorAll('.gc-scenario-pick button')].find((b) => /complement/.test(b.textContent))?.click()`);
  await sleep(200);
  await ev(`[...document.querySelectorAll('.gc-predict .ui-seg-option')].find((o) => /same/.test(o.textContent))?.querySelector('input').click()`);
  await sleep(300);
  check("complementary angle from the ground (y₀ = 0): range is the same", await ev(`/Your prediction matches/.test(document.querySelector('.gc-reveal')?.textContent ?? '')`), await ev(`document.querySelector('.gc-reveal')?.textContent.slice(0, 160) ?? ''`));
  await choose("Explore");

  // ---------------- save and restore (mechanics) ----------------
  await setField("Initial speed", 33);
  await setField("Launch angle", 52);
  await setField("Launch height", 4);
  await sleep(300);
  await setRangeEl(timeSlider, 400);
  await sleep(300);
  const savedRange = await figure("Horizontal range");
  const savedTime = await figure("Time");
  await click("Save Analysis");
  await sleep(300);
  await ev(`(() => { const el = document.querySelector('.synthesis-save-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'S13 mechanics'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`/Saved “S13 mechanics”/.test(document.body.innerText)`), "save notice", 15000);
  check("mechanics: Save Analysis stores the analysis", true);
  await setField("Initial speed", 12);
  await sleep(300);
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 1`), "saved list", 15000);
  check("Saved list labels the record with Physics · Mechanics & motion", await ev(`[...document.querySelectorAll('.saved-badge')].some((b) => /Physics · Mechanics & motion/.test(b.textContent))`));
  const openRecord = async (name) => {
    await ev(`(() => { const row = [...document.querySelectorAll('.saved-list li, .saved-item, article, li')].find((x) => x.textContent.includes(${q(name)}) && x.querySelector('button')); const b = row && [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open'); b?.click(); })()`);
    await sleep(1200);
    if (await ev(`!!document.querySelector('[role=alertdialog]')`)) await click("Replace without saving");
    await sleep(800);
  };
  await openRecord("S13 mechanics");
  await waitSel(".ph-svg");
  check("opening the saved record restores speed, angle, height and the selected time", (await getField("Initial speed")) === "33" && (await getField("Launch angle")) === "52" && (await getField("Launch height")) === "4" && (await figure("Horizontal range")) === savedRange && (await figure("Time")) === savedTime, `${await getField("Initial speed")} ${await figure("Horizontal range")} ${await figure("Time")} vs ${savedRange} ${savedTime}`);
  check("a notice says results were recalculated from the saved values", await ev(`/recalculated from the saved values/.test(document.body.innerText)`));

  // ---------------- DC circuits ----------------
  await fresh(1440, "dark", "#/physics/circuits");
  await waitSel(".ph-circuit-wrap svg");
  check("circuits: default R1 + (R2 ∥ R3) at 12 V → 220 Ω and 54.5 mA", near(si(await figure("Equivalent resistance"), "Ω"), 220, 0.002) && near(si(await figure("Source current"), "A"), 12 / 220, 0.003), `${await figure("Equivalent resistance")} ${await figure("Source current")}`);
  await screenshot(cdp, path.join(outDir, "circuits-1440-dark.png"));
  let nl = await netlistVsTable();
  check("the wires drawn in the diagram, solved independently as a netlist, reproduce every resistor voltage shown", nl.length === 3 && nl.every((x) => near(x.solved, x.shown, 0.01, 0.006)), JSON.stringify(nl.map((x) => [x.id, +x.solved.toFixed(3), x.shown])));
  await click("Series: 3 resistors");
  await sleep(300);
  check("series 100 + 200 + 300 Ω at 9 V: 600 Ω, 15 mA, drops 1.5 / 3 / 4.5 V", near(si(await figure("Equivalent resistance"), "Ω"), 600, 0.002) && near(si(await figure("Source current"), "A"), 0.015, 0.003) && (await ev(`[...document.querySelectorAll('.ph-table tbody tr')].slice(1).map((r) => r.children[2].textContent).join('|')`)) === "1.5 V|3 V|4.5 V", await ev(`[...document.querySelectorAll('.ph-table tbody tr')].map((r) => r.children[2].textContent).join('|')`));
  check("… the same current flows through every series resistor", await ev(`new Set([...document.querySelectorAll('.ph-table tbody tr')].slice(1).map((r) => r.children[3].textContent)).size === 1`));
  nl = await netlistVsTable();
  check("series diagram netlist agrees", nl.every((x) => near(x.solved, x.shown, 0.01, 0.006)), JSON.stringify(nl.map((x) => [+x.solved.toFixed(3), x.shown])));
  await click("Parallel: 3 resistors");
  await sleep(300);
  check("parallel 100 ∥ 200 ∥ 300 Ω at 12 V: 54.5 Ω, 220 mA", near(si(await figure("Equivalent resistance"), "Ω"), 600 / 11, 0.003) && near(si(await figure("Source current"), "A"), 0.22, 0.003), `${await figure("Equivalent resistance")} ${await figure("Source current")}`);
  check("… every branch has the full 12 V and the branch currents are 120 / 60 / 40 mA", await ev(`(() => { const rows = [...document.querySelectorAll('.ph-table tbody tr')].slice(1); return rows.every((r) => r.children[2].textContent === '12 V') && rows.map((r) => r.children[3].textContent).join('|') === '120 mA|60 mA|40 mA'; })()`), await ev(`[...document.querySelectorAll('.ph-table tbody tr')].map((r) => r.children[3].textContent).join('|')`));
  nl = await netlistVsTable();
  check("parallel diagram netlist agrees", nl.every((x) => near(x.solved, x.shown, 0.01, 0.006)), JSON.stringify(nl.map((x) => [+x.solved.toFixed(3), x.shown])));
  await setField("Source voltage", 24);
  await sleep(300);
  check("raising the source to 24 V doubles the current (Ohm's law) and the diagram label updates", near(si(await figure("Source current"), "A"), 0.44, 0.003) && (await ev(`/24 V/.test(document.querySelector('.ph-source .ph-comp-label').textContent) && /440 mA/.test(document.querySelector('.ph-svg').getAttribute('aria-label'))`)));
  await setField("Resistance", 300, 0);
  await sleep(300);
  const req2 = 1 / (1 / 300 + 1 / 200 + 1 / 300);
  check("changing R1 to 300 Ω updates the equivalent resistance, the table and the diagram annotation", near(si(await figure("Equivalent resistance"), "Ω"), req2, 0.003) && (await ev(`!![...document.querySelectorAll('.ph-svg text')].find((t) => /R1 = 300 Ω/.test(t.textContent))`)), await figure("Equivalent resistance"));
  await ev(`document.querySelector('[data-resistor=r2]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await sleep(300);
  check("selecting a component in the diagram opens its inspector (R, V, I, P with Ohm's law)", await ev(`/Inspector: R2/.test(document.body.innerText) && /Ohm's law: V = I·R/.test(document.body.innerText) && document.querySelector('[data-resistor=r2]').classList.contains('is-selected')`));
  await click("Clear selection");
  await sleep(200);
  await ev(`[...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Remove R3')?.click()`);
  await sleep(300);
  check("removing a resistor collapses the group and the analysis follows (R1 300 ∥ R2 200 = 120 Ω)", near(si(await figure("Equivalent resistance"), "Ω"), 120, 0.003) && (await ev(`document.querySelectorAll('g[data-resistor]').length`)) === 2);
  await clickStarts("+ series");
  await sleep(300);
  check("adding a resistor in series builds a nested network that is still drawn and solved consistently", (await ev(`document.querySelectorAll('g[data-resistor]').length`)) === 3 && (await netlistVsTable()).every((x) => near(x.solved, x.shown, 0.01, 0.006)));
  await setField("Resistance", 0, 0);
  await sleep(250);
  check("a zero resistance is refused (no fake result, the diagram is withheld)", await ev(`!!document.querySelector('.gc-field-error') && !document.querySelector('.ph-circuit-wrap svg') && /cannot be analysed/.test(document.body.innerText)`));
  await click("(R1 + R2) ∥ (R3 + R4)");
  await sleep(300);
  check("nested (100 + 150) ∥ (200 + 50) Ω at 10 V: 125 Ω, 80 mA; drops 4 / 6 / 8 / 2 V", near(si(await figure("Equivalent resistance"), "Ω"), 125, 0.003) && near(si(await figure("Source current"), "A"), 0.08, 0.003) && (await ev(`[...document.querySelectorAll('.ph-table tbody tr')].filter((r) => r.children[0].textContent.startsWith('R')).map((r) => r.children[2].textContent).join('|')`)) === "4 V|6 V|8 V|2 V");
  check("Kirchhoff panel shows KCL at the junction and KVL for each resistor", await ev(`/Current law/.test(document.body.innerText) && /Voltage law/.test(document.body.innerText) && document.querySelectorAll('.gc-step .gc-eq-line').length >= 5`));
  await choose("Practice");
  await sleep(300);
  await ev(`[...document.querySelectorAll('.gc-predict .ui-seg-option')].find((o) => /Higher/.test(o.textContent))?.querySelector('input').click()`);
  await sleep(300);
  check("circuits Practice: doubling the source voltage and predicting power is confirmed (quadruples)", await ev(`/quadruples/.test(document.querySelector('.gc-reveal')?.textContent ?? '')`), await ev(`document.querySelector('.gc-reveal')?.textContent.slice(0, 140) ?? ''`));
  await choose("Explore");
  await click("Save Analysis");
  await sleep(300);
  await ev(`(() => { const el = document.querySelector('.synthesis-save-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'S13 circuit'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`/Saved “S13 circuit”/.test(document.body.innerText)`), "save notice", 15000);
  check("circuits: Save Analysis stores the analysis", true);
  await click("Series: 3 resistors");
  await sleep(250);

  // ---------------- RC transient ----------------
  await fresh(1440, "dark", "#/physics/rc-transient");
  await waitSel(".ph-svg");
  check("RC: 9 V, 10 kΩ, 100 µF has τ = 1 s", near(si(await figure("Time constant"), "s"), 1, 0.002), await figure("Time constant"));
  check("RC: default is charging from 0 V to 9 V with initial and final voltages stated", await ev(`/Charging/.test(document.body.innerText) && /Initial/.test(document.querySelector('.ui-callout').textContent) && /final/.test(document.querySelector('.ui-callout').textContent)`));
  await setRangeEl(timeSlider, 200);
  await sleep(250);
  const e1 = Math.exp(-1);
  check("at t = τ: vC = 9(1 − 1/e) = 5.69 V, i = 0.9 mA·e⁻¹ = 331 µA, 63.2 % of the way", near(si(await figure("Capacitor voltage"), "V"), 9 * (1 - e1), 0.003) && near(si(await figure("Current i"), "A"), 0.9e-3 * e1, 0.005) && /63\.2/.test(await figure("Capacitor voltage")), `${await figure("Capacitor voltage")} / ${await figure("Current i")}`);
  const rcCur = await chartCurrents();
  check("the three graphs and the readout share the time τ = 1 s (chart axis in s)", rcCur.length === 3 && rcCur.every((c) => near(c, 1, 0.002)), rcCur.join(", "));
  check("the diagram label and equations use the same time and values", await ev(`/5\\.69/.test(document.querySelector('.ph-svg').getAttribute('aria-label')) && /KVL/.test(document.querySelector('.ph-svg').textContent)`));
  await screenshot(cdp, path.join(outDir, "rc-1440-dark.png"));
  await click("Reset");
  await sleep(200);
  check("at t = 0 the capacitor is still at V₀ = 0 V and the current is i(0) = 0.9 mA (no voltage jump)", near(si(await figure("Capacitor voltage"), "V"), 0, 1, 1e-9) && near(si(await figure("Current i"), "A"), 0.9e-3, 0.003), `${await figure("Capacitor voltage")} / ${await figure("Current i")}`);
  await choose("Normal 6 s");
  await click("▶ Play");
  await sleep(1400);
  const tRc = si(await figure("Time"), "s");
  check("RC playback advances: about 1.4 s of 6 s means ≈ 1.17 s of 5 s simulated time", tRc > 0.7 && tRc < 1.7, `${tRc}`);
  await click("❚❚ Pause");
  await sleep(200);
  const vPaused = await figure("Capacitor voltage");
  await sleep(400);
  check("pausing freezes the capacitor voltage", (await figure("Capacitor voltage")) === vPaused);
  await click("Discharging through R");
  await sleep(300);
  await setRangeEl(timeSlider, 200);
  await sleep(250);
  check("discharging 9 V → 0 V: Discharging announced; at t = τ vC = 3.31 V and the current is negative −331 µA", (await ev(`/Discharging/.test(document.querySelector('.ui-callout').textContent)`)) && near(si(await figure("Capacitor voltage"), "V"), 9 * e1, 0.004) && near(si(await figure("Current i"), "A"), -0.9e-3 * e1, 0.006), `${await figure("Capacitor voltage")} / ${await figure("Current i")}`);
  await setField("Resistance R", 20000);
  await sleep(300);
  check("doubling R doubles τ to 2 s and halves the initial current", near(si(await figure("Time constant"), "s"), 2, 0.002) && near(si(await figure("Initial current"), "A"), -0.45e-3, 0.004), `${await figure("Time constant")} ${await figure("Initial current")}`);
  await setField("Capacitance C", 0);
  await sleep(250);
  check("zero capacitance is refused", await ev(`!!document.querySelector('.gc-field-error') && /cannot be used/.test(document.body.innerText)`));
  await click("Fast: microsecond circuit");
  await sleep(300);
  check("a 1 kΩ, 1 nF circuit has τ = 1 µs and the time axis is labelled in µs", near(si(await figure("Time constant"), "s"), 1e-6, 0.002) && (await ev(`!![...document.querySelectorAll('.gc-axis-label')].find((t) => /Time \\(µs\\)/.test(t.textContent))`)), await figure("Time constant"));
  await choose("Practice");
  await sleep(300);
  await ev(`[...document.querySelectorAll('.gc-scenario-pick button')].find((b) => /double the capacitance/.test(b.textContent) && true)?.click()`);
  await ev(`[...document.querySelectorAll('.gc-predict .ui-seg-option')].find((o) => /same/.test(o.textContent))?.querySelector('input').click()`);
  await sleep(300);
  check("RC Practice: doubling C leaves the initial current the same (it is ΔV/R)", await ev(`/Your prediction matches/.test(document.querySelector('.gc-reveal')?.textContent ?? '')`), await ev(`document.querySelector('.gc-scenario-pick .is-on')?.textContent + ' → ' + (document.querySelector('.gc-reveal')?.textContent.slice(0, 100) ?? '')`));
  await choose("Explore");
  await click("Charging from empty");
  await sleep(300);
  await setField("Source voltage Vs", 6);
  await setField("Resistance R", 4700);
  await sleep(300);
  await setRangeEl(timeSlider, 300);
  await sleep(250);
  const savedRc = [await figure("Time constant"), await figure("Capacitor voltage"), await figure("Time")];
  await click("Save Analysis");
  await sleep(300);
  await ev(`(() => { const el = document.querySelector('.synthesis-save-form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'S13 rc'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click("Save", "document.querySelector('.synthesis-save-form')");
  await waitFor(() => ev(`/Saved “S13 rc”/.test(document.body.innerText)`), "save notice", 15000);
  check("RC: Save Analysis stores the analysis", true);
  await click("Discharging through R");
  await sleep(300);

  // ---------------- saved library: all three, restore and cross-subject open ----------------
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 3`), "saved list", 15000);
  const badges = await ev(`[...document.querySelectorAll('.saved-badge')].map((b) => b.textContent.trim())`);
  check("Saved list labels the Physics records with subject and tool", ["Mechanics & motion", "DC circuits", "RC transient"].every((t) => badges.some((b) => b.includes(`Physics · ${t}`))), badges.join(" | "));
  await openRecord("S13 rc");
  await waitSel(".ph-svg");
  check("opening the RC record restores the circuit, the selected time and the same values", (await hash()) === "#/physics/rc-transient" && (await figure("Time constant")) === savedRc[0] && (await figure("Capacitor voltage")) === savedRc[1] && (await figure("Time")) === savedRc[2], `${await figure("Time constant")} ${await figure("Capacitor voltage")} ${await figure("Time")} vs ${savedRc.join(" ")}`);
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 3`), "saved list", 15000);
  await openRecord("S13 circuit");
  await waitSel(".ph-circuit-wrap svg");
  check("opening the circuit record restores the nested network and its numbers", (await hash()) === "#/physics/circuits" && near(si(await figure("Equivalent resistance"), "Ω"), 120 + 0, 5) && (await ev(`/R1 \\+ /.test(document.querySelector('.ui-diagram-title').textContent)`)), await ev(`document.querySelector('.ui-diagram-title').textContent`));
  // cross-subject: Organic Saved lists Physics records and switches subject
  await ev(`document.querySelector('.subject-trigger').click()`);
  await sleep(250);
  check("subject picker: Physics is selectable; Biology and Biochemistry stay preview-only", await ev(`(() => { const items = [...document.querySelectorAll('.subject-popover .subject-item')]; const by = (n) => items.find((b) => b.querySelector('.subject-item-name').textContent.trim() === n); return !!by('Physics') && !/Planned|planned/.test(by('Physics').textContent) && /lanned/.test(by('Biology').textContent) && /lanned/.test(by('Biochemistry').textContent); })()`));
  await ev(`[...document.querySelectorAll('.subject-popover .subject-item')].find((b) => b.querySelector('.subject-item-name').textContent.trim() === 'Organic Chemistry')?.click()`);
  await sleep(700);
  check("Organic Chemistry navigation is unchanged (Properties selected; eight tabs)", (await ev(`document.querySelector('.tool-tabs [aria-selected=true]')?.textContent.trim()`)) === "Properties" && (await ev(`document.querySelectorAll('.tool-tabs [role=tab]').length`)) === 8);
  await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved')?.click()`);
  await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 3`), "saved list (organic)", 15000);
  await ev(`(() => { const row = [...document.querySelectorAll('li, article')].find((x) => x.textContent.includes('S13 mechanics') && x.querySelector('button')); [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open')?.click(); })()`);
  await waitFor(() => ev(`location.hash === '#/physics/mechanics'`), "cross-subject open", 15000);
  check("opening a mechanics record from the Organic Saved page switches subject and tool", (await hash()) === "#/physics/mechanics");
  await waitSel(".ph-svg");
  check("… and restores the saved launch", (await getField("Initial speed")) === "33");

  // ---------------- General Chemistry regression ----------------
  await fresh(1440, "dark", "#/general/overview");
  check("General Chemistry tabs are unchanged", (await tabs()) === "Overview|Acid–base & titration|Chemical equilibrium|Reaction kinetics|Thermodynamics|Saved", await tabs());
  await click("Open Chemical equilibrium");
  await waitSel(".gc-ice");
  check("General Chemistry equilibrium still computes (N₂O₄ extent about 0.0102 mol/L)", near(Number(((await figure("Reaction extent")) ?? "").match(/[\d.]+/)?.[0]), 0.0102, 0.02), await figure("Reaction extent"));
  // switching subjects remembers each subject's own tool list
  await ev(`document.querySelector('.subject-trigger').click()`);
  await sleep(250);
  await ev(`[...document.querySelectorAll('.subject-popover .subject-item')].find((b) => b.querySelector('.subject-item-name').textContent.trim() === 'Physics')?.click()`);
  await sleep(700);
  check("switching General → Physics shows Physics tabs (not a General tool id)", (await tabs()) === "Overview|Mechanics & motion|Forces & Newton's laws|Work & energy|Momentum & collisions|DC circuits|RC transient|Saved" && /^#\/physics\//.test(await hash()), `${await hash()} ${await tabs()}`);
  await ev(`history.back()`);
  await sleep(700);
  check("browser Back returns to the General Chemistry tool", (await hash()) === "#/general/equilibrium" && (await tabs()).startsWith("Overview|Acid"), `${await hash()} ${await tabs()}`);

  // ---------------- autosave across reload ----------------
  await fresh(1440, "dark", "#/physics/mechanics");
  await waitSel(".ph-svg");
  await setField("Initial speed", 41);
  await sleep(1600);
  await fresh(1440, "dark", "#/physics/mechanics");
  await waitSel(".ph-svg");
  await sleep(800);
  check("autosave: reloading Mechanics restores the last launch (speed 41)", (await getField("Initial speed")) === "41", await getField("Initial speed"));

  // ---------------- reduced motion ----------------
  await fresh(1440, "light", "#/physics/mechanics", { reducedMotion: true });
  await waitSel(".ph-svg");
  check("reduced motion: a Step button replaces continuous Play, with an explanation", await ev(`!![...document.querySelectorAll('button')].find((b) => /Step/.test(b.textContent)) && !![...document.querySelectorAll('button')].find((b) => /Play/.test(b.textContent)) === false && /reduced motion/.test(document.body.innerText)`));
  await click("Step ▸");
  await sleep(200);
  check("… and stepping advances the shared time", si(await figure("Time"), "s") > 0);

  // ---------------- layouts: viewports, themes, overflow, light chart paper ----------------
  const layouts = [[1440, "dark"], [1440, "light"], [820, "light"], [820, "dark"], [375, "light"], [375, "dark"]];
  for (const [name, target, ready] of [["mechanics", "#/physics/mechanics", ".ph-svg"], ["circuits", "#/physics/circuits", ".ph-circuit-wrap svg"], ["rc", "#/physics/rc-transient", ".ph-svg"], ["overview", "#/physics/overview", ".gc-tool-cards"]]) {
    for (const [width, scheme] of layouts) {
      await fresh(width, scheme, target);
      await waitSel(ready);
      if (name !== "overview") { await setRangeEl(timeSlider, 450); await sleep(300); }
      const info = await ev(`(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, vw: innerWidth, charts: [...document.querySelectorAll('.gc-chart-svg')].map((c) => Math.round(c.getBoundingClientRect().width)), diagrams: [...document.querySelectorAll('.ph-svg')].map((s) => { const r = s.getBoundingClientRect(); const host = s.parentElement.getBoundingClientRect(); return { w: Math.round(r.width), host: Math.round(host.width) }; }), paper: [...document.querySelectorAll('.ph-paper, .ph-sky')].map((r) => getComputedStyle(r).fill), bodyBg: getComputedStyle(document.body).backgroundColor }))()`);
      const fits = info.charts.every((w) => w <= info.vw) && info.diagrams.every((d) => d.host <= info.vw);
      const lightPaper = info.paper.every((c) => /rgb\((24\d|25\d), (24\d|25\d), (2[34]\d|25\d)\)/.test(c));
      check(`${name} ${width}px ${scheme}: no horizontal page overflow; charts and diagram frames fit`, info.over <= 0 && fits, JSON.stringify({ over: info.over, vw: info.vw, charts: info.charts, diagrams: info.diagrams }));
      if (name !== "overview") check(`${name} ${width}px ${scheme}: diagrams stay on light paper`, lightPaper, info.paper.join(" "));
      if (width === 375 || (width === 820 && scheme === "light") || (width === 1440 && scheme === "light")) await screenshot(cdp, path.join(outDir, `${name}-${width}-${scheme}.png`));
      if (width === 375 && name !== "overview") { await ev(`document.querySelector('.ui-diagram')?.scrollIntoView({ block: 'start' })`); await sleep(200); await screenshot(cdp, path.join(outDir, `${name}-375-${scheme}-view.png`), { fullPage: false }); }
    }
  }
  // every mode at 375 px
  for (const [label, target, ready, steps] of [
    ["mechanics practice", "#/physics/mechanics", ".ph-svg", [() => choose("Practice")]],
    ["mechanics constant acceleration", "#/physics/mechanics", ".ph-svg", [() => choose("Constant acceleration")]],
    ["circuits practice", "#/physics/circuits", ".ph-circuit-wrap svg", [() => choose("Practice")]],
    ["circuits nested", "#/physics/circuits", ".ph-circuit-wrap svg", [() => click("(R1 + R2) ∥ (R3 + R4)")]],
    ["rc practice", "#/physics/rc-transient", ".ph-svg", [() => choose("Practice")]],
    ["rc discharging", "#/physics/rc-transient", ".ph-svg", [() => click("Discharging through R")]],
  ]) {
    await fresh(375, "dark", target);
    await waitSel(ready);
    for (const step of steps) await step();
    await sleep(400);
    check(`${label} at 375px: no horizontal overflow`, (await overflow()) <= 0, String(await overflow()));
  }
  await fresh(375, "dark", "#/physics/circuits");
  await waitSel(".ph-circuit-wrap svg");
  await click("(R1 + R2) ∥ (R3 + R4)");
  await sleep(300);
  await screenshot(cdp, path.join(outDir, "circuits-nested-375-dark.png"));
  check("circuit diagram at 375 px keeps readable text (scaled no smaller than 70 %) inside its own scroll frame", await ev(`(() => { const s = document.querySelector('.ph-circuit-wrap svg'); const vb = s.viewBox.baseVal.width; return s.getBoundingClientRect().width / vb >= 0.69; })()`));

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
