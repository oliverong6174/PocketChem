// Phase 4 / Stage 8A-4.1: unified chemical-name / SMILES input.
//
// Unit tests inject a fake name lookup so ambiguity and failures are exact; SMILES validation is
// always the real RDKit. A second group uses the real bundled ChEBI index (served from disk,
// offline) and one trivial real search to confirm what the synthesis page would receive.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeEngine, loadEngine, loadModule } from "./engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let input;
let nameModule;
let stereo;
let reactionInput;
let runModule;
let registry;

before(async () => {
  await loadEngine();
  // The browser fetches the bundled index relative to the page; serve the same file from disk.
  globalThis.window.location = { origin: "http://localhost", href: "http://localhost/", pathname: "/" };
  const bytes = fs.readFileSync(path.join(root, "public", "data", "chemical-names.index.json.gz"));
  globalThis.fetch = async (url) =>
    String(url).includes("chemical-names.index.json.gz")
      ? new Response(bytes, { status: 200, headers: { "content-type": "application/gzip" } })
      : new Response("", { status: 404 });
  input = await loadModule("/src/utils/moleculeInput.ts");
  nameModule = await loadModule("/src/utils/moleculeNameResolver.ts");
  stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
  reactionInput = await loadModule("/src/utils/reactions/engine/reactionInput.ts");
  runModule = await loadModule("/src/utils/reactions/engine/synthesisSearchRun.ts");
  ({ reactionRegistry: registry } = await loadModule("/src/utils/reactionUtils.ts"));
});

after(async () => {
  await closeEngine();
});

// ---- helpers -------------------------------------------------------------------------

const notFound = (query) => Promise.reject(new nameModule.MoleculeNameNotFoundError(`No unique offline structure was found for “${query}”.`));
const resolution = (smiles, title, query = title) => ({
  query, smiles, connectivitySmiles: null, iupacName: title, title, molecularFormula: "X", inchiKey: null, source: "chebi",
});
const fakeDb = (table) => (query) => (table[query] ? Promise.resolve(table[query]) : notFound(query));
const resolve = (text, table = {}, extra = {}) => input.resolveMoleculeInput(text, { resolveName: fakeDb(table), ...extra });
const rejects = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.name, "MoleculeInputError", String(error));
    assert.equal(error.code, code, error.message);
    return true;
  });
};
const canonicalAll = async (smilesList) => Promise.all(smilesList.map(async (item) => (await stereo.canonicalizeStereoStructure(item)).isomeric));

// ---- name-only and SMILES-only ---------------------------------------------------------

describe("names and SMILES", () => {
  test("[engine] a chemical name resolves through the existing name lookup, unchanged", async () => {
    const acetone = resolution("CC(C)=O", "propan-2-one", "acetone");
    const result = await resolve("acetone", { acetone });
    assert.equal(result.kind, "name");
    assert.equal(result.nameResolution, acetone, "the database resolution object is passed on untouched");
    assert.equal(result.smiles, "CC(C)=O");
  });

  test("[engine] a single-molecule SMILES is validated by RDKit and normalised", async () => {
    const result = await resolve("CC(=O)C");
    assert.equal(result.kind, "smiles");
    assert.equal(result.smiles, "CC(C)=O");
    assert.deepEqual(result.components, ["CC(C)=O"]);
    assert.equal(result.nameResolution, null);
  });

  test("[engine] the smiles: prefix forces SMILES and is not part of the structure", async () => {
    const result = await resolve("smiles:CCO", { CCO: resolution("[Fake]", "fake") });
    assert.equal(result.kind, "smiles");
    assert.equal(result.smiles, "CCO");
    assert.equal(result.query, "CCO");
    assert.equal((await resolve("SMILES: CCO")).smiles, "CCO", "prefix is case-insensitive and tolerates a space after the colon");
  });
});

// ---- multiple components ---------------------------------------------------------------

