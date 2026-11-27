/**
 * Provenance of the Stage 26 mechanism claims, revised in Stage 27.
 *
 * A claim is "verified" only if the cited text was actually retrieved and read and states that claim; "partly-verified" if the text states
 * part of it (the caveat says which part); everything else is "not-checked" (standard textbook cell biology written from memory, not presented
 * as sourced). No quotations or page numbers are given. Stage 26 opened OpenStax Biology 2e pages 4.3 and 10.3. Stage 27 retrieved the full text
 * of seven open-access journal articles through the Europe PMC full-text service (NCBI and PMC pages themselves answered with a bot check) and read
 * the passages cited below. Several of those are review articles, so a verified link means the review states the link, not that PocketChem's
 * simplified model is quantitatively right. Stage 25 biochemical claims are tracked in their own module.
 */
export type ProvenanceStatus = "verified" | "partly-verified" | "not-checked";
export interface Claim {
  id: string; tool: "organelles" | "cellcycle" | "celldeath"; statement: string; status: ProvenanceStatus;
  /** `url` is stored without a scheme (the page adds the scheme); it is a citation only and nothing is fetched at run time. */
  source?: { title: string; url: string };
  /** ISO date the cited text was retrieved (Stage 27 sources only; Stage 26's OpenStax pages predate the field). */
  retrieved?: string;
  /** For a partly-verified claim: what the source does not state. */
  caveat?: string;
}

const PAPER = (title: string, doi: string) => ({ title, url: `doi.org/${doi}` });
const RET = "2026-11-23";
const OS = (page: string, title: string) => ({ title: `OpenStax Biology 2e, ${title}`, url: `openstax.org/books/biology-2e/pages/${page}` });

