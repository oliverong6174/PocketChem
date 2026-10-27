import { useEffect, useState } from "react";
import {
  WorkspacePersistence,
  type PersistenceStatus,
  type RecoveryOutcome,
  type WorkspacePersistenceConfig,
} from "./workspacePersistence";
import { getWorkspaceStore } from "./workspaceStore";

export type PageWorkspaceConfig<I, R> = Omit<WorkspacePersistenceConfig<I, R>, "store">;

/**
 * Creates the page's persistence controller and starts recovery exactly once. `recovery` is null
 * until the saved record has been read; the page applies it to its own state in an effect.
 */
export function useWorkspacePersistence<I, R>(config: PageWorkspaceConfig<I, R>) {
  // Created once per mount; the config only supplies constants and module-level functions.
  const [controller] = useState(() => new WorkspacePersistence<I, R>({ ...config, store: getWorkspaceStore() }));
  const [recovery, setRecovery] = useState<RecoveryOutcome<I, R> | null>(null);
  const [status, setStatus] = useState<PersistenceStatus>(controller.getStatus());

  useEffect(() => {
    controller.attach();
    let active = true;
    void controller.recover().then((outcome) => {
      if (active) setRecovery(outcome);
    });
    const unsubscribe = controller.subscribe(setStatus);
    // Writes are debounced; make sure the latest state is flushed when the tab is hidden or closed.
    const flush = () => void controller.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("pagehide", flush);
      controller.detach();
    };
  }, [controller]);

  return { controller, recovery, status };
}
