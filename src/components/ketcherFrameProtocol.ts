/**
 * Shared constants for the synthesis editor iframe bridge.
 * Keep this module dependency-free so the parent application does not pull the
 * full Ketcher bundle merely to construct an iframe URL.
 */
export const KETCHER_FRAME_QUERY_KEY = "__pocketchem_ketcher_frame";
export const KETCHER_FRAME_CHANNEL = "pocketchem-ketcher-frame-v1";
