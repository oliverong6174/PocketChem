export type LocalChemicalNameRecord = {
  chebiId: string;
  smiles: string;
  /** Lean runtime indexes intentionally omit InChIKey to reduce bundle size. */
  inchiKey: string | null;
  preferredName: string | null;
  iupacName: string | null;
  molecularFormula: string | null;
  source: "chebi";
};

type SerializedLeanRecord = [
  chebiNumericId: number,
  smiles: string,
  preferredName: string | null,
  iupacName: string | null,
  molecularFormula: string | null,
  extraAliases?: string[],
];

type LeanChemicalNameIndex = {
  v: 3;
  g: string;
  s: {
    n: string;
    r: string | null;
    u?: string;
  };
  r: SerializedLeanRecord[];
};

type RuntimeRecord = [
  chebiNumericId: number,
  smiles: string,
  preferredName: string | null,
  iupacName: string | null,
  molecularFormula: string | null,
];

type AliasTarget = number | number[];

type RuntimeChemicalNameIndex = {
  records: RuntimeRecord[];
  aliases: Map<string, AliasTarget>;
};

const GZIP_INDEX_ASSET = "data/chemical-names.index.json.gz";

let indexPromise: Promise<RuntimeChemicalNameIndex> | null = null;

export function normalizeChemicalName(value: string) {
  return value
    // ChEBI stores small-caps/italics as inline markup ("<small>L</small>-leucine", "(2<i>S</i>)-...").
    .replace(/<\/?(?:small|i|em|b|strong|sub|sup)>/gi, "")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[αΑ]/g, "alpha")
    .replace(/[βΒ]/g, "beta")
    .replace(/[γΓ]/g, "gamma")
    .replace(/[δΔ]/g, "delta")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[’′]/g, "'")
    .replace(/″/g, '"')
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",");
}

function getViteBaseUrl(): string | null {
  try {
    const meta = import.meta as ImportMeta & {
      env?: { BASE_URL?: string };
    };
    return meta.env?.BASE_URL ?? null;
  } catch {
    return null;
  }
}

function candidateAssetUrls(relativePath: string): string[] {
  const urls = new Set<string>();
  const origin = window.location.origin;
  const viteBase = getViteBaseUrl();

  if (viteBase) {
    try {
      if (/^https?:\/\//i.test(viteBase)) {
        urls.add(new URL(relativePath, viteBase).toString());
      } else if (viteBase.startsWith("/")) {
        const base = viteBase.endsWith("/") ? viteBase : `${viteBase}/`;
        urls.add(new URL(`${base}${relativePath}`, origin).toString());
      } else {
        urls.add(new URL(`${viteBase}${relativePath}`, document.baseURI).toString());
      }
    } catch {
      // Other candidates below may still work.
    }
  }

  try {
    urls.add(new URL(relativePath, document.baseURI).toString());
  } catch {
    // Ignore.
  }

  try {
    urls.add(new URL(`/${relativePath}`, origin).toString());
  } catch {
    // Ignore.
  }

  return [...urls];
}

async function responseToJsonText(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const isActuallyGzipped =
    bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  // Some static hosts transparently decode a .gz response before Fetch sees it.
  if (!isActuallyGzipped) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "This browser cannot decompress PocketChem's bundled offline chemical-name database.",
    );
  }

  const source = new Blob([bytes]).stream();
  const decompressed = source.pipeThrough(new DecompressionStream("gzip"));
  return await new Response(decompressed).text();
}

function validateLeanIndex(value: unknown): LeanChemicalNameIndex {
  if (!value || typeof value !== "object") {
    throw new Error("The local chemical-name database is not valid JSON.");
  }

  const index = value as Partial<LeanChemicalNameIndex>;
  if (index.v !== 3) {
    throw new Error(
      `Unsupported local chemical-name database version: ${String(index.v)}. Rebuild it with the current scripts/buildChemicalNameIndex.mjs.`,
    );
  }
  if (!Array.isArray(index.r)) {
    throw new Error("The local chemical-name database is missing its compact records table.");
  }

  return index as LeanChemicalNameIndex;
}

function addAliasCandidate(
  aliases: Map<string, AliasTarget>,
  rawKey: string | null | undefined,
  recordIndex: number,
) {
  const key = normalizeChemicalName(rawKey ?? "");
  if (!key || key.length > 240) return;

  const existing = aliases.get(key);
  if (existing === undefined) {
    aliases.set(key, recordIndex);
    return;
  }

  if (typeof existing === "number") {
    if (existing !== recordIndex) aliases.set(key, [existing, recordIndex]);
    return;
  }

  if (!existing.includes(recordIndex)) existing.push(recordIndex);
}

