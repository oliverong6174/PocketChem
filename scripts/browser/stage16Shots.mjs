// Exploratory screenshots for Stage 16 (not an assertion script). node scripts/browser/stage16Shots.mjs [outDir]
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";
const outDir = process.argv[2] ?? path.join(root, "node_modules", ".cache", "pc-live16");
const { cdp, url, stop } = await startBrowser({ port: 4330, debugPort: 9490 });
const ev = (e) => cdp.evaluate(e);
const go = async (w, scheme, target) => {
  await setViewport(cdp, w, w < 500 ? 812 : w < 1000 ? 1024 : 900, { scheme });
  await cdp.send("Page.navigate", { url: url + target });
  await waitFor(() => ev(`document.readyState==='complete' && document.body.innerText.length>50`), "app");
  await sleep(900);
};
const click = (label) => ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===${q(label)}&&!x.disabled&&x.getClientRects().length); if(!b) return false; b.click(); return true; })()`);
const choose = (label) => ev(`(() => { const o=[...document.querySelectorAll('.ui-seg-option')].find(x=>x.textContent.trim()===${q(label)}&&x.getClientRects().length); if(!o) return false; o.querySelector('input').click(); return true; })()`);
const setSel = (testid, value) => ev(`(() => { const el=document.querySelector('[data-testid=${testid}]'); if(!el) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
const check = (testid) => ev(`(() => { const el=document.querySelector('[data-testid=${testid}]'); if(!el) return false; el.click(); return true; })()`);
const shot = async (name, sel = ".ui-diagram") => { await ev(`(document.querySelector(${q(sel)})||document.body).scrollIntoView({block:'start'})`); await sleep(300); await screenshot(cdp, path.join(outDir, name), { fullPage: false }); };
const next = async (n) => { for (let i = 0; i < n; i++) await click("Next ▶"); await sleep(250); };
try {
  // regulation
  await go(1440, "light", "#/biology/gene-regulation");
  await next(4); await shot("lac-induced.png");
  await check("lactose"); await sleep(300); await shot("lac-uninduced.png");
  await check("lactose"); await check("glucose"); await check("second-copy"); await setSel("preset-1", "Oc"); await sleep(300); await shot("lac-two-copy.png");
  await choose("trp operon"); await sleep(500); await next(4); await shot("trp-high-step4.png");
  await choose("Low"); await sleep(400); await shot("trp-low-step4.png");
  await next(1); await shot("trp-low-step5.png");
  await choose("Eukaryotic gene"); await sleep(500); await next(4); await shot("euk-active.png");
  await check("methylation"); await sleep(300); await shot("euk-conflict.png");
  // genetics
  await go(1440, "light", "#/biology/genetics");
  await next(3); await shot("gen-mono.png", ".bio-parents");
  await ev(`document.querySelector('.bio-punnett').scrollIntoView({block:'center'})`); await sleep(300); await screenshot(cdp, path.join(outDir, "gen-mono-punnett.png"), { fullPage: false });
  await setSel("layout-select", "di"); await sleep(400); await next(3); await ev(`document.querySelector('.bio-punnett').scrollIntoView({block:'center'})`); await sleep(300); await screenshot(cdp, path.join(outDir, "gen-di-punnett.png"), { fullPage: false });
  await setSel("layout-select", "linked"); await sleep(400); await next(1); await shot("gen-linked-gametes.png", ".bio-parents");
  await ev(`document.querySelector('[data-testid=crossover-figure]')?.scrollIntoView({block:'center'})`); await sleep(300); await screenshot(cdp, path.join(outDir, "gen-linked-cross.png"), { fullPage: false });
  // cell division
  await go(1440, "light", "#/biology/mitosis-meiosis");
  for (const [n, name] of [[3, "meiosis-prophase1"], [1, "meiosis-crossing"], [1, "meiosis-meta1"], [1, "meiosis-ana1"], [1, "meiosis-telo1"], [2, "meiosis-meta2"], [1, "meiosis-ana2"], [1, "meiosis-telo2"]]) {
    await next(n); await shot(`${name}.png`, "[data-testid=step-caption]");
  }
  await go(1440, "light", "#/biology/mitosis-meiosis");
  await setSel("layout-select", "linked"); await sleep(400); await check("co-toggle-0"); await sleep(300);
  await next(4); await shot("meiosis-linked-crossing.png", "[data-testid=step-caption]");
  await next(6); await shot("meiosis-linked-gametes.png", "[data-testid=step-caption]");
  await go(1440, "light", "#/biology/mitosis-meiosis");
  await setSel("nd-select", "I"); await sleep(300); await next(5); await shot("meiosis-nd1-ana1.png", "[data-testid=step-caption]");
  await next(5); await shot("meiosis-nd1-end.png", "[data-testid=step-caption]");
  await go(1440, "light", "#/biology/mitosis-meiosis");
  await choose("Mitosis"); await sleep(400); await next(4); await shot("mitosis-metaphase.png", "[data-testid=step-caption]");
  await next(1); await shot("mitosis-anaphase.png", "[data-testid=step-caption]");
  await next(1); await shot("mitosis-telophase.png", "[data-testid=step-caption]");
  // dark and mobile
  await go(1440, "dark", "#/biology/mitosis-meiosis"); await next(4); await shot("meiosis-dark.png", "[data-testid=step-caption]");
  await go(1440, "dark", "#/biology/gene-regulation"); await next(4); await shot("lac-dark.png", "[data-testid=step-caption]");
  await go(375, "light", "#/biology/mitosis-meiosis"); await next(5); await shot("meiosis-mobile.png", "[data-testid=step-caption]");
  await go(375, "dark", "#/biology/genetics"); await next(3); await shot("genetics-mobile-dark.png", ".bio-parents");
  await go(375, "light", "#/biology/gene-regulation"); await next(4); await shot("lac-mobile.png", "[data-testid=step-caption]");
  console.log("errors:", cdp.errors.slice(0, 5));
} finally { await stop(); }
