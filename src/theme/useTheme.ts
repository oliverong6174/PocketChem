import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "pocketchem.theme";

export function readStoredPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : "system";
  } catch {
    return "system";
  }
}

function systemTheme(): ResolvedTheme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

export function applyTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f5f3ee" : "#070b14");
}

/**
 * Theme preference: "system" follows the OS (and updates live), "light"/"dark" are explicit.
 * The first paint is handled by the inline script in index.html; this hook keeps it in sync afterwards.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);
  const resolved: ResolvedTheme = preference === "system" ? system : preference;

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystem(query.matches ? "light" : "dark");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      /* storage unavailable: the choice applies for this visit only */
    }
  }, []);

  return { preference, resolved, setPreference };
}