function compileRuntimeIndex(serialized: LeanChemicalNameIndex): RuntimeChemicalNameIndex {
  const records: RuntimeRecord[] = [];
  const aliases = new Map<string, AliasTarget>();

  for (const row of serialized.r) {
    if (!Array.isArray(row) || row.length < 5) continue;

    const [chebiNumericId, smiles, preferredName, iupacName, molecularFormula, extraAliases] = row;
    if (!Number.isInteger(chebiNumericId) || !smiles) continue;

    const recordIndex = records.length;
    records.push([
      chebiNumericId,
      smiles,
      preferredName || null,
      iupacName || null,
      molecularFormula || null,
    ]);

    // Preferred and IUPAC names are not repeated in the serialized alias table;
    // rebuilding them here preserves the exact same lookup coverage.
    addAliasCandidate(aliases, preferredName, recordIndex);
    addAliasCandidate(aliases, iupacName, recordIndex);
    if (Array.isArray(extraAliases)) {
      for (const alias of extraAliases) addAliasCandidate(aliases, alias, recordIndex);
    }
  }

  if (records.length === 0 || aliases.size === 0) {
    throw new Error("The bundled chemical-name database contains no usable records or lookup names.");
  }

  return { records, aliases };
}

async function fetchLeanIndex(): Promise<RuntimeChemicalNameIndex> {
  const attempts: string[] = [];

  for (const url of candidateAssetUrls(GZIP_INDEX_ASSET)) {
    try {
      const response = await fetch(url, { method: "GET", cache: "no-cache" });
      if (!response.ok) {
        attempts.push(`${url} -> HTTP ${response.status}`);
        continue;
      }

      const text = await responseToJsonText(response);
      try {
        return compileRuntimeIndex(validateLeanIndex(JSON.parse(text) as unknown));
      } catch (error) {
        attempts.push(
          `${url} -> file was found, but could not be loaded: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } catch (error) {
      attempts.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    [
      "PocketChem could not load its bundled offline chemical-name database.",
      "",
      "Required runtime file:",
      "public/data/chemical-names.index.json.gz",
      "",
      ...attempts,
    ].join("\n"),
  );
}

async function getIndex() {
  indexPromise ??= fetchLeanIndex().catch((error) => {
    indexPromise = null;
    throw error;
  });
  return indexPromise;
}

function materializeRecord(
  compact: RuntimeRecord | undefined,
): LocalChemicalNameRecord | null {
  if (!compact) return null;
  const [chebiNumericId, smiles, preferredName, iupacName, molecularFormula] = compact;
  if (!smiles) return null;

  return {
    chebiId: `CHEBI:${chebiNumericId}`,
    smiles,
    inchiKey: null,
    preferredName,
    iupacName,
    molecularFormula,
    source: "chebi",
  };
}

type AliasChoice = { target: number | null; candidates: number[] };

function isGenericRecord(index: RuntimeChemicalNameIndex, recordIndex: number) {
  return Boolean(index.records[recordIndex]?.[1].includes("*"));
}

function resolveAliasTarget(
  index: RuntimeChemicalNameIndex,
  key: string,
  match: AliasTarget,
): AliasChoice {
  if (typeof match === "number") return { target: match, candidates: [match] };

  let candidates = [...new Set(match)].filter((recordIndex) => Boolean(index.records[recordIndex]));
  if (candidates.length === 0) return { target: null, candidates };
  // A residue or variable-composition entry ("L-leucine residue", "*N[C@@H](...)C(*)=O") borrows the
  // free amino acid's synonym; the name of the free molecule must not be ambiguous with it.
  const concrete = candidates.filter((recordIndex) => !isGenericRecord(index, recordIndex));
  if (concrete.length > 0) candidates = concrete;
  if (candidates.length === 1) return { target: candidates[0], candidates };

  const preferredMatches = candidates.filter(
    (recordIndex) => normalizeChemicalName(index.records[recordIndex]?.[2] ?? "") === key,
  );
  if (preferredMatches.length === 1) return { target: preferredMatches[0], candidates };

  const iupacMatches = candidates.filter(
    (recordIndex) => normalizeChemicalName(index.records[recordIndex]?.[3] ?? "") === key,
  );
  if (iupacMatches.length === 1) return { target: iupacMatches[0], candidates };

  // Identical stored SMILES do not prove identical structures: the lean pack
  // omits InChIKeys and ChEBI SMILES can drop stereodescriptors (e.g. axial
  // allene chirality), so distinct stereoisomers may share a SMILES. Without
  // an identity key the alias stays ambiguous.
  return { target: null, candidates };
}

/** The unique record for a name, or the competing concrete records when the name is shared. */
export async function lookupLocalChemicalNameDetailed(
  rawName: string,
): Promise<{ record: LocalChemicalNameRecord | null; candidates: LocalChemicalNameRecord[] }> {
  const index = await getIndex();
  const key = normalizeChemicalName(rawName);
  const match = index.aliases.get(key);
  if (match === undefined) return { record: null, candidates: [] };

  const choice = resolveAliasTarget(index, key, match);
  const candidates = choice.candidates
    .map((i) => materializeRecord(index.records[i]))
    .filter((record): record is LocalChemicalNameRecord => record !== null);
  return { record: choice.target === null ? null : materializeRecord(index.records[choice.target]), candidates };
}

export async function lookupLocalChemicalName(
  rawName: string,
): Promise<LocalChemicalNameRecord | null> {
  return (await lookupLocalChemicalNameDetailed(rawName)).record;
}

// ---- carbohydrate families -------------------------------------------------------------------
// ChEBI names a sugar by several structures (open chain "aldehydo-D-glucose", pyranose and furanose
// rings, alpha/beta anomers, D and L). A bare "glucose" or "D-glucose" does not say which one is meant.
const SUGAR_NAME = /^(?:(aldehydo|keto)-)?(?:(alpha|beta)-)?(?:([dl])-)?([a-z]{3,}?)(?:ose|o(pyranose|furanose))$/;

export type SugarForm = {
  open: "aldehydo" | "keto" | null;
  anomer: "alpha" | "beta" | null;
  series: "d" | "l" | null;
  ring: "pyranose" | "furanose" | null;
  stem: string;
};

export function parseSugarName(rawName: string): SugarForm | null {
  const m = SUGAR_NAME.exec(normalizeChemicalName(rawName));
  if (!m) return null;
  return {
    open: (m[1] as SugarForm["open"]) ?? null,
    anomer: (m[2] as SugarForm["anomer"]) ?? null,
    series: (m[3] as SugarForm["series"]) ?? null,
    ring: (m[5] as SugarForm["ring"]) ?? null,
    stem: m[4],
  };
}

export type SugarVariantRecord = { record: LocalChemicalNameRecord; form: SugarForm };

/**
 * Concrete database records for the sugar a name belongs to. `qualified` is true when the name already
 * states an open-chain/ring/anomer form, in which case an exact database match is a precise answer.
 */
export async function findCarbohydrateVariants(
  rawName: string,
  limit = 16,
): Promise<{ qualified: boolean; variants: SugarVariantRecord[] }> {
  const query = parseSugarName(rawName);
  if (!query) return { qualified: false, variants: [] };
  const qualified = Boolean(query.open || query.anomer || query.ring);
  const index = await getIndex();
  const found = new Map<number, SugarForm>();
  for (const [alias, target] of index.aliases) {
    const form = parseSugarName(alias);
    // Only aliases that state D or L describe one configuration series.
    if (!form || !form.series || form.stem !== query.stem) continue;
    if (query.series && form.series !== query.series) continue;
    if (query.open && form.open !== query.open) continue;
    if (query.anomer && form.anomer !== query.anomer) continue;
    if (query.ring && form.ring !== query.ring) continue;
    for (const recordIndex of typeof target === "number" ? [target] : target) {
      if (!index.records[recordIndex] || isGenericRecord(index, recordIndex)) continue;
      const known = found.get(recordIndex);
      found.set(recordIndex, {
        open: known?.open ?? form.open,
        anomer: known?.anomer ?? form.anomer,
        series: form.series,
        ring: known?.ring ?? form.ring,
        stem: form.stem,
      });
    }
  }
  const rank = (f: SugarForm) => [f.series === "d" ? 0 : 1, f.open ? 0 : f.ring === "pyranose" ? 1 : f.ring === "furanose" ? 3 : 2, f.anomer === null ? 0 : f.anomer === "alpha" ? 1 : 2];
  const variants = [...found.entries()]
    .map(([recordIndex, form]) => ({ record: materializeRecord(index.records[recordIndex]) as LocalChemicalNameRecord, form }))
    .filter((entry) => entry.record)
    .sort((a, b) => {
      const ra = rank(a.form); const rb = rank(b.form);
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || a.record.chebiId.localeCompare(b.record.chebiId);
    })
    .slice(0, limit);
  return { qualified, variants };
}

/**
 * Retained as an API-compatible no-op. The lean runtime pack intentionally
 * omits InChIKeys because PocketChem currently performs name -> structure
 * lookup only. Add a separate structure-identity pack if this becomes needed.
 */
export async function lookupLocalChemicalByInchiKey(
  _rawInchiKey: string,
): Promise<LocalChemicalNameRecord | null> {
  return null;
}

export function clearChemicalNameDatabaseCache() {
  indexPromise = null;
}

/** Related names from the existing alias index; candidates are not asserted to be variants until structure validation. */
export async function findRelatedChemicalNames(names: string[], limit = 100): Promise<LocalChemicalNameRecord[]> {
  const index = await getIndex();
  const prefixes = names.map(normalizeChemicalName).filter((name) => name.length >= 4);
  const targets = new Set<number>();
  for (const [alias, target] of index.aliases) {
    if (!prefixes.some((prefix) => alias.startsWith(prefix))) continue;
    for (const i of typeof target === "number" ? [target] : target) targets.add(i);
    if (targets.size >= limit) break;
  }
  return [...targets].map((i) => materializeRecord(index.records[i])).filter((r): r is LocalChemicalNameRecord => r !== null);
}
