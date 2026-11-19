// Stage 21 live-browser check (real headless Chrome, production build): Waves & sound, Geometric optics, Interference & diffraction.
//   npm run build && node scripts/browser/stage21LiveCheck.mjs
// Screenshots go to node_modules/.cache/pc-live21 (repository-local and git-ignored) unless SHOT_DIR is set.
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
};
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live21");
const { cdp, url, stop } = await startBrowser({ port: 4301, debugPort: 9461 });
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

const key = (selector, k) => ev(`(() => { const el = document.querySelector(${q(selector)}); if (!el) return false; el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: ${q(k)}, bubbles: true })); return true; })()`);
const has = (text) => ev(`document.querySelector('main').innerText.includes(${q(text)})`);
const timeText = () => ev(`document.querySelector('.ph-time-readout')?.textContent ?? ''`);
const status = () => ev(`document.querySelector('[data-testid=challenge-status]')?.textContent ?? ''`);
const aria = () => ev(`document.querySelector('.ph-svg').getAttribute('aria-label')`);

try {
  // ---------------- navigation ----------------
  await fresh(1440, "dark", "#/physics/overview");
  const tb = await tabs();
  check("Physics tabs include the three new laboratories in order", tb === "Overview|Mechanics & motion|Forces & Newton's laws|Work & energy|Momentum & collisions|Waves & sound|Geometric optics|Interference & diffraction|Electric fields & potential|Magnetic fields & forces|Electromagnetic induction|DC circuits|RC transient|Saved", tb);
  const groups = await ev(`[...document.querySelectorAll('.tool-group-label')].map((x) => x.textContent.trim()).join('|')`);
  check("the tab bar has a 'Waves & optics' group between Mechanics and Electricity", groups === "Analyze|Mechanics|Waves & optics|Electromagnetism|Electricity|Library", groups);
  const ov = await ev(`({ headings: [...document.querySelectorAll('.ph-group-heading')].map((h) => h.textContent), buttons: [...document.querySelectorAll('.gc-tool-card button')].map((b) => b.textContent.trim()), planned: [...document.querySelectorAll('.gc-planned li')].map((x) => x.textContent), plannedButtons: document.querySelectorAll('.gc-planned button').length })`);
  check("overview: twelve laboratories under four headings (Stage 24 added Electromagnetism), planned areas without buttons and without 'Waves and optics'", ov.buttons.length === 12 && ov.headings.join() === "Mechanics,Waves & optics,Electromagnetism,Electricity" && ov.plannedButtons === 0 && !ov.planned.some((p) => /Waves and optics/.test(p)), JSON.stringify(ov));
  await screenshot(cdp, path.join(outDir, "overview-1440-dark.png"), { fullPage: false });
  for (const [label, slug] of [["Waves & sound", "waves-sound"], ["Geometric optics", "geometric-optics"], ["Interference & diffraction", "interference-diffraction"]]) {
    await click(`Open ${label}`);
    await waitSel(".ph-svg");
    check(`Open button reaches ${label}; hash is #/physics/${slug}`, (await hash()) === `#/physics/${slug}`, await hash());
    await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Overview').click()`);
    await sleep(500);
  }

  // ---------------- waves: traveling wave ----------------
  await fresh(1440, "dark", "#/physics/waves-sound");
  await waitSel(".ph-svg");
  check("traveling wave default: lambda = v/f = 4/2 = 2 m, T = 0.5 s", si(await figure("Wavelength"), "m") === 2 && near(si(await figure("Period"), "s"), 0.5, 0.001), `${await figure("Wavelength")} / ${await figure("Period")}`);
  check("greatest particle speed omega A = 4 pi x 0.1 = 1.2566 m/s, distinct from the 4 m/s wave speed", near(si(await figure("Greatest particle speed"), "m/s"), 1.2566, 0.005) && near(si(await figure("Wave speed"), "m/s"), 4, 0.001), await figure("Greatest particle speed"));
  check("diagram is labelled for assistive technology with the wave quantities", /Transverse wave at t = 0 s: wavelength 2 m/.test(await aria()), await aria());
  const t0 = await timeText();
  await click("▶ Play");
  await sleep(900);
  await click("❚❚ Pause");
  const t1 = await timeText();
  check("Play advances the shared clock and Pause stops it", t0 !== t1 && nums(t1)[0] > 0, `${t0} -> ${t1}`);
  await sleep(500);
  check("paused: the clock stays still", (await timeText()) === t1);
  await setRangeEl(timeSlider, 500);
  await sleep(250);
  check("scrubbing the slider to the middle shows half of the 1.5 s axis (0.75 s)", near(nums(await timeText())[0], 0.75, 0.03), await timeText());
  await choose("Longitudinal");
  await sleep(300);
  check("longitudinal view draws the particle band and the density curve", /Longitudinal wave at t/.test(await aria()) && (await ev(`document.querySelector('.ph-svg').textContent.includes('density')`)));
  await click("Sound in air, 440 Hz");
  await sleep(300);
  check("sound preset: lambda = 343/440 = 0.7795 m", near(si(await figure("Wavelength"), "m"), 0.7795, 0.002), await figure("Wavelength"));
  await setField("Amplitude", 5);
  await sleep(300);
  check("an amplitude above 0.15 lambda is refused with a reason", (await has("These values cannot be used")) && (await has("small-amplitude")), "");
  await click("Rope wave");
  await sleep(300);

  // ---------------- waves: superposition ----------------
  await choose("Superposition and beats");
  await sleep(400);
  check("default superposition is a true standing wave", (await has("Standing wave")) && (await aria()).includes("Standing wave"));
  await click("Partly standing (unequal amplitudes)");
  await sleep(300);
  check("unequal amplitudes: labelled 'Partly standing wave (not a true standing wave)', minimum 0.05 m", (await has("Partly standing wave (not a true standing wave)")) && near(si(await figure("Smallest amplitude"), "m"), 0.05, 0.01), await figure("Smallest amplitude"));
  await click("Constructive (same direction)");
  await sleep(300);
  check("same direction in phase: amplitude 0.2 m and NOT a standing wave", near(si(await figure("Largest amplitude"), "m"), 0.2, 0.005) && !(await aria()).includes("Standing wave"), await figure("Largest amplitude"));
  await click("Destructive (180° apart)");
  await sleep(300);
  check("180 degrees apart: the waves cancel (largest amplitude 0)", si(await figure("Largest amplitude"), "m") === 0, await figure("Largest amplitude"));
  await click("Beats: 440 and 444 Hz sound");
  await sleep(400);
  check("440 + 444 Hz: 4 beats per second and the envelope graph is drawn", (await has("Beats at 4")) && near(si(await figure("Beat frequency"), "Hz"), 4, 0.001) && (await has("Disturbance at x = 0")), await figure("Beat frequency"));

  // ---------------- waves: standing waves ----------------
  await choose("Standing waves and resonance");
  await sleep(300);
  await click("Closed pipe, 3rd harmonic");
  await sleep(400);
  check("closed pipe L = 0.85 m, v = 340 m/s, n = 3: f = 3 x 340/(4 x 0.85) = 300 Hz", near(si(await figure("Frequency of harmonic 3"), "Hz"), 300, 0.002), await figure("Frequency of harmonic 3"));
  const evenDisabled = await ev(`[...document.querySelectorAll('.ph-harmonics button')].filter((b) => b.disabled).map((b) => b.textContent.trim()).slice(0, 3).join()`);
  check("a closed pipe disables even harmonics", evenDisabled === "n = 2,n = 4,n = 6", evenDisabled);
  await setField("Driving frequency", 300);
  await sleep(250);
  check("driving at 300 Hz is a resonance of harmonic 3", /Resonance: 300 Hz matches harmonic 3/.test(await ev(`document.querySelector('[data-testid=resonance]').textContent`)));
  await setField("Driving frequency", 350);
  await sleep(250);
  check("driving at 350 Hz is not a resonance", /No resonance/.test(await ev(`document.querySelector('[data-testid=resonance]').textContent`)));
  await choose("Pipe open at both ends");
  await sleep(300);
  check("switching to an open pipe re-enables the even harmonics", (await ev(`[...document.querySelectorAll('.ph-harmonics button')].filter((b) => b.disabled).length`)) === 0);

  // ---------------- waves: Doppler ----------------
  await choose("Doppler effect");
  await sleep(300);
  await click("Ambulance approaching (30 m/s)");
  await sleep(400);
  check("ambulance at 30 m/s: f' = 440 x 343/313 = 482.2 Hz", near(si(await figure("Observed frequency"), "Hz"), (440 * 343) / 313, 0.001), await figure("Observed frequency"));
  const counted = await ev(`[...document.querySelectorAll('.ui-figure')].find((f) => f.querySelector('dt').textContent.startsWith('Wavefronts received')).textContent`);
  check("counting wavefront arrivals gives the same ratio as the formula (343/313 = 1.096)", near(nums(counted).at(-1), 343 / 313, 0.006), counted);
  await click("Ambulance receding");
  await sleep(300);
  check("receding at 30 m/s: f' = 440 x 343/373 = 404.6 Hz (lower)", near(si(await figure("Observed frequency"), "Hz"), (440 * 343) / 373, 0.001), await figure("Observed frequency"));
  await click("Both approach (40 m/s each)");
  await sleep(300);
  check("both approaching at 40 m/s: f' = 440 x 383/303 = 556.2 Hz", near(si(await figure("Observed frequency"), "Hz"), (440 * 383) / 303, 0.001), await figure("Observed frequency"));
  await setField("Source velocity", 343);
  await sleep(300);
  check("a source at the speed of sound is refused (shock wave), not shown as a number", (await has("shock wave")) && !(await has("Observed frequency")), "");
  await setField("Source velocity", 40);
  await sleep(200);

  // ---------------- waves: practice and challenge ----------------
  await choose("Practice");
  await sleep(300);
  check("Practice shows the predict-then-observe panel for the Doppler view", await has("Predict, then observe"));
  await choose("Challenge");
  await sleep(300);
  check("Challenge lists the design tasks", (await has("Tune a string to 220 Hz")) && (await has("Not yet")));
  await click("Tune a string to 220 Hz");
  await sleep(500);
  check("picking a task switches to the view it needs (Standing waves)", await ev(`!!document.querySelector('.ph-harmonics')`));
  await choose("String fixed at both ends");
  await setField("Length L", 0.6);
  await setField("Wave speed on the string", 264);
  await click("n = 1");
  await sleep(400);
  check("L = 0.6 m, v = 264 m/s, n = 1 meets the challenge and the status quotes 220 Hz", (await has("Goal met")) && /220/.test(await status()), await status());
  await setField("Length L", 0.9);
  await sleep(300);
  check("changing the length un-meets it (146.7 Hz)", (await has("Not yet")) && /147/.test(await status()), await status());
  await choose("Explore");

  // ---------------- persistence: save, reload, reopen ----------------
  await choose("Doppler effect");
  await click("Observer walks toward a siren (30 m/s)");
  await sleep(300);
  await saveAs("Stage 21 Doppler check");
  await fresh(1440, "dark", "#/physics/saved");
  await sleep(500);
  await openRecord("Stage 21 Doppler check");
  await waitSel(".ph-svg");
  check("opening the saved analysis returns to Waves & sound in the Doppler view with the saved motion", (await hash()).includes("waves-sound") && near(si(await figure("Observed frequency"), "Hz"), (440 * 373) / 343, 0.002), `${await hash()} ${await figure("Observed frequency")}`);
  await fresh(1440, "dark", "#/physics/waves-sound");
  await waitSel(".ph-svg");
  await choose("Standing waves and resonance");
  await click("Open pipe, 2nd harmonic");
  await setField("Length L", 0.75);
  await sleep(1800);
  await fresh(1440, "dark", "#/physics/waves-sound");
  await waitSel(".ph-svg");
  await sleep(1000);
  check("autosave: reloading restores the last view and length (open pipe, L = 0.75 m, harmonic 2 = 453.3 Hz)", (await getField("Length L")) === "0.75" && near(si(await figure("Frequency of harmonic 2"), "Hz"), 340 / 0.75, 0.002), await getField("Length L"));

  // ---------------- optics ----------------
  await fresh(1440, "dark", "#/physics/geometric-optics");
  await waitSel(".ph-svg");
  check("converging lens f = 10 cm, object at 25 cm: s' = 16.7 cm real, m = -0.667", near(si(await figure("Image distance"), "cm"), 50 / 3, 0.003) && near(nums(await figure("Magnification"))[0], -0.667, 0.003) && (await has("Real, inverted, reduced image")), await figure("Image distance"));
  await key(".ph-drag-handle", "ArrowLeft");
  await sleep(300);
  check("the object moves with the keyboard (25 -> 26 cm) and the image follows (260/16 = 16.25 cm)", near(si(await figure("Image distance"), "cm"), 16.25, 0.004), await figure("Image distance"));
  await setField("Object distance s", 10);
  await sleep(350);
  check("object at the focal point: 'No image', 'at infinity', magnification undefined, never a huge number", (await has("No image")) && (await figure("Image distance")).includes("infinity") && (await figure("Magnification")).includes("undefined"), await figure("Image distance"));
  await click("Magnifying glass: inside f");
  await sleep(300);
  check("inside f (s = 6, f = 10): virtual, upright, enlarged, s' = -15 cm; the table highlights 'inside f'", (await has("Virtual, upright, enlarged image")) && near(si(await figure("Image distance"), "cm"), -15, 0.003) && (await ev(`document.querySelector('[data-testid=image-table] .is-here th').textContent`)) === "inside f", await figure("Image distance"));
  await click("Car mirror (convex)");
  await sleep(300);
  check("convex mirror f = -15 cm, object 40 cm: virtual, upright, reduced; s' = -10.9 cm", (await has("Virtual, upright, reduced image")) && near(si(await figure("Image distance"), "cm"), -10.909, 0.004), await figure("Image distance"));
  await choose("Refraction at a boundary");
  await sleep(300);
  await click("Air into glass");
  await sleep(300);
  check("air into glass at 40 degrees: theta2 = 25.4 degrees, toward the normal", near(nums(await figure("Angle of refraction"))[0], 25.375, 0.003) && (await figure("Angle of refraction")).includes("toward the normal"), await figure("Angle of refraction"));
  await click("Glass into air: total internal reflection");
  await sleep(300);
  check("glass into air at 55 degrees (critical 41.8): total internal reflection, no refracted ray", (await has("Total internal reflection: no refracted ray")) && near(nums(await figure("Critical angle"))[0], 41.81, 0.002), await figure("Critical angle"));
  await choose("Lenses and mirrors");
  await click("Projector: between f and 2f");
  await choose("Challenge");
  await sleep(300);
  await click("A real image the same size as the object");
  await sleep(300);
  await setField("Object distance s", 20);
  await sleep(350);
  check("Challenge 'same size': converging lens, object at 2f = 20 cm, meets it (m = -1)", (await has("Goal met")) && /m = -1/.test(await status()), await status());
  await choose("Practice");
  await sleep(300);
  check("Practice shows the predict-then-observe panel", await has("Predict, then observe"));
  await choose("Explore");

  // ---------------- interference ----------------
  await fresh(1440, "dark", "#/physics/interference-diffraction");
  await waitSel(".ph-svg");
  check("double slit default (550 nm, d = 100 um, L = 1.5 m): fringe spacing 8.25 mm", near(si(await figure("Fringe spacing"), "m"), 0.00825, 0.002), await figure("Fringe spacing"));
  await click("Missing orders (d = 4a)");
  await sleep(400);
  const missing = await ev(`[...document.querySelectorAll('[data-testid=orders] tbody tr')].filter((r) => /missing/.test(r.textContent)).map((r) => r.querySelector('th').textContent).join()`);
  check("d = 4a: orders 4 and 8 are marked missing, 7 fringes in the central peak, spacing 5.0 mm", missing === "4,8" && near(si(await figure("Fringe spacing"), "m"), 0.005, 0.002) && (await figure("Fringes in the central peak")) === "7", `${missing} ${await figure("Fringes in the central peak")}`);
  await click("Single slit");
  await sleep(300);
  check("single slit (550 nm, 50 um, 2 m): central maximum 44 mm wide; no fringe-spacing figure", (await has("Single-slit diffraction: central maximum 44")) && (await ev(`!([...document.querySelectorAll('.ui-figure dt')].some((d) => d.textContent.startsWith('Fringe spacing')))`)), "");
  await click("Five-slit grating");
  await sleep(300);
  check("five slits: 3 secondary maxima between principal maxima", nums(await figure("Secondary maxima"))[0] === 3 && (await has("5-slit grating")), await figure("Secondary maxima"));
  check("grating dispersion table: red bends more than violet", await ev(`(() => { const rows = [...document.querySelectorAll('[data-testid=dispersion] tbody tr')].map((r) => parseFloat(r.children[1].textContent)); return rows.length === 3 && rows[0] < rows[1] && rows[1] < rows[2]; })()`));
  await click("Violet light, double slit");
  await sleep(250);
  const violet = si(await figure("Fringe spacing"), "m");
  await click("Red light, double slit");
  await sleep(250);
  const red = si(await figure("Fringe spacing"), "m");
  check("red fringes are wider than violet fringes (650/420 = 1.548)", near(red / violet, 650 / 420, 0.003), `${red} / ${violet}`);
  const p0 = await figure("Probe position");
  await ev(`(() => { const s = [...document.querySelectorAll('[role=slider]')].find((x) => /Intensity|Probe/i.test((x.getAttribute('aria-label') || '') + (x.getAttribute('aria-valuetext') || ''))); if (!s) return false; s.focus(); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); return true; })()`);
  await sleep(300);
  check("the probe on the intensity graph moves with the arrow key and the readout follows", (await figure("Probe position")) !== p0, `${p0} -> ${await figure("Probe position")}`);
  await choose("Grating (N slits)");
  await setField("Number of slits N", 20);
  await setField("Slit separation d", 500);
  await setField("Screen distance L", 0.3);
  await sleep(350);
  check("a wide grating on a near screen is refused with the Fresnel number and nothing is drawn", (await has("Fresnel number")) && (await has("Enter valid values")), "");
  await click("Young's double slit (green)");
  await choose("Challenge");
  await sleep(300);
  await click("Make the third order disappear");
  await sleep(250);
  check("Challenge 'third order missing' is not met for d/a = 5", await has("Not yet"));
  await setField("Slit width a", 100 / 3);
  await sleep(350);
  check("with a = d/3 the third order is missing and the challenge is met", await has("Goal met"), await status());
  await choose("Explore");

  // ---------------- layout, themes and widths ----------------
  for (const [label, target] of [["waves", "#/physics/waves-sound"], ["optics", "#/physics/geometric-optics"], ["interference", "#/physics/interference-diffraction"]]) {
    for (const [width, scheme] of [[390, "light"], [820, "dark"], [1440, "light"], [1440, "dark"]]) {
      await fresh(width, scheme, target);
      await waitSel(".ph-svg");
      await sleep(500);
      const ofl = await overflow();
      check(`${label} at ${width}px ${scheme}: no page overflow`, ofl <= 0, `overflow ${ofl}`);
      if ((width === 390 && scheme === "light") || (width === 1440 && scheme === "dark")) await screenshot(cdp, path.join(outDir, `${label}-${width}-${scheme}.png`), { fullPage: width === 390 });
    }
  }
  for (const [label, target, steps] of [
    ["waves longitudinal", "#/physics/waves-sound", [() => choose("Longitudinal")]],
    ["waves superposition", "#/physics/waves-sound", [() => choose("Superposition and beats")]],
    ["waves standing", "#/physics/waves-sound", [() => choose("Standing waves and resonance")]],
    ["waves doppler", "#/physics/waves-sound", [() => choose("Doppler effect")]],
    ["waves challenge", "#/physics/waves-sound", [() => choose("Challenge")]],
    ["optics refraction", "#/physics/geometric-optics", [() => choose("Refraction at a boundary")]],
    ["optics mirror", "#/physics/geometric-optics", [() => click("Shaving mirror (concave)")]],
    ["interference grating", "#/physics/interference-diffraction", [() => click("Five-slit grating")]],
    ["interference challenge", "#/physics/interference-diffraction", [() => choose("Challenge")]],
  ]) {
    await fresh(375, "dark", target);
    await waitSel(".ph-svg");
    for (const step of steps) await step();
    await sleep(450);
    check(`${label} at 375px: no horizontal overflow`, (await overflow()) <= 0, String(await overflow()));
  }
  // reduced motion: the transport offers stepping instead of continuous play
  await fresh(1440, "light", "#/physics/waves-sound", { reducedMotion: true });
  await waitSel(".ph-svg");
  check("reduced motion: Waves offers Step instead of Play", await ev(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Step')) && ![...document.querySelectorAll('button')].some((b) => b.textContent.includes('▶ Play'))`));
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
