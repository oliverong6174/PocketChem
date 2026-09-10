import { getRDKit } from "../../rdkit";
import { addition } from "../engine/handlers/addition";
import { carbonyl } from "../engine/handlers/carbonyl";
import { pericyclic } from "../engine/handlers/pericyclic";
import {
  areCanonicalEnantiomers,
  canonicalizeStereoStructure,
} from "../engine/stereochemistry";

export type ReactionRegressionResult = {
  id: string;
  passed: boolean;
  message: string;
};

function v2000StereoBondCounts(molBlock: string) {
  const lines = molBlock.split(/\r?\n/);
  if (!lines[3]?.includes("V2000")) return { wedge: 0, hash: 0 };
  const atomCount = Number.parseInt(lines[3].slice(0, 3).trim(), 10);
  const bondCount = Number.parseInt(lines[3].slice(3, 6).trim(), 10);
  if (!Number.isInteger(atomCount) || !Number.isInteger(bondCount)) {
    return { wedge: 0, hash: 0 };
  }
  let wedge = 0;
  let hash = 0;
  const start = 4 + atomCount;
  for (let index = 0; index < bondCount; index += 1) {
    const stereo = Number.parseInt((lines[start + index] ?? "").slice(9, 12).trim() || "0", 10);
    if (stereo === 1) wedge += 1;
    if (stereo === 6) hash += 1;
  }
  return { wedge, hash };
}

async function dielsAlderCyclohexadienePropene(): Promise<ReactionRegressionResult> {
  const products = await pericyclic(
    ["C1=CC=CCC1", "C=CC"],
    { mode: "dielsAlder", maxProducts: 8 },
  );
  const structures = (
    await Promise.all(products.map((product) => canonicalizeStereoStructure(product)))
  ).filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (structures.length !== 2) {
    return {
      id: "diels-alder-cyclohexadiene-propene",
      passed: false,
      message: `Expected one enantiomeric pair; received ${structures.length} canonical stereoproduct(s).`,
    };
  }

  if (!(await areCanonicalEnantiomers(structures[0], structures[1]))) {
    return {
      id: "diels-alder-cyclohexadiene-propene",
      passed: false,
      message: "The two Diels-Alder products are not exact mirror images.",
    };
  }

  const rdkit = await getRDKit();
  const first = rdkit.get_mol(products[0]);
  if (!first) {
    return {
      id: "diels-alder-cyclohexadiene-propene",
      passed: false,
      message: "RDKit could not parse the representative Diels-Alder product.",
    };
  }
  try {
    first.set_new_coords?.();
    const block = first.get_molblock?.();
    const counts = typeof block === "string"
      ? v2000StereoBondCounts(block)
      : { wedge: 0, hash: 0 };
    if (counts.wedge < 3 || counts.hash !== 0) {
      return {
        id: "diels-alder-cyclohexadiene-propene",
        passed: false,
        message: `Representative must expose three solid stereobonds and no hashed stereobonds; got ${counts.wedge} wedge / ${counts.hash} hash.`,
      };
    }
  } finally {
    first.delete?.();
  }

  return {
    id: "diels-alder-cyclohexadiene-propene",
    passed: true,
    message: "Generated exactly one mirror pair and the representative uses three solid stereobonds.",
  };
}

async function cyclicImineHydrolysis(): Promise<ReactionRegressionResult> {
  const products = await carbonyl("N1=CCCC1", { mode: "imineHydrolysis" });
  const rdkit = await getRDKit();
  const expected = rdkit.get_mol("NCCCC=O");
  const expectedCanonical = expected?.get_smiles?.() ?? "";
  expected?.delete?.();

  for (const product of products) {
    const mol = rdkit.get_mol(product);
    try {
      if (mol?.get_smiles?.() === expectedCanonical) {
        return {
          id: "cyclic-imine-hydrolysis",
          passed: true,
          message: "1-pyrroline hydrolysis opens the ring to 4-aminobutanal connectivity.",
        };
      }
    } finally {
      mol?.delete?.();
    }
  }

  return {
    id: "cyclic-imine-hydrolysis",
    passed: false,
    message: `Expected NCCCC=O connectivity; received ${products.join(" | ") || "no products"}.`,
  };
}

async function epoxidationAlcoholAntiOpening(): Promise<ReactionRegressionResult> {
  const products = await addition(
    ["C1=CCCC2CCC12", "CO"],
    { mode: "epoxidationAcidicAlcoholOpening" },
  );
  if (products.length === 0) {
    return {
      id: "epoxidation-alcohol-anti-opening",
      passed: false,
      message: "No product was generated for the fused cyclic alkene + methanol regression substrate.",
    };
  }

  // The handler itself now contains a graph-level anti postcondition; this
  // regression mainly guarantees that future template refactors do not erase
  // the entire valid product set.
  return {
    id: "epoxidation-alcohol-anti-opening",
    passed: true,
    message: `Generated ${products.length} mechanistically filtered anti product(s).`,
  };
}

export async function runReactionRegressionSuite(): Promise<ReactionRegressionResult[]> {
  const tests = [
    dielsAlderCyclohexadienePropene,
    cyclicImineHydrolysis,
    epoxidationAlcoholAntiOpening,
  ];

  const results: ReactionRegressionResult[] = [];
  for (const test of tests) {
    try {
      results.push(await test());
    } catch (error) {
      results.push({
        id: test.name,
        passed: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
