// Live-browser check of the Multi-Catalytic workspace (Stage 9B-2B).
//
// Drives a real headless Chrome through the Chrome DevTools Protocol (Node's built-in WebSocket;
// no new dependencies) against the production build served by `vite preview`, so the real Ketcher
// editor, the real RDKit and the real reaction engine are in the loop.
//
//   npm run build
//   node scripts/browser/multicatalyticLiveCheck.mjs [--keep-open]
//
// Prints one PASS/FAIL line per check and exits non-zero if any check fails. Screenshots are
// written to the directory in POCKETCHEM_SHOTS (default: the OS temp dir).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 4179;
const DEBUG_PORT = 9339;
const SHOTS = process.env.POCKETCHEM_SHOTS || os.tmpdir();
const CHROME = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((candidate) => candidate && fs.existsSync(candidate));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, description, timeoutMs = 45000, step = 150) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await predicate();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(step);
  }
  throw new Error(`Timed out waiting for ${description}${last instanceof Error ? `: ${last.message}` : ""}`);
}

// ---- tiny CDP client ---------------------------------------------------------------------------
class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve);
      this.ws.addEventListener("error", reject);
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message}`));
        else resolve(message.result);
      } else if (message.method === "Runtime.exceptionThrown") {
        this.consoleErrors.push(message.params.exceptionDetails?.exception?.description ?? "exception");
      }
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  async screenshot(name) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    const file = path.join(SHOTS, `pocketchem-${name}.png`);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  }
}

// ---- page helpers (run inside the page) ----------------------------------------------------------
const PAGE_HELPERS = `
  window.__pc = {
    text: () => document.body.innerText,
    clickButton: (label, scope) => {
      const root = scope ? document.querySelector(scope) : document;
      const button = [...root.querySelectorAll('button')].find((b) => b.innerText.trim() === label && !b.disabled);
      if (!button) return false;
      button.click();
      return true;
    },
    buttonDisabled: (label) => {
      const button = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === label);
      return button ? button.disabled : null;
    },
    setInput: (selector, value) => {
      const input = document.querySelector(selector);
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    tick: (id, wanted) => {
      const box = document.querySelector('input[aria-label*="(' + id + ')"]');
      if (!box) return false;
      if (box.checked !== wanted) box.click();
      return true;
    },
    inventoryIds: () => [...document.querySelectorAll('.workspace-lot-list code')].map((c) => c.innerText),
    historyCount: () => document.querySelectorAll('.multicatalytic-route-steps > .multicatalytic-result-step').length,
    historyStatuses: () => [...document.querySelectorAll('.multicatalytic-route-steps > .multicatalytic-result-step')].map((s) => s.getAttribute('data-status')),
  };
  true;
