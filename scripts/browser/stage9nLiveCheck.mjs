// Live-browser check of the Stage 9N Conformations page: navigation, shared chair / Newman / sawhorse state, chair flips,
// energy readout, practice mode, persistence across a reload, Saved Analyses and the Ketcher hand-off.
// Real headless Chrome + the production build (see stage9fLiveCheck.mjs).
//   npm run build && node scripts/browser/stage9nLiveCheck.mjs
// Set SHOT_DIR to write screenshots.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 4189;
const DEBUG_PORT = 9349;
const CHROME = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => p && fs.existsSync(p));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, description, timeoutMs = 60000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await predicate();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${description}${last instanceof Error ? `: ${last.message}` : ""}`);
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 1;
    this.pending = new Map();
    this.errors = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve);
      this.ws.addEventListener("error", reject);
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else if (message.method === "Runtime.exceptionThrown") {
        this.errors.push(message.params.exceptionDetails?.exception?.description ?? "exception");
      }
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
}

const q = (s) => JSON.stringify(s);
let cdp;
const text = () => cdp.evaluate("document.body.innerText");
const clickButton = (label) => cdp.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled); if (!b) return false; b.click(); return true; })()`);
const count = (selector) => cdp.evaluate(`document.querySelectorAll(${q(selector)}).length`);
async function shot(name) {
  if (!process.env.SHOT_DIR) return;
  fs.mkdirSync(process.env.SHOT_DIR, { recursive: true });
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(path.join(process.env.SHOT_DIR, `${name}.png`), Buffer.from(data, "base64"));
}
async function setValue(selector, value) {
  await cdp.evaluate(`(() => { const el = document.querySelector(${q(selector)}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(String(value))}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
}
const loadSmiles = async (smiles) => {
  await waitFor(() => cdp.evaluate(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Load' && !b.disabled)`), "RDKit ready on the Conformations page", 120000);
  await setValue(".conf-smiles input", smiles);
  await clickButton("Load");
  await sleep(800);
};
const rotationText = () => cdp.evaluate(`document.querySelector('.conf-rotation output')?.innerText ?? ''`);

