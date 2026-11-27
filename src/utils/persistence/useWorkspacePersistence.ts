import { useEffect, useRef, useState } from "react";
import {
  WorkspacePersistence,
  type PersistenceStatus,
  type RecoveryOutcome,
  type WorkspacePersistenceConfig,
} from "./workspacePersistence";
import { getWorkspaceStore } from "./workspaceStore";
import { registerLeaveHook } from "./leaveGate";

export type PageWorkspaceConfig<I, R> = Omit<WorkspacePersistenceConfig<I, R>, "store"> & {
  /**
   * Runs before the app switches away from the page (and when the tab is hidden): finish reading
   * the editor so the final state can be saved. The controller's own pending save is flushed after.
   */
  beforeLeave?: () => Promise<void> | void;
};

/**
 * Creates the page's persistence controller and starts recovery exactly once. `recovery` is null
 * until the saved record has been read; the page applies it to its own state in an effect.
 */
export function useWorkspacePersistence<I, R>(config: PageWorkspaceConfig<I, R>) {
  // Created once per mount; the config only supplies constants and module-level functions.
  const [controller] = useState(() => {
    const { beforeLeave, ...rest } = config;
    void beforeLeave;
    return new WorkspacePersistence<I, R>({ ...rest, store: getWorkspaceStore() });
  });
  const beforeLeaveRef = useRef(config.beforeLeave);
  useEffect(() => {
    beforeLeaveRef.current = config.beforeLeave;
  });
  const [recovery, setRecovery] = useState<RecoveryOutcome<I, R> | null>(null);
  const [status, setStatus] = useState<PersistenceStatus>(controller.getStatus());

  useEffect(() => {
    controller.attach();
    let active = true;
    void controller.recover().then((outcome) => {
      if (active) setRecovery(outcome);
    });
    const unsubscribe = controller.subscribe(setStatus);
    const leave = async () => {
      await beforeLeaveRef.current?.();
      await controller.flush();
    };
    const unregisterLeave = registerLeaveHook(leave);
    // Writes are debounced; make sure the latest state is flushed when the tab is hidden or closed.
    const flush = () => void leave();
    window.addEventListener("pagehide", flush);
    return () => {
      active = false;
      unsubscribe();
      unregisterLeave();
      window.removeEventListener("pagehide", flush);
      controller.detach();
    };
  }, [controller]);

  return { controller, recovery, status };
}