describe("dot-separated starting materials", () => {
  test("[engine] p-cresol . bromomethane . acetylene load as three separate components", async () => {
    const result = await resolve("Cc1ccc(O)cc1.CBr.C#C");
    assert.equal(result.kind, "smiles");
    assert.equal(result.components.length, 3);
    assert.deepEqual([...result.components].sort(), ["C#C", "CBr", "Cc1ccc(O)cc1"].sort());
    assert.equal(result.smiles.split(".").length, 3);
    // the page splits the editor SMILES the same way
    assert.equal(reactionInput.splitReactionComponents(result.smiles).length, 3);
  });

  test("[engine] no component is duplicated or merged: the same molecule twice stays two components", async () => {
    const result = await resolve("CBr.CBr");
    assert.deepEqual(result.components, ["CBr", "CBr"]);
  });

  test("[engine] the target editor rejects multiple components outright instead of dropping any", async () => {
    await rejects(resolve("Cc1ccc(O)cc1.CBr", {}, { maxComponents: 1 }), "too-many-components");
    await rejects(resolve("smiles:CCO.O", {}, { maxComponents: 1 }), "too-many-components");
    const salt = resolution("[Na+].[Cl-]", "sodium chloride");
    await rejects(resolve("salt", { salt }, { maxComponents: 1 }), "too-many-components");
    const ok = await resolve("COc1ccc(CC=C)cc1", {}, { maxComponents: 1 });
    assert.equal(ok.components.length, 1);
  });

  test("[engine] the error for a multi-component target says what happened", async () => {
    await assert.rejects(resolve("CC.CC", {}, { maxComponents: 1 }), /2 separate molecules.*one connected molecule.*nothing was dropped/s);
  });
});

// ---- chemical correctness -----------------------------------------------------------------

describe("structure fidelity", () => {
  test("[engine] explicit stereochemistry is kept; enantiomers and E/Z stay distinct", async () => {
    const l = await resolve("C[C@H](N)C(=O)O");
    const d = await resolve("C[C@@H](N)C(=O)O");
    assert.match(l.smiles, /@/);
    assert.notEqual(l.smiles, d.smiles);
    const trans = await resolve("C/C=C/C");
    const cis = await resolve("C/C=C\\C");
    assert.match(trans.smiles, /[\\/]/);
    assert.notEqual(trans.smiles, cis.smiles);
  });

  test("[engine] aromaticity is represented consistently (Kekulé input becomes aromatic)", async () => {
    assert.equal((await resolve("C1=CC=CC=C1")).smiles, "c1ccccc1");
    assert.equal((await resolve("c1ccccc1")).smiles, "c1ccccc1");
  });

  test("[engine] formal charges and isotopes are preserved", async () => {
    assert.match((await resolve("[NH4+]")).smiles, /\+/);
    assert.match((await resolve("CC(=O)[O-]")).smiles, /\[O-\]/);
    assert.match((await resolve("[13CH4]")).smiles, /13C/);
    const deuterated = await resolve("[2H]C([2H])([2H])O");
    assert.match(deuterated.smiles, /2H/);
    assert.equal((deuterated.smiles.match(/2H/g) ?? []).length, 3);
  });

  test("[engine] explicit-hydrogen and ordinary forms of the same molecule have one identity", async () => {
    const explicit = await resolve("[H]C([H])([H])Br");
    const plain = await resolve("CBr");
    assert.equal(explicit.smiles, "CBr");
    assert.equal(explicit.smiles, plain.smiles);
    const [a, b] = await canonicalAll([explicit.smiles, "[H]C([H])([H])Br"]);
    assert.equal(a, b, "the planner's canonical form agrees");
    // inside a multi-component start
    assert.equal((await resolve("Cc1ccc(O)cc1.[H]C([H])([H])Br.C#C")).smiles, (await resolve("Cc1ccc(O)cc1.CBr.C#C")).smiles);
  });

  test("[engine] a database entry written with explicit hydrogens loads in the ordinary form, the stored entry untouched", async () => {
    const stored = resolution("[H]C([H])([H])Br", "bromomethane");
    const result = await resolve("bromomethane", { bromomethane: stored });
    assert.equal(result.smiles, "CBr");
    assert.equal(result.nameResolution.smiles, "[H]C([H])([H])Br");
  });
});

// ---- ambiguity and invalid input -------------------------------------------------------------

