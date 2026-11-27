// Stage 24 diagram screenshots: every scientific diagram frame is captured on its own (element clip) for visual review.
//   node scripts/browser/stage24Shots.mjs [width] [scheme] [filterSubstring]      → node_modules/.cache/pc-shots24
import fs from "node:fs";
import path from "node:path";
import { q, root, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";
const width = Number(process.argv[2] ?? 1440), scheme = process.argv[3] ?? "light", only = process.argv[4] ?? "";
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-shots24");
fs.mkdirSync(outDir, { recursive: true });
const { cdp, url, stop } = await startBrowser({ port: 4305, debugPort: 9465 });
const ev = (e) => cdp.evaluate(e);
const NATIVE = `const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };`;
const click = (label) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const choose = (label) => ev(`(() => { const o = [...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; o.querySelector('input').click(); return true; })()`);
const setField = (label, value) => ev(`(() => { ${NATIVE} const l = [...document.querySelectorAll('.gc-field label')].find((x) => x.textContent.trim().startsWith(${q(label)})); if (!l) return false; set(document.getElementById(l.htmlFor), ${q(String(value))}); return true; })()`);
const setTime = (f) => ev(`(() => { ${NATIVE} const el = document.querySelector('input[type=range][id$="-t"]'); if (!el) return false; set(el, String(Number(el.min) + (Number(el.max) - Number(el.min)) * ${f})); return true; })()`);
const EF = "#/physics/electric-fields", MG = "#/physics/magnetic-fields", IN = "#/physics/induction";
const shots = [
  ["ef-dipole", EF, []],
  ["ef-dipole-contours-only", EF, [() => click("Dipole (+2 nC and −2 nC)"), () => choose("Potential"), () => click("Add contour through P")]],
  ["ef-three", EF, [() => click("Three charges (+, +, −)")]],
  ["ef-single-contour", EF, [() => click("Single positive charge"), () => choose("Potential"), () => click("Add contour through P")]],
  ["ef-dipole-contours", EF, [() => click("Dipole (+2 nC and −2 nC)"), () => choose("Potential"), () => click("Add contour through P"), () => setField("Probe y", 0.5), () => click("Add contour through P")]],
  ["ef-motion-proton", EF, [() => choose("Uniform-field motion"), () => setTime(1)]],
  ["ef-motion-electron", EF, [() => choose("Uniform-field motion"), () => click("Electron"), () => setTime(1)]],
  ["mg-wire-out", MG, []],
  ["mg-wire-in", MG, [() => click("One wire, current into the screen")]],
  ["mg-wire-two-opp", MG, [() => click("Two wires, opposite directions")]],
  ["mg-wire-three", MG, [() => click("Three wires")]],
  ["mg-loop", MG, [() => choose("Current loop")]],
  ["mg-solenoid", MG, [() => choose("Solenoid")]],
  ["mg-lorentz", MG, [() => choose("Lorentz force")]],
  ["mg-lorentz-electron", MG, [() => choose("Lorentz force"), () => click("Electron")]],
  ["mg-motion-proton", MG, [() => choose("Particle motion"), () => setTime(0.4)]],
  ["mg-motion-electron", MG, [() => choose("Particle motion"), () => click("Electron"), () => setTime(0.4)]],
  ["mg-motion-helix", MG, [() => choose("Particle motion"), () => click("Add motion along B (helix)"), () => setTime(0.6)]],
  ["mg-conductor", MG, [() => choose("Force on a conductor")]],
  ["in-flux", IN, [() => choose("Magnetic flux")]],
  ["in-faraday-inc", IN, [() => click("Field increasing"), () => setTime(0.5)]],
  ["in-faraday-dec", IN, [() => click("Field decreasing"), () => setTime(0.5)]],
  ["in-faraday-turning", IN, [() => click("Loop turning in a steady field"), () => setTime(0.4)]],
  ["in-motional", IN, [() => choose("Motional EMF")]],
  ["in-generator", IN, [() => choose("AC generator"), () => setTime(0.3)]],
  ["in-rl-on", IN, [() => choose("RL circuit"), () => setTime(0.3)]],
  ["in-rl-off", IN, [() => choose("RL circuit"), () => click("Switch off (current decays)"), () => setTime(0.3)]],
];
try {
  for (const [name, target, steps] of shots) {
    if (only && !name.includes(only)) continue;
    await setViewport(cdp, width, width < 500 ? 812 : width < 1000 ? 1024 : 900, { scheme });
    await cdp.send("Page.navigate", { url: url + "?c=" + name + "#/physics/overview" });
    await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
    await ev(`(async () => { try { localStorage.clear(); sessionStorage.clear(); const dbs = (await indexedDB.databases?.()) ?? []; await Promise.all(dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); }))); } catch { /* ignore */ } })()`);
    await cdp.send("Page.navigate", { url: url + "?s=" + name + target });
    await waitFor(() => ev(`document.readyState === 'complete' && !!document.querySelector('.ph-svg, main svg')`), name);
    await sleep(700);
    for (const s of steps) { await s(); await sleep(300); }
    await sleep(500);
    const n = await ev(`document.querySelectorAll('.ph-diagram').length`);
    for (let i = 0; i < n; i += 1) {
      await ev(`document.querySelectorAll('.ph-diagram')[${i}].scrollIntoView({ block: 'start' })`);
      await sleep(250);
      const r = await ev(`(() => { const b = document.querySelectorAll('.ph-diagram')[${i}].getBoundingClientRect(); return { x: Math.max(0, b.x) + scrollX, y: Math.max(0, b.y) + scrollY, width: Math.min(b.width, innerWidth), height: Math.min(b.height, 1400) }; })()`);
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...r, scale: 1 } });
      fs.writeFileSync(path.join(outDir, `${name}-${width}-${scheme}-${i}.png`), Buffer.from(data, "base64"));
    }
    console.log(name, n, "diagrams", cdp.errors.length ? "ERRORS " + cdp.errors[0] : "");
  }
} finally { stop(); }
console.log("done");
