/**
 * Stage 28: electron configurations of atoms and simple ions for Z = 1 to 36 (pure; no React).
 *
 * Three different kinds of statement are kept apart:
 *   1. GROUND_STATE_TABLE: curated ground-state configurations of the neutral atoms. They were compared with the NIST Handbook of Basic
 *      Atomic Spectroscopic Data (per-element "Atomic Data" tables) for all 36 elements in Stage 28; see scripts/reference/stage28.
 *   2. aufbauConfiguration: the elementary Madelung filling order (increasing n + l, then increasing n). A MODEL: it is wrong for
 *      chromium and copper within Z ≤ 36, and for many heavier elements.
 *   3. ion configurations: electrons are removed from the highest n, then the highest l (so 4s before 3d), and anions add electrons in
 *      Madelung order. A MODEL RULE taught in General Chemistry, not data: gas-phase ground states of some singly charged ions differ
 *      (for example V⁺, Co⁺ and Ni⁺, see GAS_PHASE_CATION_EXCEPTIONS).
 */
import { ELEMENTS } from "./elements";
import { subshellCapacity, subshellLabel, subshellOrbitalCount } from "./quantum28";

export interface Occupation { n: number; l: number; count: number }
export const CONFIG_ENGINE_VERSION = 1;
export const MAX_Z = 36;

const CORE = { He: "1s2", Ne: "1s2 2s2 2p6", Ar: "1s2 2s2 2p6 3s2 3p6", Zn: "1s2 2s2 2p6 3s2 3p6 3d10 4s2" } as const;
const c = (core: keyof typeof CORE | "", rest: string) => `${core ? `${CORE[core]} ` : ""}${rest}`.trim();

/** Curated ground-state configurations, written by subshell in order of increasing n (then l), as in standard tables. */
export const GROUND_STATE_TABLE: Readonly<Record<number, string>> = Object.freeze({
  1: "1s1", 2: "1s2",
  3: c("He", "2s1"), 4: c("He", "2s2"), 5: c("He", "2s2 2p1"), 6: c("He", "2s2 2p2"), 7: c("He", "2s2 2p3"), 8: c("He", "2s2 2p4"), 9: c("He", "2s2 2p5"), 10: c("He", "2s2 2p6"),
  11: c("Ne", "3s1"), 12: c("Ne", "3s2"), 13: c("Ne", "3s2 3p1"), 14: c("Ne", "3s2 3p2"), 15: c("Ne", "3s2 3p3"), 16: c("Ne", "3s2 3p4"), 17: c("Ne", "3s2 3p5"), 18: c("Ne", "3s2 3p6"),
  19: c("Ar", "4s1"), 20: c("Ar", "4s2"),
  21: c("Ne", "3s2 3p6 3d1 4s2"), 22: c("Ne", "3s2 3p6 3d2 4s2"), 23: c("Ne", "3s2 3p6 3d3 4s2"), 24: c("Ne", "3s2 3p6 3d5 4s1"), 25: c("Ne", "3s2 3p6 3d5 4s2"),
  26: c("Ne", "3s2 3p6 3d6 4s2"), 27: c("Ne", "3s2 3p6 3d7 4s2"), 28: c("Ne", "3s2 3p6 3d8 4s2"), 29: c("Ne", "3s2 3p6 3d10 4s1"), 30: c("Ne", "3s2 3p6 3d10 4s2"),
  31: c("Zn", "4p1"), 32: c("Zn", "4p2"), 33: c("Zn", "4p3"), 34: c("Zn", "4p4"), 35: c("Zn", "4p5"), 36: c("Zn", "4p6"),
});
/** Atoms in Z = 1..36 whose observed ground state is not the Madelung (Aufbau) one. */
export const OBSERVED_EXCEPTIONS: ReadonlySet<number> = new Set([24, 29]);

/**
 * Singly charged cations whose NIST gas-phase ground configuration differs from the removal rule (compared for every Z = 1..36
 * with a NIST ion entry in Stage 28). Values are the NIST ground configurations of the ion.
 */
export const GAS_PHASE_CATION_EXCEPTIONS: Readonly<Record<number, string>> = Object.freeze({
  23: c("Ne", "3s2 3p6 3d4"), 27: c("Ne", "3s2 3p6 3d8"), 28: c("Ne", "3s2 3p6 3d9"),
});

