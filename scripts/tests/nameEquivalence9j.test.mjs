// Stage 9J: the synonym comparison used for development reporting accepts alternative spellings of ONE structure and rejects different molecules.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const { namesEquivalent } = await import(pathToFileURL(path.resolve("scripts/benchmarks/stage9j/nameEquivalence.mjs")).href);

describe("accepted: alternative spellings of the same structure", () => {
  const same = [
    ["(R)-butan-2-ol", "(2R)-butan-2-ol"],
    ["ethanoic acid", "acetic acid"],
    ["methyl ethanoate", "methyl acetate"],
    ["ethyl methanoate", "ethyl formate"],
    ["1-(2-methylpropyl)benzene", "1-2-methylpropylbenzene"],
    ["cyclohex-1-ene", "cyclohexene"],
    ["trans-(1R,2R)-cyclohexane-1,2-diol", "(1R,2R)-cyclohexane-1,2-diol"],
    ["(2E)-but-2-ene", "(E)-but-2-ene"],
    ["trans-cyclohexane-1,2-diol", "trans-cyclohexane-1,2-diol"],
    ["sodium ethanoate", "sodium acetate"],
    ["1-phenylethan-1-one", "1-phenylethanone"],
    ["ethanedioic acid", "oxalic acid"],
    ["2-methoxy-4-(prop-2-en-1-yl)phenol", "2-methoxy-4-prop-2-enylphenol"],
  ];
  for (const [a, b] of same) test(`${a} = ${b}`, () => assert.ok(namesEquivalent(a, b)));
});

describe("rejected: names of different molecules", () => {
  const different = [
    ["(R)-butan-2-ol", "(S)-butan-2-ol"],
    ["(2E)-but-2-ene", "(2Z)-but-2-ene"],
    ["(1R,2R)-cyclohexane-1,2-diol", "(1R,2S)-cyclohexane-1,2-diol"],
    ["(2R,3S)-butane-2,3-diol", "(2S,3R)-butane-2,3-diol"],
    ["cis-cyclohexane-1,2-diol", "trans-cyclohexane-1,2-diol"],
    ["methyl ethanoate", "ethyl methanoate"],
    ["propan-1-ol", "propan-2-ol"],
    ["2-methylbutane", "2-methylpropane"],
    ["ethanoic acid", "methanoic acid"],
    ["cyclohexanone", "cyclohexanol"],
    ["2-chloropropane", "1-chloropropane"],
    ["(R)-butan-2-ol", "butan-2-ol"],
    ["sodium methanoate", "sodium acetate"],
    ["ethanedioic acid", "propanedioic acid"],
    ["1-phenylethan-1-ol", "1-phenylethanone"],
  ];
  for (const [a, b] of different) test(`${a} != ${b}`, () => assert.ok(!namesEquivalent(a, b)));
});
