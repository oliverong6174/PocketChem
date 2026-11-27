/**
 * Display summaries (and the one `check` number) saved beside the Stage 26 inputs. Pure functions of validated inputs; the numbers are recomputed from
 * the engines on every open, never trusted from the record. Headline lines are kept under 400 characters so they can be saved.
 */
import { ENDO_STAGES, TRAFF_PERTURBATIONS, TRAFFICKING_ASSUMPTIONS, VESICLE_STAGE_TITLE, cargoById, compartmentOf, endoCargo, evaluateQc, organelleById, traceCargo, traceEndocytosis, vesicleRoute } from "./trafficking26";
import { CELLCYCLE_ASSUMPTIONS, LICENSE_PHASE_LABEL, evaluateCdk, evaluateCycle, evaluateLicense, phaseInfo, CDK_COMPLEXES } from "./cellcycle26";
import { AUTOPHAGY_STEPS, CELLDEATH_ASSUMPTIONS, FATE_NODES, PATH_STEPS, SCENARIOS, evaluateApoptosis, evaluateAutophagy, evaluateFate, pathProgress } from "./celldeath26";
import { CELLCYCLE_ENGINE_VERSION, CELLDEATH_ENGINE_VERSION, ORGANELLES_ENGINE_VERSION, type CellCycleInputs, type CellDeathInputs, type OrganelleInputs } from "../persistence/biologyTools26";
import type { BiologyResults } from "../persistence/biologyTools";

export const ORGANELLE_ASSUMPTIONS = TRAFFICKING_ASSUMPTIONS;
export const CYCLE_ASSUMPTIONS = CELLCYCLE_ASSUMPTIONS;
export const DEATH_ASSUMPTIONS = CELLDEATH_ASSUMPTIONS;

const ok = (engineVersion: number, headline: string[], assumptions: string[], check: number, checkLabel: string): BiologyResults => ({ engineVersion, headline: headline.map((h) => h.slice(0, 390)), assumptions, check, checkLabel });
const list = (xs: string[]) => (xs.length ? xs.join(", ") : "none");

export function summarizeOrganelles(i: OrganelleInputs): BiologyResults | null {
  switch (i.section) {
    case "cell": {
      const o = i.organelle ? organelleById(i.organelle) : null;
      return ok(ORGANELLES_ENGINE_VERSION, o ? [`Organelle: ${o.name} (${o.boundary})`, `Functions: ${o.functions.join("; ")}`] : ["Schematic animal cell; no organelle selected"], ORGANELLE_ASSUMPTIONS, o ? o.functions.length : 0, "number of listed functions");
    }
    case "tracker": {
      const t = traceCargo(i.cargo, i.perturbations), c = cargoById(i.cargo), s = t.steps[i.step];
      return ok(ORGANELLES_ENGINE_VERSION, [`${c.name}: ${t.summary}`, `Perturbations: ${list(i.perturbations.map((p) => TRAFF_PERTURBATIONS.find((x) => x.id === p)!.label))}`, `Step ${i.step + 1} of ${t.steps.length}: ${s.title} (${compartmentOf(s.at).name})`], ORGANELLE_ASSUMPTIONS, t.steps.length, "steps taken by the cargo");
    }
    case "vesicles": {
      const r = vesicleRoute(i.vesicle.route);
      return ok(ORGANELLES_ENGINE_VERSION, [`Vesicle route: ${r.name}`, i.vesicle.stage ? `Stage inspected: ${VESICLE_STAGE_TITLE[i.vesicle.stage]}` : "No stage selected"], ORGANELLE_ASSUMPTIONS, i.vesicle.stage ? ["selection", "budding", "transport", "tethering", "docking", "fusion"].indexOf(i.vesicle.stage) + 1 : 0, "stage inspected (1–6)");
    }
    case "endosomes": {
      const c = endoCargo(i.endo.cargo), t = traceEndocytosis(c.id, i.endo.perturbations);
      return ok(ORGANELLES_ENGINE_VERSION, [`Endocytic cargo: ${c.name}`, `Route: ${t.path.map((p) => ENDO_STAGES.find((s) => s.id === p)!.title).join(" → ")}`, t.statements[0]], ORGANELLE_ASSUMPTIONS, t.degrades ? 1 : 0, "degraded in the lysosome (1 = yes)");
    }
    case "quality": {
      const v = evaluateQc(i.qc).values;
      const route = v.exported ? "folds and is exported" : v.proteasomeDeg ? "ERAD then proteasomal degradation" : v.lysoDeg ? "lysosomal degradation" : "accumulates (no modelled degradation route)";
      return ok(ORGANELLES_ENGINE_VERSION, [`Quality control: ${route}`, `Perturbations: ${list(i.qc.perturbations)}`], ORGANELLE_ASSUMPTIONS, v.exported ? 1 : 0, "exported from the ER (1 = yes)");
    }
  }
}
export function describeOrganelles(i: OrganelleInputs): string {
  switch (i.section) {
    case "cell": return `Organelles: ${i.organelle ? organelleById(i.organelle).name : "cell overview"}`.slice(0, 300);
    case "tracker": return `Protein trafficking: ${cargoById(i.cargo).name}${i.perturbations.length ? `, ${i.perturbations.join(" + ")}` : ""}`.slice(0, 300);
    case "vesicles": return `Vesicular transport: ${vesicleRoute(i.vesicle.route).name}`.slice(0, 300);
    case "endosomes": return `Endosomes and lysosomes: ${endoCargo(i.endo.cargo).name}`.slice(0, 300);
    case "quality": return "Protein quality control";
  }
}

