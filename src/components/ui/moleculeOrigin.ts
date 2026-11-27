import { createContext } from "react";
import type { MoleculeDestinationId } from "../../utils/moleculeTransfer";

/** The workspace a depiction is shown in, so "Open in" can leave that one out. Null outside the organic workspaces. */
export const MoleculeOriginContext = createContext<MoleculeDestinationId | null>(null);