describe("ambiguous and invalid input", () => {
  test("[engine] a short string that is both a SMILES and a different database name is rejected, never chosen silently", async () => {
    const cobalt = resolution("[Co]", "cobalt", "CO");
    await assert.rejects(resolve("CO", { CO: cobalt }), (error) => {
      assert.equal(error.code, "ambiguous");
      assert.match(error.message, /ambiguous/);
      assert.match(error.message, /smiles:CO/);
      assert.match(error.message, /cobalt/);
      return true;
    });
    // the user's explicit choices both work
    assert.equal((await resolve("smiles:CO", { CO: cobalt })).smiles, "CO");
  });

  test("[engine] when SMILES and name describe the same structure there is nothing to choose between", async () => {
    const ethanol = resolution("CCO", "ethanol", "CCO");
    const result = await resolve("CCO", { CCO: ethanol });
    assert.equal(result.kind, "name");
    assert.match(result.notes.join(" "), /same structure/);
  });

  test("[engine] invalid SMILES, unknown names, spaces and empty input get clear, distinct errors", async () => {
    await rejects(resolve("C(C"), "not-found");
    await assert.rejects(resolve("C(C"), /not a valid SMILES and no unique offline chemical name/);
    await rejects(resolve("smiles:C(C"), "invalid-smiles");
    await assert.rejects(resolve("smiles:C(C"), /not a valid SMILES/);
    await rejects(resolve("smiles:CC water"), "invalid-smiles");
    await assert.rejects(resolve("smiles:CC water"), /cannot contain spaces/);
    await rejects(resolve("notamolecule"), "not-found");
    await rejects(resolve("   "), "empty");
    await rejects(resolve("smiles:"), "empty");
    await rejects(resolve("smiles:" + "C".repeat(2500)), "too-long");
  });

  test("[engine] text RDKit would read as a SMILES plus a title is not accepted as a SMILES", async () => {
    await rejects(resolve("CC water"), "not-found");
  });

  test("[engine] valence errors are invalid SMILES", async () => {
    await rejects(resolve("smiles:C(C)(C)(C)(C)C"), "invalid-smiles");
  });

  test("[engine] a failing name database does not block SMILES, but is reported when it matters", async () => {
    const broken = () => Promise.reject(new Error("local database unreadable"));
    const smiles = await input.resolveMoleculeInput("CCO", { resolveName: broken });
    assert.equal(smiles.kind, "smiles");
    assert.match(smiles.notes.join(" "), /name lookup was unavailable/i);
    await assert.rejects(input.resolveMoleculeInput("acetone", { resolveName: broken }), (error) => {
      assert.equal(error.code, "lookup-failed");
      assert.match(error.message, /local database unreadable/);
      return true;
    });
  });
});

// ---- replace versus add ---------------------------------------------------------------------

