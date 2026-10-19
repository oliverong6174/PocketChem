import type { MultistepSynthesisRoute, MultistepSynthesisSearchOptions } from "../reactionTypes";

/**
 * UI-facing advanced search settings for the Multi-Step Synthesis page. All off
 * by default: with the defaults the options are exactly the ordinary Normal /
 * Deep search options and the convergent lanes are never entered.
 */
export type AdvancedSearchSettings = {
  /** Try routes of the shape A -> A', B -> B', A' + B' -> target first. */
  convergent: boolean;
  /** Also search backward from the target (needs `convergent`). */
  bidirectional: boolean;
  /** Qualitative copies of each supplied material (1 or 2); not an amount. */
  copies: 1 | 2;
};

export const DEFAULT_ADVANCED_SETTINGS: AdvancedSearchSettings = {
  convergent: false,
  bidirectional: false,
  copies: 1,
};

/** Share of the hard time limit the advanced lane may use before the ordinary search runs. */
const ADVANCED_LANE_TIME_SHARE = 0.6;

/**
 * Collects verified routes reported while a search runs, so they survive a
 * timeout or cancellation. Reports from a superseded or aborted run are ignored
 * (a stale search can never add to, or overwrite, the current run's results),
 * and the list is bounded.
 */
export function createRouteCollector(isCurrent: () => boolean, signal: AbortSignal, cap = 5) {
  const routes: MultistepSynthesisRoute[] = [];
  return {
    routes,
    onRouteFound(route: MultistepSynthesisRoute) {
      if (!isCurrent() || signal.aborted) return;
      if (route.verification?.status !== "verified" && route.verification?.status !== "connectivity-only") return;
      if (routes.length >= cap || routes.some((item) => item.id === route.id)) return;
      // The confidence label always follows successful replay, not the planner label.
      routes.push({
        ...route,
        confidence: route.verification.status === "verified" ? "verified" : "connectivity-verified",
      });
    },
  };
}

export function buildSynthesisSearchOptions(
  searchEffort: "normal" | "deep",
  hardTimeoutMs: number,
  advanced: AdvancedSearchSettings,
  extra: { signal?: AbortSignal; onRouteFound?: (route: MultistepSynthesisRoute) => void } = {},
): MultistepSynthesisSearchOptions {
  const options: MultistepSynthesisSearchOptions = {
    beamWidth: searchEffort === "deep" ? 16 : 10,
    branchLimit: searchEffort === "deep" ? 32 : 18,
    maxSteps: searchEffort === "deep" ? 9 : 7,
    maxRoutes: 1,
    preferFirstVerifiedRoute: true,
    searchEffort,
    signal: extra.signal,
  };
  if (advanced.convergent) {
    options.convergentSearch = {
      startingMaterialCopies: advanced.copies === 2 ? 2 : 1,
      bidirectional: advanced.bidirectional,
      maxWallMs: Math.floor(hardTimeoutMs * ADVANCED_LANE_TIME_SHARE),
    };
  }
  options.onRouteFound = extra.onRouteFound;
  return options;
}
