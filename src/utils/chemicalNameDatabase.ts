export type LocalChemicalNameRecord = {
  chebiId: string;
  smiles: string;
  inchiKey: string | null;
  preferredName: string | null;
  iupacName: string | null;
  molecularFormula: string | null;
  source: "chebi";
};

type CompactRecord = {
  s: string;
  k: string | null;
  p: string | null;
  i: string | null;
  f: string | null;
};

type ChemicalNameIndex = {
  v: number;
  generatedAt: string;
  source: {
    name: string;
    release: string | null;
    url?: string;
  };
  records: Record<string, CompactRecord>;
  aliases: Record<string, string | string[]>;
};

const GZIP_INDEX_ASSET = "data/chemical-names.index.json.gz";
const JSON_INDEX_ASSET = "data/chemical-names.index.json";

let indexPromise: Promise<ChemicalNameIndex> | null = null;

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

function validateIndex(index: ChemicalNameIndex): ChemicalNameIndex {
  if (!index || typeof index !== "object") {
    throw new Error("The local chemical-name database is not valid JSON.");
  }
  if (index.v !== 1) {
    throw new Error(
      `Unsupported local chemical-name database version: ${String(index.v)}.`,
    );
  }
  if (!index.records || !index.aliases) {
    throw new Error(
      "The local chemical-name database is missing its records or aliases table.",
    );
  }
  return index;
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

  // Some dev/static servers serve ".gz" as application/gzip, while others
  // transparently decode it before Fetch receives the body. Detect the actual
  // gzip magic bytes instead of assuming one behavior.
  const isActuallyGzipped =
    bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  if (!isActuallyGzipped) {
    return new TextDecoder("utf-8").decode(bytes);
  }

  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "This browser cannot decompress the bundled .gz database. Keep the uncompressed chemical-names.index.json file in public/data as a fallback.",
    );
  }

  const source = new Blob([bytes]).stream();
  const decompressed = source.pipeThrough(new DecompressionStream("gzip"));
  return await new Response(decompressed).text();
}

async function fetchIndexFrom(
  relativePath: string,
  compressed: boolean,
): Promise<ChemicalNameIndex> {
  const attempts: string[] = [];

  for (const url of candidateAssetUrls(relativePath)) {
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-cache",
        headers: compressed ? undefined : { Accept: "application/json" },
      });

      if (!response.ok) {
        attempts.push(`${url} -> HTTP ${response.status}`);
        continue;
      }

      const text = compressed
        ? await responseToJsonText(response)
        : await response.text();

      try {
        return validateIndex(JSON.parse(text) as ChemicalNameIndex);
      } catch (error) {
        attempts.push(
          `${url} -> file was found, but could not be parsed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } catch (error) {
      attempts.push(
        `${url} -> ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  throw new Error(attempts.join("\n"));
}

async function loadIndex(): Promise<ChemicalNameIndex> {
  const failures: string[] = [];

  try {
    return await fetchIndexFrom(GZIP_INDEX_ASSET, true);
  } catch (error) {
    failures.push(
      `Compressed database failed:\n${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  try {
    return await fetchIndexFrom(JSON_INDEX_ASSET, false);
  } catch (error) {
    failures.push(
      `Uncompressed database failed:\n${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  throw new Error(
    [
      "PocketChem could not load its local chemical-name database.",
      "",
      "Required build output:",
      "public/data/chemical-names.index.json.gz",
      "public/data/chemical-names.index.json",
      "",
      ...failures,
    ].join("\n"),
  );
}

async function getIndex() {
  indexPromise ??= loadIndex().catch((error) => {
    // Allow a retry after a failed dev-server load instead of permanently
    // caching the rejected promise for the rest of the session.
    indexPromise = null;
    throw error;
  });
  return indexPromise;
}

function materializeRecord(
  chebiId: string,
  compact: CompactRecord | undefined,
): LocalChemicalNameRecord | null {
  if (!compact?.s) return null;
  return {
    chebiId,
    smiles: compact.s,
    inchiKey: compact.k || null,
    preferredName: compact.p || null,
    iupacName: compact.i || null,
    molecularFormula: compact.f || null,
    source: "chebi",
  };
}

function resolveAliasTarget(
  index: ChemicalNameIndex,
  key: string,
  match: string | string[],
): string | null {
  if (typeof match === "string") return match;

  const candidates = [...new Set(match)].filter((id) => Boolean(index.records[id]));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Prefer the record whose official/preferred ChEBI name exactly matches
  // what the user typed. This distinguishes names such as "arachidonic acid"
  // from broader records that merely list that text as an external synonym.
  const preferredMatches = candidates.filter(
    (id) => normalizeChemicalName(index.records[id]?.p ?? "") === key,
  );
  if (preferredMatches.length === 1) return preferredMatches[0];

  // An exact IUPAC-name match has the same precedence over synonym-only hits.
  const iupacMatches = candidates.filter(
    (id) => normalizeChemicalName(index.records[id]?.i ?? "") === key,
  );
  if (iupacMatches.length === 1) return iupacMatches[0];

  // Legacy/merged records may be different ChEBI IDs for the exact same
  // structure. Treat that as one chemical rather than a user-facing ambiguity.
  const structureKeys = candidates.map((id) => {
    const record = index.records[id];
    return record?.k || record?.s || null;
  });
  const firstStructureKey = structureKeys[0];
  if (
    firstStructureKey &&
    structureKeys.every((value) => value === firstStructureKey)
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
  const match = index.aliases[key];
  if (!match) return null;

  const targetId = resolveAliasTarget(index, key, match);
  if (!targetId) return null;
  return materializeRecord(targetId, index.records[targetId]);
}

export async function lookupLocalChemicalByInchiKey(
  rawInchiKey: string,
): Promise<LocalChemicalNameRecord | null> {
  const index = await getIndex();
  const key = rawInchiKey.trim().toUpperCase();
  if (!key) return null;

  for (const [chebiId, compact] of Object.entries(index.records)) {
    if ((compact.k ?? "").toUpperCase() === key) {
      return materializeRecord(chebiId, compact);
    }
  }
  return null;
}

export function clearChemicalNameDatabaseCache() {
  indexPromise = null;
}
