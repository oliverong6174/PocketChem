// Stage 21 screenshots of every view at desktop width (full page), for visual review: node scripts/browser/stage21Shots.mjs
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live21");
const { cdp, url, stop } = await startBrowser({ port: 4302, debugPort: 9462 });
const ev = (e) => cdp.evaluate(e);
const click = (label) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const choose = (label) => ev(`(() => { const o = [...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; o.click(); return true; })()`);
const shots = [
  ["waves-travel", "#/physics/waves-sound", []], ["waves-long", "#/physics/waves-sound", [() => click("Longitudinal pulse (clear compressions)")]],
  ["waves-sup-standing", "#/physics/waves-sound", [() => choose("Superposition and beats")]], ["waves-sup-beats", "#/physics/waves-sound", [() => choose("Superposition and beats"), () => click("Beats: 440 and 444 Hz sound")]],
  ["waves-standing-closed", "#/physics/waves-sound", [() => choose("Standing waves and resonance"), () => click("Closed pipe, 3rd harmonic")]],
  ["waves-doppler", "#/physics/waves-sound", [() => choose("Doppler effect"), () => click("Both approach (40 m/s each)")]],
  ["optics-real", "#/physics/geometric-optics", []], ["optics-virtual", "#/physics/geometric-optics", [() => click("Magnifying glass: inside f")]],
  ["optics-diverging", "#/physics/geometric-optics", [() => click("Diverging lens")]], ["optics-concave", "#/physics/geometric-optics", [() => click("Shaving mirror (concave)")]],
  ["optics-convex", "#/physics/geometric-optics", [() => click("Car mirror (convex)")]],
  ["optics-refraction", "#/physics/geometric-optics", [() => choose("Refraction at a boundary")]],
  ["optics-tir", "#/physics/geometric-optics", [() => choose("Refraction at a boundary"), () => click("Glass into air: total internal reflection")]],
  ["interf-double", "#/physics/interference-diffraction", []], ["interf-missing", "#/physics/interference-diffraction", [() => click("Missing orders (d = 4a)")]],
  ["interf-single", "#/physics/interference-diffraction", [() => click("Single slit")]], ["interf-grating", "#/physics/interference-diffraction", [() => click("Five-slit grating")]],
];
try {
  for (const [name, target, steps] of shots) {
    await setViewport(cdp, 1100, 900, { scheme: "light" });
    await cdp.send("Page.navigate", { url: url + target });
    await cdp.send("Page.reload").catch(() => undefined); await sleep(600);
    await waitFor(() => ev(`document.readyState === 'complete' && !!document.querySelector('.ph-svg')`), name);
    await sleep(500);
    await ev(`localStorage.clear(); true`);
    for (const s of steps) { await s(); await sleep(250); }
    await sleep(400);
    await ev(`(() => { const n = document.querySelector('.ph-diagram'); n && n.scrollIntoView(); return true; })()`);
    await screenshot(cdp, path.join(outDir, `shot-${name}.png`), { fullPage: false });
  }
} finally { stop(); }
console.log("done");
