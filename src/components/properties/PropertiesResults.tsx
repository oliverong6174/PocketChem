import { useEffect, useMemo, useState } from "react";
import { getCondensedSulfonateSvg } from "../../utils/functionalGroups";
import type { MoleculeIdentityResult } from "../../utils/nomenclatureUtils";
import { buildPropertySections, type GroupCount, type PropertyRow, type StereoCenter } from "../../utils/propertiesSections";
import { MolecularFigure } from "../ui/MolecularFigure";
import { findConcreteNameVariants, findStereoVariants, type MoleculeNameResolution } from "../../utils/moleculeNameResolver";

interface Shared {
  identity: MoleculeIdentityResult;
  smiles: string;
  groups: readonly GroupCount[];
  stereocenters: readonly StereoCenter[];
}

function useStructureSvg(smiles: string): string | null {
  const [state, setState] = useState<{ smiles: string; svg: string | null }>({ smiles: "", svg: null });
  useEffect(() => {
    let cancelled = false;
    void getCondensedSulfonateSvg(smiles).then((svg) => { if (!cancelled) setState({ smiles, svg: svg ?? null }); }).catch(() => { if (!cancelled) setState({ smiles, svg: null }); });
    return () => { cancelled = true; };
  }, [smiles]);
  return state.smiles === smiles ? state.svg : null;
}

/** Who this molecule is: structure, name and its confidence, formula, mass and SMILES. Stays above every results tab. */
export function PropertiesIdentity({ identity, smiles, groups, stereocenters, molfile, onLoadVariant }: Shared & { molfile?: string | null; onLoadVariant?: (resolution: MoleculeNameResolution) => void }) {
  const svg = useStructureSvg(smiles);
  const nomenclature = identity.nomenclature;
  const source = identity.sourceIdentity;
  const derived = identity.structureDerivedNomenclature ?? nomenclature;
  const generic = identity.properties.fullySpecified === false;
  const [variantResult, setVariantResult] = useState<{ source: typeof source; entries: MoleculeNameResolution[] } | null>(null);
  const variants = variantResult?.source === source ? variantResult?.entries ?? [] : [];
  useEffect(() => {
    let cancelled = false;
    if (generic && source) void findConcreteNameVariants(source.resolution).then((entries) => { if (!cancelled) setVariantResult({ source, entries }); }).catch(() => {});
    return () => { cancelled = true; };
  }, [generic, source]);
  const unspecifiedStereo = !generic && stereocenters.some((center) => center.configuration === "unknown");
  const [stereoResult, setStereoResult] = useState<{ source: typeof source; entries: MoleculeNameResolution[] } | null>(null);
  const stereoVariants = stereoResult?.source === source ? stereoResult?.entries ?? [] : [];
  useEffect(() => {
    let cancelled = false;
    if (unspecifiedStereo && source) void findStereoVariants(source.resolution).then((entries) => { if (!cancelled) setStereoResult({ source, entries }); }).catch(() => {});
    return () => { cancelled = true; };
  }, [unspecifiedStereo, source]);
  const name = source?.resolvedName || nomenclature.displayName || nomenclature.estimatedName;
  const sections = useMemo(() => buildPropertySections(identity, groups, stereocenters), [identity, groups, stereocenters]);
  const composition = sections.sections.find((section) => section.id === "composition");
  const text = `${name}. ${composition?.rows.map((row) => `${row.label} ${row.value}`).join(", ") ?? ""}. SMILES ${smiles}.`;
  return (
    <section aria-label="Molecule identity" className="pr-identity" data-testid="pr-identity">
      <figure aria-label={`Structure of ${name}`} className="pr-structure">
        {svg ? <MolecularFigure className="pr-structure-svg" source={{ smiles, molfile: molfile && /MDLV30\/STE(RAC|REL)/.test(molfile) ? molfile : null, label: name }} svg={svg} title={`Structure of ${name}`} /> : <div aria-hidden="true" className="pr-structure-svg is-empty">Drawing…</div>}
        <figcaption className="pc-visually-hidden">{text}</figcaption>
      </figure>
      <div className="pr-identity-main">
        <p className="pr-eyebrow">Current molecule</p>
        <h3 className="pr-name">{name}</h3>
        {source ? <p className="pr-confidence">{derived.namingStatus === "unsupported" ? <span>Structure-derived name unavailable</span> : derived.displayName.toLowerCase() !== name.toLowerCase() ? <span>Structure-derived name: {derived.displayName}</span> : null}<span>{source.sourceId}</span></p> : <p className="pr-confidence"><strong>{nomenclature.namingConfidence} confidence</strong><span>in structure-derived name</span>{nomenclature.commonName && nomenclature.commonName.toLowerCase() !== name.toLowerCase() ? <span>Also known as <em>{nomenclature.commonName}</em></span> : null}</p>}
        <dl className="pr-keyfacts">
          {composition?.rows.filter((row) => ["formula", "mw", "exactMass", "charge"].includes(row.id)).map((row) => (
            <div key={row.id}><dt>{row.label}</dt><dd>{row.value}</dd></div>
          ))}
        </dl>
        {generic ? <div className="pr-generic" role="note"><strong>Generic structure</strong><p>Molecular weight, exact mass and DBE are unavailable: substituents are unspecified (R is not an element).</p>{variants.length > 0 ? <details><summary>Choose a concrete database entry</summary><p>These entries match the scaffold. Each is a separate choice.</p>{variants.map((variant) => <button className="secondary-button" type="button" key={variant.sourceId} onClick={() => onLoadVariant?.(variant)} disabled={!onLoadVariant}>{variant.title} <span className="pr-note">{variant.sourceId}</span></button>)}</details> : null}</div> : null}
        {unspecifiedStereo ? <p className="pr-generic" role="note"><strong>Stereochemistry unspecified.</strong>{stereoVariants.length > 0 ? <> Load a specific isomer: {stereoVariants.map((variant) => <button className="secondary-button" type="button" key={variant.sourceId} onClick={() => onLoadVariant?.(variant)} disabled={!onLoadVariant}>{variant.variantLabel ?? variant.title}</button>)}</> : null}</p> : null}
        <p className="pr-smiles"><span className="pr-eyebrow">SMILES</span> <code>{smiles}</code></p>
      </div>
    </section>
  );
}

