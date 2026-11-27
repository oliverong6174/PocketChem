// Shared helpers for the Phase 4 tests. They only call existing engine
// functions; no planner search is run.
import { loadEngine, loadModule } from "../engine.mjs";

let cache = null;

export async function modules() {
  if (!cache) {
    const { utils } = await loadEngine();
    const engine = await loadModule("/src/utils/reactions/engine/reactionEngine.ts");
    const stereo = await loadModule("/src/utils/reactions/engine/stereochemistry.ts");
    cache = { utils, engine, stereo, registry: utils.reactionRegistry };
  }
  return cache;
}

/** Isomeric canonical SMILES; the identity the planner and verifier compare by. */
export async function canon(smiles) {
  const { stereo } = await modules();
  const structure = await stereo.canonicalizeStereoStructure(smiles);
  return structure ? structure.isomeric : null;
}

export async function canonSet(list) {
  return (await Promise.all(list.map(canon))).sort();
}

/** The structural (user-supplied) reactants a rule needs besides its substrate. */
export function structuralSlots(rule) {
  return (rule.additionalReactants ?? []).filter((item) => item.supplyMode === "user-structure");
}

export async function runRule(ruleId, reactants) {
  const { engine, registry } = await modules();
  const rule = registry.find((item) => item.id === ruleId);
  if (!rule) throw new Error(`unknown rule ${ruleId}`);
  const pathways = await engine.predictReactionPathwaysFromRules(reactants.join("."), [], [rule], {
    planning: true,
  });
  return pathways.filter((item) => item.productSmiles);
}

/** The pathway whose product set equals `expected` (compared canonically). */
export async function pathwayGiving(ruleId, reactants, expected) {
  const { utils } = await modules();
  const wanted = await canonSet(expected);
  for (const pathway of await runRule(ruleId, reactants)) {
    const got = await canonSet(utils.splitReactionComponents(pathway.productSmiles));
    if (JSON.stringify(got) === JSON.stringify(wanted)) return pathway;
  }
  return null;
}

/** A planner-shaped step built from a real engine pathway. */
export function stepFromPathway(pathway, extra = {}) {
  return {
    ruleId: pathway.ruleId,
    reactantSmiles: pathway.reactantSmiles,
    reactantComponents: pathway.reactantComponents,
    productSmiles: pathway.productSmiles,
    productComponents: pathway.productSmiles.split("."),
    productMixture: pathway.productMixture,
    ...extra,
  };
}

/** Builds the fixture's route from real engine output, step by step. */
export async function routeFromFixture(fixture) {
  const steps = [];
  for (const spec of fixture.steps) {
    const pathway = await pathwayGiving(spec.ruleId, spec.reactants, spec.product);
    if (!pathway) throw new Error(`${fixture.id}: ${spec.ruleId} does not give ${spec.product}`);
    steps.push(stepFromPathway(pathway));
  }
  return {
    id: fixture.id,
    startingSmiles: fixture.supplied.join("."),
    targetSmiles: fixture.target,
    steps,
    confidence: "verified",
    score: 0,
  };
}

/** Canonical identity in the shape the pool expects. */
export async function poolSpecies(smiles) {
  const { stereo } = await modules();
  const structure = await stereo.canonicalizeStereoStructure(smiles);
  if (!structure) throw new Error(`cannot canonicalize ${smiles}`);
  return {
    smiles,
    canonical: structure.isomeric,
    connectivity: structure.connectivity,
    hasSpecifiedStereo: structure.hasSpecifiedStereo,
  };
}

/**
 * Drives a fixture through the species pool exactly as a planner would: each
 * step consumes the first live lot of every reactant structure and returns the
 * pool state plus the route steps annotated with the lot ids the pool used.
 */
export async function driveFixtureThroughPool(fixture, pool, copies = fixture.copies) {
  const { utils } = await modules();
  let state = pool.createPoolState(await Promise.all(fixture.supplied.map(poolSpecies)), copies);
  const steps = [];
  for (const spec of fixture.steps) {
    const pathway = await pathwayGiving(spec.ruleId, spec.reactants, spec.product);
    if (!pathway) throw new Error(`${fixture.id}: ${spec.ruleId} does not give ${spec.product}`);

    const consumedLotIds = [];
    for (const component of pathway.reactantComponents) {
      const wanted = await canon(component);
      const lot = pool
        .liveLots(state)
        .find((item) => item.canonical === wanted && !consumedLotIds.includes(item.id));
      if (!lot) return { state, steps, failed: { ruleId: spec.ruleId, reactant: component } };
      consumedLotIds.push(lot.id);
    }
    const products = await Promise.all(
      utils.splitReactionComponents(pathway.productSmiles).map(async (smiles, index) => ({
        ...(await poolSpecies(smiles)),
        role: index === 0 ? "primary" : "coproduct",
      })),
    );
    const applied = pool.applyStep(state, {
      ruleId: spec.ruleId,
      consumedLotIds,
      products,
      stepMixture: pathway.productMixture
        ? { kind: pathway.productMixture.kind, memberSmiles: pathway.productMixture.memberSmiles }
        : null,
    });
    if (!applied.ok) return { state, steps, failed: { ruleId: spec.ruleId, reason: applied.reason } };
    state = applied.state;
    steps.push(stepFromPathway(pathway, { reactantLotIds: consumedLotIds }));
  }
  return { state, steps, failed: null };
}
