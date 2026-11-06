// Stage 9J: McLafferty eligibility and mass bookkeeping audit. Expected m/z values are derived by hand from the mechanism
// (ion = acceptor-side fragment + transferred H = M - alkene lost), not from the implementation.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeEngine, getRdkit, loadEngine, loadModule } from "./engine.mjs";

let mc;
before(async () => {
  await loadEngine();
  await getRdkit();
  mc = await loadModule("/src/utils/spectroscopy/massSpec/mclafferty.ts");
});
after(async () => { await closeEngine(); });

const mzs = async (smiles) => (await mc.predictMcLaffertyPeaks(smiles)).map((p) => p.mz).sort((a, b) => a - b);

describe("McLafferty: eligible structures give the hand-derived m/z", () => {
  const eligible = [
    ["hexanoic acid", "CCCCCC(=O)O", [60]],                 // CH2=C(OH)2+. ; loses 1-butene... C3H7 side: M116-56
    ["methyl hexanoate", "CCCCCC(=O)OC", [74]],             // CH2=C(OH)OMe+.
    ["ethyl butanoate", "CCCC(=O)OCC", [88]],               // CH2=C(OH)OEt+.
    ["hexanenitrile", "CCCCCC#N", [41]],                    // CH2=C=NH+.
    ["butanal", "CCCC=O", [44]],                            // CH2=CHOH+.
    ["heptan-2-one", "CCCCCC(C)=O", [58]],                  // CH2=C(OH)CH3+.
    ["pentanamide", "CCCCC(N)=O", [59]],                    // CH2=C(OH)NH2+.
    ["butyrophenone", "CCCC(=O)c1ccccc1", [120]],           // CH2=C(OH)Ph+.
  ];
  for (const [name, smiles, expected] of eligible) {
    test(`${name}`, async () => {
      const got = await mzs(smiles);
      for (const mz of expected) assert.ok(got.includes(mz), `${name}: expected ${mz}, got ${got}`);
    });
  }
});

describe("McLafferty: ineligible structures give none", () => {
  const none = [
    ["propanal (no gamma carbon)", "CCC=O"],
    ["acetone", "CC(C)=O"],
    ["pentan-3-one (ethyl groups: no gamma)", "CCC(=O)CC"],
    ["2-methylpropanal (no gamma)", "CC(C)C=O"],
    ["benzaldehyde (aromatic acceptor side, no sp3 alpha)", "O=Cc1ccccc1"],
    ["acetophenone", "CC(=O)c1ccccc1"],
    ["cyclohexanone (alpha-beta bond is in a ring: no neutral alkene can leave)", "O=C1CCCCC1"],
    ["acetic acid", "CC(=O)O"],
    ["tert-butyl acetate (gamma carbons exist only on the alkoxy side, not the acyl side)", "CC(=O)OC(C)(C)C"],
  ];
  for (const [name, smiles] of none) {
    test(`${name}`, async () => {
      const got = await mzs(smiles);
      // tert-butyl acetate: an acyl-side gamma does not exist, so no McLafferty ion is expected from it
      assert.deepEqual(got, [], `${name}: got ${got}`);
    });
  }
});

describe("McLafferty: mass and charge bookkeeping", () => {
  // For every eligible structure the ion must equal M minus a neutral alkene: M - mz must be the mass of CnH2n (14n, n >= 2),
  // and the ion can never exceed the molecular ion.
  const molecules = [
    ["CCCCCC(=O)O", 116], ["CCCCCC(=O)OC", 130], ["CCCC(=O)OCC", 116], ["CCCCCC#N", 97],
    ["CCCC=O", 72], ["CCCCCC(C)=O", 114], ["CCCCC(N)=O", 101], ["CCCCCCCC(=O)O", 144], ["CCCCCCC(C)=O", 128],
  ];
  for (const [smiles, mass] of molecules) {
    test(`${smiles}: M - ion = neutral CnH2n`, async () => {
      for (const mz of await mzs(smiles)) {
        assert.ok(mz <= mass, `${smiles}: ion ${mz} above M ${mass}`);
        const lost = mass - mz;
        assert.ok(lost >= 28 && lost % 14 === 0, `${smiles}: neutral lost ${lost} is not an alkene (14n, n>=2)`);
      }
    });
  }
  test("every McLafferty peak is reported as heuristic-intensity fragment with an explanation that says so", async () => {
    for (const p of await mc.predictMcLaffertyPeaks("CCCCCC(=O)O")) {
      assert.equal(p.kind, "fragment");
      assert.match(p.explanation, /heuristic|not a calculated value/);
    }
  });
});