describe("loading into the editor: Replace and Add", () => {
  function fakeEditor(initial = "") {
    const state = { content: initial, fragments: [], calls: [] };
    return {
      state,
      api: {
        setMolecule: async (smiles) => { state.calls.push(["set", smiles]); state.content = smiles; },
        addFragment: async (smiles) => { state.calls.push(["add", smiles]); state.fragments.push(smiles); state.content = state.content ? `${state.content}.${smiles}` : smiles; },
        getSmiles: async () => state.content,
      },
    };
  }

  test("[engine] Replace swaps the whole content, components together", async () => {
    const editor = fakeEditor("CCO");
    const loaded = await resolve("Cc1ccc(O)cc1.CBr.C#C");
    await input.loadInputIntoEditor(editor.api, loaded, "replace");
    assert.deepEqual(editor.state.calls, [["set", loaded.smiles]]);
    assert.equal(editor.state.content.split(".").length, 3);
  });

  test("[engine] Add keeps existing content and adds each component as its own fragment", async () => {
    const editor = fakeEditor("CCO");
    const loaded = await resolve("CBr.C#C");
    await input.loadInputIntoEditor(editor.api, loaded, "add");
    assert.equal(editor.state.calls.length, 2);
    assert.ok(editor.state.calls.every(([kind]) => kind === "add"));
    assert.deepEqual(editor.state.content.split(".").sort(), ["C#C", "CBr", "CCO"]);
  });

  test("[engine] without addFragment, Add appends to the current SMILES instead of replacing it", async () => {
    const editor = fakeEditor("CCO");
    delete editor.api.addFragment;
    await input.loadInputIntoEditor(editor.api, await resolve("CBr"), "add");
    assert.equal(editor.state.content, "CCO.CBr");
    const empty = fakeEditor("");
    delete empty.api.addFragment;
    await input.loadInputIntoEditor(empty.api, await resolve("CBr"), "add");
    assert.equal(empty.state.content, "CBr");
  });

  test("[source] the drawer says 'Chemical name or SMILES', refuses a second molecule in a single-molecule editor, and the target uses it", () => {
    const drawer = fs.readFileSync(path.join(root, "src", "components", "MoleculeDrawer.tsx"), "utf8");
    assert.match(drawer, /placeholder="Chemical name or SMILES"/);
    assert.match(drawer, /resolveMoleculeInput\(query, \{ maxComponents \}\)/);
    assert.match(drawer, /loadInputIntoEditor\(api, input, action\)/);
    assert.match(drawer, /action === "add" && maxComponents === 1 && hasStructure/);
    assert.match(drawer, /if \(input\.nameResolution\) onNameStructureApplied/);
    assert.match(drawer, /nameInputMode === "add-or-replace" && hasStructure/, "Add button visibility is unchanged");
    const page = fs.readFileSync(path.join(root, "src", "components", "SynthesisPage.tsx"), "utf8");
    const target = page.slice(page.indexOf('globalKey="synthesisProductKetcher"'));
    assert.match(target.slice(0, 300), /maxComponents=\{1\}/);
    const start = page.slice(page.indexOf('globalKey="synthesisReactantKetcher"'), page.indexOf('globalKey="synthesisProductKetcher"'));
    assert.doesNotMatch(start, /maxComponents/);
  });

  test("[engine] Add of separate names keeps every earlier material (one fragment each)", async () => {
    const table = {
      "p-cresol": resolution("Cc1ccc(O)cc1", "p-cresol"),
      bromomethane: resolution("[H]C([H])([H])Br", "bromomethane"),
      acetylene: resolution("C#C", "acetylene"),
    };
    const editor = fakeEditor("");
    for (const name of ["p-cresol", "bromomethane", "acetylene"]) {
      await input.loadInputIntoEditor(editor.api, await resolve(name, table), "add");
    }
    assert.deepEqual(editor.state.fragments, ["Cc1ccc(O)cc1", "CBr", "C#C"]);
    assert.equal(editor.state.calls.length, 3);
    assert.ok(editor.state.calls.every(([kind]) => kind === "add"), "no Replace happened");
  });

  test("[engine] Add of separate SMILES keeps earlier materials, stereochemistry and components", async () => {
    const editor = fakeEditor("C#C.CBr");
    await input.loadInputIntoEditor(editor.api, await resolve("C[C@H](N)C(=O)O"), "add");
    await input.loadInputIntoEditor(editor.api, await resolve("C/C=C/C"), "add");
    const parts = editor.state.content.split(".");
    assert.equal(parts.length, 4);
    assert.ok(parts.includes("C#C") && parts.includes("CBr"), "pre-existing components survive");
    assert.ok(parts.some((p) => p.includes("@")), "the stereocentre is preserved");
    assert.ok(parts.some((p) => p.includes("/")), "the E/Z double bond is preserved");
    assert.ok(editor.state.calls.every(([kind]) => kind === "add"));
  });

  test("[engine] Add of a dot-separated SMILES appends every component, and Replace still replaces all", async () => {
    const editor = fakeEditor("CCO");
    const loaded = await resolve("Cc1ccc(O)cc1.CBr.C#C");
    await input.loadInputIntoEditor(editor.api, loaded, "add");
    assert.equal(editor.state.fragments.length, 3);
    assert.deepEqual(editor.state.content.split(".").sort(), [...loaded.components, "CCO"].sort());
    const replaced = fakeEditor("CCO");
    await input.loadInputIntoEditor(replaced.api, loaded, "replace");
    assert.deepEqual(replaced.state.calls, [["set", loaded.smiles]]);
  });

  test("[engine] Add keeps duplicates as separate drawn molecules (inventory = one copy per drawn molecule)", async () => {
    const editor = fakeEditor("CBr");
    await input.loadInputIntoEditor(editor.api, await resolve("CBr"), "add");
    assert.deepEqual(editor.state.content.split("."), ["CBr", "CBr"]);
  });

  test("[source] Add is enabled only for the starting-material editor; target and other pages are unchanged", () => {
    const page = fs.readFileSync(path.join(root, "src", "components", "SynthesisPage.tsx"), "utf8");
    const startBlock = page.slice(page.indexOf('globalKey="synthesisReactantKetcher"'), page.indexOf('globalKey="synthesisProductKetcher"'));
    assert.match(startBlock, /nameInputMode="add-or-replace"/);
    const targetBlock = page.slice(page.indexOf('globalKey="synthesisProductKetcher"'));
    assert.doesNotMatch(targetBlock.slice(0, 400), /nameInputMode/);
    assert.match(targetBlock.slice(0, 400), /maxComponents=\{1\}/);
    const users = [];
    for (const file of fs.readdirSync(path.join(root, "src", "components"))) {
      if (!file.endsWith(".tsx")) continue;
      const text = fs.readFileSync(path.join(root, "src", "components", file), "utf8");
      if (/nameInputMode=/.test(text)) users.push(file);
    }
    assert.deepEqual(users.sort(), ["ReactionsPage.tsx", "SynthesisPage.tsx"]);
  });
});

