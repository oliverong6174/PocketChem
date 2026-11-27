/**
 * Stage 27: evidence records for the scientific models behind the tools. Pure data plus a validator; no React, no network.
 *
 * Three questions are kept SEPARATE because they have different answers for the same model:
 *   - kind: what sort of statement is it (reference data, textbook approximation, numerical model, curated mechanism)?
 *   - source: was it compared with an external source whose text was actually retrieved and read? (what the source covers is stated)
 *   - calc: was the numerical or logical behaviour reproduced by an independent calculation or hand-specified case (the Stage 27
 *     reference suite, scripts/tests/scientificReference27.test.mjs), rather than only by the module's own tests?
 * A model can be calculation-checked without being source-verified, and a source-verified constant does not make a simplified model exact.
 * Nothing here is a certification. A claim is only labelled "source-verified" when `sources` lists a retrieved text with a date.
 * Links are citations only; nothing is fetched at run time.
 */
export type ModelKind = "reference-data" | "textbook-approximation" | "numerical-model" | "curated-mechanism";
export type SourceStatus = "source-verified" | "partly-verified" | "not-verified";
export type CalcStatus = "independently-checked" | "not-checked";

export interface EvidenceSource {
  title: string;
  /** Link without a scheme (`https://` is added); a DOI, a page or a dataset. */
  ref: string;
  /** ISO date the text or table was retrieved and read. */
  retrieved: string;
  /** What in the source was compared (table, section, article part). */
  covers: string;
}

export interface EvidenceRecord {
  id: string;
  model: string;
  kind: ModelKind;
  source: SourceStatus;
  /** What the source status applies to (and what it does not). */
  sourceCovers: string;
  calc: CalcStatus;
  /** Identifiers of reference cases in scientificReference27.test.mjs, e.g. "CHEM-ATOMIC-1". */
  checks: string[];
  conditions: string[];
  assumptions: string[];
  scope: string;
  unsupported: string[];
  sources: EvidenceSource[];
  /** True only for models that produce numbers meant to be compared with measurements. Curated mechanisms are always false. */
  quantitative: boolean;
}

export const KIND_LABEL: Record<ModelKind, string> = {
  "reference-data": "Reference data",
  "textbook-approximation": "Textbook approximation",
  "numerical-model": "Numerical model",
  "curated-mechanism": "Curated educational mechanism",
};
export const SOURCE_LABEL: Record<SourceStatus, string> = {
  "source-verified": "Source-verified",
  "partly-verified": "Partly source-verified",
  "not-verified": "Not verified against a source",
};
export const CALC_LABEL: Record<CalcStatus, string> = {
  "independently-checked": "Independently calculation-checked",
  "not-checked": "Not independently checked",
};

const RET = "2026-11-23";
const NIST: EvidenceSource = { title: "NIST Fundamental Physical Constants, complete listing (2022 CODATA adjustment)", ref: "physics.nist.gov/cuu/Constants/Table/allascii.txt", retrieved: RET, covers: "R, F, k_B, N_A, e, c (exact in the SI) and the permittivity, permeability and particle masses" };

