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

function resolveAliasTarget(
  index: RuntimeChemicalNameIndex,
  key: string,
  match: AliasTarget,
): number | null {
  if (typeof match === "number") return match;

  const candidates = [...new Set(match)].filter((recordIndex) => Boolean(index.records[recordIndex]));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const preferredMatches = candidates.filter(
    (recordIndex) => normalizeChemicalName(index.records[recordIndex]?.[2] ?? "") === key,
  );
  if (preferredMatches.length === 1) return preferredMatches[0];

  const iupacMatches = candidates.filter(
    (recordIndex) => normalizeChemicalName(index.records[recordIndex]?.[3] ?? "") === key,
  );
  if (iupacMatches.length === 1) return iupacMatches[0];

  // Different ChEBI records can be legacy/merged aliases for exactly the same
  // structure. Without storing InChIKeys, exact SMILES identity is sufficient
  // for this ambiguity collapse because these are ChEBI's selected structures.
  const firstSmiles = index.records[candidates[0]]?.[1] ?? null;
  if (
    firstSmiles &&
    candidates.every((recordIndex) => index.records[recordIndex]?.[1] === firstSmiles)
  ) {
    return candidates[0];
  }

  return null;
}

export async function lookupLocalChemicalName(
  rawName: string,
): Promise<LocalChemicalNameRecord | null> {
  const index = await getIndex();
  const key = normalizeChemicalName(rawName);
  const match = index.aliases.get(key);
  if (match === undefined) return null;

  const targetIndex = resolveAliasTarget(index, key, match);
  if (targetIndex === null) return null;
  return materializeRecord(index.records[targetIndex]);
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