export function summarizeCellCycle(i: CellCycleInputs): BiologyResults | null {
  const ev = evaluateCycle(i.cycle);
  const proceeds = ev.verdicts.filter((v) => v.status === "proceeds").length;
  switch (i.section) {
    case "cdk": {
      const a = evaluateCdk(i.cdk).values.active;
      return ok(CELLCYCLE_ENGINE_VERSION, [`${CDK_COMPLEXES.find((c) => c.id === i.cdk.complex)!.name}: ${a ? "active" : "inactive"}`], CYCLE_ASSUMPTIONS, a ? 1 : 0, "complex active (1 = yes)");
    }
    case "licensing": {
      const l = evaluateLicense(i.license);
      return ok(CELLCYCLE_ENGINE_VERSION, [`Licensing in ${LICENSE_PHASE_LABEL[i.license.phase]}: ${l.values.licensingPermitted ? "permitted" : "blocked"}; firing ${l.values.firing ? "possible" : "not possible"}`, `Origin state: ${l.origin}`], CYCLE_ASSUMPTIONS, l.values.licensingPermitted ? 1 : 0, "licensing permitted (1 = yes)");
    }
    default: {
      const cur = ev.verdicts.find((v) => v.from === i.cycle.phase)!;
      return ok(CELLCYCLE_ENGINE_VERSION, [`${phaseInfo(i.cycle.phase).name}: ${cur.label} ${cur.status}`, ...ev.outcome.definite.slice(1, 3), `Perturbations: ${list(i.cycle.perturbations)}`], CYCLE_ASSUMPTIONS, proceeds, "transitions that proceed (of 5)");
    }
  }
}
export function describeCellCycle(i: CellCycleInputs): string {
  const names: Record<string, string> = { overview: "Cell cycle", cdk: "Cyclin–CDK regulation", g1s: "G1/S control", licensing: "Replication licensing", ddr: "DNA-damage checkpoint", g2m: "G2/M control", sac: "Spindle assembly checkpoint" };
  return `${names[i.section]}${i.section === "licensing" ? `: ${LICENSE_PHASE_LABEL[i.license.phase]}` : i.section === "overview" || i.section === "cdk" ? "" : `: ${phaseInfo(i.cycle.phase).name}`}${i.cycle.perturbations.length ? `, ${i.cycle.perturbations.join(" + ")}` : ""}`.slice(0, 300);
}

export function summarizeCellDeath(i: CellDeathInputs): BiologyResults | null {
  switch (i.section) {
    case "overview": return ok(CELLDEATH_ENGINE_VERSION, ["Cell-fate overview: survival, repair, arrest, apoptosis, autophagy; no fate is predicted"], DEATH_ASSUMPTIONS, 0, "overview");
    case "intrinsic": case "extrinsic": case "caspases": {
      const path = i.section === "extrinsic" ? "extrinsic" : "intrinsic";
      const ev = evaluateApoptosis(i.apop), n = pathProgress(path, ev.values);
      return ok(CELLDEATH_ENGINE_VERSION, [`${path === "intrinsic" ? "Intrinsic" : "Extrinsic"} pathway reaches step ${n} of ${PATH_STEPS[path].length}${n ? `: ${PATH_STEPS[path][n - 1].title}` : ""}`, `Executioner caspases-3/7: ${ev.values.casp37 ? "active" : "not activated"}`, `Perturbations: ${list(i.apop.perturbations)}`], DEATH_ASSUMPTIONS, n, "pathway steps reached");
    }
    case "autophagy": {
      const ev = evaluateAutophagy(i.auto);
      return ok(CELLDEATH_ENGINE_VERSION, [`Autophagy reaches step ${ev.progress} of ${AUTOPHAGY_STEPS.length}${ev.progress ? `: ${AUTOPHAGY_STEPS[ev.progress - 1].title}` : ""}`, `Perturbations: ${list(i.auto.perturbations)}`], DEATH_ASSUMPTIONS, ev.progress, "autophagy steps reached");
    }
    case "fate": {
      const f = evaluateFate(i.fate);
      return ok(CELLDEATH_ENGINE_VERSION, [`Scenario: ${SCENARIOS.find((s) => s.id === i.fate.scenario)!.label}`, ...f.rows.filter((r) => r.status !== "not-engaged").slice(0, 3).map((r) => `${r.label}: ${r.status}`), "Survival or death is not predicted"], DEATH_ASSUMPTIONS, f.rows.filter((r) => r.status === "engaged").length, `engaged mechanisms (of ${FATE_NODES.filter((n) => n.kind !== "stressor").length})`);
    }
  }
}
export function describeCellDeath(i: CellDeathInputs): string {
  switch (i.section) {
    case "overview": return "Cell fate overview";
    case "intrinsic": return `Intrinsic apoptosis${i.apop.perturbations.length ? `: ${i.apop.perturbations.join(" + ")}` : ""}`.slice(0, 300);
    case "extrinsic": return `Extrinsic apoptosis${i.apop.perturbations.length ? `: ${i.apop.perturbations.join(" + ")}` : ""}`.slice(0, 300);
    case "caspases": return "Caspase cascade";
    case "autophagy": return `Autophagy${i.auto.perturbations.length ? `: ${i.auto.perturbations.join(" + ")}` : ""}`.slice(0, 300);
    case "fate": return `Cell-fate map: ${SCENARIOS.find((s) => s.id === i.fate.scenario)!.label}`.slice(0, 300);
  }
}