// ---- parsing and formatting ------------------------------------------------------------------------------------------------------------------

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (v: number): string => String(v).split("").map((d) => SUP[Number(d)]).join("");
const LETTER_TO_L: Record<string, number> = { s: 0, p: 1, d: 2, f: 3 };

export function parseConfiguration(text: string): Occupation[] | null {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  const out: Occupation[] = [];
  for (const p of parts) {
    const m = /^(\d)([spdf])(\d{1,2})$/.exec(p);
    if (!m) return null;
    const n = Number(m[1]); const l = LETTER_TO_L[m[2]]; const count = Number(m[3]);
    if (l > n - 1 || count < 0 || count > subshellCapacity(l)) return null;
    if (out.some((o) => o.n === n && o.l === l)) return null;
    out.push({ n, l, count });
  }
  return out.sort((a, b) => a.n - b.n || a.l - b.l);
}
export const electronCount = (occ: Occupation[]): number => occ.reduce((s, o) => s + o.count, 0);

/** Madelung order: increasing n + l, ties by increasing n. Covers the subshells needed for Z ≤ 36 and a little beyond. */
export const MADELUNG_ORDER: ReadonlyArray<{ n: number; l: number }> = (() => {
  const all: Array<{ n: number; l: number }> = [];
  for (let n = 1; n <= 5; n++) for (let l = 0; l <= Math.min(3, n - 1); l++) all.push({ n, l });
  return all.sort((a, b) => a.n + a.l - (b.n + b.l) || a.n - b.n);
})();

/** The Aufbau (Madelung) configuration for a number of electrons. */
export function aufbauConfiguration(electrons: number): Occupation[] {
  const out: Occupation[] = [];
  let left = electrons;
  for (const s of MADELUNG_ORDER) {
    if (left <= 0) break;
    const put = Math.min(left, subshellCapacity(s.l));
    out.push({ n: s.n, l: s.l, count: put });
    left -= put;
  }
  return out.sort((a, b) => a.n - b.n || a.l - b.l);
}

const NOBLE: ReadonlyArray<[number, string]> = [[36, "Kr"], [18, "Ar"], [10, "Ne"], [2, "He"]];

/** Writes a configuration, optionally with a noble-gas core (`neutral`: a neutral atom never abbreviates to itself, so Kr is [Ar] 3d¹⁰ 4s² 4p⁶). Subshells follow increasing n, so 3d is written before 4s. */
export function formatConfiguration(occ: Occupation[], opts: { noble?: boolean; unicode?: boolean; neutral?: boolean } = {}): string {
  const unicode = opts.unicode !== false;
  const total = electronCount(occ);
  if (total === 0) return "no electrons";
  const write = (list: Occupation[]) => list.map((o) => `${subshellLabel(o.n, o.l)}${unicode ? sup(o.count) : String(o.count)}`).join(unicode ? " " : " ");
  if (opts.noble) {
    for (const [z, sym] of NOBLE) {
      if (opts.neutral ? z >= total : z > total) continue;
      const core = aufbauConfiguration(z);
      if (!core.every((k) => occ.some((o) => o.n === k.n && o.l === k.l && o.count === k.count))) continue;
      const rest = occ.filter((o) => !core.some((k) => k.n === o.n && k.l === o.l));
      if (rest.length === 0) return `[${sym}]`;
      return `[${sym}] ${write(rest)}`;
    }
  }
  return write(occ);
}
/** Plain compact form used to compare with reference tables: "1s22s22p63s23p63d54s" (a count of 1 is omitted). */
export function compactConfiguration(occ: Occupation[]): string {
  return occ.filter((o) => o.count > 0).map((o) => `${subshellLabel(o.n, o.l)}${o.count === 1 ? "" : o.count}`).join("");
}

// ---- atoms and ions ---------------------------------------------------------------------------------------------------------------------------

export type ConfigStatus = "reference-atom" | "removal-rule" | "filling-rule";
export interface ConfigResult {
  Z: number; symbol: string; name: string; charge: number; electrons: number;
  occupation: Occupation[]; aufbau: Occupation[];
  status: ConfigStatus;
  /** True when the observed configuration differs from the Aufbau configuration of the same number of electrons (neutral atoms only). */
  isException: boolean;
  /** For a +1 cation: the NIST gas-phase configuration when it differs from the rule's result. */
  gasPhaseNote: string | null;
  unpaired: number;
}
export type ConfigOutcome = { ok: true; value: ConfigResult } | { ok: false; error: string };