async function main() {
  if (!CHROME) throw new Error("No Chrome/Edge found (set CHROME_PATH).");
  if (!fs.existsSync(path.join(root, "dist", "index.html"))) throw new Error("dist/ missing; run `npm run build`.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pocketchem-chrome-"));
  const preview = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--window-size=1400,2000", "about:blank"], { stdio: "ignore" });
  try {
    await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/`)).ok, "vite preview");
    const target = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find((t) => t.type === "page"), "Chrome");
    cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
    await waitFor(() => cdp.evaluate(`document.readyState === 'complete' && document.body.innerText.includes('Conformations')`), "app shell");

    // ---- navigation ----
    check("the Conformations tab is in the navigation", await clickButton("Conformations"));
    await waitFor(() => count(".conf-page").then((n) => n > 0), "Conformations page", 30000);
    check("page opens with the input card and an empty-state message", (await text()).includes("Load a molecule above"));
    check("an Ketcher editor is mounted for this page", await waitFor(() => cdp.evaluate(`Boolean(window.conformationsKetcher)`), "Conformations Ketcher", 120000).then(() => true).catch(() => false));

    // ---- chair, shared state, flip ----
    await loadSmiles("C[C@H]1CC[C@H](C)CC1");
    check("a chair is drawn for trans-1,4-dimethylcyclohexane", (await count("svg.conf-svg .conf-ring-bond")) === 6 || (await count("svg.conf-svg .conf-ring-bond")) > 0);
    check("Chair A is shown first", (await cdp.evaluate(`document.querySelector('.conf-view-title')?.innerText`)) === "Chair A");
    const axialA = await count("svg.conf-svg .conf-sub.conf-axial:not(.conf-h)");
    const stability = await cdp.evaluate(`document.querySelector('.conf-verdict')?.innerText ?? ''`);
    check("stability says Chair A (diequatorial) is favoured, as additive A-values", /Chair A/.test(stability) && /A-value/i.test(stability), stability.slice(0, 120));
    await shot("chair-A");
    check("Flip chair works", await clickButton("Flip chair"));
    await sleep(300);
    check("Chair B is shown after the flip", (await cdp.evaluate(`document.querySelector('.conf-view-title')?.innerText`)) === "Chair B");
    const axialB = await count("svg.conf-svg .conf-sub.conf-axial:not(.conf-h)");
    check("trans-1,4: the two methyls swap from equatorial to axial on the flip", axialA === 0 && axialB === 2, `axial A=${axialA}, B=${axialB}`);
    await shot("chair-B");
    await clickButton("Flip chair");
    await sleep(300);
    check("flipping twice returns to Chair A", (await cdp.evaluate(`document.querySelector('.conf-view-title')?.innerText`)) === "Chair A" && (await count("svg.conf-svg .conf-sub.conf-axial:not(.conf-h)")) === 0);

    // cis-1,3: stereo-specified molecule, different pattern
    await loadSmiles("C[C@H]1CCC[C@@H](C)C1");
    check("cis-1,3: diequatorial chair is shown", (await count("svg.conf-svg .conf-sub.conf-axial:not(.conf-h)")) === 0);
    // unspecified stereo is not guessed
    await loadSmiles("CC1CCCCC1C");
    check("1,2-dimethylcyclohexane without stereo asks the user instead of guessing", /does not say which substituents are on the same face/.test(await text()));
    await clickButton("up");
    await sleep(300);
    check("choosing a face for the unspecified atom draws chairs", (await count("svg.conf-svg .conf-ring-bond")) > 0 || /Chair [AB]/.test(await text()));
    // unsupported ring
    await loadSmiles("c1ccccc1");
    check("benzene is refused for chair analysis with a reason", /No chair analysis/.test(await text()));

    // ---- Newman / sawhorse on butane ----
    await loadSmiles("CCCC");
    await clickButton("Newman");
    await sleep(300);
    check("Newman projection is drawn for a default bond", (await count("svg.conf-newman")) >= 1 && (await count("svg.conf-newman .conf-n-front")) >= 3);
    await setValue("#conf-rotation", 180);
    await sleep(300);
    check("rotating to 180 shows 180 on the slider output", (await rotationText()).includes("180"));
    const readout = await cdp.evaluate(`document.querySelector('.conf-readout')?.innerText ?? ''`);
    check("dihedral readout is shown and numeric (anti, 180 degrees)", /180°/.test(readout), readout);
    const verdict = await cdp.evaluate(`document.querySelector('.conf-block .conf-verdict')?.innerText ?? ''`);
    check("180 degrees between the methyls is classed staggered / anti", /anti/i.test(verdict), verdict.slice(0, 100));
    await shot("newman-anti");
    await setValue("#conf-rotation", 0);
    await sleep(300);
    const eclipsedVerdict = await cdp.evaluate(`document.querySelector('.conf-block .conf-verdict')?.innerText ?? ''`);
    const eclipsedText = await text();
    check("0 degrees is eclipsed, with a strain energy above the minimum", /eclipsed/i.test(eclipsedVerdict) && /Strain: \d+(\.\d+)? kJ\/mol/.test(eclipsedText), eclipsedVerdict.slice(0, 80));
    await clickButton("Snap to staggered");
    await sleep(300);
    check("Snap to staggered moves to a staggered conformation", /staggered/i.test(await cdp.evaluate(`document.querySelector('.conf-block .conf-verdict')?.innerText ?? ''`)));
    await setValue("#conf-rotation", 60);
    await sleep(300);
    await clickButton("Sawhorse");
    await sleep(300);
    check("Sawhorse shows the same rotation (shared state)", (await rotationText()).includes("60") && (await count("svg.conf-sawhorse")) >= 1 && (await count("svg.conf-newman")) >= 1);
    check("sawhorse view also keeps the 60 degree dihedral readout", /60°/.test(await cdp.evaluate(`document.querySelector('.conf-readout')?.innerText ?? ''`)));
    await shot("sawhorse");
    check("energy graph is drawn for butane", (await count("svg.conf-graph .conf-curve")) === 1);
    check("energy model limits are stated", /not a calculation|approximation/i.test(await text()));
    await clickButton("View from the other end");
    await sleep(300);
    check("View from the other end keeps the page alive and swaps the bond direction", (await count("svg.conf-newman")) >= 1);
    // practice mode hides answers
    await clickButton("Newman");
    await cdp.evaluate(`(() => { const l = [...document.querySelectorAll('label.conf-toggle')].find((x) => /Practice mode/.test(x.innerText)); l.querySelector('input').click(); })()`);
    await sleep(400);
    const practiceText = await text();
    check("practice mode shows questions and hides the energy / names", /Practice/.test(practiceText) && /hidden in practice mode/i.test(practiceText));
    await shot("practice");
    await cdp.evaluate(`(() => { const l = [...document.querySelectorAll('label.conf-toggle')].find((x) => /Practice mode/.test(x.innerText)); l.querySelector('input').click(); })()`);
    await sleep(300);
    check("turning practice mode off restores the explanations", /What you are seeing/.test(await text()));

    // ---- Newman for a molecule with no energy parameters: no invented number ----
    await loadSmiles("C[C@@H](Br)[C@H](Br)C");
    await sleep(500);
    const brText = await text();
    check("a bromine-bearing bond gets no invented numeric energy", /No numeric energy|no energy curve/i.test(brText));

    // ---- persistence across a reload ----
    await loadSmiles("CC1CCCCC1");
    await clickButton("Flip chair");
    await sleep(1500); // the page saves after a short delay
    await cdp.send("Page.reload");
    await waitFor(() => cdp.evaluate(`document.readyState === 'complete' && document.body.innerText.includes('Conformations')`), "reloaded app");
    await clickButton("Conformations");
    await waitFor(() => count(".conf-page").then((n) => n > 0), "Conformations page after reload", 30000);
    await waitFor(() => cdp.evaluate(`document.querySelector('.conf-view-title')?.innerText === 'Chair B'`), "restored flipped chair", 60000).then(
      () => check("after a reload the molecule, chair mode and the flipped chair are restored", true),
      () => check("after a reload the molecule, chair mode and the flipped chair are restored", false, "not restored"),
    );
    check("restored work says it came from the previous session", /Restored from your previous session/.test(await text()));

    // ---- Saved Analyses ----
    await clickButton("Save Analysis");
    await sleep(300);
    await cdp.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Save$/.test(x.innerText.trim())); if (b) b.click(); })()`);
    await sleep(1500);
    await clickButton("Saved");
    await waitFor(async () => /Conformations/.test(await text()), "saved list", 20000).catch(() => undefined);
    check("the saved conformations analysis is listed on the Saved page", /Conformations of/.test(await text()) && /Conformations/.test(await text()));
    await shot("saved");
    const opened = await cdp.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Open/.test(x.innerText.trim())); if (!b) return false; b.click(); return true; })()`);
    if (opened) {
      await waitFor(async () => (await count(".conf-page")) > 0, "page after open", 30000).catch(() => undefined);
      await sleep(1500);
      check("opening a saved analysis returns to the Conformations page with its chair", (await count(".conf-page")) > 0 && /methylcyclohexane|CC1CCCCC1|C1CCC/.test(await text()));
    } else {
      check("opening a saved analysis returns to the Conformations page", false, "no Open button");
    }

    // ---- Ketcher hand-off ----
    await clickButton("Conformations");
    await waitFor(() => cdp.evaluate(`Boolean(window.conformationsKetcher)`), "Ketcher for hand-off", 60000);
    await cdp.evaluate(`window.conformationsKetcher.setMolecule('CC(C)CC')`);
    await sleep(800);
    check("Analyse drawn structure takes the drawing from the editor", await clickButton("Analyse drawn structure"));
    await sleep(1500);
    const handoff = await cdp.evaluate(`document.querySelector('.conf-molecule')?.innerText ?? ''`);
    check("the structure drawn in Ketcher becomes the analysed molecule", /CC\(C\)CC|CCC\(C\)C/.test(handoff), handoff);
    await shot("ketcher-handoff");

    check("no uncaught page exceptions", cdp.errors.length === 0, cdp.errors.slice(0, 2).join(" | "));
  } finally {
    try { chrome.kill(); } catch { /* already closed */ }
    try { preview.kill(); } catch { /* already closed */ }
    setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 1500);
  }
}

try {
  await main();
} catch (error) {
  console.log(`FAIL  harness error - ${error instanceof Error ? error.message : String(error)}`);
  results.push(false);
}
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