export const EVIDENCE: readonly EvidenceRecord[] = [
  {
    id: "gc-atomic-masses", model: "Atomic masses (83 elements)", kind: "reference-data", source: "source-verified",
    sourceCovers: "Every element value, compared one by one with the CIAAW abridged table; elements with an interval standard atomic weight use the CIAAW conventional value.",
    calc: "independently-checked", checks: ["CHEM-ATOMIC-1", "CHEM-ATOMIC-2", "CHEM-ATOMIC-3", "CHEM-ATOMIC-4", "CHEM-MASS"],
    conditions: ["Conventional (abridged) standard atomic weights, CIAAW 2024 tables.", "Natural terrestrial material; not isotope masses and not mass numbers."],
    assumptions: ["H, Li, B, C, N, O, Mg, Si, S, Cl, Ar, Br, Tl and Pb have interval standard weights; one conventional value is used for each.", "Ion masses ignore electron mass."],
    scope: "Teaching-level molar masses to about 4 or 5 significant figures.",
    unsupported: ["Isotope-specific or enriched materials.", "Elements with no standard atomic weight (Tc, Pm, Po onward except Th, Pa and U)."],
    sources: [
      { title: "CIAAW Abridged Atomic Weights (2024)", ref: "ciaaw.org/abridged-atomic-weights.htm", retrieved: RET, covers: "all 83 conventional values" },
      { title: "CIAAW Standard Atomic Weights (2024)", ref: "ciaaw.org/atomic-weights.htm", retrieved: RET, covers: "unabridged values and intervals" },
    ],
    quantitative: true,
  },
  {
    id: "gc-stoichiometry", model: "Stoichiometry, equation balancing and limiting reagent", kind: "textbook-approximation", source: "partly-verified",
    sourceCovers: "The atomic masses it uses (CIAAW). The conservation arithmetic is mathematics, not a source claim.",
    calc: "independently-checked", checks: ["CHEM-MASS", "CHEM-BALANCE"],
    conditions: ["A single reaction of known stoichiometry going to completion."],
    assumptions: ["No side reactions, equilibrium or incomplete mixing.", "Solution volumes are additive."],
    scope: "Whole-number balancing of a supplied reaction and amounts from it.",
    unsupported: ["Predicting products.", "Equilibrium yields (use the equilibrium tool)."],
    sources: [{ title: "CIAAW Abridged Atomic Weights (2024)", ref: "ciaaw.org/abridged-atomic-weights.htm", retrieved: RET, covers: "atomic masses" }],
    quantitative: true,
  },
  {
    id: "gc-ideal-gas", model: "Ideal gas law and kinetic theory", kind: "textbook-approximation", source: "partly-verified",
    sourceCovers: "The constants R, k_B and N_A (NIST, exact). The ideal-gas law itself is a textbook idealisation, not a claim about a particular gas.",
    calc: "independently-checked", checks: ["CHEM-GAS-1", "CHEM-GAS-2", "CHEM-GAS-3", "PHYS-CONST"],
    conditions: ["Ideal, non-interacting point particles; SI units internally."],
    assumptions: ["No condensation, no intermolecular forces, no particle volume."],
    scope: "Gases at moderate pressure and well above their condensation point.",
    unsupported: ["Real-gas behaviour near condensation or at high pressure."],
    sources: [NIST], quantitative: true,
  },
  {
    id: "gc-electrode-potentials", model: "Standard reduction potentials (28 couples)", kind: "reference-data", source: "partly-verified",
    sourceCovers: "Couple identity, electron count, sign and size against a SECONDARY compilation (a Wikipedia data page that cites the CRC Handbook and other sources per row). The CRC Handbook and Bard, Parsons and Jordan were not opened.",
    calc: "independently-checked", checks: ["CHEM-ELECTRO-1", "CHEM-ELECTRO-2", "CHEM-ELECTRO-3", "CHEM-ELECTRO-4"],
    conditions: ["V versus the standard hydrogen electrode, 25 °C, 1 mol/L for dissolved species, gases at about 1 bar.", "Every couple is written as a reduction."],
    assumptions: ["All values lie within 0.025 V of the cross-check table; Au³⁺/Au differs by 0.022 V, a real spread between compilations.", "Concentrations stand in for activities."],
    scope: "Cell voltages, direction and equilibrium constants for the 28 listed couples under the stated conditions.",
    unsupported: ["Temperature-corrected E°.", "Basic-medium, complexation or precipitation variants.", "Kinetics, overpotential, current."],
    sources: [{ title: "Standard electrode potential (data page), Wikipedia: a secondary compilation", ref: "en.wikipedia.org/wiki/Standard_electrode_potential_(data_page)", retrieved: RET, covers: "all 28 couples" }],
    quantitative: true,
  },
  {
    id: "gc-nernst-cell", model: "Galvanic cell, Nernst equation, ΔG° and K", kind: "textbook-approximation", source: "partly-verified",
    sourceCovers: "The constants R and F (NIST, exact). The Nernst relation is a textbook thermodynamic result; the model is not compared with measurements of real cells.",
    calc: "independently-checked", checks: ["CHEM-ELECTRO-5", "CHEM-ELECTRO-6", "CHEM-ELECTRO-7", "CHEM-ELECTRO-8"],
    conditions: ["E = E° − (RT/nF) ln Q with Q the overall reaction quotient."],
    assumptions: ["Ideal solutions; potentials are never multiplied by stoichiometric coefficients."],
    scope: "Ideal cells built from the curated couples.",
    unsupported: ["Liquid-junction potentials, internal resistance, power output."],
    sources: [NIST], quantitative: true,
  },
  {
    id: "bio-membrane", model: "Nernst and Goldman-Hodgkin-Katz membrane potential", kind: "textbook-approximation", source: "partly-verified",
    sourceCovers: "The constants (NIST); the Na⁺ gradient (145 outside, 12 inside mM) and the resting potential of about −70 mV match OpenStax Biology 2e 35.2. The default K⁺ (4/140) and Cl⁻ (110/10) values differ from that table (K⁺ 155 inside; Cl⁻ 120 outside and 4 inside), and the permeability ratios are illustrative and not source-checked.",
    calc: "independently-checked", checks: ["BIO-NERNST-1", "BIO-NERNST-2", "BIO-NERNST-3", "BIO-NERNST-4", "BIO-ION"],
    conditions: ["Default 37 °C; ion concentrations in mM; Vm = inside minus outside."],
    assumptions: ["Ideal solutions; constant field (GHK); K⁺, Na⁺ and Cl⁻ only in the GHK equation; the pump's electrogenic current is omitted."],
    scope: "Equilibrium potentials and a steady resting voltage for chosen gradients and relative permeabilities.",
    unsupported: ["The membrane potential of a particular cell type.", "E_Cl in a specific neuron (intracellular chloride varies widely between neurons)."],
    sources: [
      NIST,
      { title: "OpenStax Biology 2e, 35.2 How Neurons Communicate (Table 35.1)", ref: "openstax.org/books/biology-2e/pages/35-2-how-neurons-communicate", retrieved: RET, covers: "ion concentrations and the −70 mV resting potential" },
    ],
    quantitative: true,
  },
  {
    id: "bio-hodgkin-huxley", model: "Hodgkin-Huxley action potential (squid giant axon, 6.3 °C)", kind: "numerical-model", source: "not-verified",
    sourceCovers: "Nothing. The 1952 paper could not be retrieved as text, so the parameters and rate equations were not compared with it. They match the widely reproduced modern-convention set (rest −65 mV, E_Na +50, E_K −77, E_L −54.387 mV, g_Na 120, g_K 36, g_L 0.3 mS/cm²), and E_L is consistent with a zero net current at rest.",
    calc: "independently-checked", checks: ["BIO-HH-1", "BIO-HH-2", "BIO-HH-3", "BIO-HH-4", "BIO-HH-5", "BIO-HH-6", "BIO-HH-7"],
    conditions: ["Squid giant axon, 6.3 °C, membrane patch (no propagation), fixed-step RK4 with dt = 0.01 ms."],
    assumptions: ["Rates are the published 6.3 °C values; no temperature scaling is offered.", "The two removable singularities of α_n and α_m are evaluated with expm1, so there is no cut-off."],
    scope: "Qualitative and semi-quantitative behaviour of one historical preparation: threshold, spike, refractoriness, effects of blocking Na⁺ or K⁺ channels.",
    unsupported: ["Mammalian neurons or other temperatures.", "Dendritic integration and propagation speed.", "Pharmacology beyond the idealised Na⁺ and K⁺ block."],
    sources: [], quantitative: true,
  },
  {
    id: "physics-constants", model: "Physical constants used by the Physics tools", kind: "reference-data", source: "source-verified",
    sourceCovers: "R, F, k_B, N_A, e and c equal NIST's exact values. ε₀, μ₀ and the particle masses are labelled CODATA 2018 in the code and differ from the 2022 values by less than 2 parts in 10⁹, far below the precision of any teaching calculation.",
    calc: "independently-checked", checks: ["PHYS-CONST"],
    conditions: ["SI units."], assumptions: ["Values are not updated to CODATA 2022; the difference is immaterial here."],
    scope: "Physics, General Chemistry and Biology calculations that use these constants.", unsupported: [],
    sources: [NIST], quantitative: true,
  },
  {
    id: "physics-closed-forms", model: "Waves, optics, diffraction, electric and magnetic fields, induction", kind: "textbook-approximation", source: "not-verified",
    sourceCovers: "Nothing in a retrieved text. The relations are standard closed-form physics; Stage 27 reproduced representative cases with independent hand calculations instead.",
    calc: "independently-checked", checks: ["PHYS-WAVE-1", "PHYS-WAVE-2", "PHYS-OPT-1", "PHYS-OPT-2", "PHYS-OPT-3", "PHYS-OPT-4", "PHYS-DIFF-1", "PHYS-DIFF-2", "PHYS-FIELD-1", "PHYS-FIELD-2", "PHYS-MAG-1", "PHYS-IND-1", "PHYS-IND-2"],
    conditions: ["Ideal strings and pipes, thin lenses and paraxial rays, point charges, ideal conductors and inductors."],
    assumptions: ["Paraxial and thin-lens approximations; Fraunhofer (far-field) slits; no damping, resistance of rails beyond the stated R, or relativistic effects."],
    scope: "The sign conventions and closed forms of each tool in its stated range.",
    unsupported: ["Aberrations, near-field diffraction, radiation, relativistic speeds."],
    sources: [], quantitative: true,
  },
  {
    id: "biochem-fatty-acid-atp", model: "Fatty-acid β-oxidation and ATP-equivalent accounting", kind: "textbook-approximation", source: "partly-verified",
    sourceCovers: "Only that β-oxidation takes place in the mitochondrial matrix, yields acetyl units that enter the citric acid cycle as acetyl-CoA (OpenStax Biology 2e 7.6). The cycle counts, the activation cost and the 106 ATP result are not in that page.",
    calc: "independently-checked", checks: ["BIOCHEM-FA-4", "BIOCHEM-FA-8", "BIOCHEM-FA-12", "BIOCHEM-FA-16", "BIOCHEM-FA-18", "BIOCHEM-FA-16b"],
    conditions: ["Saturated even-chain fatty acids, activation through acyl-CoA synthetase (ATP → AMP + PPi, PPi hydrolysed)."],
    assumptions: ["2.5 ATP per NADH and 1.5 per FADH₂ (the P/O convention); 10 ATP-equivalents per acetyl-CoA through the citric acid cycle.", "106 ATP for palmitate is a bookkeeping result under that convention, not a measured cellular yield."],
    scope: "Stoichiometry of complete oxidation of the supported chain lengths.",
    unsupported: ["Odd-chain and unsaturated variants (curated separately or not quantified).", "Tissue, compartment and transport costs; actual cellular ATP yield."],
    sources: [{ title: "OpenStax Biology 2e, 7.6 Connections of Carbohydrate, Protein, and Lipid Metabolic Pathways", ref: "openstax.org/books/biology-2e/pages/7-6-connections-of-carbohydrate-protein-and-lipid-metabolic-pathways", retrieved: RET, covers: "location of β-oxidation and entry of acetyl-CoA into the cycle" }],
    quantitative: true,
  },
  {
    id: "biochem-urea-cycle", model: "Urea cycle stoichiometry and nitrogen sources", kind: "textbook-approximation", source: "partly-verified",
    sourceCovers: "Only that the liver makes urea from amino-acid nitrogen and CO₂ (OpenStax Biology 2e 7.6, which simplifies the nitrogen sources to 'two ammonia molecules'). The aspartate source, five enzymes and the 3-ATP / 4-bond accounting are not in that page.",
    calc: "independently-checked", checks: ["BIOCHEM-UREA-1", "BIOCHEM-UREA-2", "BIOCHEM-UREA-3"],
    conditions: ["Hepatocyte mitochondria and cytosol, per urea formed."],
    assumptions: ["Three ATP molecules are consumed but four high-energy phosphate bonds are expended, because one ATP becomes AMP + PPi and the PPi is hydrolysed."],
    scope: "Bookkeeping of atoms, nitrogen origin and phosphate bonds.",
    unsupported: ["Regulation in vivo, periportal versus perivenous differences, flux."],
    sources: [{ title: "OpenStax Biology 2e, 7.6 Connections of Carbohydrate, Protein, and Lipid Metabolic Pathways", ref: "openstax.org/books/biology-2e/pages/7-6-connections-of-carbohydrate-protein-and-lipid-metabolic-pathways", retrieved: RET, covers: "liver urea synthesis from amino-acid nitrogen and CO₂" }],
    quantitative: true,
  },
  {
    id: "bio-apoptosis", model: "Apoptosis signalling graph (intrinsic, extrinsic, caspases)", kind: "curated-mechanism", source: "partly-verified",
    sourceCovers: "The intrinsic chain BAX/BAK → MOMP → cytochrome c → APAF1 apoptosome → caspase-9 → caspase-3/7 (one 2012 review). BH3 control of BAX/BAK is contested in that review (direct versus indirect models). Fas/DISC/c-FLIP/BID, p53 → PUMA/NOXA and BAX/BAK redundancy are not source-checked.",
    calc: "independently-checked", checks: ["BIO-MECH-1", "BIO-MECH-2", "BIO-MECH-3", "BIO-MECH-4", "BIO-MECH-5", "BIO-MECH-6", "BIO-MECH-7"],
    conditions: ["Boolean states of named components; a perturbation forces a node on or off."],
    assumptions: ["Logic is qualitative: no rates, concentrations, thresholds or cell-survival probabilities."],
    scope: "Which downstream events a stated set of conditions and lesions would permit or block.",
    unsupported: ["Cell fate after pathway block (survival, necroptosis, delayed death).", "Clinical phenotypes, cancer risk, treatment response.", "Other death receptors and non-apoptotic death."],
    sources: [{ title: "Structural biology of the intrinsic cell death pathway (Comput Struct Biotechnol J 2012)", ref: "doi.org/10.5936/csbj.201204007", retrieved: RET, covers: "the intrinsic chain and the BH3 activation models" }],
    quantitative: false,
  },
  {
    id: "bio-cell-cycle", model: "Cell-cycle checkpoints and replication licensing graph", kind: "curated-mechanism", source: "partly-verified",
    sourceCovers: "Cyclin–CDK, RB–E2F, p53–p21, the G2 and spindle checkpoints (OpenStax Biology 2e 10.3); the MCC–APC/C–securin link (BUBR1 review); the geminin, Cdt1 and CDK brakes on re-licensing (two reviews). Separase and cohesin, ORC/Cdc6/MCM loading, ATM/ATR and Wee1/Cdc25 are not source-checked.",
    calc: "independently-checked", checks: ["BIO-MECH-8"],
    conditions: ["Boolean states; each transition is proceeds, pauses or unresolved."],
    assumptions: ["Qualitative; the restriction point is a user-set condition; attachment and tension are one yes/no."],
    scope: "Which transition a stated checkpoint situation permits.",
    unsupported: ["Cell-cycle durations or CDK activities.", "Cancer or malignancy from p53 or RB loss.", "The fate after a checkpoint is bypassed."],
    sources: [
      { title: "OpenStax Biology 2e, 10.3 Control of the Cell Cycle", ref: "openstax.org/books/biology-2e/pages/10-3-control-of-the-cell-cycle", retrieved: "2026-11-15", covers: "regulators and the three checkpoints (read in Stage 26)" },
      { title: "BUB1 and BUBR1: multifaceted kinases of the cell cycle (Trends Biochem Sci 2011)", ref: "doi.org/10.1016/j.tibs.2010.08.004", retrieved: RET, covers: "MCC and APC/C inhibition" },
      { title: "Quality control in the initiation of eukaryotic DNA replication (Philos Trans R Soc B 2011)", ref: "doi.org/10.1098/rstb.2011.0073", retrieved: RET, covers: "geminin, Cdt1 and CDK control of licensing" },
    ],
    quantitative: false,
  },
  {
    id: "bio-organelles-trafficking", model: "Protein targeting and vesicular trafficking routes", kind: "curated-mechanism", source: "partly-verified",
    sourceCovers: "COPII coat assembly (Sar1, Sec23/24, Sec13/31); the existence of SRP, its receptor and Sec61; importin involvement and the Ran-GTP asymmetry in nuclear import. COPI, Rab/SNARE, mannose-6-phosphate sorting, mitochondrial import, endosome pH and ERAD are not source-checked.",
    calc: "not-checked", checks: [],
    conditions: ["Six curated cargo classes in a schematic animal cell. Route validity is tested by the Stage 26 suite (hand-typed expectations); no Stage 27 independent case was added."],
    assumptions: ["Geometry is schematic; routes are validated against a transport graph, not measured."],
    scope: "Which compartments a curated cargo class passes through and which machinery recognises it.",
    unsupported: ["Localisation of arbitrary sequences.", "Trafficking rates, kinetics, clinical phenotypes."],
    sources: [
      { title: "Assembly, organization, and function of the COPII coat (Histochem Cell Biol 2008)", ref: "doi.org/10.1007/s00418-007-0363-x", retrieved: RET, covers: "COPII assembly" },
      { title: "Types of nuclear localization signals and mechanisms of protein import into the nucleus (Cell Commun Signal 2021)", ref: "doi.org/10.1186/s12964-021-00741-y", retrieved: RET, covers: "importins and Ran-GTP" },
    ],
    quantitative: false,
  },
];

