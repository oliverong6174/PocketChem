// Stage 10 live-browser check: navigation (desktop tabs + mobile sheet), planned-subject preview, theme switching,
// real pointer / touch / keyboard rotation of the Newman projection, chair-flip animation (and reduced motion),
// and horizontal-overflow audits at 375 / 768 / 1440 for every tool.
//   npm run build && node scripts/browser/stage10LiveCheck.mjs
import path from "node:path";
import os from "node:os";
import { q, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => {
  if (process.env.DBG) console.log("   [errors so far:", cdp?.errors?.length ?? 0, "]");
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
};
const outDir = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "pc-live10");
const { cdp, url, stop } = await startBrowser({ port: 4293, debugPort: 9453 });
const ev = (expr) => cdp.evaluate(expr);
const click = (label) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const setValue = (selector, value) => ev(`(() => { const el = document.querySelector(${q(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const load = async (smiles) => {
  await waitFor(() => ev(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Load' && !b.disabled)`), "engine", 120000);
  await setValue(".conf-smiles input", smiles);
  await click("Load");
  await waitFor(() => ev(`!!document.querySelector('.mol-status.is-ok, .mol-status.is-error')`), "name/SMILES resolution (first use unpacks the offline name database)", 120000);
  await sleep(600);
};
const fresh = async (width, scheme = "dark", extra = {}) => {
  await setViewport(cdp, width, width < 500 ? 812 : 900, { scheme, ...extra });
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
const rotation = () => ev(`document.querySelector('.conf-rotation output')?.innerText ?? ''`);
const svgCentre = () => ev(`(() => { const r = document.querySelector('svg.conf-newman:not(.conf-compact)').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top }; })()`);

try {
  // ---- desktop navigation ----
  await fresh(1440);
  const tools = ["Properties", "Ranking", "Spectroscopy", "Conformations", "Reactions", "Multi-Step", "Multi-Catalytic", "Saved"];
  check("desktop: all eight tools are tabs in the grouped tablist", (await ev(`document.querySelectorAll('.tool-tabs [role=tab]').length`)) === 8);
  check("desktop: tab groups are labelled Analyze, Synthesize, Library", (await ev(`[...document.querySelectorAll('.tool-group-label')].map((x) => x.textContent).join(',')`)) === "Analyze,Synthesize,Library");
  let navOk = true;
  for (const tool of tools) {
    await openTool(tool, 1800);
    const selected = await ev(`document.querySelector('.tool-tabs [aria-selected=true]')?.textContent.trim()`);
    const panelOk = await ev(`!!document.querySelector('[id^=page-panel-]')`);
    if (selected !== tool || !panelOk) navOk = false;
  }
  check("desktop: every tool opens and becomes the selected tab", navOk);

  // ---- keyboard tab navigation ----
  await openTool("Properties");
  await ev(`document.querySelector('#page-tab-analysis').focus()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await sleep(600);
  check("keyboard: ArrowRight moves to the next tab (Ranking)", (await ev(`document.querySelector('.tool-tabs [aria-selected=true]')?.textContent.trim()`)) === "Ranking");

  // ---- subject picker + planned preview ----
  await click("Organic Chemistry");
  await sleep(300);
  const listed = await ev(`document.querySelector('.subject-popover')?.innerText ?? ''`);
  check("subjects: five branches in two modes, planned ones flagged", /Scientific Workbench/i.test(listed) && /Interactive Learning/i.test(listed) && /Biochemistry/.test(listed) && (listed.match(/Planned/gi) ?? []).length >= 4, listed.split(String.fromCharCode(10)).join(" / ").slice(0, 200));
  await ev(`[...document.querySelectorAll('.subject-item')].find((b) => /Biology/.test(b.innerText))?.click()`);
  await sleep(300);
  const dialog = await ev(`document.querySelector('[role=dialog]')?.innerText ?? ''`);
  check("planned subject opens an informational preview, not a tool", /Not available yet/.test(dialog) && !(await ev(`!!document.querySelector('[role=dialog] canvas, [role=dialog] input')`)));
  await screenshot(cdp, path.join(outDir, "planned-dialog.png"), { fullPage: false });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(300);
  check("Escape closes the preview and the organic tool is still active", !(await ev(`!!document.querySelector('[role=dialog]')`)) && (await ev(`!!document.querySelector('.tool-tabs [aria-selected=true]')`)));

  // ---- theme ----
  await ev(`document.querySelector('[data-theme-option=light]').click()`);
  await sleep(200);
  check("theme: choosing Light sets data-theme=light and persists", (await ev(`document.documentElement.dataset.theme`)) === "light" && (await ev(`localStorage.getItem('pocketchem.theme')`)) === "light");
  const bg = await ev(`getComputedStyle(document.body).backgroundColor`);
  check("theme: light background is light", /rgb\((2[0-9]{2}), (2[0-9]{2}), (2[0-9]{2})\)/.test(bg), bg);
  await ev(`document.querySelector('[data-theme-option=dark]').click()`);
  await sleep(200);
  check("theme: Dark restores the dark theme", (await ev(`document.documentElement.dataset.theme`)) === "dark");
  await ev(`localStorage.removeItem('pocketchem.theme')`);

  // ---- Newman: real mouse drag, keyboard, then touch ----
  await openTool("Conformations");
  await load("CCCC");
  await ev(`[...document.querySelectorAll('[role=tab]')].find((x) => x.textContent.trim() === 'Newman').click()`);
  await sleep(500);
  await ev(`document.querySelector('svg.conf-newman:not(.conf-compact)').scrollIntoView({ block: 'center' })`);
  await sleep(300);
  let c = await svgCentre();
  const r = (c.w / 320) * 100;
  const at = (deg) => ({ x: c.x + r * Math.sin((deg * Math.PI) / 180), y: c.y - r * Math.cos((deg * Math.PI) / 180) });
  const p0 = at(30);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p0.x, y: p0.y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p0.x, y: p0.y, button: "left", buttons: 1, clickCount: 1 });
  for (const deg of [60, 90, 120]) {
    const p = at(deg);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, button: "left", buttons: 1 });
    await sleep(50);
  }
  const p1 = at(120);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p1.x, y: p1.y, button: "left", buttons: 0, clickCount: 1 });
  await sleep(300);
  const afterMouse = parseInt(await rotation(), 10);
  check("Newman: a real mouse drag rotates the rear carbon to the pointer angle (~120 deg)", Math.abs(afterMouse - 120) <= 3, `readout ${afterMouse}`);
  const slider = await ev(`document.querySelector('#conf-rotation').value`);
  check("Newman: the slider stays in sync with the drag", Math.abs(Number(slider) - afterMouse) <= 1);
  const verdict = await ev(`document.querySelector('.conf-block .conf-verdict')?.innerText ?? ''`);
  check("Newman: the assessment follows the drag (120 deg is eclipsed)", /eclipsed/i.test(verdict), verdict.slice(0, 60));

  await ev(`document.querySelector('svg.conf-newman:not(.conf-compact)').focus()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34 });
  await sleep(300);
  const afterKey = parseInt(await rotation(), 10);
  check("Newman: keyboard (Page Down) turns it by 60 degrees", Math.abs(afterKey - 60) <= 1, `readout ${afterKey}`);
  check("Newman: aria-valuenow tracks the rotation", Number(await ev(`document.querySelector('svg.conf-newman:not(.conf-compact)').getAttribute('aria-valuenow')`)) === afterKey);

  await fresh(375, "dark");
  await openTool("Conformations");
  await load("CCCC");
  await ev(`[...document.querySelectorAll('[role=tab]')].find((x) => x.textContent.trim() === 'Newman').click()`);
  await sleep(500);
  await ev(`document.querySelector('svg.conf-newman:not(.conf-compact)').scrollIntoView({ block: 'center' })`);
  await sleep(300);
  c = await svgCentre();
  const rt = (c.w / 320) * 100;
  const tp = (deg) => ({ x: c.x + rt * Math.sin((deg * Math.PI) / 180), y: c.y - rt * Math.cos((deg * Math.PI) / 180) });
  const t0 = tp(20);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: t0.x, y: t0.y }] });
  for (const deg of [60, 120, 180]) {
    const p = tp(deg);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x, y: p.y }] });
    await sleep(60);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(300);
  const afterTouch = parseInt(await rotation(), 10);
  check("Newman: a touch drag at 375px rotates to ~180 degrees", Math.abs(afterTouch - 180) <= 4, `readout ${afterTouch}`);
  const ov = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  check("phone: Conformations page has no horizontal overflow", ov <= 0, `${ov}px`);
  await screenshot(cdp, path.join(outDir, "phone-newman.png"), { fullPage: false });

  // energy graph label font sizes stay legible on a phone
  const fonts = await ev(`(() => { const t = document.querySelector('svg.conf-graph text.conf-feature'); if (!t) return 0; const s = t.getBoundingClientRect(); return parseFloat(getComputedStyle(t).fontSize) * (document.querySelector('svg.conf-graph').getBoundingClientRect().width / document.querySelector('svg.conf-graph').viewBox.baseVal.width); })()`);
  check("phone: energy-graph labels render at >= 11px", fonts >= 11, `${fonts.toFixed ? fonts.toFixed(1) : fonts}px`);

  // ---- chair flip + reduced motion ----
  await fresh(1440, "dark");
  await openTool("Conformations");
  await load("C[C@H]1CC[C@H](C)CC1");
  const title = () => ev(`document.querySelector('.conf-view-title')?.innerText`);
  check("chair: starts at Chair A", (await title()) === "Chair A");
  await click("Flip chair");
  let mid = "";
  for (let i = 0; i < 20 && !/→/.test(mid); i += 1) { mid = await title(); if (!/→/.test(mid)) await sleep(20); }
  check("chair flip: animates (title shows the transition, flip button disabled)", /→/.test(mid), mid);
  await sleep(900);
  check("chair flip: ends on Chair B with the real labels back", (await title()) === "Chair B" && (await ev(`document.querySelectorAll('.conf-visual svg.conf-chair .conf-sub.conf-axial:not(.conf-h)').length`)) === 2);
  await fresh(1440, "dark", { reducedMotion: true });
  await openTool("Conformations");
  await load("C[C@H]1CC[C@H](C)CC1");
  await click("Flip chair");
  await sleep(120);
  check("reduced motion: the flip is immediate", (await title()) === "Chair B");

  // ---- overflow audit of every tool at three widths, both themes ----
  for (const scheme of ["dark", "light"]) {
    for (const width of [375, 768, 1440]) {
      await fresh(width, scheme);
      const bad = [];
      for (const tool of tools) {
        await openTool(tool, 1800); // let each Ketcher editor finish starting before it is unmounted
        const o = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
        if (o > 0) bad.push(`${tool}:${o}`);
      }
      check(`overflow: no horizontal scroll at ${width}px (${scheme})`, bad.length === 0, bad.join(" "));
    }
  }

  // ---- touch target size in the mobile sheet ----
  await fresh(375, "dark");
  await ev(`document.querySelector('.shell-menu').click()`);
  await sleep(400);
  const small = await ev(`[...document.querySelectorAll('.sheet button')].filter((b) => { const r = b.getBoundingClientRect(); return r.height < 40 || r.width < 40; }).map((b) => b.innerText.trim() || b.getAttribute('aria-label')).join(',')`);
  check("phone sheet: every control is at least 40px in both dimensions", small === "", small);
  await screenshot(cdp, path.join(outDir, "phone-sheet.png"), { fullPage: false });

  check("no uncaught page exceptions", cdp.errors.length === 0, cdp.errors.slice(0, 2).join(" | "));
} catch (error) {
  check("script completed", false, error.message);
} finally {
  stop();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