// ---- real database and synthesis hand-off -------------------------------------------------------

describe("real name database and editor-to-synthesis transfer", () => {
  const real = (text, extra = {}) => input.resolveMoleculeInput(text, extra);

  test("[engine] existing name behavior: common and IUPAC names still resolve from the offline index", async () => {
    const estragole = await real("estragole");
    assert.equal(estragole.kind, "name");
    const iupac = await real("1-methoxy-4-(prop-2-en-1-yl)benzene");
    assert.equal(iupac.smiles, estragole.smiles);
    assert.equal((await real("p-cresol")).smiles, "Cc1ccc(O)cc1");
    assert.equal((await real("acetone")).smiles, "CC(C)=O");
    assert.equal((await real("ethyne")).smiles, "C#C");
    assert.equal((await real("bromomethane")).smiles, "CBr", "explicit-H database entry loads as the ordinary form");
    assert.equal((await real("bromomethane")).nameResolution.smiles, "[H]C([H])([H])Br");
  });

  test("[engine] the starting materials and target from the task are accepted as SMILES", async () => {
    const start = await real("Cc1ccc(O)cc1.CBr.C#C");
    assert.equal(start.kind, "smiles", JSON.stringify(start.notes));
    assert.equal(start.components.length, 3);
    const target = await real("COc1ccc(CC=C)cc1", { maxComponents: 1 });
    assert.equal(target.kind, "smiles");
    const named = await real("estragole", { maxComponents: 1 });
    assert.equal((await canonicalAll([target.smiles]))[0], (await canonicalAll([named.smiles]))[0], "SMILES and name give the same target");
  });

  test("[engine] the same three materials entered by name or by SMILES reach the synthesis page identically", async () => {
    const byName = [await real("p-cresol"), await real("bromomethane"), await real("acetylene")];
    const bySmiles = await real("Cc1ccc(O)cc1.CBr.C#C");
    const nameComponents = (await canonicalAll(byName.map((item) => item.smiles))).sort();
    const smilesComponents = (await canonicalAll(reactionInput.splitReactionComponents(bySmiles.smiles))).sort();
    assert.deepEqual(smilesComponents, nameComponents);
  });

  test("[engine] short real strings are never silently resolved to a conflicting reading", async () => {
    for (const text of ["CO", "CC", "NO", "Cl", "N", "O", "C"]) {
      let outcome;
      try {
        outcome = await real(text);
      } catch (error) {
        assert.ok(["ambiguous", "not-found", "invalid-smiles"].includes(error.code), `${text}: ${error.code}`);
        continue;
      }
      if (outcome.kind === "name") {
        // accepted as a name only because the SMILES reading was invalid or identical
        const asSmiles = await input.normalizeSmilesWithRdkit(text);
        if (asSmiles) assert.equal(asSmiles.smiles, outcome.smiles, `${text}: name and SMILES must agree`);
      }
    }
  });

  test("[engine] one trivial search runs from an explicit-hydrogen start exactly as from the ordinary form", async () => {
    const explicit = await real("Cc1ccc(O)cc1.[H]C([H])([H])Br");
    const plain = await real("Cc1ccc(O)cc1.CBr");
    assert.equal(explicit.smiles, plain.smiles);
    const target = await real("COc1ccc(C)cc1", { maxComponents: 1 });
    const controller = new runModule.SearchRunController({ rules: registry, totalMs: 20000 });
    await controller.start({ startingSmiles: explicit.smiles, targetSmiles: target.smiles });
    const state = controller.getState();
    assert.equal(state.outcome.kind, "found", JSON.stringify(state.outcome));
    assert.equal(state.routes[0].verification.status, "verified");
    assert.equal(state.copies, 1, "no copies were added by the input");
    const inventory = state.routes[0].verification.inventory ?? [];
    assert.ok(inventory.every((entry) => entry.copies === 1));
  });
});

