// Stage 10: screenshots of the Conformations page (chair, Newman, sawhorse + energy graph) at several viewports/themes.
//   npm run build && SHOT_DIR=<dir> node scripts/browser/stage10ConfShots.mjs [--widths=375,768,1440] [--themes=dark,light]
import path from "node:path";
import os from "node:os";
import { q, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const arg = (name, fallback) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split("=")[1].split(",");
const widths = arg("widths", "375,768,1440").map(Number);
const themes = arg("themes", "dark,light");
const outDir = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "pc-conf");

const { cdp, url, stop } = await startBrowser({ port: 4292, debugPort: 9452 });
const click = (label) => cdp.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const setValue = (selector, value) => cdp.evaluate(`(() => { const el = document.querySelector(${q(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${q(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const load = async (smiles) => {
  await waitFor(() => cdp.evaluate(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Load' && !b.disabled)`), "engine", 120000);
  await setValue(".conf-smiles input", smiles);
  await click("Load");
  await waitFor(() => cdp.evaluate(`!!document.querySelector('.mol-status.is-ok, .mol-status.is-error')`), "name/SMILES resolution (first use unpacks the offline name database)", 120000);
  await sleep(600);
};
const tab = (name) => cdp.evaluate(`(() => { const b = [...document.querySelectorAll('[role=tab]')].find((x) => x.textContent.trim() === ${q(name)} && x.getClientRects().length); b?.click(); })()`);
const openTool = async (name) => {
  const direct = await cdp.evaluate(`(() => { const b = [...document.querySelectorAll('.tool-tabs [role=tab]')].find((x) => x.textContent.trim() === ${q(name)} && x.getClientRects().length); if (b) { b.click(); return true; } return false; })()`);
  if (!direct) {
    await cdp.evaluate(`document.querySelector('.shell-menu')?.click()`);
    await sleep(350);
    await cdp.evaluate(`[...document.querySelectorAll('.sheet-tool')].find((x) => x.querySelector('.sheet-tool-name')?.textContent.trim() === ${q(name)})?.click()`);
  }
  await sleep(900);
};

try {
  for (const theme of themes) {
    for (const width of widths) {
      await setViewport(cdp, width, width < 500 ? 812 : 900, { scheme: theme });
      await cdp.send("Page.navigate", { url });
      await waitFor(() => cdp.evaluate(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
      await openTool("Conformations");
      const name = (s) => path.join(outDir, `${theme}-${width}-${s}.png`);
      await load("CC1CCCCC1");
      await screenshot(cdp, name("chair"));
      await load("CCCC");
      await tab("Newman");
      await sleep(500);
      await cdp.evaluate(`(() => { const r = document.querySelector('#conf-rotation'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, '60'); r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await sleep(400);
      await screenshot(cdp, name("newman"));
      await tab("Sawhorse");
      await sleep(400);
      await screenshot(cdp, name("sawhorse"));
      console.log("captured", theme, width);
    }
  }
  if (cdp.errors.length) console.log("PAGE ERRORS:", cdp.errors.slice(0, 3));
} finally {
  stop();
}
process.exit(0);
