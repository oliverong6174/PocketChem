import type { Plugin } from "vite";

export const RESTRICTED_DATA: string[];
export const PERSONAL_MODE: string;
export function restrictedData(): Plugin;