// ---- Stage 8A-4.2: short-alias ambiguity and plain-text names -----------------------------------

describe("short aliases and name display", () => {
  const withFormula = (smiles, title, formula, query = title) => ({ ...resolution(smiles, title, query), molecularFormula: formula });
  const CALCIOL = withFormula("C=C1CCC(O)CC1=CC=C1CCCC2(C)C1CCC2C(C)CCCC(C)C", "calciol", "C27H44O", "cc");

  test("[engine] a SMILES-looking synonym that expands to a far larger molecule is refused, with a case hint", async () => {
    await rejects(resolve("cc", { cc: CALCIOL }), "suspicious-alias");
    await assert.rejects(resolve("cc", { cc: CALCIOL }), /case-sensitive.*CC.*would be read as CC/s);
  });

  test("[engine] the policy is size-based, not a list: real abbreviations, formulas and exact primary names still resolve", async () => {
    const table = {
      DMF: withFormula("CN(C)C=O", "N,N-dimethylformamide", "C3H7NO", "DMF"),
      CCl4: withFormula("ClC(Cl)(Cl)Cl", "tetrachloromethane", "CCl4", "CCl4"),
      NO2: withFormula("O=[N]=O", "nitrogen dioxide", "NO2", "NO2"),
      cc: withFormula("CC(C)CCCC", "cc", "C9H20", "cc"), // the entry's own title is the typed text
    };
    for (const name of Object.keys(table)) assert.equal((await resolve(name, table)).kind, "name", name);
  });

  test("[engine] SMILES stays case-sensitive and the smiles: prefix still forces SMILES", async () => {
    await rejects(resolve("smiles:cc", { cc: CALCIOL }), "invalid-smiles");
    assert.equal((await resolve("smiles:CC", { CC: CALCIOL })).smiles, "CC");
    await rejects(resolve("CC", { CC: CALCIOL }), "ambiguous");
  });

  test("[engine] real index: cc / CC / CO / Cl / O / smiles:CC behave by one policy", async () => {
    const real = (text) => input.resolveMoleculeInput(text);
    await rejects(real("cc"), "suspicious-alias");
    await rejects(real("CC"), "ambiguous");
    await rejects(real("Cl"), "ambiguous");
    await rejects(real("O"), "ambiguous");
    assert.equal((await real("CO")).kind, "smiles");
    assert.equal((await real("smiles:CC")).smiles, "CC");
    assert.equal((await real("smiles:CC")).kind, "smiles");
    assert.equal((await real("Na")).kind, "name");
    assert.equal((await real("water")).kind, "name");
  });

  test("[engine] chemical names are shown as plain text: tags removed, entities decoded, nothing interpreted", async () => {
    const text = await loadModule("/src/utils/chemicalNameText.ts");
    assert.equal(text.toPlainChemicalName("(3<i>S</i>,5<i>Z</i>,7<i>E</i>)-9,10-secocholesta"), "(3S,5Z,7E)-9,10-secocholesta");
    assert.equal(text.toPlainChemicalName("H<sub>2</sub>O &amp; &alpha;-D &#945; &lt;b&gt;"), "H2O & α-D α <b>");
    assert.equal(text.toPlainChemicalName("<script>alert(1)</script>x"), "alert(1)x");
    assert.equal(text.toPlainChemicalName(null), null);
    assert.equal(text.toPlainChemicalName("  "), null);
    const calciol = await nameModule.resolveMoleculeName("calciol");
    for (const name of [calciol.iupacName, calciol.title]) assert.doesNotMatch(name ?? "", /<\/?[a-zA-Z]/, name);
  });
});

describe("starting-material inventory", () => {
  test("[engine] each drawn component is its own supplied material; duplicates are never merged", () => {
    // Copies then multiply per component: "CBr.CBr" is two materials, each with the selected copies.
    assert.deepEqual(reactionInput.splitReactionComponents("CBr.CBr"), ["CBr", "CBr"]);
    assert.equal(reactionInput.splitReactionComponents("CBr.C#C.CCO").length, 3);
  });
});
