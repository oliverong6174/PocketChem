/**
 * The app's Saved Analyses library with the validators of every page that can save into it:
 * Synthesis (Stage 8B-3A), Ranking and Spectroscopy (Stage 8B-3B-1). Properties and Reactions
 * register here when they gain a Save control.
 */
import { getAnalysisLibrary, registerAnalysisValidators, type AnalysisLibrary } from "./analysisLibrary";
import { RANKING_ENGINE_VERSION, validateRankingInputs, validateRankingResults } from "./rankingWorkspace";
import { SPECTROSCOPY_ENGINE_VERSION, validateSpectroscopyInputs, validateSpectroscopyResults } from "./spectroscopyWorkspace";
import {
  SYNTHESIS_ENGINE_VERSION,
  validateSynthesisInputs,
  validateSynthesisResults,
} from "./synthesisWorkspace";

/** Pages whose saved analyses can be opened again by this version. */
export const OPENABLE_ANALYSIS_PAGES = ["synthesis", "ranking", "spectroscopy"] as const;

/** The app page each saved analysis type opens on. */
export const ANALYSIS_APP_PAGE = {
  synthesis: "multiStep",
  ranking: "acidBase",
  spectroscopy: "spectroscopy",
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
    });
    registered = true;
  }
  return getAnalysisLibrary();
}