export const evidenceById = (id: string): EvidenceRecord | undefined => EVIDENCE.find((e) => e.id === id);

/** Consistency rules that stop a label from claiming more than its record supports. Returns problems; empty means consistent. */
export function validateEvidence(records: readonly EvidenceRecord[] = EVIDENCE): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const r of records) {
    if (ids.has(r.id)) problems.push(`duplicate ${r.id}`);
    ids.add(r.id);
    if (r.source !== "not-verified" && r.sources.length === 0) problems.push(`${r.id}: ${r.source} but no retrieved source listed`);
    if (r.source === "not-verified" && r.sources.length > 0) problems.push(`${r.id}: not-verified but lists sources`);
    for (const s of r.sources) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.retrieved)) problems.push(`${r.id}: source without a retrieval date`);
      if (!s.ref || /^https?:/.test(s.ref)) problems.push(`${r.id}: reference must be given without a scheme`);
      if (!s.covers) problems.push(`${r.id}: source without a statement of what it covers`);
    }
    if (r.kind === "curated-mechanism" && r.quantitative) problems.push(`${r.id}: a curated mechanism must not be marked quantitative`);
    if (r.kind === "curated-mechanism" && r.unsupported.length === 0) problems.push(`${r.id}: a curated mechanism must list unsupported conclusions`);
    if (r.source === "partly-verified" && r.sourceCovers.length < 60) problems.push(`${r.id}: partly-verified without saying what is covered`);
    if (r.calc === "independently-checked" && r.checks.length === 0 && r.kind !== "curated-mechanism") problems.push(`${r.id}: calculation-checked without reference cases`);
  }
  return problems;
}