function Tile({ row, info }: { row: PropertyRow; info: Record<string, string> }) {
  return (
    <div className="pr-tile" data-testid="pr-tile">
      <span className="pr-tile-label">{row.label}</span>
      <strong className="pr-tile-value">{row.value}</strong>
      {info[row.infoKey] ? <span className="pc-visually-hidden">{info[row.infoKey]}</span> : null}
    </div>
  );
}

/** Scan view: the values that matter most, grouped by what kind of statement they are. */
export function PropertiesSummary({ identity, smiles, groups, stereocenters, info }: Shared & { info: Record<string, string> }) {
  const sections = useMemo(() => buildPropertySections(identity, groups, stereocenters), [identity, groups, stereocenters]);
  const byId = (id: string) => sections.sections.find((section) => section.id === id);
  const keyRows = byId("composition")?.rows.filter((row) => ["mw", "heavy"].includes(row.id)) ?? [];
  const descriptors = byId("descriptors");
  const tendencies = byId("tendencies");
  const assigned = sections.stereocenters.filter((center) => center.configuration !== "unknown");
  const unspecified = sections.stereocenters.filter((center) => center.configuration === "unknown");
  return (
    <div className="pr-summary" data-testid="pr-summary">
      <section aria-labelledby="pr-key" className="pr-block">
        <h4 id="pr-key">Key results</h4>
        <div className="pr-tiles">
          {descriptors?.rows.filter((row) => ["dbe", "rings"].includes(row.id)).map((row) => <Tile info={info} key={row.id} row={row} />)}
          {keyRows.map((row) => <Tile info={info} key={row.id} row={row} />)}
          <div className="pr-tile" data-testid="pr-tile"><span className="pr-tile-label">Functional groups</span><strong className="pr-tile-value">{sections.groups.reduce((n, g) => n + g.count, 0)}</strong></div>
          <div className="pr-tile" data-testid="pr-tile"><span className="pr-tile-label">Stereocenters</span><strong className="pr-tile-value">{assigned.length}{unspecified.length > 0 ? ` + ${unspecified.length} unspecified` : ""}</strong></div>
        </div>
      </section>

      <section aria-labelledby="pr-groups" className="pr-block">
        <h4 id="pr-groups">Functional groups and stereochemistry</h4>
        {sections.groups.length === 0 ? <p className="pr-none">No functional group was detected for this structure.</p> : (
          <ul aria-label="Functional groups found" className="pr-chips">
            {sections.groups.map((group) => <li className="pr-chip" key={group.name}>{group.name}{group.count > 1 ? <strong> × {group.count}</strong> : null}</li>)}
          </ul>
        )}
        {sections.stereocenters.length === 0 ? <p className="pr-none">No stereocenter found.</p> : (
          <p className="pr-line">
            {assigned.length > 0 ? <>Stereocenters: {assigned.map((center) => center.atom ? `atom ${center.atom}: ${center.configuration}` : center.configuration).join(", ")}. </> : null}
            {unspecified.length > 0 ? <>{unspecified.length === 1 ? "1 potential stereocenter" : `${unspecified.length} potential stereocenters`} with unspecified configuration.</> : null}
          </p>
        )}
      </section>

      {descriptors && descriptors.rows.length > 0 ? (
        <section aria-labelledby="pr-desc" className="pr-block">
          <h4 id="pr-desc">{descriptors.title}</h4>
          <div className="pr-tiles">{descriptors.rows.filter((row) => !["dbe", "rings"].includes(row.id)).map((row) => <Tile info={info} key={row.id} row={row} />)}</div>
        </section>
      ) : null}

      {tendencies && tendencies.rows.length > 0 ? (
        <section aria-labelledby="pr-tend" className="pr-block">
          <h4 id="pr-tend">{tendencies.title}</h4>
          <div className="pr-tiles">{tendencies.rows.map((row) => <Tile info={info} key={row.id} row={row} />)}</div>
        </section>
      ) : null}
      <span className="pc-visually-hidden">{smiles}</span>
    </div>
  );
}