const symbolOf = (Z: number): { symbol: string; name: string } | null => {
  const e = Object.values(ELEMENTS).find((x) => x.Z === Z);
  return e ? { symbol: e.symbol, name: e.name } : null;
};
export const elementSymbol = (Z: number): string => symbolOf(Z)?.symbol ?? "?";
export const elementName = (Z: number): string => symbolOf(Z)?.name ?? "?";

const periodEnd = (Z: number): number => [2, 10, 18, 36].find((e) => e >= Z) ?? 36;

/** Unpaired electrons from Hund's rule: a subshell with k electrons in 2l+1 degenerate orbitals has k unpaired when k ≤ 2l+1, else 2(2l+1) − k. */
export function unpairedElectrons(occ: Occupation[]): number {
  return occ.reduce((s, o) => { const b = subshellOrbitalCount(o.l); return s + (o.count <= b ? o.count : 2 * b - o.count); }, 0);
}

export function configurationFor(Z: number, charge = 0): ConfigOutcome {
  if (!Number.isInteger(Z) || Z < 1 || Z > MAX_Z) return { ok: false, error: `Atomic numbers 1 to ${MAX_Z} are supported.` };
  if (!Number.isInteger(charge) || charge < -3 || charge > 8) return { ok: false, error: "Ionic charges from −3 to +8 are supported." };
  const sym = symbolOf(Z);
  const text = GROUND_STATE_TABLE[Z];
  if (!sym || !text) return { ok: false, error: "Element not available." };
  const atom = parseConfiguration(text);
  if (!atom) return { ok: false, error: "Internal table error." };
  const electrons = Z - charge;
  if (electrons < 0) return { ok: false, error: `A charge of +${charge} would remove more electrons than the ${Z} the atom has.` };
  let occ: Occupation[] = atom.map((o) => ({ ...o }));
  let status: ConfigStatus = "reference-atom";
  if (charge > 0) {
    status = "removal-rule";
    // remove from the highest n, then the highest l
    let toRemove = charge;
    const order = [...occ].sort((a, b) => b.n - a.n || b.l - a.l);
    for (const o of order) { const take = Math.min(o.count, toRemove); o.count -= take; toRemove -= take; if (toRemove === 0) break; }
    occ = occ.filter((o) => o.count > 0);
  } else if (charge < 0) {
    status = "filling-rule";
    if (Z >= 21 && Z <= 30) return { ok: false, error: "Anions of the d-block elements are not curated in this tool." };
    if (electrons > periodEnd(Z)) return { ok: false, error: `${sym.symbol} cannot take ${-charge} more electron${charge === -1 ? "" : "s"} within its own period in this model (its period ends at ${periodEnd(Z)} electrons).` };
    let toAdd = -charge;
    for (const s of MADELUNG_ORDER) {
      if (toAdd === 0) break;
      const cur = occ.find((o) => o.n === s.n && o.l === s.l);
      const have = cur?.count ?? 0;
      const room = subshellCapacity(s.l) - have;
      if (room <= 0) continue;
      const put = Math.min(room, toAdd);
      if (cur) cur.count += put; else occ.push({ n: s.n, l: s.l, count: put });
      toAdd -= put;
    }
    occ.sort((a, b) => a.n - b.n || a.l - b.l);
  }
  const aufbau = aufbauConfiguration(electrons);
  const isException = charge === 0 && OBSERVED_EXCEPTIONS.has(Z);
  const gp = charge === 1 ? GAS_PHASE_CATION_EXCEPTIONS[Z] : undefined;
  return {
    ok: true,
    value: {
      Z, symbol: sym.symbol, name: sym.name, charge, electrons, occupation: occ, aufbau, status, isException,
      gasPhaseNote: gp ? `NIST lists the gas-phase ground configuration of ${sym.symbol}⁺ as ${formatConfiguration(parseConfiguration(gp) ?? [], { noble: true })}, which differs from the removal rule.` : null,
      unpaired: unpairedElectrons(occ),
    },
  };
}

