/**
 * Saved state of the General Chemistry acid-base / titration tool (persisted page "genchem", subject "general").
 *
 * Inputs are everything needed to rebuild the analysis exactly; the calculation is deterministic and cheap, so results
 * are re-derived from the inputs when a record is opened. The stored results are a small summary shown in the library
 * and used to detect that the model changed since saving (then the page says so and shows the current values).
 */
import {
  isSpeciesKind,
  validateBuffer,
  validateSingleSolution,
  type BufferInput,
  type SingleSolutionInput,
} from "../generalChem/acidBase";
import { validateTitration, type TitrationInput } from "../generalChem/titration";

/** Bump when the model's definition of any stored number changes. */
export const GENCHEM_ENGINE_VERSION = 1;

export type GenChemView = "titration" | "solution" | "buffer";
export const GENCHEM_VIEWS: readonly GenChemView[] = ["titration", "solution", "buffer"];

export type GenChemInputs = {
  /** Always "general": subject identity is explicit in the data as well as in the record. */
  subject: "general";
  tool: "acid-base-titration";
  view: GenChemView;
  titration: TitrationInput;
  solution: SingleSolutionInput & { dilutedVolumeMl: number; startVolumeMl: number };
  buffer: BufferInput;
};

export type GenChemResults = {
  view: GenChemView;
  engineVersion: number;
  /** Headline lines exactly as shown when saved (display only; recomputed on open). */
  headline: string[];
  /** Key numbers for the integrity check on open. */
  pH: number;
  /** The assumptions that applied. */
  assumptions: string[];
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const DEFAULT_GENCHEM_INPUTS: GenChemInputs = {
  subject: "general",
  tool: "acid-base-titration",
  view: "titration",
  titration: { analyte: "weak-acid", c0: 0.1, v0: 25, pK: 4.76, ct: 0.1, vt: 12.5 },
  solution: { kind: "weak-acid", concentration: 0.1, pK: 4.76, startVolumeMl: 10, dilutedVolumeMl: 100 },
  buffer: { family: "acid", pK: 4.76, weak: 0.1, conjugate: 0.1 },
};

export function validateGenChemInputs(raw: unknown): GenChemInputs | null {
  if (!isObject(raw)) return null;
  if (raw.subject !== "general" || raw.tool !== "acid-base-titration") return null;
  if (typeof raw.view !== "string" || !GENCHEM_VIEWS.includes(raw.view as GenChemView)) return null;
  if (!isObject(raw.titration) || !isObject(raw.solution) || !isObject(raw.buffer)) return null;

  const t = raw.titration;
  if (!isSpeciesKind(t.analyte)) return null;
  const titration = validateTitration(t);
  if (!titration.ok) return null;

  const s = raw.solution;
  const solution = validateSingleSolution(s);
  if (!solution.ok) return null;
  if (typeof s.startVolumeMl !== "number" || typeof s.dilutedVolumeMl !== "number") return null;
  if (!Number.isFinite(s.startVolumeMl) || !Number.isFinite(s.dilutedVolumeMl) || s.startVolumeMl <= 0 || s.dilutedVolumeMl < s.startVolumeMl || s.dilutedVolumeMl > 1e6) return null;

  const buffer = validateBuffer(raw.buffer);
  if (!buffer.ok) return null;

  return {
    subject: "general",
    tool: "acid-base-titration",
    view: raw.view as GenChemView,
    titration: titration.value,
    solution: { ...solution.value, startVolumeMl: s.startVolumeMl, dilutedVolumeMl: s.dilutedVolumeMl },
    buffer: buffer.value,
  };
}

export function validateGenChemResults(raw: unknown): GenChemResults | null {
  if (!isObject(raw)) return null;
  if (typeof raw.view !== "string" || !GENCHEM_VIEWS.includes(raw.view as GenChemView)) return null;
  if (typeof raw.engineVersion !== "number" || !Number.isInteger(raw.engineVersion)) return null;
  if (typeof raw.pH !== "number" || !Number.isFinite(raw.pH) || raw.pH < -3 || raw.pH > 17) return null;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 20 && v.every((x) => typeof x === "string" && x.length <= 400);
  if (!strings(raw.headline) || !strings(raw.assumptions)) return null;
  return { view: raw.view as GenChemView, engineVersion: raw.engineVersion, headline: raw.headline, pH: raw.pH, assumptions: raw.assumptions };
}

export function describeGenChemAnalysis(inputs: GenChemInputs, results: GenChemResults): string {
  const lead =
    inputs.view === "titration"
      ? `Titration of ${inputs.titration.v0} mL ${inputs.titration.c0} M ${inputs.titration.analyte.replace("-", " ")}`
      : inputs.view === "solution"
        ? `${inputs.solution.concentration} M ${inputs.solution.kind.replace("-", " ")}`
        : `${inputs.buffer.family === "acid" ? "Weak-acid" : "Weak-base"} buffer`;
  return `${lead}: pH ${results.pH.toFixed(2)}`.slice(0, 300);
}
