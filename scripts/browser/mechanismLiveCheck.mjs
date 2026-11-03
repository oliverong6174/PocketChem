// Live-browser check of the Stage 9E selectivity, rearrangement and stereochemistry output on the Reactions page.
// Real headless Chrome + live Ketcher + the production build (see multicatalyticLiveCheck.mjs).
//   npm run build && node scripts/browser/mechanismLiveCheck.mjs
// Set PROBES='[["SMILES","title-regex"], ...]' to print the cards for those molecules instead of asserting (discovery mode).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 4182;
const DEBUG_PORT = 9342;
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

async function assertions(predict) {
  const BS = String.fromCharCode(92);
  /** The single card whose title is exactly `title`, or null. */
  const card = (cards, title) => cards.find((c) => c.title === title) ?? null;

  // --- electrophilic aromatic substitution: ortho and para are both listed and not ranked
  let cards = await predict("Cc1ccccc1");
  let c = card(cards, "Aromatic Nitration");
  check("toluene nitration lists two products (ortho and para)", Boolean(c) && c.variants === 2, c ? `${c.variants} drawings` : "no card");
  check("nitration says the products are not ranked and never calls one major", Boolean(c) && /does not rank them/.test(c.text) && !/Major product/.test(c.text) && !/chemically competitive/.test(c.text));

  // --- carbocation rearrangement: direct and shifted products, unranked
  cards = await predict("C=CC(C)(C)C");
  c = card(cards, "Acid-Catalyzed Hydration");
  check("3,3-dimethylbut-1-ene hydration lists the direct and the methyl-shifted alcohol", Boolean(c) && c.variants === 2 && /does not rank them/.test(c.text), c ? `${c.variants} drawings` : "no card");
  c = card(cards, "HX Addition: Hydrohalogenation");
  check("3,3-dimethylbut-1-ene HX addition lists both halides and says carbocation rearrangement is modelled", Boolean(c) && c.variants === 2 && /both the direct and the rearranged halide are listed/.test(c.text));

  cards = await predict("c1ccccc1.CC(C)(C)CCl");
  c = card(cards, "Friedel–Crafts Alkylation");
  check("benzene + neopentyl chloride lists neopentylbenzene and the rearranged tert-pentylbenzene, unranked", Boolean(c) && c.variants === 2 && /does not rank them/.test(c.text) && /rearranged alkylarene is listed/.test(c.text));

  // --- E2: qualitative ranking shown under each structure, with its evidence
  cards = await predict("CC(C)C(C)(C)Br.[O-]CC");
  c = card(cards, "E2 with an Unhindered Alkoxide");
  check("small alkoxide on a tertiary bromide: Zaitsev alkene labelled major, the other minor, evidence quoted", Boolean(c) && c.variants === 2 && /Major product \(qualitative\)/.test(c.text) && /Minor product \(qualitative\)/.test(c.text) && /Reusch/.test(c.text));
  cards = await predict("CC(C)C(C)(C)Br.[O-]C(C)(C)C");
  c = card(cards, "E2 with tert-Butoxide: Hofmann Preference");
  check("tert-butoxide on the same bromide: Hofmann alkene major, Zaitsev alkene competitive (not 'minor')", Boolean(c) && c.variants === 2 && /Major product \(qualitative\)/.test(c.text) && /Competitive alkene \(qualitative\)/.test(c.text));

  // --- epoxide regiochemistry and stereochemistry
  cards = await predict("CC1CO1");
  c = card(cards, "Epoxide Opening with HBr");
  check("propylene oxide + HBr gives 1-bromopropan-2-ol (halide on the less substituted carbon)", Boolean(c) && /1-bromopropan-2-ol/.test(c.text), c ? "" : "no card");
  cards = await predict("C1CCC2OC2C1");
  c = card(cards, "Base-Catalyzed Epoxide Opening with Hydroxide");
  check("cyclohexene oxide opens to the trans-diol racemate", Boolean(c) && /Racemic mixture/.test(c.text));
  c = card(cards, "Epoxide Opening with HBr");
  check("cyclohexene oxide + HBr gives trans-2-bromocyclohexanol as a racemate", Boolean(c) && /Racemic mixture/.test(c.text) && /2-bromocyclohexanol/.test(c.text));

  // --- halohydrin: racemate for E and Z disubstituted alkenes; unassigned (stated) for a trisubstituted one
  for (const [label, smiles] of [["(E)", "C/C=C/C"], ["(Z)", `C/C=C${BS}C`]]) {
    cards = await predict(smiles);
    c = card(cards, "Halohydrin Formation");
    check(`${label}-2-butene halohydrin is shown as a racemate`, Boolean(c) && /Racemic mixture/.test(c.text));
  }
  cards = await predict("CC=C(C)CC");
  c = card(cards, "Halohydrin Formation");
  const epoxide = card(cards, "Epoxidation");
  check(
    "a trisubstituted alkene's halohydrin and epoxide carry no invented stereochemistry and say why",
    Boolean(c) && Boolean(epoxide) && !/Product mixture/.test(c.text) && !/Product mixture/.test(epoxide.text) && /not assigned/.test(c.text) && /not assigned/.test(epoxide.text),
  );
}

try {
  await main();
} catch (error) {
  check(`harness error: ${error instanceof Error ? error.message : String(error)}`, false);
}
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