// ---- orbital boxes (Hund's rule) -------------------------------------------------------------------------------------------------------------

/** One box = one spatial orbital: 0 empty, 1 spin up, 2 spin down, 3 a spin-paired pair. */
export interface SubshellBoxes { n: number; l: number; label: string; count: number; boxes: number[] }
export function orbitalBoxes(occ: Occupation[]): SubshellBoxes[] {
  return occ.filter((o) => o.count > 0).map((o) => {
    const b = subshellOrbitalCount(o.l);
    const boxes = new Array<number>(b).fill(0);
    // Hund: one electron (parallel spin, drawn up) into each box first, then pair
    for (let i = 0; i < Math.min(o.count, b); i++) boxes[i] = 1;
    for (let i = 0; i < o.count - b; i++) boxes[i] = 3;
    return { n: o.n, l: o.l, label: subshellLabel(o.n, o.l), count: o.count, boxes };
  });
}

// ---- student build ---------------------------------------------------------------------------------------------------------------------------

export const BUILD_SUBSHELLS: ReadonlyArray<{ n: number; l: number }> = [
  { n: 1, l: 0 }, { n: 2, l: 0 }, { n: 2, l: 1 }, { n: 3, l: 0 }, { n: 3, l: 1 }, { n: 4, l: 0 }, { n: 3, l: 2 }, { n: 4, l: 1 },
];
export type BuildClass = "matches-model" | "matches-aufbau-only" | "valid-other" | "wrong-count" | "pauli-violation";
export interface BuildCheck { cls: BuildClass; total: number; expected: number; messages: string[]; occupation: Occupation[] }

export function checkBuild(Z: number, charge: number, counts: number[]): BuildCheck | null {
  const ref = configurationFor(Z, charge);
  if (!ref.ok || counts.length !== BUILD_SUBSHELLS.length) return null;
  const occ = BUILD_SUBSHELLS.map((s, i) => ({ n: s.n, l: s.l, count: counts[i] })).filter((o) => o.count > 0).sort((a, b) => a.n - b.n || a.l - b.l);
  const messages: string[] = [];
  const over = BUILD_SUBSHELLS.map((s, i) => ({ s, k: counts[i] })).filter(({ s, k }) => !Number.isInteger(k) || k < 0 || k > subshellCapacity(s.l));
  if (over.length) {
    for (const { s } of over) messages.push(`${subshellLabel(s.n, s.l)} holds at most ${subshellCapacity(s.l)} electrons: ${subshellOrbitalCount(s.l)} orbital${s.l === 0 ? "" : "s"} × 2, because each orbital takes two electrons of opposite spin (Pauli exclusion).`);
    return { cls: "pauli-violation", total: counts.reduce((a, b) => a + b, 0), expected: ref.value.electrons, messages, occupation: occ };
  }
  const total = electronCount(occ);
  const expected = ref.value.electrons;
  if (total !== expected) {
    messages.push(`${total} electron${total === 1 ? "" : "s"} placed; ${elementSymbol(Z)}${charge ? (charge > 0 ? (charge === 1 ? "⁺" : `${sup(charge)}⁺`) : (charge === -1 ? "⁻" : `${sup(-charge)}⁻`)) : ""} has ${expected}.`);
    return { cls: "wrong-count", total, expected, messages, occupation: occ };
  }
  const same = (a: Occupation[], b: Occupation[]) => compactConfiguration(a) === compactConfiguration(b);
  if (same(occ, ref.value.occupation)) {
    messages.push(ref.value.isException ? "This is the observed ground-state configuration, which is an exception to the simple Aufbau order." : charge === 0 ? "This matches the reference ground-state configuration." : "This matches the configuration the removal/filling rule gives.");
    return { cls: "matches-model", total, expected, messages, occupation: occ };
  }
  if (same(occ, ref.value.aufbau)) {
    messages.push("This is the configuration the simple Aufbau order predicts, but it is not the observed ground state for this atom or ion.");
    return { cls: "matches-aufbau-only", total, expected, messages, occupation: occ };
  }
  messages.push("The electron count and the Pauli limits are right, but this arrangement is not the ground-state configuration (it would be an excited configuration).");
  return { cls: "valid-other", total, expected, messages, occupation: occ };
}