export const CLAIMS: readonly Claim[] = [
  { id: "nuclear-envelope-double", tool: "organelles", statement: "The nuclear envelope is a double-membrane structure perforated by pores.", status: "verified", source: OS("4-3-eukaryotic-cells", "4.3 Eukaryotic Cells") },
  { id: "organelles-membrane-bound", tool: "organelles", statement: "Eukaryotic cells have a membrane-bound nucleus and membrane-bound organelles such as the ER, Golgi apparatus and mitochondria.", status: "verified", source: OS("4-3-eukaryotic-cells", "4.3 Eukaryotic Cells") },
  { id: "cyclin-cdk-positive", tool: "cellcycle", statement: "Cyclins and cyclin-dependent kinases are positive regulators that carry the cell through checkpoints; cyclin levels fluctuate through the cycle.", status: "verified", source: OS("10-3-control-of-the-cell-cycle", "10.3 Control of the Cell Cycle") },
  { id: "rb-e2f", tool: "cellcycle", statement: "Active (dephosphorylated) Rb binds E2F and blocks production of proteins needed for the G1/S transition.", status: "verified", source: OS("10-3-control-of-the-cell-cycle", "10.3 Control of the Cell Cycle") },
  { id: "p53-p21", tool: "cellcycle", statement: "p53 responds to damaged DNA, halts the cycle and induces p21, which inhibits Cdk/cyclin complexes; if damage cannot be repaired p53 can trigger apoptosis.", status: "verified", source: OS("10-3-control-of-the-cell-cycle", "10.3 Control of the Cell Cycle") },
  { id: "g2-checkpoint", tool: "cellcycle", statement: "The G2 checkpoint bars mitotic entry until chromosomes are replicated and DNA is undamaged.", status: "verified", source: OS("10-3-control-of-the-cell-cycle", "10.3 Control of the Cell Cycle") },
  { id: "spindle-checkpoint", tool: "cellcycle", statement: "The spindle (M) checkpoint holds the cycle until every sister-chromatid pair is attached to spindle fibres from opposite poles, because anaphase separation is irreversible.", status: "verified", source: OS("10-3-control-of-the-cell-cycle", "10.3 Control of the Cell Cycle") },
  // ---- Stage 27: sources retrieved through Europe PMC full text (open access) ----
  { id: "intrinsic-chain", tool: "celldeath", statement: "BAX/BAK oligomerise on the outer mitochondrial membrane (MOMP); cytochrome c released into the cytosol binds Apaf-1, forming the apoptosome; the initiator caspase-9 activates the effector caspases-3/7.", status: "verified", retrieved: RET,
    source: PAPER("Structural biology of the intrinsic cell death pathway (Comput Struct Biotechnol J 2012)", "10.5936/csbj.201204007") },
  { id: "bh3-activation", tool: "celldeath", statement: "BH3-only proteins act upstream of BAX/BAK and BCL-2 pro-survival proteins restrain them.", status: "partly-verified", retrieved: RET,
    source: PAPER("Structural biology of the intrinsic cell death pathway (Comput Struct Biotechnol J 2012)", "10.5936/csbj.201204007"),
    caveat: "The review presents two competing models: indirect activation (BH3-only proteins release BAX/BAK from pro-survival proteins) and direct activation (some BH3-only proteins bind and trigger BAX/BAK). PocketChem's 'BH3 signal not neutralised' logic follows the indirect picture and is a simplification. The p53 to PUMA/NOXA link and BAX/BAK redundancy are not in this review." },
  { id: "copii-coat", tool: "organelles", statement: "COPII assembly: Sar1 recruits the Sec23/24 complex; Sec13/31 forms the outer scaffold of the coat.", status: "verified", retrieved: RET,
    source: PAPER("Assembly, organization, and function of the COPII coat (Histochem Cell Biol 2008)", "10.1007/s00418-007-0363-x") },
  { id: "nuclear-import", tool: "organelles", statement: "Importin alpha/beta family members recognise nuclear localisation signals for passage through the nuclear pore complex; Ran-GTP is enriched in the nucleus and Ran-GDP in the cytoplasm.", status: "partly-verified", retrieved: RET,
    source: PAPER("Types of nuclear localization signals and mechanisms of protein import into the nucleus (Cell Commun Signal 2021)", "10.1186/s12964-021-00741-y"),
    caveat: "The article states importin involvement and the RanGTP asymmetry; the Ran-gradient-driven directionality and cargo release steps shown in the model, and mitochondrial TOM/TIM23 import, are not checked here." },
  { id: "licensing-brakes", tool: "cellcycle", statement: "Re-licensing is restrained by geminin inhibition of Cdt1, replication-coupled destruction of Cdt1 in S phase (Cul4/PCNA) and CDK-dependent inhibition; reducing mitotic CDK1 activity permits re-licensing and extra rounds of replication in human cells.", status: "partly-verified", retrieved: RET,
    source: PAPER("Quality control in the initiation of eukaryotic DNA replication (Philos Trans R Soc B 2011)", "10.1098/rstb.2011.0073"),
    caveat: "Read in this review and in a Cdt1 review (doi.org/10.1186/1747-1028-1-22), which also links Cdt1-geminin imbalance to re-replication. The ORC/Cdc6/MCM loading steps, DDK firing and the specific CDK targets (Cdc6, ORC) were not found as sentences and are unchecked." },
  { id: "mcc-apc", tool: "cellcycle", statement: "The mitotic checkpoint complex (BUBR1, BUB3, MAD2, CDC20) inhibits the APC/C toward cyclin B1 and securin; BUBR1 associates with unattached or incorrectly attached kinetochores.", status: "partly-verified", retrieved: RET,
    source: PAPER("BUB1 and BUBR1: multifaceted kinases of the cell cycle (Trends Biochem Sci 2011)", "10.1016/j.tibs.2010.08.004"),
    caveat: "Separase, cohesin cleavage, the need for CDK1 activity at the APC/C-Cdc20 step and the single attachment/tension simplification were not checked." },
  { id: "autophagy-core", tool: "celldeath", statement: "AMPK and mTORC1 control the ULK1 complex; the Beclin-1/VPS34 (PI3KC3) complex promotes extension of the isolation membrane together with the ATG5-ATG12 and ATG8/LC3 systems; autophagic vesicles fuse with lysosomes.", status: "partly-verified", retrieved: RET,
    source: PAPER("Autophagy: regulator of cell death (Cell Death Dis 2023)", "10.1038/s41419-023-06154-8"),
    caveat: "A review of autophagy and cell death that states the initiation, elongation and lysosomal fusion sequence in outline. The model's context-dependent links in the fate map (p53, ER stress, caspase cleavage of Beclin 1) are not checked." },
  { id: "srp-sec61", tool: "organelles", statement: "The signal recognition particle, its receptor and the Sec61 complex are the targeting, insertion and translocation machinery of the ER import pathway.", status: "partly-verified", retrieved: RET,
    source: PAPER("Mechanisms of ER Protein Import (editorial, Int J Mol Sci 2022)", "10.3390/ijms23105315"),
    caveat: "An editorial introducing a special issue; it names the machinery but does not describe the co-translational order, the ribosome handover or signal peptidase cleavage shown in the model." },
  // ---- not checked: standard textbook mechanisms written from memory ----
  { id: "copi-rab-snare", tool: "organelles", statement: "COPI (Arf1, coatomer) mainly retrieves proteins to the ER; Rab and SNARE roles in tethering and fusion.", status: "not-checked" },
  { id: "m6p", tool: "organelles", statement: "GlcNAc-1-phosphotransferase tags lysosomal hydrolases with mannose 6-phosphate; M6P receptors sort them at the TGN via clathrin/AP-1.", status: "not-checked" },
  { id: "mito-import", tool: "organelles", statement: "TOM/TIM23 and the membrane potential drive presequence import into the mitochondrial matrix.", status: "not-checked" },
  { id: "endosome-ph", tool: "organelles", statement: "Approximate pH values (early endosome 6.0-6.5, late endosome 5.0-5.5, lysosome 4.5-5.0).", status: "not-checked" },
  { id: "erad", tool: "organelles", statement: "ER quality control, ERAD (Hrd1, p97), proteasomal versus lysosomal degradation.", status: "not-checked" },
  { id: "replication-initiation", tool: "cellcycle", statement: "ORC/Cdc6/Cdt1/MCM loading in G1 and CDK/DDK-dependent firing.", status: "not-checked" },
  { id: "atm-atr", tool: "cellcycle", statement: "ATM-CHK2 and ATR-CHK1 arms, Cdc25 inhibition, Wee1/Cdc25 control of CDK1, CAK activation, INK4 and CIP/KIP inhibitors.", status: "not-checked" },
  { id: "separase-cohesin", tool: "cellcycle", statement: "Separase, securin and cohesin cleavage trigger sister-chromatid separation.", status: "not-checked" },
  { id: "bcl2-details", tool: "celldeath", statement: "p53 induction of PUMA/NOXA, BAX/BAK redundancy (one suffices) and neutralisation by BCL-2 excess.", status: "not-checked" },
  { id: "fas-disc", tool: "celldeath", statement: "Fas-FADD-DISC-caspase-8, c-FLIP, BID cleavage and the type I/type II distinction.", status: "not-checked" },
  { id: "fate-map", tool: "celldeath", statement: "The context-dependent links of the fate map between stressors, apoptosis and autophagy.", status: "not-checked" },
];
export const claimsFor = (tool: Claim["tool"]): Claim[] => CLAIMS.filter((c) => c.tool === tool);
