/**
 * The app's Saved Analyses library with the validators of every page that can save into it:
 * Synthesis (Stage 8B-3A), Ranking and Spectroscopy (Stage 8B-3B-1), Properties and Reactions
 * (Stage 8B-3B-2), and the Multi-Catalytic workspace (Stage 9B-2B).
 */
import { getAnalysisLibrary, registerAnalysisValidators, type AnalysisLibrary } from "./analysisLibrary";
import {
  MULTICATALYTIC_ENGINE_VERSION,
  validateMulticatalyticInputs,
  validateMulticatalyticResults,
} from "./multicatalyticWorkspace";
import { PROPERTIES_ENGINE_VERSION, validatePropertiesInputs, validatePropertiesResults } from "./propertiesWorkspace";
import { REACTIONS_ENGINE_VERSION, validateReactionsInputs, validateReactionsResults } from "./reactionsWorkspace";
import { RANKING_ENGINE_VERSION, validateRankingInputs, validateRankingResults } from "./rankingWorkspace";
import { SPECTROSCOPY_ENGINE_VERSION, validateSpectroscopyInputs, validateSpectroscopyResults } from "./spectroscopyWorkspace";
import {
  SYNTHESIS_ENGINE_VERSION,
  validateSynthesisInputs,
  validateSynthesisResults,
} from "./synthesisWorkspace";

/** Pages whose saved analyses can be opened again by this version. */
export const OPENABLE_ANALYSIS_PAGES = ["synthesis", "ranking", "spectroscopy", "properties", "reactions", "multicatalytic"] as const;

/** The app page each saved analysis type opens on. */
export const ANALYSIS_APP_PAGE = {
  synthesis: "multiStep",
  ranking: "acidBase",
  spectroscopy: "spectroscopy",
  properties: "analysis",
  reactions: "reactions",
  multicatalytic: "multiCatalytic",
} as const;

let registered = false;

export function getAppAnalysisLibrary(): AnalysisLibrary {
  if (!registered) {
    registerAnalysisValidators({
      synthesis: {
        engineVersion: SYNTHESIS_ENGINE_VERSION,
        validateInputs: validateSynthesisInputs,
        validateResults: validateSynthesisResults,
      },
      ranking: {
        engineVersion: RANKING_ENGINE_VERSION,
        validateInputs: validateRankingInputs,
        validateResults: validateRankingResults,
      },
      spectroscopy: {
        engineVersion: SPECTROSCOPY_ENGINE_VERSION,
        validateInputs: validateSpectroscopyInputs,
        validateResults: validateSpectroscopyResults,
      },
      properties: {
        engineVersion: PROPERTIES_ENGINE_VERSION,
        validateInputs: validatePropertiesInputs,
        validateResults: validatePropertiesResults,
      },
      reactions: {
        engineVersion: REACTIONS_ENGINE_VERSION,
        validateInputs: validateReactionsInputs,
        validateResults: validateReactionsResults,
      },
      multicatalytic: {
        engineVersion: MULTICATALYTIC_ENGINE_VERSION,
        validateInputs: validateMulticatalyticInputs,
        validateResults: validateMulticatalyticResults,
      },
    });
    registered = true;
  }
  return getAnalysisLibrary();
}