`;

async function main() {
  if (!CHROME) throw new Error("No Chrome or Edge installation was found (set CHROME_PATH).");
  if (!fs.existsSync(path.join(root, "dist", "index.html"))) throw new Error("dist/ is missing; run `npm run build` first.");

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pocketchem-chrome-"));
  const preview = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--disable-gpu", "--window-size=1500,1900", "about:blank",
  ], { stdio: "ignore" });
  const cleanup = () => {
    try { chrome.kill(); } catch { /* already closed */ }
    try { preview.kill(); } catch { /* already closed */ }
    setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 1500);
  };

  try {
    await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/`)).ok, "vite preview");
    const targets = await waitFor(async () => {
      const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
      return list.find((item) => item.type === "page");
    }, "Chrome debugging endpoint");
    const cdp = new Cdp(targets.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    const open = async () => {
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
      await waitFor(() => cdp.evaluate("document.readyState === 'complete' && document.body.innerText.includes('Multi-Catalytic')"), "app shell");
      await cdp.evaluate(PAGE_HELPERS);
    };
    const gotoMulticatalytic = async () => {
      await cdp.evaluate(`window.__pc.clickButton('Multi-Catalytic')`);
      await waitFor(() => cdp.evaluate(`window.__pc.text().includes('Multi-Catalytic Workspace')`), "workspace panel");
    };
    const editorReady = () => waitFor(() => cdp.evaluate(`Boolean(window.multiCatalyticWorkspaceKetcher) && window.__pc.text().includes('Editor ready')`), "workspace Ketcher editor", 90000);
    const addMolecule = async (smiles, expectedCount) => {
      await cdp.evaluate(`window.multiCatalyticWorkspaceKetcher.setMolecule(${JSON.stringify(smiles)})`);
      await sleep(400);
      await waitFor(() => cdp.evaluate(`window.__pc.clickButton('Add drawn molecule(s) to inventory')`), "Add button");
      await waitFor(async () => (await cdp.evaluate(`window.__pc.inventoryIds().length`)) === expectedCount, `${expectedCount} inventory entries`);
    };
    const chooseRule = async (ruleId, search) => {
      await cdp.evaluate(`window.__pc.setInput('#workspace-condition-search', ${JSON.stringify(search)})`);
      await waitFor(() => cdp.evaluate(`Boolean(document.querySelector('[data-rule-id="${ruleId}"]'))`), `rule ${ruleId} in the list`);
      await cdp.evaluate(`document.querySelector('[data-rule-id="${ruleId}"]').click()`);
    };
    const runStep = async (ruleId, search, lotIds, expectedHistory) => {
      await chooseRule(ruleId, search);
      for (const id of lotIds) await waitFor(() => cdp.evaluate(`window.__pc.tick(${JSON.stringify(id)}, true)`), `lot ${id} checkbox`);
      await waitFor(async () => (await cdp.evaluate(`window.__pc.buttonDisabled('Run step')`)) === false, "Run step enabled");
      await cdp.evaluate(`window.__pc.clickButton('Run step')`);
      await waitFor(async () => (await cdp.evaluate(`window.__pc.historyCount()`)) === expectedHistory, `${expectedHistory} history entries`);
    };

    // ---------------------------------------------------------------- fresh start
    await open();
    await gotoMulticatalytic();
    await editorReady();
    check("the Multi-Catalytic page loads with the live Ketcher editor and both tools", await cdp.evaluate(`window.__pc.text().includes('Ordered sequence (one molecule)') && window.__pc.text().includes('Workspace (several molecules)')`));
    await cdp.evaluate(`localStorage.clear()`);

    // ---------------------------------------------------------------- multiple molecule inputs
    await addMolecule("CCCCBr", 1);
    await addMolecule("CCCCO", 2);
    check("multiple molecules can be drawn and added to the inventory", (await cdp.evaluate(`window.__pc.inventoryIds().join(',')`)) === "sm0#1,sm1#1");
    check("a drawing that was added is cleared from the canvas", (await cdp.evaluate(`window.multiCatalyticWorkspaceKetcher.getSmiles()`)) === "");

    // ---------------------------------------------------------------- missing partner: the UI blocks it
    await addMolecule("CC(=O)O", 3);
    await chooseRule("fischer-esterification", "fischer");
    await cdp.evaluate(`window.__pc.tick('sm2#1', true)`);
    await sleep(500);
    check("a reaction that needs a second molecule cannot be run with only one selected", (await cdp.evaluate(`window.__pc.buttonDisabled('Run step')`)) === true);
    check("the page says how many molecules the reaction consumes", (await cdp.evaluate(`window.__pc.text()`)).includes("Consumes 2 molecules"));
    await cdp.evaluate(`window.__pc.tick('sm2#1', false)`);

    // ---------------------------------------------------------------- the two branches, convergence, post-modification
    await runStep("haloalkane-grignard-formation-bromide", "grignard reagent formation", ["sm0#1"], 1);
    await runStep("primary-alcohol-mild-oxidation", "oxidation to an aldehyde", ["sm1#1"], 2);
    const afterBranches = await cdp.evaluate(`window.__pc.inventoryIds().join(',')`);
    check("two independent branches each consumed their own starting molecule", afterBranches === "sm2#1,s1.1,s2.1", afterBranches);
    await runStep("aldehyde-organometallic-addition", "organometallic addition", ["s2.1", "s1.1"], 3);
    const afterJoin = await cdp.evaluate(`window.__pc.inventoryIds().join(',')`);
    check("the convergent step consumed both branch products and created one", afterJoin === "sm2#1,s3.1", afterJoin);
    await runStep("secondary-alcohol-oxidation-pcc", "oxidation with pcc", ["s3.1"], 4);
    const finalIds = await cdp.evaluate(`window.__pc.inventoryIds().join(',')`);
    check("the combined product was modified by a further step", finalIds === "sm2#1,s4.1", finalIds);
    await waitFor(() => cdp.evaluate(`window.__pc.text().includes('Structure replay passed')`), "structure replay result");
    check("structure replay is reported and is not described as experimental validation", (await cdp.evaluate(`window.__pc.text()`)).includes("This is not experimental validation"));
    check("the unrelated acetic acid molecule stayed in the inventory untouched", await cdp.evaluate(`window.__pc.inventoryIds().includes('sm2#1')`));
    check("each step shows its catalysts/reagents and conditions, with the isolation statement", await cdp.evaluate(`window.__pc.text().includes('Catalysts and reagents.') && window.__pc.text().includes('Conditions.') && window.__pc.text().includes('is isolated before the next step runs')`));
    check("the assessment says steps run in isolation and claims no tandem or cooperative catalysis", await cdp.evaluate(`window.__pc.text().includes('does not claim, a one-pot tandem process or cooperative catalysis')`));
    check("every history entry is a completed reaction", (await cdp.evaluate(`window.__pc.historyStatuses().join(',')`)) === "reaction,reaction,reaction,reaction");
    console.log("   screenshot:", await cdp.screenshot("workspace-convergent"));

    // ---------------------------------------------------------------- competing outcomes
    await addMolecule("CC(C)CC", 3);
    await chooseRule("alkane-radical-bromination", "free-radical bromination");
    await cdp.evaluate(`window.__pc.tick('sm3#1', true)`);
    await waitFor(async () => (await cdp.evaluate(`window.__pc.buttonDisabled('Run step')`)) === false, "Run step enabled");
    await cdp.evaluate(`window.__pc.clickButton('Run step')`);
    await waitFor(() => cdp.evaluate(`window.__pc.text().includes('Choose an outcome')`), "outcome chooser");
    check("several distinct outcomes stop the step for an explicit choice", true);
    const chooserText = await cdp.evaluate(`document.querySelector('.workspace-choice').innerText`);
    check("the chooser shows the rule's own estimates and does not rank unestimated outcomes", /Estimated major product \(the rule's own numeric estimate\)/.test(chooserText) && /Estimated minor or trace/.test(chooserText));
    check("nothing was consumed while the choice is pending", (await cdp.evaluate(`window.__pc.inventoryIds().includes('sm3#1')`)) === true);
    check("a new step cannot be run while a choice is pending", (await cdp.evaluate(`window.__pc.buttonDisabled('Run step')`)) === true);
    console.log("   screenshot:", await cdp.screenshot("workspace-choice"));
    await cdp.evaluate(`window.__pc.clickButton('Use this outcome', '.workspace-choice')`);
    await waitFor(async () => (await cdp.evaluate(`window.__pc.historyCount()`)) === 6, "history after choice");
    const statuses = await cdp.evaluate(`window.__pc.historyStatuses().join(',')`);
    check("the chosen outcome is committed after the pending attempt, which stays in the history", statuses.endsWith("needs-selection,reaction"), statuses);
    check("the page says the user chose the outcome", (await cdp.evaluate(`window.__pc.text()`)).includes("You chose this outcome"));

    // ---------------------------------------------------------------- undo
    await cdp.evaluate(`window.__pc.clickButton('Undo last action')`);
    await waitFor(async () => (await cdp.evaluate(`window.__pc.historyCount()`)) === 5, "history after undo");
    check("undo restores the earlier inventory (the molecule awaiting a choice is back)", await cdp.evaluate(`window.__pc.inventoryIds().includes('sm3#1')`));

    // ---------------------------------------------------------------- automatic recovery after a reload
    await sleep(1800); // the save is debounced
    const before = await cdp.evaluate(`JSON.stringify({ids: window.__pc.inventoryIds(), n: window.__pc.historyCount()})`);
    await open();
    await gotoMulticatalytic();
    await waitFor(() => cdp.evaluate(`window.__pc.text().includes('Restored from your previous session')`), "restored notice");
    const afterReload = await cdp.evaluate(`JSON.stringify({ids: window.__pc.inventoryIds(), n: window.__pc.historyCount()})`);
    check("the workspace is restored after a reload with the same inventory and history", before === afterReload, `${before} -> ${afterReload}`);
    check("the restored page says nothing was recomputed", (await cdp.evaluate(`window.__pc.text()`)).includes("were not recomputed"));
    await editorReady();

    // ---------------------------------------------------------------- continue working after a restore
    check("a choice that was pending before the reload is still pending, and its molecule is still unconsumed", (await cdp.evaluate(`window.__pc.text().includes('Choose an outcome')`)) && (await cdp.evaluate(`window.__pc.inventoryIds().includes('sm3#1')`)));
    check("Run step stays disabled until the restored choice is made", (await cdp.evaluate(`window.__pc.buttonDisabled('Run step')`)) === true);
    await cdp.evaluate(`window.__pc.clickButton('Use this outcome', '.workspace-choice')`);
    await waitFor(async () => (await cdp.evaluate(`window.__pc.historyCount()`)) === 6, "history after resolving the restored choice");
    check("a restored workspace keeps working: the restored choice was resolved against the restored lots", (await cdp.evaluate(`window.__pc.historyStatuses().slice(-1)[0]`)) === "reaction" && !(await cdp.evaluate(`window.__pc.inventoryIds().includes('sm3#1')`)));

    // ---------------------------------------------------------------- save, clear, reopen from Saved
    await cdp.evaluate(`window.__pc.clickButton('Save Analysis')`);
    await waitFor(() => cdp.evaluate(`Boolean(document.querySelector('.synthesis-save-form input'))`), "save form");
    await cdp.evaluate(`window.__pc.setInput('.synthesis-save-form input', 'Live check workspace')`);
    await cdp.evaluate(`window.__pc.clickButton('Save')`);
    await waitFor(() => cdp.evaluate(`window.__pc.text().includes('Saved “Live check workspace”')`), "save confirmation");
    const savedBefore = await cdp.evaluate(`JSON.stringify({ids: window.__pc.inventoryIds(), n: window.__pc.historyCount()})`);
    await cdp.evaluate(`window.__pc.clickButton('Clear workspace')`);
    await waitFor(async () => (await cdp.evaluate(`window.__pc.inventoryIds().length`)) === 0, "empty inventory after clear");
    check("Clear workspace empties the inventory and history", (await cdp.evaluate(`window.__pc.historyCount()`)) === 0);
    await cdp.evaluate(`window.__pc.clickButton('Saved')`);
    await waitFor(() => cdp.evaluate(`window.__pc.text().includes('Live check workspace')`), "saved list entry");
    check("the saved workspace is listed under Saved with its own page label", (await cdp.evaluate(`window.__pc.text()`)).includes("Multi-Catalytic Workspace"));
    check("the saved summary counts completed and incomplete steps", /completed steps?/.test(await cdp.evaluate(`window.__pc.text()`)));
    await waitFor(async () => (await cdp.evaluate(`window.__pc.clickButton('Open')`)) === true, "Open button");
    await waitFor(() => cdp.evaluate(`window.__pc.text().includes('Opened saved analysis “Live check workspace”')`), "opened notice", 60000);
    const savedAfter = await cdp.evaluate(`JSON.stringify({ids: window.__pc.inventoryIds(), n: window.__pc.historyCount()})`);
    check("reopening the saved analysis restores the same inventory and history", savedBefore === savedAfter, `${savedBefore} -> ${savedAfter}`);
    console.log("   screenshot:", await cdp.screenshot("workspace-reopened"));

    // ---------------------------------------------------------------- the original tool is untouched
    await cdp.evaluate(`window.__pc.clickButton('Ordered sequence (one molecule)')`);
    await waitFor(() => cdp.evaluate(`window.__pc.text().includes('Add reagent / catalyst')`), "ordered-sequence tool");
    check("the original ordered-sequence tool still opens", true);
    check("diagnostic mode is an explicit opt-in and is off by default", (await cdp.evaluate(`document.querySelector('.multicatalytic-diagnostic input').checked`)) === false);
    check("the page explains why a branch stops by default", await cdp.evaluate(`window.__pc.text().includes('a step cannot use an intermediate that was never made')`));

    check("no uncaught page exceptions were raised", cdp.consoleErrors.length === 0, cdp.consoleErrors.slice(0, 2).join(" | "));
  } finally {
    if (!process.argv.includes("--keep-open")) cleanup();
  }
}

try {
  await main();
} catch (error) {
  check(`harness error: ${error instanceof Error ? error.message : String(error)}`, false);
}
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
