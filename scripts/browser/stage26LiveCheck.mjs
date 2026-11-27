// Stage 26 live-browser check (headless Chrome, production build): Organelles & protein trafficking, Cell cycle & checkpoints,
// Apoptosis & autophagy - navigation, selectable organelles, cargo routes and perturbations, vesicle/endosome/quality-control views,
// cell-cycle verdicts for G1/S, DNA damage, licensing, G2/M and the spindle checkpoint, intrinsic/extrinsic apoptosis, caspases,
// autophagy, the fate map, learning modes, save/reopen, concept search, cross-subject links, themes and layouts. Expected values are
// typed independently of the code. Screenshots are written for visual inspection.
//   npm run build && node scripts/browser/stage26LiveCheck.mjs      (screenshots: node_modules/.cache/pc-live26)
import path from "node:path";
import { q, root, screenshot, setViewport, sleep, startBrowser, waitFor } from "./lib/chrome.mjs";

const results = [];
const check = (name, ok, detail = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${String(detail).slice(0, 260)}` : ""}`); };
const outDir = process.env.SHOT_DIR ?? path.join(root, "node_modules", ".cache", "pc-live26");
const { cdp, url, stop } = await startBrowser({ port: 4362, debugPort: 9522 });
const ev = (e) => cdp.evaluate(e);
let nav = 0;
const NATIVE = `const set = (el, v) => { const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };`;
const click = (label, scope = "document") => ev(`(() => { const b = [...${scope}.querySelectorAll('button')].find((x) => x.innerText.trim() === ${q(label)} && !x.disabled && x.getClientRects().length); if (!b) return false; b.click(); return true; })()`);
const clickAria = (label) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === ${q(label)} && !x.disabled); if (!b) return false; b.click(); return true; })()`);
const choose = (label) => ev(`(() => { const o = [...document.querySelectorAll('.ui-seg-option')].find((x) => x.textContent.trim() === ${q(label)} && x.getClientRects().length); if (!o) return false; (o.querySelector('input') ?? o).click(); return true; })()`);
const tick = (testid) => ev(`(() => { const el = document.querySelector('[data-testid=${testid}]'); if (!el) return false; el.click(); return true; })()`);
const svgClick = (testid) => ev(`(() => { const el = document.querySelector('[data-testid=${testid}]'); if (!el) return false; el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
const comp = (id) => ev(`(() => { const el = document.querySelector('[data-component=${id}]'); if (!el) return false; el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
const setText = (selector, value) => ev(`(() => { ${NATIVE} const el = document.querySelector(${q(selector)}); if (!el) return false; set(el, ${q(value)}); return true; })()`);
const textOf = (sel) => ev(`(document.querySelector(${q(sel)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`);
const count = (sel) => ev(`document.querySelectorAll(${q(sel)}).length`);
const bodyText = () => ev(`document.body.innerText.replace(/\\s+/g, ' ')`);
const hash = () => ev(`location.hash`);
const isChecked = (testid) => ev(`!!document.querySelector('[data-testid=${testid}]')?.checked`);
const isDisabled = (testid) => ev(`!!document.querySelector('[data-testid=${testid}]')?.disabled`);
const clearStorage = () => ev(`(async () => { try { localStorage.clear(); sessionStorage.clear(); const dbs = (await indexedDB.databases?.()) ?? []; await Promise.all(dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); }))); } catch (e) {} return true; })()`);
const ready = (what) => waitFor(() => ev(`document.readyState === 'complete' && document.body.innerText.length > 50`), what);
const fresh = async (w, scheme, target) => {
  await setViewport(cdp, w, w < 500 ? 812 : w < 1000 ? 1024 : 900, { scheme });
  nav += 1; await cdp.send("Page.navigate", { url: `${url}?n=${nav}#/biology/overview` });
  await ready("app"); await sleep(300); await clearStorage();
  nav += 1; await cdp.send("Page.navigate", { url: `${url}?n=${nav}${target}` });
  await ready("app"); await sleep(1000);
};
const next = async (n) => { for (let i = 0; i < n; i += 1) await clickAria("Next step"); await sleep(250); };
const last = async () => { await clickAria("Last step"); await sleep(350); };
const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const tabs = () => ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].map((b) => b.textContent.trim()).join('|')`);
const shot = async (name, sel = ".ui-diagram") => { await ev(`(document.querySelector(${q(sel)}) || document.body).scrollIntoView({ block: 'start' })`); await sleep(300); await screenshot(cdp, path.join(outDir, name), { fullPage: false }); };
const cdpKey = async (k, code, vk, modifiers = 0) => {
  await cdp.send("Input.dispatchKeyEvent", { type: k === "Enter" ? "keyDown" : "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(k === "Enter" ? { text: String.fromCharCode(13) } : {}) });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
};
const ORG = "#/biology/organelles-trafficking", CYC = "#/biology/cell-cycle-checkpoints", DTH = "#/biology/apoptosis-autophagy";
const verdict = (id) => textOf(`[data-testid=verdict-status-${id}]`);
const nodeState = async (id) => { await svgClick(`node-${id}`); await sleep(200); return textOf("[data-testid=node-state]"); };
const progress = () => textOf("[data-testid=path-progress]");

try {
  // ---- 1. Biology overview and navigation
  await fresh(1440, "light", "#/biology/overview");
  const t = await tabs();
  check("1 Biology tabs list the three new tools after Neuronal physiology and before Saved", /Neuronal physiology\|Organelles & protein trafficking\|Cell cycle & checkpoints\|Apoptosis & autophagy\|Saved$/.test(t), t);
  const ov = await ev(`({ cards: [...document.querySelectorAll('.gc-tool-card h3')].map((b) => b.textContent.trim()), heads: [...document.querySelectorAll('.ph-group-heading')].map((h) => h.textContent.trim()) })`);
  check("1 overview lists 13 working tools including the three new ones and a Cell organization & regulation group", ov.cards.length === 13 && ov.cards.includes("Organelles & protein trafficking") && ov.cards.includes("Apoptosis & autophagy") && ov.heads.includes("Cell organization & regulation"), JSON.stringify(ov));
  await click("Open Organelles & protein trafficking"); await sleep(1200);
  check("1 the Open button reaches the organelle laboratory", (await hash()) === ORG, await hash());
  await fresh(1440, "light", "#/biology/overview"); await click("Open Cell cycle & checkpoints"); await sleep(1000);
  check("1 the Open button reaches the cell-cycle laboratory", (await hash()) === CYC, await hash());
  await fresh(1440, "light", "#/biology/overview"); await click("Open Apoptosis & autophagy"); await sleep(1000);
  check("1 the Open button reaches the apoptosis laboratory", (await hash()) === DTH, await hash());

  // ---- 2. interactive organelle selection
  await fresh(1440, "light", ORG);
  check("2 cell map has at least 13 selectable organelle shapes and 14 list buttons", (await count("svg.b26-cell [data-component]")) >= 13 && (await count("[data-testid^=org-]")) === 14, `${await count("svg.b26-cell [data-component]")}`);
  await shot("org-cell-empty.png", ".ui-diagram");
  await comp("golgi"); await sleep(300);
  check("2 selecting the Golgi shows its functions and the secreted, membrane and lysosomal routes through it", /Golgi apparatus/.test(await bodyText()) && /Processes glycans/.test(await textOf("[data-testid=organelle-detail]")) && /Secreted protein/.test(await textOf("[data-testid=organelle-processes]")) && /Lysosomal hydrolase/.test(await textOf("[data-testid=organelle-processes]")) && !/Nuclear protein/.test(await textOf("[data-testid=organelle-processes]")), await textOf("[data-testid=organelle-processes]"));
  await comp("mitochondrion"); await sleep(300);
  check("2 selecting the mitochondrion shows a double membrane and the matrix-protein route", /double membrane/.test(await textOf("[data-testid=organelle-detail]")) && /Mitochondrial matrix protein/.test(await textOf("[data-testid=organelle-processes]")));
  await comp("nuclear-pore"); await sleep(300);
  check("2 selecting the nuclear pore shows the nuclear-import route", /Nuclear protein/.test(await textOf("[data-testid=organelle-processes]")));
  await tick("org-peroxisome"); await sleep(300);
  check("2 the peroxisome has no modelled route and says so; the drawing is flagged schematic", /No modelled cargo route passes through this organelle/.test(await bodyText()) && /schematic/i.test(await bodyText()));
  await comp("lysosome"); await sleep(300);
  await shot("org-cell-selected.png", ".ui-diagram");
  check("2 selecting an organelle on the map marks it in the list (aria-pressed) ", await ev(`document.querySelector('[data-testid=org-lysosome]').getAttribute('aria-pressed') === 'true'`));

  // ---- 3. secretory protein trafficking
  await fresh(1440, "light", ORG); await choose("Cargo tracker"); await sleep(500);
  check("3 tracker opens on the secreted protein with SRP recognition in its facts", /Free ribosome|Co-translational/.test(await textOf("[data-testid=cargo-facts]")) && /SRP/.test(await textOf("[data-testid=cargo-facts]")));
  check("3 step 1: translation on a free ribosome in the cytosol", /Cytosol/.test(await textOf("[data-testid=step-compartment]")) && (await count("[data-testid=cargo-marker]")) === 1);
  await next(2); check("3 step 3: ribosome delivered to the Sec61 translocon in the ER", /Endoplasmic reticulum/.test(await textOf("[data-testid=step-compartment]")) && /Sec61/.test(await textOf("[data-testid=step-detail]")), await textOf("[data-testid=step-detail]"));
  await next(1); check("3 step 4: signal peptide cleaved, soluble chain in the lumen", /signal peptide removed|Soluble chain in the ER lumen/.test(await textOf("[data-testid=step-processing]")), await textOf("[data-testid=step-processing]"));
  await next(2); check("3 step 6: packaged into COPII carriers (Sar1, Sec23/Sec24)", /COPII-coated/.test(await textOf("[data-testid=step-compartment]")) && /Sar1/.test(await textOf("[data-testid=step-detail]")), await textOf("[data-testid=step-detail]"));
  await shot("org-secreted-copii.png", ".ui-diagram");
  await last();
  check("3 end of route: soluble protein released into the extracellular space after exocytosis", /Extracellular space/.test(await textOf("[data-testid=step-compartment]")) && /Step 11 of 11/.test(await bodyText()), await textOf("[data-testid=step-compartment]"));
  await shot("org-secreted-end.png", ".ui-diagram");
  await tick("pert-srp-disabled"); await sleep(400);
  check("3 SRP disabled: the secreted protein stays in the cytosol, the blocked step is named and the outcome lists what is not modelled", /Cytosol/.test(await textOf("[data-testid=step-compartment]")) && /Blocked: Signal recognised by SRP/.test(await bodyText()) && /not modelled/.test(await textOf("[data-testid=outcome-uncertain]")), await textOf("[data-testid=blocked-note]"));
  await shot("org-secreted-srp-disabled.png", ".ui-diagram");
  await tick("pert-er-export-impaired"); await sleep(300);
  check("3 a second perturbation that gates a later step is reported as already stopped earlier", /already stopped earlier/.test(await textOf("[data-testid=outcome-definite]")), await textOf("[data-testid=outcome-definite]"));
  await tick("pert-srp-disabled"); await sleep(300); await last();
  check("3 with only impaired ER export the secreted protein is retained in the ER", /Endoplasmic reticulum/.test(await textOf("[data-testid=step-compartment]")), await textOf("[data-testid=step-compartment]"));
  await shot("org-secreted-er-retained.png", ".ui-diagram");

  // ---- 6. membrane protein, ER and Golgi order, topology
  await fresh(1440, "light", ORG); await choose("Cargo tracker"); await tick("cargo-membrane"); await sleep(400);
  await next(3);
  check("6 membrane cargo after insertion: N-terminal domain in the ER lumen, C-terminal domain in the cytosol", /ER lumen/.test(await textOf("[data-testid=step-topology]")) && /cytosol/.test(await textOf("[data-testid=step-topology]")), await textOf("[data-testid=step-topology]"));
  await next(3);
  check("6 in the Golgi the lumenal domain faces the Golgi lumen (topology does not flip)", /cis-Golgi|medial-Golgi/.test(await textOf("[data-testid=step-compartment]")) && /Golgi lumen/.test(await textOf("[data-testid=step-topology]")), await textOf("[data-testid=step-topology]"));
  await last();
  check("6 after fusion with the plasma membrane the former lumenal domain is outside the cell", /Plasma membrane/.test(await textOf("[data-testid=step-compartment]")) && /extracellular space/.test(await textOf("[data-testid=step-topology]")), await textOf("[data-testid=step-topology]"));
  await shot("org-membrane-end.png", ".ui-diagram");
  await tick("cargo-cytosolic"); await last();
  check("6 a cytosolic protein never visits the ER or Golgi: it ends in the cytosol after three steps", /Cytosol/.test(await textOf("[data-testid=step-compartment]")) && /Step 3 of 3/.test(await bodyText()));

  // ---- 4. nuclear protein import
  await fresh(1440, "light", ORG); await choose("Cargo tracker"); await tick("cargo-nuclear"); await sleep(400); await next(1);
  check("4 nuclear: importin-α binds the NLS in the cytosol", /Importin-α/.test(await textOf("[data-testid=step-detail]")), await textOf("[data-testid=step-detail]"));
  await next(1); check("4 nuclear: the complex docks at the nuclear pore (FG-nucleoporins)", /Nuclear pore complex/.test(await textOf("[data-testid=step-compartment]")) && /FG-nucleoporins/.test(await textOf("[data-testid=step-detail]")));
  await last(); check("4 nuclear: Ran-GTP releases the cargo in the nucleus", /Nucleus/.test(await textOf("[data-testid=step-compartment]")) && /Ran-GTP/.test(await textOf("[data-testid=step-detail]")));
  await shot("org-nuclear-end.png", ".ui-diagram");
  await tick("pert-nuclear-targeting-defective"); await sleep(400);
  check("4 defective NLS recognition: the protein stays in the cytosol", /Cytosol/.test(await textOf("[data-testid=step-compartment]")) && /Nuclear targeting defective/.test(await bodyText()));
  await tick("pert-nuclear-targeting-defective"); await tick("pert-ran-gradient-lost"); await sleep(300); await last();
  check("4 loss of the Ran gradient stalls the cargo at the nuclear pore", /Nuclear pore complex/.test(await textOf("[data-testid=step-compartment]")), await textOf("[data-testid=step-compartment]"));
  await shot("org-nuclear-ran-lost.png", ".ui-diagram");
  await tick("pert-srp-disabled"); await sleep(300);
  check("4 an SRP perturbation has no effect on a nuclear protein and the page says why", /no step of this route depends on it/.test(await textOf("[data-testid=outcome-definite]")), await textOf("[data-testid=outcome-definite]"));

  // ---- 5. mitochondrial targeting
  await fresh(1440, "light", ORG); await choose("Cargo tracker"); await tick("cargo-mitochondrial"); await sleep(400); await next(2);
  check("5 mitochondrial: crosses the outer membrane through TOM40 into the intermembrane space", /intermembrane space/.test(await textOf("[data-testid=step-compartment]")) && /TOM40/.test(await textOf("[data-testid=step-detail]")), await textOf("[data-testid=step-compartment]"));
  await next(1); check("5 mitochondrial: TIM23 and the membrane potential move it into the matrix", /Mitochondrial matrix/.test(await textOf("[data-testid=step-compartment]")) && /membrane potential/.test(await textOf("[data-testid=step-detail]")));
  await shot("org-mito.png", ".ui-diagram");
  await tick("pert-mito-potential-lost"); await sleep(300); await last();
  check("5 dissipated membrane potential: arrested in the intermembrane space after TOM", /intermembrane space/.test(await textOf("[data-testid=step-compartment]")), await textOf("[data-testid=step-compartment]"));
  await tick("pert-mito-potential-lost"); await tick("pert-mts-defective"); await sleep(300); await last();
  check("5 defective presequence: the precursor stays in the cytosol", /Cytosol/.test(await textOf("[data-testid=step-compartment]")));

  // ---- lysosomal hydrolase (route and sorting failure)
  await fresh(1440, "light", ORG); await choose("Cargo tracker"); await tick("cargo-lysosomal"); await sleep(400); await last();
  check("7 lysosomal hydrolase: ends in the lysosome after M6P tagging, TGN receptors, clathrin/AP-1 and an endosome", /Lysosome/.test(await textOf("[data-testid=step-compartment]")) && /Step 13 of 13/.test(await bodyText()));
  await shot("org-lysosomal-end.png", ".ui-diagram");
  await tick("pert-m6p-blocked"); await sleep(400); await last();
  check("7 blocked M6P tagging: the hydrolase is secreted by the default route instead", /Extracellular space/.test(await textOf("[data-testid=step-compartment]")) && /default secretory route/.test(await bodyText()));
  await shot("org-lysosomal-m6p-blocked.png", ".ui-diagram");

  // ---- 6b. vesicle transport
  await fresh(1440, "light", ORG); await choose("Vesicle transport"); await sleep(500);
  check("6 COPII route shown; no stage selected yet", /COPII: ER → Golgi/.test(await textOf("[data-testid=vesicle-route]")) && (await count("[data-testid=vesicle-detail]")) === 0);
  await svgClick("node-budding"); await sleep(300);
  check("6 budding: Sec23/Sec24 and Sec13/Sec31 coat, distinguished from transport", /Sec13\/Sec31/.test(await textOf("[data-testid=vesicle-detail]")) && /Budding makes the vesicle; it does not move it/.test(await textOf("[data-testid=vesicle-detail]")));
  await svgClick("node-tethering"); await sleep(300);
  check("6 tethering: Rab1 effectors, stated to be not fusion", /Rab1/.test(await textOf("[data-testid=vesicle-detail]")) && /not fusion/.test(await textOf("[data-testid=vesicle-detail]")));
  await svgClick("node-docking"); await svgClick("node-docking"); await sleep(100); await svgClick("node-docking"); await sleep(300);
  check("6 docking: SNARE pairing that does not complete it", /SNARE/.test(await textOf("[data-testid=vesicle-detail]")) && /does not complete it/.test(await textOf("[data-testid=vesicle-detail]")), await textOf("[data-testid=vesicle-detail]"));
  await shot("org-vesicle-copii.png", ".ui-diagram");
  await choose("COPI"); await sleep(300); await svgClick("node-selection"); await sleep(300);
  check("6 COPI: retrograde Golgi → ER, coatomer recognises KKXX / KDEL-receptor signals", /retrograde/.test(await textOf("[data-testid=vesicle-route]")) && /KKXX/.test(await textOf("[data-testid=vesicle-detail]")), await textOf("[data-testid=vesicle-detail]"));
  check("6 a coat does not fix every final destination (caveat shown)", /does not alone fix|not decide|does not decide/.test(await textOf("[data-testid=vesicle-caveat]")) || /retrieves proteins/.test(await textOf("[data-testid=vesicle-caveat]")), await textOf("[data-testid=vesicle-caveat]"));
  await choose("Clathrin / AP-2"); await sleep(300); await svgClick("node-budding"); await sleep(300);
  check("6 clathrin/AP-2: dynamin scission in endocytosis", /Dynamin/.test(await textOf("[data-testid=vesicle-detail]")), await textOf("[data-testid=vesicle-detail]"));

  // ---- 7b. endosomes and lysosomes
  await fresh(1440, "light", ORG); await choose("Endosomes & lysosomes"); await sleep(500);
  check("7 LDL: the receptor recycles and LDL goes to the lysosome", /receptor recycles/.test(await textOf("[data-testid=endo-summary]")) && (await count("[data-testid=node-lysosome]")) === 1);
  await svgClick("node-late"); await sleep(300);
  check("7 late endosome: more acidic than the early endosome (pH range shown)", /5\.0–5\.5/.test(await textOf("[data-testid=endo-detail]")), await textOf("[data-testid=endo-detail]"));
  await shot("org-endo-ldl.png", ".ui-diagram");
  await tick("endo-pert-v-atpase-inhibited"); await sleep(400);
  check("7 V-ATPase inhibited: acidification fails, ligand release fails, no lysosomal degradation", /not acidified/.test(await bodyText()) && /release of the ligand from the receptor/.test(await bodyText()), "");
  await shot("org-endo-vatpase.png", ".ui-diagram");
  await choose("Transferrin"); await sleep(400);
  check("7 transferrin recycles undegraded (not all internalised material is destroyed)", /Nothing is degraded/.test(await textOf("[data-testid=endo-summary]")));
  await choose("IgA (transcytosis)"); await sleep(300);
  check("7 IgA is transcytosed and not degraded", /not degraded/.test(await textOf("[data-testid=endo-summary]")));
  check("7 the mannose 6-phosphate pathway is shown as a curated example", (await count("[data-testid=m6p-steps] li")) >= 3 && /Without the tag/.test(await textOf("[data-testid=m6p-steps]")));
  await click("Follow a lysosomal hydrolase in the Cargo tracker"); await sleep(500);
  check("7 the M6P button opens the lysosomal route in the Cargo tracker", /acid hydrolase/.test(await textOf("[data-testid=cargo-facts]")) && /mannose 6-phosphate/i.test(await textOf("[data-testid=cargo-facts]")));

  // ---- 8. protein quality control
  await fresh(1440, "light", ORG); await choose("Protein quality control"); await sleep(500);
  check("8 a misfolded protein is retained, retrotranslocated and degraded by the proteasome", /proteasome/.test(await textOf("[data-testid=outcome-definite]")) && /not exported/.test(await textOf("[data-testid=outcome-definite]")), await textOf("[data-testid=outcome-definite]"));
  await shot("org-qc-default.png", ".ui-diagram");
  await tick("pert-erad-impaired"); await sleep(300);
  check("8 ERAD impaired: the lysosomal route is the (context-dependent) alternative", /lysosomes/.test(await textOf("[data-testid=outcome-definite]")), await textOf("[data-testid=outcome-definite]"));
  await tick("pert-lysosome-route-impaired"); await sleep(300);
  check("8 both routes impaired: the protein accumulates and the unfolded protein response is not modelled", /accumulates/.test(await textOf("[data-testid=outcome-definite]")) && /not modelled/.test(await textOf("[data-testid=outcome-uncertain]")));
  await svgClick("node-lysoDeg"); await sleep(300);
  check("8 selecting a state shows its rule and what decides it", /ON when/.test(await textOf("[data-testid=node-rule]")) && (await textOf("[data-testid=node-causes]")).length > 10, await textOf("[data-testid=node-rule]"));
  await shot("org-qc-both-impaired.png", ".ui-diagram");

  // ---- 9. cell-cycle phases
  await fresh(1440, "light", CYC);
  check("9 the circular diagram has G0, G1, S, G2 and M and five verdicts", (await count("svg.b26-ring [data-component]")) >= 9 && (await count("[data-testid^=verdict-status-]")) === 5, `${await count("svg.b26-ring [data-component]")}`);
  check("9 a healthy G1 cell: every transition proceeds", (await Promise.all(["g0g1", "g1s", "s", "g2m", "m"].map(verdict))).every((v) => /proceeds/.test(v)));
  await shot("cc-ring-g1.png", ".ui-diagram");
  await comp("S"); await sleep(300);
  check("9 selecting S shows DNA replication as its process and a fork-only condition becomes available", /DNA replication/.test(await textOf("[data-testid=phase-detail]")) && !(await isDisabled("cond-replstress")));
  check("9 S phase: replication is incomplete so the S→G2 transition pauses", /pauses/.test(await verdict("s")), await verdict("s"));
  await comp("M"); await sleep(300);
  check("9 selecting M shows chromosome segregation; kinetochore attachment can now be changed", /chromosome segregation/.test(await textOf("[data-testid=phase-detail]")) && !(await isDisabled("cond-attached")));
  await comp("G1"); await sleep(300);
  check("9 contradictory conditions are disabled in G1 with the reason (attachment, forks, replication)", (await isDisabled("cond-attached")) && (await isDisabled("cond-replstress")) && (await isDisabled("cond-replcomplete")));
  await shot("cc-ring-m.png", ".ui-diagram");

  // ---- 10. G1/S control
  await fresh(1440, "light", CYC); await choose("G1/S control"); await sleep(500);
  check("10 G1/S module shows the RB–E2F network and proceeds with mitogen", (await count("[data-testid=node-rbBrake]")) === 1 && /proceeds/.test(await verdict("g1s")));
  await shot("cc-g1s-default.png", ".ui-diagram");
  await tick("cond-mitogen"); await sleep(300);
  check("10 no mitogen: G1/S pauses (cyclin D–CDK4/6 absent, RB holds E2F)", /pauses/.test(await verdict("g1s")) && (await nodeState("cdk46")).includes("off") && (await nodeState("rbBrake")).includes("ON"));
  await svgClick("node-cdk46"); await sleep(200);
  check("10 the rule text names its dependency (Cyclin D–CDK4/6 is ON when cyclin D is available)", /ON when Cyclin D available/.test(await textOf("[data-testid=node-rule]")), await textOf("[data-testid=node-rule]"));
  await shot("cc-g1s-no-mitogen.png", ".ui-diagram");
  await tick("pert-rb-loss"); await sleep(300);
  check("10 RB loss bypasses the mitogen requirement (E2F free) and the perturbation is marked in words", /proceeds/.test(await verdict("g1s")) && /forced off/.test(await ev(`document.querySelector('[data-testid=node-rbBrake]')?.getAttribute('aria-label') ?? ''`)), await ev(`document.querySelector('[data-testid=node-rbBrake]')?.getAttribute('aria-label')`));
  await tick("pert-rb-loss"); await tick("cond-restriction"); await sleep(300);
  check("10 past the restriction point, mitogen withdrawal no longer stops G1/S", /proceeds/.test(await verdict("g1s")));
  await tick("pert-cdk46-inhibited"); await sleep(300);
  check("10 CDK4/6 inhibition pauses G1/S even after the restriction-point setting", /pauses/.test(await verdict("g1s")));
  await tick("pert-cdk46-inhibited"); await tick("pert-licensing-defective"); await sleep(300);
  check("10 defective origin licensing blocks S entry although E2F and CDK2 are active", /pauses/.test(await verdict("g1s")));

  // ---- 11. DNA-damage checkpoint
  await fresh(1440, "light", CYC); await choose("DNA-damage checkpoint"); await sleep(500);
  await tick("cond-dsb"); await sleep(300);
  check("11 double-strand breaks: ATM, CHK2, p53 and p21 ON; Cdc25 and CDK2 off; G1/S pauses", (await nodeState("atm")).includes("ON") && (await nodeState("p21")).includes("ON") && (await nodeState("cdc25")).includes("off") && /pauses/.test(await verdict("g1s")));
  await shot("cc-ddr-damage.png", ".ui-diagram");
  await tick("pert-p53-loss"); await sleep(300);
  check("11 p53 loss alone: p21 is lost but the ATM–CHK2–Cdc25 arm still holds G1/S; no malignancy claim", /pauses/.test(await verdict("g1s")) && /does not by itself predict malignancy/.test(await bodyText()));
  await tick("pert-atm-defective"); await tick("pert-chk1-defective"); await sleep(300);
  check("11 only with p53, ATM and CHK1 all defective does G1/S proceed — shown as unresolved, fate not determined", /unresolved/.test(await verdict("g1s")) && /not determined/.test(await bodyText()), await verdict("g1s"));
  await shot("cc-ddr-unresolved.png", ".ui-diagram");

  // ---- 12. replication licensing
  await fresh(1440, "light", CYC); await choose("Replication licensing"); await sleep(500);
  check("12 G1: licensing is permitted, origins are licensed, firing not yet possible", /PERMITTED/.test(await textOf("[data-testid=license-result]")) && /firing not possible/.test(await textOf("[data-testid=license-result]")) && /licensed/.test(await textOf("[data-testid=origin-state-0]")));
  await shot("cc-license-g1.png", ".ui-diagram");
  await choose("S"); await sleep(300);
  check("12 S phase: licensing blocked, firing possible, origins firing — not licensed again", /blocked/.test(await textOf("[data-testid=license-result]")) && /firing possible/.test(await textOf("[data-testid=license-result]")) && /firing/.test(await textOf("[data-testid=origin-state-0]")));
  await tick("pert-geminin-loss"); await sleep(300);
  check("12 geminin lost alone: licensing is still blocked in this model and the redundancy is flagged as uncertain", /blocked/.test(await textOf("[data-testid=license-result]")) && /single brake|redundancy/.test(await textOf("[data-testid=outcome-uncertain]")));
  await tick("pert-cdt1-stable"); await tick("pert-cdc6-cdk-resistant"); await sleep(300);
  check("12 all three brakes lost in S: re-licensing hazard, described as not normal", /RE-LICENSING HAZARD/.test(await textOf("[data-testid=license-result]")) && /second time/.test(await textOf("[data-testid=outcome-definite]")));
  await shot("cc-license-relicense.png", ".ui-diagram");

  // ---- 13. G2/M and spindle checkpoint, anaphase gating
  await fresh(1440, "light", CYC); await choose("G2/M control"); await sleep(500);
  check("13 G2: Wee1/Cdc25 balance resolves to CDK1 active and mitotic entry proceeds", /proceeds/.test(await verdict("g2m")) && (await nodeState("cdk1Active")).includes("ON"));
  await tick("cond-replcomplete"); await sleep(300);
  check("13 unreplicated DNA: CHK1 inhibits Cdc25, CDK1 stays phosphorylated, G2/M pauses", /pauses/.test(await verdict("g2m")) && (await nodeState("cdk1Inhib")).includes("ON"));
  await shot("cc-g2m-unreplicated.png", ".ui-diagram");
  await tick("pert-chk1-defective"); await sleep(300);
  check("13 CHK1 defective: mitotic entry proceeds despite unreplicated DNA — unresolved", /unresolved/.test(await verdict("g2m")));
  await fresh(1440, "light", CYC); await choose("Spindle checkpoint"); await sleep(500);
  check("13 spindle checkpoint module opens in M with all kinetochores attached: anaphase proceeds", /proceeds/.test(await verdict("m")) && (await nodeState("separase")).includes("ON"));
  await tick("cond-attached"); await sleep(300);
  check("13 an unattached kinetochore: checkpoint ON, APC/C–Cdc20 off, securin kept, separase and cohesin intact: anaphase pauses", /pauses/.test(await verdict("m")) && (await nodeState("sacSignal")).includes("ON") && (await nodeState("apcCdc20")).includes("off") && (await nodeState("anaphase")).includes("off"));
  await shot("cc-sac-unattached.png", ".ui-diagram");
  await tick("pert-sac-defective"); await sleep(300);
  check("14 anaphase gating: a defective checkpoint lets anaphase start despite the unattached kinetochore — unresolved", /unresolved/.test(await verdict("m")));
  await tick("pert-sac-defective"); await tick("pert-securin-stable"); await tick("cond-attached"); await sleep(300);
  check("14 non-degradable securin blocks anaphase even with every kinetochore attached", /pauses/.test(await verdict("m")));
  check("14 the page states that attachment and tension are simplified", /distinct mechanisms|more complex mechanisms/.test(await bodyText()));

  // ---- cyclin-CDK regulation
  await fresh(1440, "light", CYC); await choose("Cyclin–CDK regulation"); await sleep(500);
  check("9 CDK1: cyclin present but inhibitory phosphates retained → inactive (cyclin level alone does not decide)", /inactive/.test(await textOf("[data-testid=cdk-result]")));
  await tick("cdk-inhib"); await sleep(300);
  check("9 removing the inhibitory phosphates activates cyclin B–CDK1", /ACTIVE/.test(await textOf("[data-testid=cdk-result]")));
  await tick("cdk-cki"); await sleep(300);
  check("9 a CDK inhibitor switches it off again", /inactive/.test(await textOf("[data-testid=cdk-result]")));

  // ---- 15. intrinsic apoptosis
  await fresh(1440, "light", DTH); await choose("Intrinsic apoptosis"); await sleep(500);
  check("15 intrinsic: mitochondrial diagram with eight selectable events", (await count("[data-testid^=node-]")) >= 8 && /Pathway reaches step 8 of 8/.test(await progress()), await progress());
  await shot("cd-intrinsic-step0.png", ".ui-diagram");
  await last(); await sleep(300);
  check("15 the last event is executioner caspase-3/7 activation and the caption explains it", /Executioner caspase-3\/7/.test(await textOf("[data-testid=step-caption]")), await textOf("[data-testid=step-caption]"));
  await shot("cd-intrinsic-complete.png", ".ui-diagram");
  await svgClick("node-momp"); await sleep(300);
  check("15 selecting MOMP: not every membrane-potential change; BAX/BAK pores", /BAX\/BAK/.test(await textOf("[data-testid=node-detail]")) && /not the same as every change of mitochondrial membrane potential/.test(await textOf("[data-testid=node-detail]")), await textOf("[data-testid=node-detail]"));
  await tick("pert-bcl2-overexpression"); await sleep(300);
  check("15 pro-survival BCL-2 excess: the BH3 signal is neutralised, the pathway stops at step 1", /step 1 of 8/.test(await progress()), await progress());
  await shot("cd-intrinsic-bcl2.png", ".ui-diagram");
  await tick("pert-bcl2-overexpression"); await tick("pert-bax-loss"); await sleep(300);
  check("15 BAX lost but BAK present: MOMP and execution still occur", /step 8 of 8/.test(await progress()));
  await tick("pert-bak-loss"); await sleep(300);
  check("15 BAX and BAK both lost: stops before BAX/BAK activation (step 2)", /step 2 of 8/.test(await progress()), await progress());
  await tick("pert-bax-loss"); await tick("pert-bak-loss"); await tick("pert-apaf1-loss"); await sleep(300);
  check("15 APAF1 impaired: cytochrome c is released but no apoptosome forms (step 5)", /step 5 of 8/.test(await progress()), await progress());
  await tick("pert-apaf1-loss"); await tick("pert-casp9-inhibited"); await sleep(300);
  check("15 caspase-9 inhibited: stops after the apoptosome (step 6); a caspase-independent death is flagged as not modelled", /step 6 of 8/.test(await progress()) && /caspase-independent/.test(await textOf("[data-testid=outcome-uncertain]")), await progress());
  await tick("pert-casp9-inhibited"); await tick("pert-p53-loss"); await sleep(300);
  check("15 DNA damage with p53 lost: no PUMA/NOXA so the BH3 signal never starts (step 0)", /step 0 of 8/.test(await progress()), await progress());

  // ---- 16. extrinsic apoptosis
  await fresh(1440, "light", DTH); await choose("Extrinsic apoptosis"); await sleep(500);
  await tick("stim-dna"); await tick("stim-fasl"); await sleep(300); await last();
  check("16 extrinsic: Fas → FADD → DISC → caspase-8 → executioner caspases (5 of 5)", /step 5 of 5/.test(await progress()), await progress());
  await shot("cd-extrinsic-complete.png", ".ui-diagram");
  await tick("pert-cflip-high"); await sleep(300);
  check("16 c-FLIP excess: the DISC forms but caspase-8 is not activated (step 3)", /step 3 of 5/.test(await progress()), await progress());
  await tick("pert-cflip-high"); await tick("pert-bcl2-overexpression"); await sleep(300);
  check("16 type I cell: BCL-2 excess does not stop caspase-3/7 (direct activation by caspase-8)", /step 5 of 5/.test(await progress()));
  await tick("stim-type2"); await sleep(300);
  check("16 type II cell: BCL-2 excess blocks execution because the mitochondrial arm is needed", /step 4 of 5/.test(await progress()), await progress());
  await shot("cd-extrinsic-type2-bcl2.png", ".ui-diagram");
  check("16 extrinsic differs from intrinsic and connects through BID (stated)", /cleaves BID to tBID/.test(await bodyText()));

  // ---- 17. caspase cascade
  await fresh(1440, "light", DTH); await choose("Caspase cascade"); await sleep(500);
  check("17 table distinguishes initiators (caspase-8, -9) from executioners (caspase-3, -7)", (await count("[data-testid=caspase-table] tbody tr")) === 4 && /initiator/.test(await textOf("[data-testid=caspase-table]")) && /executioner/.test(await textOf("[data-testid=caspase-table]")));
  check("17 with DNA damage caspase-9 and executioner caspases are active, caspase-8 is not", /active/.test(await textOf("[data-testid=caspase-state-casp9]")) && /inactive/.test(await textOf("[data-testid=caspase-state-casp8]")) && /^active/.test(await textOf("[data-testid=caspase-state-casp3]")));
  check("17 consequences of execution are listed (lamins, ICAD/DNA, blebbing, PS exposure)", (await count("[data-testid^=node-]")) >= 6);
  await shot("cd-caspases.png", ".ui-diagram");
  await tick("pert-executioner-inhibited"); await sleep(300);
  check("17 executioner inhibition: caspase-3/7 inactive", /inactive/.test(await textOf("[data-testid=caspase-state-casp3]")));

  // ---- 18. autophagy and lysosomal recycling
  await fresh(1440, "light", DTH); await choose("Autophagy"); await sleep(500);
  await last(); await sleep(300);
  check("18 starvation drives autophagy through all eight stages to recycling", /stage 8 of 8/.test(await progress()), await progress());
  await shot("cd-autophagy-complete.png", ".ui-diagram");
  await tick("auto-nutrients"); await sleep(300);
  check("18 with nutrients mTORC1 keeps ULK1 off: nothing starts", /stage 0 of 8/.test(await progress()), await progress());
  await tick("auto-nutrients"); await tick("pert-fusion-defective"); await sleep(300);
  check("18 defective autophagosome–lysosome fusion: autophagosomes form (stage 5) but accumulate, no recycling", /stage 5 of 8/.test(await progress()) && /accumulate/.test(await bodyText()), await progress());
  await shot("cd-autophagy-fusion-defective.png", ".ui-diagram");
  await tick("pert-fusion-defective"); await tick("pert-v-atpase-inhibited"); await sleep(300);
  check("18 lysosomal V-ATPase inhibited: fusion happens but degradation does not (stage 6)", /stage 6 of 8/.test(await progress()), await progress());
  check("18 autophagy is stated to be a separate pathway from apoptosis", /separate pathway from apoptosis/.test(await bodyText()));

  // ---- 19. fate map and scenarios
  await fresh(1440, "light", DTH); await choose("Fate map"); await sleep(600);
  check("19 fate map: DNA damage engages the checkpoint, arrest and mitochondrial apoptosis; extrinsic not engaged", /engaged/.test(await textOf("[data-testid=fate-row-checkpoint]")) && /engaged/.test(await textOf("[data-testid=fate-row-arrest]")) && /engaged/.test(await textOf("[data-testid=fate-row-intrinsic]")) && /not engaged/.test(await textOf("[data-testid=fate-row-extrinsic]")));
  await shot("cd-fate-dna.png", ".ui-diagram");
  check("19 survival is not predicted (statement shown)", /no survival probability, clinical outcome, cancer susceptibility or treatment response/.test(await bodyText()));
  await choose("Nutrient deprivation"); await sleep(400);
  check("19 nutrient deprivation: autophagy and recycling engaged; apoptosis only 'possible' (context-dependent)", /engaged/.test(await textOf("[data-testid=fate-row-autophagy]")) && /possible/.test(await textOf("[data-testid=fate-row-intrinsic]")) && /context-dependent/.test(await textOf("[data-testid=fate-row-intrinsic]")));
  await shot("cd-fate-nutrient.png", ".ui-diagram");
  await choose("Lysosomal dysfunction"); await sleep(400);
  check("19 lysosomal dysfunction: autophagy starts but recycling is blocked", /blocked/.test(await textOf("[data-testid=fate-row-recycling]")) && /engaged/.test(await textOf("[data-testid=fate-row-autophagy]")));
  await choose("Death-receptor activation"); await sleep(400); await tick("pert-cflip-high"); await sleep(300);
  check("19 death receptor with c-FLIP excess: extrinsic blocked and caspases blocked", /blocked/.test(await textOf("[data-testid=fate-row-extrinsic]")) && /blocked/.test(await textOf("[data-testid=fate-row-caspases]")));
  await svgClick("node-intrinsic"); await sleep(300);
  check("19 selecting a node lists its links with their evidence labels", /established/.test(await textOf("[data-testid=fate-links]")) && /context-dependent/.test(await textOf("[data-testid=fate-links]")), await textOf("[data-testid=fate-links]"));
  await shot("cd-fate-death-receptor.png", ".ui-diagram");

  // ---- 20. Explore / Practice / Challenge in all three
  for (const [target, label, pre] of [[ORG, "organelles", async () => { await choose("Cargo tracker"); }], [CYC, "cell cycle", async () => { await choose("Spindle checkpoint"); }], [DTH, "apoptosis", async () => { await choose("Intrinsic apoptosis"); }]]) {
    await fresh(1440, "light", target); await pre();
    await choose("Practice"); await sleep(400);
    const qp = await textOf("[data-testid=quiz-prompt]");
    check(`20 ${label} practice: a question is shown from model state`, qp.length > 20, qp);
    const ok0 = await ev(`(() => { const o = [...document.querySelectorAll('.bio-quiz .bio-option')]; o[0].click(); return o.length; })()`); await sleep(300);
    check(`20 ${label} practice: an answer gets an explanation`, ok0 >= 3 && (await textOf("[data-testid=quiz-explanation]")).length > 30);
    await choose("Challenge"); await sleep(500);
    const cp = await textOf("[data-testid=predict-prompt]");
    await ev(`document.querySelectorAll('.bio-quiz .bio-option')[0].click()`); await sleep(300);
    await tick("predict-reveal"); await sleep(700);
    check(`20 ${label} challenge: predict first, reveal applies the state, next prediction offered`, cp.startsWith("Predict") && (await textOf("[data-testid=predict-prompt]")) !== cp, cp);
  }
  const gather = async (target, sections) => {
    const all = [];
    for (const s of sections) {
      await fresh(1440, "light", target); await choose(s); await choose("Practice"); await sleep(300);
      for (let i = 0; i < 8; i++) { all.push(await textOf("[data-testid=quiz-prompt]")); if (!(await click("Next question"))) break; await sleep(80); }
    }
    return all;
  };
  const oq = await gather(ORG, ["Cell organization", "Cargo tracker", "Vesicle transport", "Endosomes & lysosomes", "Protein quality control"]);
  check("20 required organelle questions are present (secretory pathway, SRP, COPII vs COPI, M6P)", ["Which proteins enter the secretory pathway?", "role of SRP", "distinguishes COPII from COPI", "Why can lysosomal hydrolase sorting fail?"].every((n) => oq.some((x) => x.includes(n))), oq.join(" | ").slice(0, 200));
  const cq = await gather(CYC, ["Replication licensing", "Spindle checkpoint"]);
  check("20 required cell-cycle questions are present (licensing, unattached kinetochore)", ["When can replication origins be licensed", "Why can an unattached kinetochore delay anaphase?"].every((n) => cq.some((x) => x.includes(n))), cq.join(" | ").slice(0, 200));
  const dq = await gather(DTH, ["Intrinsic apoptosis", "Caspase cascade", "Autophagy"]);
  check("20 required apoptosis questions are present (intrinsic trigger, initiator vs executioner, autophagy vs apoptosis)", ["What activates the intrinsic apoptotic pathway?", "difference between initiator and executioner caspases?", "Why is autophagy not synonymous with apoptosis?"].every((n) => dq.some((x) => x.includes(n))), dq.join(" | ").slice(0, 200));

  // ---- 21. save and reopen
  const saveCase = async (target, setup, name, expectOpen, label) => {
    await fresh(1440, "light", target); await setup(); await sleep(300);
    await click("Save Analysis"); await sleep(300);
    await setText(".synthesis-save-form input", name);
    await click("Save", "document.querySelector('.synthesis-save-form')");
    await waitFor(() => ev(`document.body.innerText.includes('Saved “${name}”')`), "save notice", 15000);
    check(`21 ${label}: save notice shown`, true);
    await ev(`[...document.querySelectorAll('.tool-tabs [role=tab]')].find((b) => b.textContent.trim() === 'Saved').click()`);
    await waitFor(() => ev(`document.querySelectorAll('.saved-badge').length >= 1`), "saved list", 15000);
    check(`21 ${label}: saved list labels it Biology`, /Biology/.test(await bodyText()));
    await ev(`(() => { const row = [...document.querySelectorAll('li, article')].find((x) => x.textContent.includes(${q(name)}) && x.querySelector('button')); [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Open')?.click(); })()`);
    await sleep(700); if (await ev(`!!document.querySelector('[role=alertdialog]')`)) await click("Replace without saving");
    await sleep(1500);
    check(`21 ${label}: reopening restores the saved state`, await expectOpen(), await hash());
  };
  await saveCase(ORG, async () => { await choose("Cargo tracker"); await tick("cargo-lysosomal"); await tick("pert-m6p-blocked"); await last(); }, "org s26", async () => (await hash()) === ORG && /Extracellular space/.test(await textOf("[data-testid=step-compartment]")) && (await isChecked("pert-m6p-blocked")), "organelles (lysosomal, M6P blocked)");
  await saveCase(CYC, async () => { await choose("DNA-damage checkpoint"); await tick("cond-dsb"); await tick("pert-p53-loss"); }, "cc s26", async () => (await hash()) === CYC && (await isChecked("cond-dsb")) && (await isChecked("pert-p53-loss")) && /pauses/.test(await verdict("g1s")), "cell cycle (DNA damage, p53 loss)");
  await saveCase(DTH, async () => { await choose("Intrinsic apoptosis"); await tick("pert-apaf1-loss"); await last(); }, "cd s26", async () => (await hash()) === DTH && /step 5 of 8/.test(await progress()) && (await isChecked("pert-apaf1-loss")), "apoptosis (APAF1 impaired)");
  for (const [slug, setup, expect, label] of [
    ["organelles-trafficking", async () => { await choose("Cargo tracker"); await tick("cargo-nuclear"); await next(2); }, async () => /Nuclear pore complex/.test(await textOf("[data-testid=step-compartment]")), "cargo and step"],
    ["cell-cycle-checkpoints", async () => { await choose("Replication licensing"); await choose("S"); }, async () => /firing possible/.test(await textOf("[data-testid=license-result]")), "licensing phase"],
    ["apoptosis-autophagy", async () => { await choose("Fate map"); await choose("Nutrient deprivation"); }, async () => /engaged/.test(await textOf("[data-testid=fate-row-autophagy]")), "fate scenario"],
  ]) {
    await fresh(1440, "light", `#/biology/${slug}`); await setup(); await sleep(2800);
    await cdp.send("Page.reload"); await ready("reload"); await sleep(1800);
    check(`21 autosave: a reloaded ${slug} page restores its ${label}`, await expect());
  }

  // ---- 22/23. concept search and cross-subject links
  await fresh(1440, "dark", "#/general/overview");
  await cdpKey("k", "KeyK", 75, 2); await sleep(500);
  check("22 Ctrl+K opens concept search", await ev(`!!document.querySelector('.concept-search[role=dialog]')`));
  const results1 = () => ev(`[...document.querySelectorAll('[data-testid=concept-result]')].map((li) => ({ title: li.querySelector('.concept-result-title').textContent, subject: li.querySelector('.concept-subject').textContent }))`);
  for (const [query, part] of [["signal recognition particle", "Signal recognition particle"], ["copii", "Vesicular transport"], ["erad", "ER quality control"], ["origin licensing", "Replication origin licensing"], ["retinoblastoma", "G1/S control"], ["spindle assembly checkpoint", "Spindle assembly checkpoint"], ["apoptosome", "Apoptosis"], ["bcl-2", "BCL-2 family"], ["caspase", "Caspases"], ["autophagy", "Autophagy"]]) {
    await setText("[data-testid=concept-input]", query); await sleep(300);
    const res = await results1();
    check(`22 concept search "${query}" finds "${part}" in the top five`, res.slice(0, 5).some((x) => x.title.toLowerCase().includes(part.toLowerCase()) && /Biology/.test(x.subject)), JSON.stringify(res.slice(0, 3)));
  }
  await setText("[data-testid=concept-input]", "autophagy"); await sleep(300); await cdpKey("Enter", "Enter", 13); await sleep(1500);
  check("22 Enter on the Autophagy result opens the apoptosis & autophagy laboratory", (await hash()) === DTH, await hash());
  await fresh(1440, "light", ORG);
  const rel = await textOf("[data-testid=related-concepts]");
  check("23 organelle page lists related learning (Translation, Autophagy)", /Translation/.test(rel) && /Autophagy/.test(rel), rel.slice(0, 260));
  for (const [slug, label, want] of [["translation", "Translation → Protein targeting", /Protein targeting/], ["cell-signaling", "Cell signaling → G1/S control", /G1\/S control/], ["mitosis-meiosis", "Mitosis → Spindle assembly checkpoint", /Spindle assembly checkpoint/], ["dna-replication", "DNA replication → Replication licensing", /Replication licensing/], ["membranes-transport", "Membrane transport → Endocytosis", /Endocytosis/]]) {
    await fresh(1440, "light", `#/biology/${slug}`);
    const r = await textOf("[data-testid=related-concepts]");
    check(`23 ${label} is listed on the ${slug} page`, want.test(r), r.slice(0, 300));
  }
  await fresh(1440, "light", "#/biology/cell-signaling");
  check("23 Cell signaling → Apoptosis regulation is listed", /Apoptosis regulation/.test(await textOf("[data-testid=related-concepts]")));
  await fresh(1440, "light", "#/biochemistry/electron-transport");
  check("23 Mitochondrial metabolism (electron transport) → Intrinsic apoptosis is listed", /Intrinsic apoptosis/.test(await textOf("[data-testid=related-concepts]")), (await textOf("[data-testid=related-concepts]")).slice(0, 300));
  await fresh(1440, "light", "#/biochemistry/protein-structure");
  check("23 Protein folding → ER quality control is listed", /ER quality control/.test(await textOf("[data-testid=related-concepts]")), (await textOf("[data-testid=related-concepts]")).slice(0, 300));
  await fresh(1440, "light", ORG);
  await ev(`(() => { const b = [...document.querySelectorAll('[data-testid=related-concepts] button, [data-testid=related-concepts] a')].find((x) => /Autophagy/.test(x.textContent)); b?.click(); })()`); await sleep(1200);
  check("23 the related-learning link from lysosomes opens the autophagy laboratory", (await hash()) === DTH, await hash());

  // ---- 24/25. themes and layouts, with screenshots
  const pages = [
    ["organelles-trafficking", async () => { await choose("Cargo tracker"); await next(4); }, "svg.b26-cell"],
    ["cell-cycle-checkpoints", async () => { await choose("G1/S control"); }, ".mt-svg"],
    ["apoptosis-autophagy", async () => { await choose("Intrinsic apoptosis"); await last(); }, ".mt-svg"],
  ];
  for (const [slug, setup, sel] of pages) for (const w of [1440, 820, 375]) for (const scheme of ["light", "dark"]) {
    await fresh(w, scheme, `#/biology/${slug}`); await setup(); await sleep(500);
    const o = await overflow();
    const dg = await ev(`(() => { const s = document.querySelector(${q(sel)}); if (!s) return null; const b = s.getBoundingClientRect(); let a = s.parentElement; while (a && a.scrollWidth <= a.clientWidth + 2 && a !== document.body) a = a.parentElement; return { w: Math.round(b.width), scrollable: !!a && a !== document.body && a.scrollWidth > a.clientWidth + 2 }; })()`);
    check(`25 ${slug} at ${w}px ${scheme}: no page-level horizontal overflow and the diagram is present`, o <= 1 && dg, `overflow ${o}, ${JSON.stringify(dg)}`);
    if (w === 375) check(`25 ${slug} at 375px ${scheme}: the diagram keeps its text size and scrolls inside its frame`, dg && dg.w >= 600 && dg.scrollable, JSON.stringify(dg));
    await shot(`${slug}-${w}-${scheme}.png`, ".gc-stage, .ui-diagram");
  }
  for (const [slug, setup] of [["cell-cycle-checkpoints", async () => {}], ["apoptosis-autophagy", async () => { await choose("Fate map"); }]]) for (const w of [820, 375]) {
    await fresh(w, "light", `#/biology/${slug}`); await setup(); await sleep(400);
    check(`25 ${slug} (second view) at ${w}px: no page-level horizontal overflow`, (await overflow()) <= 1, String(await overflow()));
    await shot(`${slug}-view2-${w}.png`, ".ui-diagram");
  }

  // ---- 26. representative Stage 15, 16 and 23 Biology pages still work
  await fresh(1440, "light", "#/biology/translation");
  check("26 Stage 15 Translation still renders a ribosome diagram with step controls", (await count(".bio-page svg")) >= 1 && (await ev(`!!document.querySelector('[aria-label="Next step"]')`)));
  await fresh(1440, "light", "#/biology/mitosis-meiosis");
  check("26 Stage 16 Mitosis & meiosis page still renders", /Mitosis/.test(await bodyText()) && (await count(".bio-page svg")) >= 1);
  await fresh(1440, "light", "#/biology/cell-signaling");
  check("26 Stage 23 Cell signaling still lists its receptor classes", /GPCR|G-protein/.test(await bodyText()) && (await count("[data-testid=receptor-table]")) === 1);

  check("no uncaught page exceptions recorded", cdp.errors.length === 0, cdp.errors.slice(0, 2).join(" | "));
} catch (e) {
  console.log("FATAL", e && e.stack ? e.stack : e);
  results.push(false);
} finally {
  await stop();
}
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
