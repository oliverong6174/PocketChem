// Exploratory screenshots for Stage 15 (not an assertion script). node scripts/browser/stage15Shots.mjs <outDir>
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";
const outDir = process.argv[2] ?? path.join(root, "node_modules", ".cache", "pc-live15");
const { cdp, url, stop } = await startBrowser({ port: 4310, debugPort: 9470 });
const ev = (e) => cdp.evaluate(e);
const go = async (w, scheme, target) => {
  await setViewport(cdp, w, w < 500 ? 812 : w < 1000 ? 1024 : 900, { scheme });
  await cdp.send("Page.navigate", { url: url + target });
  await waitFor(() => ev(`document.readyState==='complete' && document.body.innerText.length>50`), "app");
  await sleep(900);
};
const click = (label) => ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===${q(label)}&&!x.disabled&&x.getClientRects().length); if(!b) return false; b.click(); return true; })()`);
const shot = async (name) => { await ev(`(document.querySelector('.ui-diagram')||document.body).scrollIntoView({block:'start'})`); await sleep(250); await screenshot(cdp, path.join(outDir, name), { fullPage: false }); };
const stepTo = async (n) => { for (let i=0;i<n;i++) await click("Next ▶"); await sleep(200); };
try {
  await go(1440, "light", "#/biology/dna-replication");
  await stepTo(12);
  await shot("rep-12.png");
  await stepTo(14);
  await shot("rep-26.png");
  await click("⏭"); await sleep(300);
  await screenshot(cdp, path.join(outDir, "rep-end.png"), { fullPage: true });
  await go(1440, "light", "#/biology/transcription");
  await stepTo(8);
  await shot("tx-6.png");
  await stepTo(30);
  await shot("tx-36.png");
  await click("⏭"); await sleep(300);
  await screenshot(cdp, path.join(outDir, "tx-end.png"), { fullPage: true });
  await go(1440, "light", "#/biology/translation");
  await stepTo(6);
  await shot("tr-6.png");
  await go(1440, "dark", "#/biology/dna-rna-protein");
  await screenshot(cdp, path.join(outDir, "dogma-dark.png"), { fullPage: true });
  await go(1440, "dark", "#/biology/overview");
  await screenshot(cdp, path.join(outDir, "overview-dark.png"), { fullPage: false });
  console.log("errors:", cdp.errors.slice(0, 5));
} finally { await stop(); }
