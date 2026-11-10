// Live-browser check of the Stage 9F corrections: name display and the unsupported state on the Analysis page, and epoxide regiochemistry on the Reactions page.
// Real headless Chrome + live Ketcher + the production build (see multicatalyticLiveCheck.mjs).
//   npm run build && node scripts/browser/stage9fLiveCheck.mjs
// Set PROBES='[["SMILES","title-regex"], ...]' to print the cards for those molecules instead of asserting (discovery mode).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 4183;
const DEBUG_PORT = 9343;
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

const NL = String.fromCharCode(92) + "n"; // the two characters backslash-n, to be interpreted by the page's JavaScript
// Every card on the page: its title (first line), how many product drawings it has and its flattened text.
const ALL_CARDS = `[...document.querySelectorAll('.reaction-pathway-card')].map((c) => ({
  title: c.innerText.split('${NL}')[0].trim(),
  variants: c.querySelectorAll('.reaction-product-variant').length,
  text: c.innerText.replace(/\\s+/g, ' '),
}))`;

async function main() {
  if (!CHROME) throw new Error("No Chrome/Edge found (set CHROME_PATH).");
  if (!fs.existsSync(path.join(root, "dist", "index.html"))) throw new Error("dist/ missing; run `npm run build`.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pocketchem-chrome-"));
  const preview = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--window-size=1500,2200", "about:blank"], { stdio: "ignore" });
  try {
    await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/`)).ok, "vite preview");
    const target = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find((t) => t.type === "page"), "Chrome");
    const cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
    await waitFor(() => cdp.evaluate(`document.readyState === 'complete' && document.body.innerText.includes('Reactions')`), "app shell");
    await homeChecks(cdp);
    await cdp.evaluate(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Reactions').click()`);
    await waitFor(() => cdp.evaluate(`Boolean(window.reactionKetcher)`), "Reactions Ketcher editor", 90000);

    /** Draws the molecule, predicts, expands every result and returns all cards. */
    const predict = async (smiles) => {
      await cdp.evaluate(`window.reactionKetcher.setMolecule(${JSON.stringify(smiles)})`);
      await sleep(500);
      await cdp.evaluate(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Predict Products').click()`);
      await waitFor(
        async () =>
          (await cdp.evaluate(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Predict Products' && !b.disabled)`)) &&
          (await cdp.evaluate(`document.querySelectorAll('.reaction-pathway-card').length > 0`)),
        `predictions for ${smiles}`,
        90000,
      );
      for (let round = 0; round < 12; round += 1) {
        const clicked = await cdp.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Show\\s/.test(x.innerText.trim()) && !x.disabled); if (!b) return false; b.click(); return true; })()`);
        if (!clicked) break;
        await sleep(800);
      }
      await sleep(2500); // product drawings are rendered asynchronously
      return cdp.evaluate(ALL_CARDS);
    };

    if (process.env.PROBES) {
      for (const [smiles, filter] of JSON.parse(process.env.PROBES)) {
        const cards = await predict(smiles);
        console.log(`### ${smiles}  (${cards.length} cards)`);
        for (const card of cards.filter((c) => !filter || new RegExp(filter).test(c.title))) console.log(`  [${card.variants} drawings] ${card.text.slice(0, 700)}`);
      }
    } else {
      await assertions(predict);
    }
    check("no uncaught page exceptions", cdp.errors.length === 0, cdp.errors.slice(0, 2).join(" | "));
  } finally {
    try {
      chrome.kill();
    } catch {
      /* already closed */
    }
    try {
      preview.kill();
    } catch {
      /* already closed */
    }
    setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 1500);
  }
}

async function homeChecks(cdp) {
  const NAME_INPUT = "input[placeholder='Chemical name or SMILES']";
  /** Types a SMILES into the name field, presses Enter (which analyses) and returns the page text once a result is shown. */
  const analyse = async (smiles, expectText) => {
    await waitFor(() => cdp.evaluate(`(() => { const el = document.querySelector("${NAME_INPUT}"); return Boolean(el) && !el.disabled; })()`), "enabled name input", 120000);
    await cdp.evaluate(`(() => { const el = document.querySelector("${NAME_INPUT}"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, 'smiles:' + ${JSON.stringify(smiles)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(300);
    await cdp.evaluate(`(() => { const b = [...document.querySelectorAll('.molecule-name-input-row button')].find((x) => /^(Enter|Replace)$/.test(x.innerText.trim())); b.click(); })()`);
    await sleep(2500);
    // the Analysis page analyses on Enter; if it did not, press the Analyze button
    const analysed = await cdp.evaluate("document.body.innerText").then((t) => t.includes(expectText));
    if (!analysed) {
      await cdp.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Analyze Molecule$/.test(x.innerText.trim()) && !x.disabled); if (b) b.click(); })()`);
    }
    await waitFor(async () => (await cdp.evaluate("document.body.innerText")).includes(expectText), `result text '${expectText}' for ${smiles}`, 90000);
    await sleep(1500);
    return cdp.evaluate("document.body.innerText");
  };
  let text = await analyse("CC1CCO1", "2-methyloxetane");
  check("Analysis page names 2-methyloxetane (heteroatom locant 1, lowest substituent locant)", /2-methyloxetane/.test(text) && !/4-methyloxetane/.test(text));
  text = await analyse("C1CCC2OC2C1", "Name not available");
  check("Analysis page shows an explicit 'name not available' for cyclohexene oxide instead of a garbled name", /Name not available/.test(text) && !/hexoxy/.test(text));
  text = await analyse("CC(C)CC(C)(C)C", "2,2,4-trimethylpentane");
  check("Analysis page names isooctane with the lowest locants", /2,2,4-trimethylpentane/.test(text) && !/2,4,4-trimethylpentane/.test(text));
}

async function assertions(predict) {
  const card = (cards, title) => cards.find((c) => c.title === title) ?? null;
  let cards = await predict("C1OC1c1ccccc1");
  let c = card(cards, "Epoxide Opening with HBr");
  check("styrene oxide + HBr puts the bromide on the benzylic carbon (2-bromo-2-phenylethanol)", Boolean(c) && /2-bromo-2-phenylethan/.test(c.text) && !/2-bromo-1-phenylethan/.test(c.text), c ? c.text.slice(0, 160) : "no card");
  cards = await predict("CC1CO1");
  c = card(cards, "Epoxide Opening with HBr");
  check("propylene oxide + HBr is unchanged (1-bromopropan-2-ol)", Boolean(c) && /1-bromopropan-2-ol/.test(c.text));
  cards = await predict("CC1(C)OC1c1ccccc1");
  c = card(cards, "Epoxide Opening with HBr");
  check("an epoxide whose two carbons are both stabilised lists both regioisomers", Boolean(c) && c.variants === 2, c ? c.variants + " drawings" : "no card");
}

try {
  await main();
} catch (error) {
  check(`harness error: ${error instanceof Error ? error.message : String(error)}`, false);
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
