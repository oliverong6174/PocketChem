// Stage 10: screenshots of the Reactions results (and Properties analysis) with real data, light/dark, 375/1440.
//   npm run build && SHOT_DIR=<dir> node scripts/browser/stage10ReactionShots.mjs
import os from "node:os";
import path from "node:path";
import { q, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const outDir = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "pc-rxn");
const { cdp, url, stop } = await startBrowser({ port: 4294, debugPort: 9454 });
const ev = (e) => cdp.evaluate(e);
const clickText = (label) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (b) b.click(); return !!b; })()`);
try {
  for (const [scheme, width] of [["dark", 1440], ["light", 1440], ["dark", 375]]) {
    await setViewport(cdp, width, width < 500 ? 812 : 900, { scheme });
    await cdp.send("Page.navigate", { url });
    await waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), "app");
    // Properties analysis
    await waitFor(() => ev(`Boolean(window.mainKetcher || window.reactionKetcher || true)`), "x");
    await ev(`(() => { const direct = [...document.querySelectorAll('.tool-tabs [role=tab]')].find((x) => x.textContent.trim() === 'Reactions' && x.getClientRects().length); if (direct) direct.click(); else { document.querySelector('.shell-menu').click(); setTimeout(() => [...document.querySelectorAll('.sheet-tool')].find((x) => x.textContent.includes('Reactions')).click(), 300); } })()`);
    await waitFor(() => ev(`Boolean(window.reactionKetcher)`), "Reactions Ketcher", 90000);
    await ev(`window.reactionKetcher.setMolecule('CC=CC')`);
    await sleep(600);
    await clickText("Predict Products");
    await waitFor(() => ev(`document.querySelectorAll('.reaction-pathway-card').length > 0 && [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Predict Products' && !b.disabled)`), "results", 90000);
    await sleep(800);
    await screenshot(cdp, path.join(outDir, `${scheme}-${width}-reactions.png`));
    console.log("captured", scheme, width, await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`));
  }
} finally {
  stop();
}
process.exit(0);
