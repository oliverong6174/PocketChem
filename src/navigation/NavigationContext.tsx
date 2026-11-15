import { createContext, useContext } from "react";
import type { ConceptDestination } from "../utils/concepts/conceptIndex";

/**
 * A single function the shell provides so a tool can open another tool. It goes through the same switch functions as the tab
 * bar (so unsaved work is flushed first and the address bar / Back button follow). It is not a state store: a tool that wants to
 * hand data over uses the validated one-shot handoff slot, then calls this.
 */
export interface Navigation {
  openDestination: (destination: ConceptDestination) => void;
  openSearch: (initialQuery?: string) => void;
}

const NOOP: Navigation = { openDestination: () => undefined, openSearch: () => undefined };

export const NavigationContext = createContext<Navigation>(NOOP);
export const useNavigation = (): Navigation => useContext(NavigationContext);
