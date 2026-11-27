import type { Status } from "../../utils/biology/signaling23";

export const STATUS_SYMBOL: Record<Status, string> = { active: "●", inactive: "○", blocked: "✕", attenuated: "◐", persisting: "↻" };
export const STATUS_WORD: Record<Status, string> = { active: "ON", inactive: "off", blocked: "BLOCKED", attenuated: "ATTENUATED", persisting: "PERSISTING" };
