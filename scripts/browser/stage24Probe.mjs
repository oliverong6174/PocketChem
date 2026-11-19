// Stage 24 DOM probe: for each "slug:Mode" argument, lists presets, fields and figures. node scripts/browser/stage24Probe.mjs induction:Motional\ EMF
import { q, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";
const { cdp, url, stop } = await startBrowser({ port: 4311, debugPort: 9471 });
const ev = (e) => cdp.evaluate(e);
try {
  await setViewport(cdp, 1440, 900, { scheme: "light" });
  for (const arg of process.argv.slice(2)) {
    const [slug, mode] = arg.split(":");
    await cdp.send("Page.navigate", { url: url + "#/physics/" + slug });
    await waitFor(() => ev(`document.readyState==='complete' && !!document.querySelector('.ph-svg, svg')`), slug);
    await sleep(600);
    if (mode) { await ev(`(() => { const o = [...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(mode)}); o.querySelector('input').click(); })()`); await sleep(500); }
    console.log("=== " + arg, JSON.stringify(await ev(`({
      seg:[...document.querySelectorAll('.ui-seg-option')].map(b=>b.textContent.trim()).join('|'),
      buttons:[...document.querySelectorAll('main button')].map(b=>b.innerText.trim()).filter(Boolean).join('|'),
      fields:[...document.querySelectorAll('.gc-field label')].map(b=>b.textContent.trim()).join('|'),
      sliders:[...document.querySelectorAll('[role=slider], input[type=range]')].map(b=>(b.getAttribute('aria-label')||b.id)).join('|'),
      figs:[...document.querySelectorAll('.ui-figure')].map(f=>f.querySelector('dt').textContent.trim()+'='+f.querySelector('dd').textContent.trim().slice(0,60)).join(' ; '),
      svgs:[...document.querySelectorAll('svg[aria-label]')].map(s=>s.getAttribute('aria-label').slice(0,160)).join(' || ')
    })`), null, 1).replace(/\n/g, " "));
  }
} finally { stop(); }