/** Reference view: every available value with its definition, evidence kind and (for estimates) the factors behind it; naming detail; what is not available. */
export function PropertiesDetail({ identity, smiles, groups, stereocenters, info }: Shared & { info: Record<string, string> }) {
  const sections = useMemo(() => buildPropertySections(identity, groups, stereocenters), [identity, groups, stereocenters]);
  const nomenclature = identity.nomenclature;
  return (
    <div className="pr-detail" data-testid="pr-detail">
      {sections.sections.map((section) => (
        <section aria-labelledby={`pr-d-${section.id}`} className="pr-block" key={section.id}>
          <h4 id={`pr-d-${section.id}`}>{section.title}</h4>
          {section.id === "tendencies" ? <p className="pr-note">Estimated from structural features; not measured values.</p> : null}
          <table className="pr-table">
            <caption className="pc-visually-hidden">{section.title}</caption>
            <thead><tr><th scope="col">Property</th><th scope="col">Value</th><th scope="col">What it means</th></tr></thead>
            <tbody>
              {section.rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td><strong>{row.value}</strong></td>
                  <td>
                    {info[row.infoKey] ?? ""}
                    {row.detail ? (
                      <details className="pr-why">
                        <summary>Why this level?</summary>
                        <p>{row.detail.explanation}</p>
                        {row.detail.factors.length > 0 ? <ul>{row.detail.factors.map((factor) => <li key={factor}>{factor}</li>)}</ul> : null}
                      </details>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <section aria-labelledby="pr-d-naming" className="pr-block">
        <h4 id="pr-d-naming">Naming and identity</h4>
        <dl className="pr-naming">
          <div><dt>Name</dt><dd>{nomenclature.displayName || nomenclature.estimatedName} <span className="pr-note">({nomenclature.namingConfidence} confidence)</span></dd></div>
          {nomenclature.commonName ? <div><dt>Common name</dt><dd>{nomenclature.commonName}</dd></div> : null}
          <div><dt>Parent chain</dt><dd>{nomenclature.parentChain ?? "Not assigned"}{nomenclature.parentChainLength > 0 ? ` (${nomenclature.parentChainLength} C)` : ""}</dd></div>
          <div><dt>Main suffix</dt><dd>{nomenclature.mainSuffix ?? "Hydrocarbon / no suffix group detected"}</dd></div>
          {nomenclature.prefixes.length > 0 ? <div><dt>Detected prefixes</dt><dd>{nomenclature.prefixes.join(", ")}</dd></div> : null}
          <div><dt>SMILES</dt><dd><code>{smiles}</code></dd></div>
        </dl>
      </section>

      {sections.unavailable.length > 0 ? (
        <section aria-labelledby="pr-d-na" className="pr-block" data-testid="pr-unavailable">
          <h4 id="pr-d-na">Not available for this structure</h4>
          <p className="pr-note">No value for: {sections.unavailable.join(", ")}.</p>
        </section>
      ) : null}
    </div>
  );
}
