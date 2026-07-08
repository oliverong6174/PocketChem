  import {
    getMoleculeAnnotation,
    getHighlightedMoleculeSvg,
    type AnnotationConcept,
    type MoleculeAnnotation,
  } from "./utils/moleculeAnnotation";
  import { useEffect, useMemo, useRef, useState } from "react";
  import MoleculeDrawer from "./components/MoleculeDrawer";
  import {
    analyzeFunctionalGroupHierarchy,
    getMoleculeSvg,
    flattenFunctionalGroupOccurrences,
    type FunctionalGroupResult,
    type FunctionalGroupOccurrence,
  } from "./utils/functionalGroups";
  import { analyzeAcidity, type AcidityResult } from "./utils/analyzeAcidity";
  import { analyzeBasicity, type BasicityResult } from "./utils/analyzeBasicity";
  import {
    analyzeResonance,
    type ResonanceResult,
  } from "./utils/resonanceUtils";
  import "./App.css";
  import {
    analyzeChirality,
    type ChiralityResult,
  } from "./utils/chiralityUtils";
  import {
    analyzeNomenclatureAndProperties,
    type MoleculeIdentityResult,
  } from "./utils/nomenclatureUtils";

  import ReactionsPage from "./components/ReactionsPage";
  import {
    predictReactionPathways,
    type ReactionPathway,
  } from "./utils/reactionUtils";

  import { initializeFunctionalGroups } from "./utils/functionalGroups/bootstrap";


  type RankingMode = "acidity" | "basicity" | "anionStability";

  type ComparisonMolecule = {
    id: number;
    label: string;
    smiles: string;
    structureSvg: string | null;
    functionalGroups: FunctionalGroupResult[];
    acidityResults: AcidityResult[];
    basicityResults: BasicityResult[];
  };

  type AnnotationCarouselItem =
    | {
        kind: "atom";
        atom: MoleculeAnnotation["atoms"][number];
      }
    | {
        kind: "bond";
        bond: MoleculeAnnotation["bonds"][number];
      }
    | {
        kind: "resonance";
        resonance: ResonanceResult;
      }
    | {
        kind: "chirality";
        chirality: ChiralityResult;
      }
    | {
      kind: "functionalGroup";
      functionalGroup: FunctionalGroupOccurrence;
      };
    

  type PropertyTileProps = {
    label: string;
    value: string | number;
    info: string;
  };

  function PropertyTile({ label, value, info }: PropertyTileProps) {
    return (
      <div className="property-tile">
        <div className="property-tile-header">
          <span>{label}</span>

          <button
            type="button"
            className="info-button"
            aria-label={`What is ${label}?`}
            title={info}
          >
            ?
          </button>
        </div>

        <strong>{value}</strong>
      </div>
    );
  }

  function App() {
    //useState calls
    const analyzeInFlightRef = useRef(false);
    const latestAnalyzeRunRef = useRef(0);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [smiles, setSmiles] = useState("Not analyzed yet");
    const [status, setStatus] = useState("Draw a molecule first");
    const [, setMainGroup] = useState<FunctionalGroupResult | null>(
      null
    );
    const [functionalGroups, setFunctionalGroups] = useState<
      FunctionalGroupResult[]
    >([]);
    const [acidityResults, setAcidityResults] = useState<AcidityResult[]>([]);
    const [basicityResults, setBasicityResults] = useState<BasicityResult[]>([]);
    const [resonanceResults, setResonanceResults] = useState<ResonanceResult[]>([]);
    const [comparisonMolecules, setComparisonMolecules] = useState<
    ComparisonMolecule[]
    >([]);
    const [rankingMode, setRankingMode] = useState<RankingMode>("acidity");
    const [moleculeAnnotation, setMoleculeAnnotation] =
      useState<MoleculeAnnotation | null>(null);

    const [selectedConcept, setSelectedConcept] =
      useState<AnnotationConcept>("functionalGroups");
    const [selectedHybridization, setSelectedHybridization] =
    useState<"all" | "sp" | "sp2" | "sp3">("all");
    const [selectedBondType, setSelectedBondType] =
    useState<"all" | "single" | "double" | "triple">("all");

    const [selectedAtomIndex, setSelectedAtomIndex] = useState<number | null>(null);
    const [selectedBondIndex, setSelectedBondIndex] = useState<number | null>(null);
    const [annotationCardIndex, setAnnotationCardIndex] = useState(0);
    const [highlightedMoleculeSvg, setHighlightedMoleculeSvg] =
    useState<string | null>(null);
    const highlightedSvgRef = useRef<HTMLDivElement | null>(null);

    const [chiralityResults, setChiralityResults] = useState<ChiralityResult[]>([]);
    const [molfile, setMolfile] = useState<string | null>(null);

    const [moleculeIdentity, setMoleculeIdentity] =
    useState<MoleculeIdentityResult | null>(null);

    const [activePage, setActivePage] = useState<"analysis" | "reactions">("analysis");
    const [reactionPathways, setReactionPathways] = useState<ReactionPathway[]>([]);

    const PROPERTY_INFO: Record<string, string> = {
    formula:
      "Molecular formula shows the number and type of atoms in the molecule, such as C2H4O2.",

    dbe:
      "DBE means degrees of unsaturation. It estimates how many rings and/or pi bonds are present. A double bond counts as 1 DBE, a ring counts as 1 DBE, and a triple bond counts as 2 DBE.",

    molecularWeight:
      "Molecular weight is the average mass of one mole of the molecule, usually shown in g/mol. It helps estimate molecule size.",

    exactMass:
      "Exact mass is calculated using the exact masses of specific isotopes, usually the most common isotope of each atom.",

    formalCharge:
      "Formal charge is the overall charge assigned from the Lewis structure. Neutral molecules have formal charge 0.",

    heavyAtoms:
      "Heavy atom count is the number of non-hydrogen atoms. It helps estimate molecule size and complexity.",

    hbd:
      "H-bond donors are atoms/groups that can donate a hydrogen bond, usually O-H or N-H groups.",

    hba:
      "H-bond acceptors are atoms with lone pairs that can accept a hydrogen bond, usually oxygen or nitrogen. Some atoms, like the OH oxygen in carboxylic acids, may not count as effective acceptors.",

    rotatableBonds:
      "Rotatable bonds are single bonds that can freely rotate. More rotatable bonds usually means a molecule is more flexible.",

    tpsa:
    "TPSA means topological polar surface area. It estimates how much of the molecule's surface is polar. Low TPSA, about 0–40 Å², means less polar and often better membrane crossing. Medium TPSA, about 40–90 Å², means moderate polarity. High TPSA, above 90–140 Å², means more polar and more hydrogen bonding. Very high TPSA, above 140 Å², often lowers intestinal absorption.",

    logP:
    "logP estimates whether a neutral molecule prefers oil/fat or water. Negative logP means very water-loving. logP around 0–1 is fairly hydrophilic. logP around 1–3 is often a good balance for drug-like molecules. logP around 3–5 is more lipophilic. logP above 5 may be too greasy, poorly water-soluble, and more likely to accumulate in fat.",
    
    rings:
      "Ring count is the number of ring systems detected in the molecule. Rings affect shape, rigidity, and chemical behavior.",

    boilingPoint:
    "Boiling point tendency estimates whether a molecule should have a low, medium, or high boiling point. It is based on molecular weight, polarity, hydrogen bonding, charge, and branching. This is not an exact experimental boiling point.",
      
      waterSolubility:
      "Water solubility tendency estimates how well a molecule dissolves in water. Very low means mostly nonpolar or greasy. Low means limited water solubility. Medium means some polar groups but not extremely water-loving. High means polar or hydrogen-bonding groups. Very high usually means charged, very polar, or many hydrogen-bonding groups.",

    membranePermeability:
      "Membrane permeability tendency estimates passive crossing through lipid membranes. Very low usually means charged, very large, or very polar. Low means crossing may be difficult. Medium means possible but structure-dependent. High means a good balance of lipid solubility and size. Very high means small, neutral, and lipid-compatible, but extremely greasy molecules may still have poor useful absorption.",

    volatility:
      "Volatility tendency estimates how easily a molecule evaporates. Very low means it is not very volatile, often because it is large, charged, or strongly hydrogen-bonding. Low means it evaporates slowly. Medium means moderate evaporation. High means fairly volatile. Very high means small molecules with weak intermolecular forces that evaporate easily.",
      
    };

    const functionalGroupOccurrences = useMemo(
    () =>
      flattenFunctionalGroupOccurrences(
        functionalGroups.filter(
          (group) => (group.category ?? "functionalGroup") === "functionalGroup"
        )
      ),
    [functionalGroups]
  );

  {/*DEBUG MOLFILE SMILES*/}
      function isMolBlockLike(value: unknown) {
      if (typeof value !== "string") return false;

      return (
        value.includes("M  END") ||
        value.includes("V2000") ||
        value.includes("V3000") ||
        value.includes("-INDIGO-") ||
        /^\s*\n?\s*-INDIGO-/i.test(value)
      );
    }

    function sanitizeDisplayedSmiles(value: unknown) {
      if (typeof value !== "string") return "";

      const trimmed = value.trim();

      if (!trimmed) return "";
      if (isMolBlockLike(trimmed)) return "";

      return trimmed;
    }

    const analyzeMolecule = async () => {
  if (analyzeInFlightRef.current) {
    console.warn("Analyze suppressed: analysis already in progress.");
    return;
  }

  if (!window.ketcher) {
    setStatus("Molecule editor is still loading. Try again in a second.");
    return;
  }

  analyzeInFlightRef.current = true;
  setIsAnalyzing(true);
  setStatus("Analyzing molecule...");

  try {
    const result = await window.ketcher.getSmiles();
    const currentMolfile = await window.ketcher.getMolfile();

    const safeSmiles = sanitizeDisplayedSmiles(result);

    console.log("SMILES result:", result);
    console.log("Safe SMILES:", safeSmiles);
    console.log("MOLFILE result:", currentMolfile);

    if (!safeSmiles) {
      setSmiles("No molecule detected");
      setMolfile(null);
      setStatus("Draw a molecule before analyzing.");
      return;
    }

    setSmiles(safeSmiles);
    setMolfile(currentMolfile);

    const moleculeSource = currentMolfile || safeSmiles;

    const annotation = await getMoleculeAnnotation(moleculeSource);
    setMoleculeAnnotation(annotation);

    const resonance = await analyzeResonance(moleculeSource);
    setResonanceResults(resonance);
    console.log("Resonance results:", resonance);

    const chirality = await analyzeChirality(safeSmiles, currentMolfile);
    setChiralityResults(chirality);
    console.log("Chirality results:", chirality);

    const hierarchy = await analyzeFunctionalGroupHierarchy(moleculeSource);

    const detectedFunctionalGroups = hierarchy.functionalGroups ?? [];

    setMainGroup(hierarchy.mainGroup ?? detectedFunctionalGroups[0] ?? null);
    setFunctionalGroups(detectedFunctionalGroups);

    const pathways = await predictReactionPathways(
      safeSmiles,
      detectedFunctionalGroups
    );

    setReactionPathways(pathways);

    const acidity = await analyzeAcidity(safeSmiles, hierarchy.primaryGroups);
    setAcidityResults(acidity);

    const basicity = await analyzeBasicity(safeSmiles, hierarchy.primaryGroups);
    setBasicityResults(basicity);

    let identity: MoleculeIdentityResult | null = null;

    try {
      identity = await analyzeNomenclatureAndProperties(
        safeSmiles,
        hierarchy.primaryGroups,
        hierarchy.mainGroup
      );
    } catch (nomenclatureError) {
      console.error("Nomenclature/property analysis failed:", nomenclatureError);
      identity = null;
    }

    console.log("SMILES leaving App.tsx:", JSON.stringify(safeSmiles));

    setMoleculeIdentity(identity);

    setStatus("Molecule analyzed successfully.");
  } catch (error) {
    console.error("Analyze error:", error);
    setStatus("Something went wrong while analyzing the molecule.");
  } finally {
    // Always unlock. Do not condition this on latestAnalyzeRunRef.
    analyzeInFlightRef.current = false;
    setIsAnalyzing(false);
  }
};
  
    const addCurrentMoleculeToComparison = async () => {
      if (!window.ketcher) {
        setStatus("Molecule editor is still loading. Try again in a second.");
        return;
      }

      if (comparisonMolecules.length >= 5) {
        setStatus("Comparison list is full. You can compare up to 5 molecules.");
        return;
      }

      try {
        const currentSmiles = await window.ketcher.getSmiles();

        if (!currentSmiles || currentSmiles.trim() === "") {
          setStatus("Draw a molecule before adding it to comparison.");
          return;
        }

        const hierarchy = await analyzeFunctionalGroupHierarchy(currentSmiles);
        const acidity = await analyzeAcidity(currentSmiles, hierarchy.primaryGroups);
        const basicity = await analyzeBasicity(currentSmiles, hierarchy.primaryGroups);
        const structureSvg = await getMoleculeSvg(currentSmiles);

        const nextLabel = `Molecule ${String.fromCharCode(
          65 + comparisonMolecules.length
        )}`;

        const newMolecule: ComparisonMolecule = {
          id: Date.now(),
          label: nextLabel,
          smiles: currentSmiles,
          structureSvg,
          functionalGroups: hierarchy.functionalGroups,
          acidityResults: acidity,
          basicityResults: basicity,
        };

        setComparisonMolecules((prev) => [...prev, newMolecule]);

        // Also update the main analysis panel to match the molecule just added
        setSmiles(currentSmiles);
        setMainGroup(hierarchy.mainGroup);
        setFunctionalGroups(hierarchy.functionalGroups);
        setAcidityResults(acidity);
        setBasicityResults(basicity);

        setStatus(`${nextLabel} added to comparison.`);
      } catch (error) {
        console.error("Add to comparison error:", error);
        setStatus("Something went wrong while adding the molecule to comparison.");
      }
    };

    const deleteComparisonMolecule = (id: number) => {
      setComparisonMolecules((prev) =>
        prev.filter((molecule) => molecule.id !== id)
      );

      setStatus("Molecule removed from comparison.");
    };

    const getAnionStabilityScore = (molecule: ComparisonMolecule) => {
      const bestBase = molecule.basicityResults[0];

      if (!bestBase) return 999;

      const group = bestBase.relatedGroup.toLowerCase();
      const site = bestBase.basicSite.toLowerCase();
      const explanation = bestBase.explanation.toLowerCase();

      if (group.includes("carboxylate")) return 0;

      if (
        group.includes("alpha resonance-stabilized") ||
        site.includes("alpha resonance-stabilized") ||
        explanation.includes("resonance-stabilized")
      ) {
        return 1;
      }

      if (group.includes("methyl localized carbanion")) return 2;
      if (group.includes("primary localized carbanion")) return 3;
      if (group.includes("secondary localized carbanion")) return 4;
      if (group.includes("tertiary localized carbanion")) return 5;

      if (group.includes("carbanion")) return 6;

      return 999;
    };

    const getRankedComparison = () => {
      return [...comparisonMolecules].sort((a, b) => {
        const aScore =
          rankingMode === "acidity"
            ? a.acidityResults[0]?.estimatedPkaNumber
            : a.basicityResults[0]?.conjugateAcidPkaNumber;

        const bScore =
          rankingMode === "acidity"
            ? b.acidityResults[0]?.estimatedPkaNumber
            : b.basicityResults[0]?.conjugateAcidPkaNumber;

        // Molecules with no rankable site go to the bottom
        if (aScore === undefined && bScore === undefined) return 0;
        if (aScore === undefined) return 1;
        if (bScore === undefined) return -1;

        // Lower pKa = stronger acid
        if (rankingMode === "acidity") {
          return aScore - bScore;
        }

        // Higher conjugate acid pKa = stronger base
        if (rankingMode === "basicity") {
          return bScore - aScore;
        }

        // Custom stability order:
        // carboxylate > alpha resonance-stabilized > methyl > primary > secondary > tertiary
        if (rankingMode === "anionStability") {
          const aStabilityScore = getAnionStabilityScore(a);
          const bStabilityScore = getAnionStabilityScore(b);

          if (aStabilityScore !== bStabilityScore) {
            return aStabilityScore - bStabilityScore;
          }

          // tie-breaker: lower conjugate acid pKa = more stable anion
          return aScore - bScore;
        }

        return 0;
      });
    };

  const rankedComparison = getRankedComparison();

  const clearComparison = () => {
    setComparisonMolecules([]);
    setSmiles("Not analyzed yet");
    setMainGroup(null);
    setFunctionalGroups([]);                            
    setStatus("Comparison list cleared.");
  };

  const getAtomCardClassName = (atom: MoleculeAnnotation["atoms"][number]) => {
    const classes = ["annotation-card"];

    if (selectedConcept === "hybridization") {
      classes.push(`hybridization-${atom.hybridization}`);

      if (
        selectedHybridization !== "all" &&
        atom.hybridization === selectedHybridization
      ) {
        classes.push("annotation-card-highlighted");
      }
    }

    if (selectedConcept === "lonePairs" && atom.lonePairInfo.count > 0) {
      classes.push("annotation-card-highlighted");
    }

    if (selectedAtomIndex === atom.atomIndex) {
      classes.push("annotation-card-selected");
    }

    return classes.join(" ");
  };

  const getBondCardClassName = (bond: MoleculeAnnotation["bonds"][number]) => {
    const classes = ["annotation-card"];

    if (selectedConcept === "bondOrbitals") {
      classes.push(`bond-${bond.bondType}`);

      if (selectedBondType !== "all" && bond.bondType === selectedBondType) {
        classes.push("annotation-card-highlighted");
      }
    }

    if (selectedBondIndex === bond.bondIndex) {
      classes.push("annotation-card-selected");
    }

    return classes.join(" ");
  };

  const getVisibleAtomAnnotations = () => {

    
    if (!moleculeAnnotation) return [];

    if (selectedConcept === "hybridization") {
      return moleculeAnnotation.atoms.filter((atom) => {
        if (atom.hybridization === "unknown") return false;

        if (selectedHybridization === "all") {
          return true;
        }

        return atom.hybridization === selectedHybridization;
      });
    }

    if (selectedConcept === "lonePairs") {
      return moleculeAnnotation.atoms.filter(
        (atom) => atom.lonePairInfo.count > 0
      );
    }

    if (selectedConcept === "acidBaseSites") {
      return moleculeAnnotation.atoms.filter((atom) =>
        atom.siteTypes.some(
          (site) =>
            site.includes("basic") ||
            site.includes("acid") ||
            site.includes("lone-pair")
        )
      );
    }

    if (selectedConcept === "reactiveSites") {
      return moleculeAnnotation.atoms.filter((atom) =>
        atom.siteTypes.some(
          (site) =>
            site.includes("electrophilic") ||
            site.includes("basic") ||
            site.includes("lone-pair")
        )
      );
    }

    return [];
  };

  const getVisibleBondAnnotations = () => {
    if (!moleculeAnnotation) return [];

    if (selectedConcept === "bondOrbitals") {
      return moleculeAnnotation.bonds.filter((bond) => {
        if (selectedBondType === "all") return true;
        return bond.bondType === selectedBondType;
      });
    }

    return [];
  };

  const getHighlightedAtomIndices = () => {
    const visibleAtomIndices = getVisibleAtomAnnotations().map(
      (atom) => atom.atomIndex
    );

    if (selectedConcept === "functionalGroups") {
    return Array.from(
      new Set(
        functionalGroupOccurrences.flatMap((occurrence) => occurrence.atoms)
      )
    );
  }

    if (selectedConcept === "resonance") {
      const allResonanceAtomIndices = resonanceResults.flatMap((result) => [
        ...result.matchedAtoms,
        ...(result.possibleRadicalSites ?? []),
      ]);

      return Array.from(new Set(allResonanceAtomIndices));
    }

    if (selectedConcept === "chirality") {
    return Array.from(
      new Set(chiralityResults.map((result) => result.atomIndex))
    );
    }

    if (selectedAtomIndex !== null) {
      visibleAtomIndices.push(selectedAtomIndex);
    }

    if (selectedBondIndex !== null && moleculeAnnotation) {
      const selectedBond = moleculeAnnotation.bonds.find(
        (bond) => bond.bondIndex === selectedBondIndex
      );

      if (selectedBond) {
        visibleAtomIndices.push(...selectedBond.atomIndices);
      }
    }

    return Array.from(new Set(visibleAtomIndices));
  };

  const getHighlightedBondIndices = () => {
    const visibleBondIndices: number[] = [];

    if (selectedConcept === "functionalGroups") {
    return Array.from(
      new Set(
        functionalGroupOccurrences.flatMap((occurrence) => occurrence.bonds)
      )
    );
  }

    if (selectedConcept === "resonance") {
      const allResonanceBondIndices = resonanceResults.flatMap(
        (result) => result.resonanceBondIndices ?? []
      );

      return Array.from(new Set(allResonanceBondIndices));
    }

    if (selectedConcept === "bondOrbitals") {
      visibleBondIndices.push(
        ...getVisibleBondAnnotations().map((bond) => bond.bondIndex)
      );
    }

    if (selectedBondIndex !== null) {
      visibleBondIndices.push(selectedBondIndex);
    }

    return Array.from(new Set(visibleBondIndices));
  };

  const getSelectedFunctionalGroupAtomIndices = () => {
    if (
      selectedConcept !== "functionalGroups" ||
      currentAnnotationItem?.kind !== "functionalGroup"
    ) { 
      return [];
    }

    return currentAnnotationItem.functionalGroup.atoms;
  };

  const getSelectedFunctionalGroupBondIndices = () => {
    if (
      selectedConcept !== "functionalGroups" ||
      currentAnnotationItem?.kind !== "functionalGroup"
    ) {
      return [];
    }

    return currentAnnotationItem.functionalGroup.bonds;
  };

  const getSelectedResonanceAtomIndices = () => {
    if (
      selectedConcept !== "resonance" ||
      currentAnnotationItem?.kind !== "resonance"
    ) {
      return [];
    }

    return Array.from(
      new Set([
        ...currentAnnotationItem.resonance.matchedAtoms,
        ...(currentAnnotationItem.resonance.possibleRadicalSites ?? []),
      ])
    );
  };

  const getSelectedResonanceBondIndices = () => {
    if (
      selectedConcept !== "resonance" ||
      currentAnnotationItem?.kind !== "resonance"
    ) {
      return [];
    }

    return Array.from(
      new Set(currentAnnotationItem.resonance.resonanceBondIndices ?? [])
    );
  };

  const getSelectedChiralityAtomIndices = () => {
    if (
      selectedConcept !== "chirality" ||
      currentAnnotationItem?.kind !== "chirality"
    ) {
      return [];
    }

    return [currentAnnotationItem.chirality.atomIndex];
  };

  useEffect(() => {
    const updateHighlightedSvg = async () => {
      if (!moleculeAnnotation || smiles === "Not analyzed yet") {
        setHighlightedMoleculeSvg(null);
        return;
      }

      const atomIndices = getHighlightedAtomIndices();
      const bondIndices = getHighlightedBondIndices();

  const moleculeSourceForHighlight = molfile || smiles;

    
  const svg = await getHighlightedMoleculeSvg(
    moleculeSourceForHighlight,
    atomIndices,
    bondIndices,
    selectedConcept === "resonance" || selectedConcept === "chirality" || selectedConcept === "functionalGroups"
      ? null
      : selectedAtomIndex,
    selectedConcept === "resonance" || selectedConcept === "chirality" || selectedConcept === "functionalGroups"
      ? null
      : selectedBondIndex,
    [
      ...getSelectedResonanceAtomIndices(),
      ...getSelectedChiralityAtomIndices(),
      ...getSelectedFunctionalGroupAtomIndices(),
    ],
    [
      ...getSelectedResonanceBondIndices(),
      ...getSelectedFunctionalGroupBondIndices(),
    ]
  );

      setHighlightedMoleculeSvg(svg);
    };

    updateHighlightedSvg();
  }, [
    moleculeAnnotation,
    smiles,
    molfile,
    selectedConcept,
    selectedHybridization,
    selectedBondType,
    selectedAtomIndex,
    selectedBondIndex,
    resonanceResults,
    annotationCardIndex,
  ]);

  useEffect(() => {
    initializeFunctionalGroups();
  }, []);

  const annotationCarouselItems = useMemo<AnnotationCarouselItem[]>(() => {
    if (selectedConcept === "resonance") {
      return resonanceResults.map((resonance) => ({
        kind: "resonance" as const,
        resonance,
      }));
    }

    if (selectedConcept === "functionalGroups") {
    return functionalGroupOccurrences.map((functionalGroup) => ({
      kind: "functionalGroup" as const,
      functionalGroup,
    }));
  }

    if (selectedConcept === "chirality") {
    return chiralityResults.map((chirality) => ({
      kind: "chirality" as const,
      chirality,
    }));
  }

    const atomItems = getVisibleAtomAnnotations().map((atom) => ({
      kind: "atom" as const,
      atom,
    }));

    const bondItems = getVisibleBondAnnotations().map((bond) => ({
      kind: "bond" as const,
      bond,
    }));

    return [...atomItems, ...bondItems];
  }, [
    moleculeAnnotation,
    selectedConcept,
    selectedHybridization,
    selectedBondType,
    resonanceResults,
    chiralityResults,
    functionalGroupOccurrences,
  ]);

  const currentAnnotationItem =
    annotationCarouselItems[annotationCardIndex] ?? null;

    useEffect(() => {
    if (!currentAnnotationItem) {
      setSelectedAtomIndex(null);
      setSelectedBondIndex(null);
      return;
    }

    if (currentAnnotationItem.kind === "atom") {
      setSelectedAtomIndex(currentAnnotationItem.atom.atomIndex);
      setSelectedBondIndex(null);
    }

    if (currentAnnotationItem.kind === "bond") {
      setSelectedBondIndex(currentAnnotationItem.bond.bondIndex);
      setSelectedAtomIndex(null);
    }

    if (currentAnnotationItem.kind === "resonance") {
      setSelectedAtomIndex(null);
      setSelectedBondIndex(null);
    }

    if (currentAnnotationItem.kind === "chirality") {
    setSelectedAtomIndex(null);
    setSelectedBondIndex(null);
    return;
  }

    if (currentAnnotationItem.kind === "functionalGroup") {
    setSelectedAtomIndex(null);
    setSelectedBondIndex(null);
    return;
  }

  }, [currentAnnotationItem]);

  const goToPreviousAnnotationCard = () => {
    if (annotationCarouselItems.length === 0) return;

    setAnnotationCardIndex((currentIndex) =>
      currentIndex === 0 ? annotationCarouselItems.length - 1 : currentIndex - 1
    );
  };

  const goToNextAnnotationCard = () => {
    if (annotationCarouselItems.length === 0) return;

    setAnnotationCardIndex((currentIndex) =>
      currentIndex === annotationCarouselItems.length - 1 ? 0 : currentIndex + 1
    );
  };

  {/* FAST MOLECULE NAVIGATION CLICKER */}

  const jumpToAnnotationItem = (kind: "atom" | "bond", index: number) => {

      if (selectedConcept === "functionalGroups") {
    const targetIndex = annotationCarouselItems.findIndex((item) => {
      if (item.kind !== "functionalGroup") return false;

      return kind === "atom"
        ? item.functionalGroup.atoms.includes(index)
        : item.functionalGroup.bonds.includes(index);
    });

    if (targetIndex !== -1) {
      setAnnotationCardIndex(targetIndex);
      setSelectedAtomIndex(null);
      setSelectedBondIndex(null);
    }

    return;
  }
    // Special behavior for Resonance mode:
    // clicking any atom/bond in a resonance system jumps to that resonance card.
    if (selectedConcept === "resonance") {
      const targetIndex = annotationCarouselItems.findIndex((item) => {
        if (item.kind !== "resonance") return false;

        const resonance = item.resonance;

        if (kind === "atom") {
          return [
            ...resonance.matchedAtoms,
            ...(resonance.possibleRadicalSites ?? []),
          ].includes(index);
        }

        if (kind === "bond") {
          return (resonance.resonanceBondIndices ?? []).includes(index);
        }

        return false;
      });

      if (targetIndex !== -1) {
        setAnnotationCardIndex(targetIndex);
        setSelectedAtomIndex(null);
        setSelectedBondIndex(null);
      }

      return;
    }

    if (selectedConcept === "chirality" && kind === "atom") {
    const targetIndex = annotationCarouselItems.findIndex(
      (item) =>
        item.kind === "chirality" && item.chirality.atomIndex === index
    );

    if (targetIndex !== -1) {
      setAnnotationCardIndex(targetIndex);
      setSelectedAtomIndex(null);
      setSelectedBondIndex(null);
    }

    return;
  }

    // Normal atom/bond behavior for non-resonance modes
    const targetIndex = annotationCarouselItems.findIndex((item) => {
      if (kind === "atom" && item.kind === "atom") {
        return item.atom.atomIndex === index;
      }

      if (kind === "bond" && item.kind === "bond") {
        return item.bond.bondIndex === index;
      }

      return false;
    });

    if (targetIndex === -1) return;

    setAnnotationCardIndex(targetIndex);

    if (kind === "atom") {
      setSelectedAtomIndex(index);
      setSelectedBondIndex(null);
    } else {
      setSelectedBondIndex(index);
      setSelectedAtomIndex(null);
    }
  };

  useEffect(() => {
    setAnnotationCardIndex(0);
  }, [selectedConcept, selectedHybridization, selectedBondType, moleculeAnnotation]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (annotationCarouselItems.length <= 1) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousAnnotationCard();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextAnnotationCard();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [annotationCarouselItems.length]);

  {/* CLICKER FUNCTION */}
  useEffect(() => {
    const container = highlightedSvgRef.current;
    if (!container) return;

    const svg = container.querySelector("svg");
    if (!svg) return;

    const clickableElements = svg.querySelectorAll(
      "[class*='atom-'], [class*='bond-']"
    );

    const cleanupFunctions: Array<() => void> = [];

    clickableElements.forEach((element) => {
      element.classList.add("svg-clickable-site");

      const handleClick = (event: Event) => {
        event.stopPropagation();

        const className = element.getAttribute("class") ?? "";

        const bondMatch = className.match(/bond-(\d+)/);
        const atomMatch = className.match(/atom-(\d+)/);

        if (bondMatch) {
          jumpToAnnotationItem("bond", Number(bondMatch[1]));
          return;
        }

        if (atomMatch) {
          jumpToAnnotationItem("atom", Number(atomMatch[1]));
        }
      };

      element.addEventListener("click", handleClick);

      cleanupFunctions.push(() => {
        element.removeEventListener("click", handleClick);
      });
    });

    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup());
    };
  }, [highlightedMoleculeSvg, annotationCarouselItems]);

  {/*RETURN STATEMENT*/}


    return (
      <main className="app">
        <section className="hero">
          <div>
            <p className="eyebrow">Multipurpose Organic Chemistry Tool</p>
            <h1>PocketChem</h1>
            <p className="subtitle">
              Draw molecules, identify functional groups, understand mechanisms,
              and connect organic chemistry to biochemistry.
            </p>
          </div>
        </section>

        <div className="page-tabs">
          <button
            className={activePage === "analysis" ? "page-tab active" : "page-tab"}
            onClick={() => setActivePage("analysis")}
          >
            Analysis
          </button>

          <button
            className={activePage === "reactions" ? "page-tab active" : "page-tab"}
            onClick={() => setActivePage("reactions")}
          >
            Reactions
          </button>
        </div>

        {activePage === "analysis" ? (
      <section className="workspace">
          <div className="card molecule-card">
            <div className="card-header">
              <div>
                <h2>Molecule Drawer</h2>
                <p>Draw a molecule, then click Analyze Molecule.</p>
              </div>
              <span className="status">Draw Mode</span>
            </div>

            <div className="drawer-placeholder">
              <MoleculeDrawer />
            </div>

            <div className="button-row">
              <button
                className="primary-button"
                onClick={analyzeMolecule}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? "Analyzing..." : "Analyze Molecule"}
              </button>

              {/* CLEAR BUTTON */}
              
              <button
                className="secondary-button"
                onClick={() => {
                  analyzeInFlightRef.current = false;
                  latestAnalyzeRunRef.current = 0;
                  setIsAnalyzing(false);
                  
                  setSmiles("Not analyzed yet");
                  setStatus("Draw a molecule first");
                  setMainGroup(null);
                  setFunctionalGroups([]);
                  setAcidityResults([]);
                  setBasicityResults([]);
                  setResonanceResults([]);
                  setChiralityResults([]);
                  setReactionPathways([]);
                  setActivePage("analysis");
                  setMoleculeAnnotation(null);
                  setSelectedAtomIndex(null);
                  setSelectedBondIndex(null);
                  setMolfile(null);
                  setMoleculeIdentity(null);
                }}
              >
                Clear Analysis
              </button>

              <button className="secondary-button" onClick={addCurrentMoleculeToComparison}>
                Add to Comparison
              </button>

              <button className="secondary-button" onClick={clearComparison}>
                Clear Comparison
              </button>
            </div>
          </div>

        <div className="card analysis-card">
    <h2>Analysis</h2>

    <div className="analysis-section">
      <p className="label">Status</p>
      <p>{status}</p>
    </div>

    <div className="analysis-section">
      <p className="label">SMILES</p>
      <p className="smiles-output">{smiles}</p>
    </div>

  {/* NOMENCLATURE SECTION */}

  <div className="analysis-section">
    <p className="label">Nomenclature & Core Properties</p>

    {!moleculeIdentity ? (
      <p className="empty">
        Analyze a molecule to estimate its name, formula, DBE, and basic molecular properties.
      </p>
    ) : (
      <div className="group-list">
        <div className="group-card">
            <div className="group-card-header">
              <h3>
                {moleculeIdentity.nomenclature.displayName ||
                  moleculeIdentity.nomenclature.estimatedName}
              </h3>

              <span>{moleculeIdentity.nomenclature.namingConfidence} confidence</span>
            </div>
    
      

          {moleculeIdentity.nomenclature.commonName && (
            <p>
              <strong>Common name:</strong>{" "}
              {moleculeIdentity.nomenclature.commonName}
            </p>
          )}
          <p>
            <strong>Parent chain:</strong>{" "}
            {moleculeIdentity.nomenclature.parentChain ?? "Not assigned"}
            {moleculeIdentity.nomenclature.parentChainLength > 0
              ? ` (${moleculeIdentity.nomenclature.parentChainLength} C)`
              : ""}
          </p>

          <p>
            <strong>Main suffix:</strong>{" "}
            {moleculeIdentity.nomenclature.mainSuffix ??
              "Hydrocarbon / no suffix group detected"}
          </p>

          {moleculeIdentity.nomenclature.prefixes.length > 0 && (
            <p>
              <strong>Detected prefixes:</strong>{" "}
              {moleculeIdentity.nomenclature.prefixes.join(", ")}
            </p>
          )}

          <p>{moleculeIdentity.nomenclature.explanation}</p>

          <div className="limitation-list">
            {moleculeIdentity.nomenclature.limitations.map((limitation) => (
              <p className="empty" key={limitation}>
                {limitation}
              </p>
            ))}
          </div>
        </div>

  {/*PROPERTY SECTION*/}

        <div className="property-grid">
          <PropertyTile
            label="Formula"
            value={moleculeIdentity.properties.molecularFormula}
            info={PROPERTY_INFO.formula}
          />

          <PropertyTile
            label="DBE / unsaturation"
            value={moleculeIdentity.properties.degreesOfUnsaturation ?? "N/A"}
            info={PROPERTY_INFO.dbe}
          />

          <PropertyTile
            label="Molecular weight"
            value={
              moleculeIdentity.properties.molecularWeight
                ? `${moleculeIdentity.properties.molecularWeight} g/mol`
                : "N/A"
            }
            info={PROPERTY_INFO.molecularWeight}
          />

          <PropertyTile
            label="Exact mass"
            value={moleculeIdentity.properties.exactMass ?? "N/A"}
            info={PROPERTY_INFO.exactMass}
          />

          <PropertyTile
            label="Formal charge"
            value={moleculeIdentity.properties.formalCharge}
            info={PROPERTY_INFO.formalCharge}
          />

          <PropertyTile
            label="Heavy atoms"
            value={moleculeIdentity.properties.heavyAtomCount}
            info={PROPERTY_INFO.heavyAtoms}
          />

          <PropertyTile
            label="Water solubility"
            value={moleculeIdentity.properties.waterSolubilityTendency.level}
            info={PROPERTY_INFO.waterSolubility}
          />

          <PropertyTile
            label="Membrane permeability"
            value={moleculeIdentity.properties.membranePermeabilityTendency.level}
            info={PROPERTY_INFO.membranePermeability}
          />

          <PropertyTile
          label="Boiling point tendency"
          value={moleculeIdentity.properties.boilingPointTendency.level}
          info={PROPERTY_INFO.boilingPoint}
          />

          
          <PropertyTile
            label="Volatility"
            value={moleculeIdentity.properties.volatilityTendency.level}
            info={PROPERTY_INFO.volatility}
          />

    

          <PropertyTile
            label="H-bond donors"
            value={moleculeIdentity.properties.hydrogenBondDonors ?? "N/A"}
            info={PROPERTY_INFO.hbd}
          />

          <PropertyTile
            label="H-bond acceptors"
            value={moleculeIdentity.properties.hydrogenBondAcceptors ?? "N/A"}
            info={PROPERTY_INFO.hba}
          />

          <PropertyTile
            label="Rotatable bonds"
            value={moleculeIdentity.properties.rotatableBonds ?? "N/A"}
            info={PROPERTY_INFO.rotatableBonds}
          />

          <PropertyTile
            label="Rings"
            value={moleculeIdentity.properties.ringCount ?? "N/A"}
            info={PROPERTY_INFO.rings}
          />
        </div>
      </div>
    )}
  </div>

  {/* HIGHLIGHTING SECTION */}
  <div className="analysis-section">
    <p className="label">Concept View</p>
      <div className="concept-button-row">

        <button
      className={
        selectedConcept === "functionalGroups"
          ? "concept-button active"
          : "concept-button"
      }
      onClick={() => {
        setSelectedConcept("functionalGroups");
        setSelectedAtomIndex(null);
        setSelectedBondIndex(null);
      }}
      type="button"
    >
      Functional Groups
    </button>
      <button
        className={
          selectedConcept === "hybridization"
            ? "concept-button active"
            : "concept-button"
        }
        onClick={() => {
          setSelectedConcept("hybridization");
          setSelectedAtomIndex(null);
          setSelectedBondIndex(null);
        }}
        type="button"
      >
        Hybridization
      </button>

      <button
        className={
          selectedConcept === "bondOrbitals"
            ? "concept-button active"
            : "concept-button"
        }
        onClick={() => {
    setSelectedConcept("bondOrbitals");
    setSelectedAtomIndex(null);
    setSelectedBondIndex(null);
  }}
        type="button"
      >
        Bond Orbitals
      </button>

      <button
        className={
          selectedConcept === "lonePairs"
            ? "concept-button active"
            : "concept-button"
        }
        onClick={() => {
    setSelectedConcept("lonePairs");
    setSelectedAtomIndex(null);
    setSelectedBondIndex(null);
  }}
        type="button"
      >
        Lone Pairs
      </button>

      <button
        className={
          selectedConcept === "acidBaseSites"
            ? "concept-button active"
            : "concept-button"
        }
        onClick={() => {
    setSelectedConcept("acidBaseSites");
    setSelectedAtomIndex(null);
    setSelectedBondIndex(null);
  }}
        type="button"
      >
        Acid/Base Sites
      </button>

      <button
        className={
          selectedConcept === "reactiveSites"
            ? "concept-button active"
            : "concept-button"
        }
        onClick={() => {
    setSelectedConcept("reactiveSites");
    setSelectedAtomIndex(null);
    setSelectedBondIndex(null);
  }}
        type="button"
      >
        Reactive Sites
      </button>

        <button
    className={
      selectedConcept === "resonance"
        ? "concept-button active"
        : "concept-button"
    }
    onClick={() => {
      setSelectedConcept("resonance");
      setSelectedAtomIndex(null);
      setSelectedBondIndex(null);
    }}
    type="button"
  >
    Resonance Sites
  </button>

  <button
    className={
      selectedConcept === "chirality"
        ? "concept-button active"
        : "concept-button"
    }
    onClick={() => {
      setSelectedConcept("chirality");
      setSelectedAtomIndex(null);
      setSelectedBondIndex(null);
    }}
    type="button"
  >
    Chirality
  </button>

    </div>



    {selectedConcept === "hybridization" && (
      <div className="concept-subfilter-row">
        {(["all", "sp", "sp2", "sp3"] as const).map((hybridization) => (
          <button
            key={hybridization}
            className={
              selectedHybridization === hybridization
                ? "concept-subfilter-button active"
                : "concept-subfilter-button"
            }
            onClick={() => setSelectedHybridization(hybridization)}
            type="button"
          >
            {hybridization === "all" ? "All" : hybridization}
          </button>
        ))}
      </div>
    )}

    {selectedConcept === "bondOrbitals" && (
      <div className="concept-subfilter-row">
        {(["all", "single", "double", "triple"] as const).map(
          (bondType) => (
            <button
              key={bondType}
              className={
                selectedBondType === bondType
                  ? "concept-subfilter-button active"
                  : "concept-subfilter-button"
              }
              onClick={() => setSelectedBondType(bondType)}
              type="button"
            >
              {bondType === "all" ? "All" : bondType}
            </button>
          )
        )}
      </div>
    )}


  {highlightedMoleculeSvg && (
    <div className="highlight-preview-wrapper">
      <p className="annotation-summary">Highlighted molecule preview:</p>

      <div className="highlight-preview">
        <div
            ref={highlightedSvgRef}
            className="highlighted-molecule-svg"
            dangerouslySetInnerHTML={{ __html: highlightedMoleculeSvg }}
          />
      </div>
    </div>
  )}

    {!moleculeAnnotation ? (
      <p className="empty">Analyze a molecule to see concept annotations.</p>
    ) : (
      <div className="annotation-list">
        {selectedConcept === "hybridization" && (
          <p className="annotation-summary">
            Showing{" "}
            {selectedHybridization === "all"
              ? "all hybridized atoms"
              : `${selectedHybridization} atoms`}
            .
          </p>
        )}

        {selectedConcept === "bondOrbitals" && (
          <p className="annotation-summary">
            Showing{" "}
            {selectedBondType === "all"
              ? "all bond orbital overlaps"
              : `${selectedBondType} bond orbital overlaps`}
            .
          </p>

        
        )}

        {selectedConcept === "resonance" && (
          <p className="annotation-summary">
            Showing resonance-stabilized systems and possible delocalization sites.
          </p>
        )}

        {selectedConcept === "chirality" && (
          <p className="annotation-summary">
            Showing possible chiral centers. Specific R/S assignment requires wedge/dash stereochemistry.
          </p>
        )}

          {annotationCarouselItems.length === 0 ? (
            <p className="empty">No annotations found for this concept yet.</p>
          ) : (
            <div className="annotation-carousel">
              <button
                className="carousel-arrow"
                type="button"
                onClick={goToPreviousAnnotationCard}
                disabled={annotationCarouselItems.length <= 1}
                aria-label="Previous annotation"
              >
                ‹
              </button>

              <div className="annotation-carousel-card">
                <p className="annotation-counter">
                  Card {annotationCardIndex + 1} of {annotationCarouselItems.length}
                </p>

                {currentAnnotationItem?.kind === "atom" && (
                  <div
                    className={getAtomCardClassName(currentAnnotationItem.atom)}
                    onClick={() => {
                      setSelectedAtomIndex(currentAnnotationItem.atom.atomIndex);
                      setSelectedBondIndex(null);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <h3>
                      Atom {currentAnnotationItem.atom.atomIndex + 1}:{" "}
                      {currentAnnotationItem.atom.element}
                    </h3>

                    {selectedAtomIndex === currentAnnotationItem.atom.atomIndex && (
                      <p className="selected-note">Selected atom</p>
                    )}

                    <p>
                      <strong>Hybridization:</strong>{" "}
                      {currentAnnotationItem.atom.hybridization}
                    </p>

                    {selectedConcept === "lonePairs" && (
                      <>
                        <p>
                          <strong>Lone pairs:</strong>{" "}
                          {currentAnnotationItem.atom.lonePairInfo.count}
                        </p>
                        <p>
                          <strong>Lone pair orbital:</strong>{" "}
                          {currentAnnotationItem.atom.lonePairInfo.orbital}
                        </p>
                        <p>
                          <strong>Resonance participation:</strong>{" "}
                          {currentAnnotationItem.atom.lonePairInfo.participatesInResonance
                            ? "Yes"
                            : "No"}
                        </p>
                        <p>{currentAnnotationItem.atom.lonePairInfo.explanation}</p>
                      </>
                    )}

                    {currentAnnotationItem.atom.siteTypes.length > 0 &&
                      selectedConcept !== "lonePairs" && (
                        <p>
                          <strong>Site type:</strong>{" "}
                          {currentAnnotationItem.atom.siteTypes.join(", ")}
                        </p>
                      )}

                    {selectedConcept !== "lonePairs" && (
                      <p>{currentAnnotationItem.atom.explanation}</p>
                    )}
                  </div>
                )}

                {currentAnnotationItem?.kind === "bond" && (
                  <div
                    className={getBondCardClassName(currentAnnotationItem.bond)}
                    onClick={() => {
                      setSelectedBondIndex(currentAnnotationItem.bond.bondIndex);
                      setSelectedAtomIndex(null);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <h3>
                      {currentAnnotationItem.bond.bondType} bond: Atom{" "}
                      {currentAnnotationItem.bond.atomIndices[0] + 1}–Atom{" "}
                      {currentAnnotationItem.bond.atomIndices[1] + 1}
                    </h3>

                    {selectedBondIndex === currentAnnotationItem.bond.bondIndex && (
                      <p className="selected-note">Selected bond</p>
                    )}

                    <p>
                      <strong>Sigma overlap:</strong>{" "}
                      {currentAnnotationItem.bond.sigmaOverlap}
                    </p>

                    {currentAnnotationItem.bond.piOverlap && (
                      <p>
                        <strong>Pi overlap:</strong>{" "}
                        {currentAnnotationItem.bond.piOverlap}
                      </p>
                    )}

                    <p>
                      <strong>Orbital info:</strong>{" "}
                      {currentAnnotationItem.bond.orbitalInfo.join(", ")}
                    </p>

                    <p>{currentAnnotationItem.bond.explanation}</p>
                  </div>
                )}

              {currentAnnotationItem?.kind === "resonance" && (
              <div className="annotation-card annotation-card-selected">
              <h3>{currentAnnotationItem.resonance.siteLabel}</h3>
              <p className="selected-note">Selected resonance system</p>

              <p>
                <strong>Type:</strong> {currentAnnotationItem.resonance.type}
              </p>

              <p>
                <strong>Strength:</strong>{" "}
                {currentAnnotationItem.resonance.stabilizationStrength}
              </p>

              <p>
                <strong>Highlighted resonance system:</strong>{" "}
                {[...currentAnnotationItem.resonance.matchedAtoms]
                  .sort((a, b) => a - b)
                  .map((atomIndex) => atomIndex + 1)
                  .join(", ")}
              </p>

              {currentAnnotationItem.resonance.possibleRadicalSites && (
                <p>
                  <strong>Possible charged/radical sites:</strong>{" "}
                  {[...currentAnnotationItem.resonance.possibleRadicalSites]
                    .sort((a, b) => a - b)
                    .map((atomIndex) => atomIndex + 1)
                    .join(", ")}
                </p>
              )}

              {currentAnnotationItem.resonance.resonanceBondIndices && (
                <p>
                  <strong>Resonance bonds:</strong>{" "}
                  {[...currentAnnotationItem.resonance.resonanceBondIndices]
                    .sort((a, b) => a - b)
                    .map((bondIndex) => bondIndex + 1)
                    .join(", ")}
                </p>
              )}

              <p>{currentAnnotationItem.resonance.explanation}</p>

              {currentAnnotationItem.resonance.forms.length > 0 && (
                <div>
                  <p>
                    <strong>Possible forms:</strong>
                  </p>

                  {currentAnnotationItem.resonance.forms.map((form) => (
                    <p key={form.label}>
                      <strong>{form.label}:</strong> {form.description}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentAnnotationItem?.kind === "chirality" && (
            <div className="annotation-card annotation-card-selected">
              <h3>
                Atom {currentAnnotationItem.chirality.atomIndex + 1}:{" "}
                {currentAnnotationItem.chirality.element}
              </h3>

              <p className="selected-note">Selected chiral center</p>

              <p>
                <strong>Configuration:</strong>{" "}
                {currentAnnotationItem.chirality.configuration === "unknown"
                  ? "Not assigned"
                  : currentAnnotationItem.chirality.configuration}
              </p>

              <p>
                <strong>Assignment source:</strong>{" "}
                {currentAnnotationItem.chirality.assignmentSource === "rdkit"
                  ? "Automatic Analysis"
                  : currentAnnotationItem.chirality.assignmentSource === "pocketchem-fallback"
                  ? "Manual Analysis"
                  : "Unassigned"}
              </p>

              {currentAnnotationItem.chirality.configuration === "unknown" && (
                <p className="empty">
                  Add wedge/dash bonds in Ketcher to specify stereochemistry for R/S assignment.
                </p>
              )}

              <p>
                <strong>Type:</strong> {currentAnnotationItem.chirality.label}
              </p>

              <p>{currentAnnotationItem.chirality.explanation}</p>

              <p>
              <strong>Why this is chiral:</strong>{" "}
              {currentAnnotationItem.chirality.whyChiralExplanation}
            </p>

            <p>
              <strong>How the configuration was assigned:</strong>{" "}
              {currentAnnotationItem.chirality.configurationExplanation}
            </p>
            </div>
          )}

          {currentAnnotationItem?.kind === "functionalGroup" && (
              <div className="annotation-card annotation-card-selected">
                <h3>{currentAnnotationItem.functionalGroup.groupName}</h3>

                <p className="selected-note">
                  Occurrence {currentAnnotationItem.functionalGroup.occurrence} /{" "}
                  {currentAnnotationItem.functionalGroup.totalOccurrences}
                </p>

                <p>
                  <strong>Confidence:</strong>{" "}
                  {currentAnnotationItem.functionalGroup.group.confidence}
                </p>

                <p>
                  <strong>Suffix:</strong>{" "}
                  {currentAnnotationItem.functionalGroup.group.suffix}
                </p>

                <p>
                  <strong>Prefix:</strong>{" "}
                  {currentAnnotationItem.functionalGroup.group.prefix}
                </p>

                <p>
                  <strong>Highlighted atoms:</strong>{" "}
                  {currentAnnotationItem.functionalGroup.atoms.join(", ")}
                </p>

                <p>{currentAnnotationItem.functionalGroup.group.mcatNote}</p>
              </div>
            )}
              </div>

              <button
                className="carousel-arrow"
                type="button"
                onClick={goToNextAnnotationCard}
                disabled={annotationCarouselItems.length <= 1}
                aria-label="Next annotation"
              >
                ›
              </button>
            </div>
          )}  
      </div>
    )}
  </div>



  {/* RESONANCE SECTION */}

  <div className="analysis-section">
    <p className="label">Resonance</p>

    {resonanceResults.length === 0 ? (
      <p className="empty">No major resonance pattern detected yet.</p>
    ) : (
      <div className="group-list">
        {resonanceResults.map((result, index) => (
          <div
            className="group-card"
            key={`${result.type}-${result.siteLabel}-${index}`}
          >
            <div className="group-card-header">
              <h3>{result.siteLabel}</h3>
              <span>{result.stabilizationStrength} resonance</span>
            </div>

            <p>
              <strong>Type:</strong> {result.type}
            </p>

            <p>
              <strong>Matched atoms:</strong>{" "}
              {[...result.matchedAtoms]
              .sort((a, b) => a - b)
              .map((atomIndex) => atomIndex + 1)
              .join(", ")}
            </p>

            {result.possibleRadicalSites && (
              <p>
                <strong>Possible radical sites:</strong>{" "}
                {result.possibleRadicalSites
                  .map((atomIndex) => atomIndex + 1)
                  .join(", ")}
              </p>
            )}

            <p>{result.explanation}</p>
          </div>
        ))}
      </div>
    )}
  </div>

  {/* ACIDITY AND BASICITY SECTION */}

        <div className="analysis-section">
          <p className="label">Acidity Estimate</p>

          {acidityResults.length === 0 ? (
            <p className="empty">No acidic sites estimated yet</p>
          ) : (
            <>
              <div className="group-card">
                <div className="group-card-header">
                  <h3>Strongest acidic site: {acidityResults[0].acidicSite}</h3>
                  <span>pKa {acidityResults[0].estimatedPka}</span>
                </div>

                <p>
                  <strong>Related group:</strong> {acidityResults[0].relatedGroup}
                </p>
                <p>
                  <strong>A — Atom:</strong> {acidityResults[0].atom}
                </p>
                <p>
                  <strong>R — Resonance:</strong> {acidityResults[0].resonance}
                </p>
                <p>
                  <strong>I — Induction:</strong> {acidityResults[0].induction}
                </p>
                <p>
                  <strong>O — Orbital:</strong> {acidityResults[0].orbital}
                </p>
                <p>{acidityResults[0].explanation}</p>
                {acidityResults[0].modifiers.length > 0 && (
                  <p>
                    <strong>pKa modifier:</strong> {acidityResults[0].modifiers.join(" ")}
                  </p>
                )}
              </div>

              {acidityResults.length > 1 && (
                <div className="group-list">
                  {acidityResults.slice(1).map((result) => (
                    <div className="group-card" key={result.relatedGroup}>
                      <div className="group-card-header">
                        <h3>Weaker acidic site: {result.acidicSite}</h3>
                        <span>pKa {result.estimatedPka}</span>
                      </div>

                      <p>
                        <strong>Related group:</strong> {result.relatedGroup}
                      </p>
                      <p>{result.explanation}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

  {/* BASICITY SECTION*/}

                <div className="analysis-section">
            <p className="label">Basicity Estimate</p>

            {basicityResults.length === 0 ? (
              <p className="empty">No basic sites estimated yet</p>
            ) : (
              <div className="group-list">
                {basicityResults.map((result, index) => (
                  <div
                    className="group-card"
                    key={`${result.relatedGroup}-${result.basicSite}-${index}`}
                  >
                    <div className="group-card-header">
                      <h3>{result.basicSite}</h3>
                      <span>conj. acid pKa {result.conjugateAcidPka}</span>
                    </div>

                    <p>
                      <strong>Related group:</strong> {result.relatedGroup}
                    </p>
                    <p>{result.explanation}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

  {/* COMPARISON SECTION */}

          <div className="analysis-section">
    <p className="label">Compare Molecules</p>

    <div className="button-row">
      <label>
        <input
          type="radio"
          name="rankingMode"
          value="acidity"
          checked={rankingMode === "acidity"}
          onChange={() => setRankingMode("acidity")}
        />
        Rank by acidity
      </label>

      <label>
        <input
          type="radio"
          name="rankingMode"
          value="basicity"
          checked={rankingMode === "basicity"}
          onChange={() => setRankingMode("basicity")}
        />
        Rank by basicity
      </label>

      <label>
        <input
          type="radio"
          name="rankingMode"
          value="anionStability"
          checked={rankingMode === "anionStability"}
          onChange={() => setRankingMode("anionStability")}
        />
        Rank by anion stability
      </label>
    </div>

    {comparisonMolecules.length === 0 ? (
      <p className="empty">Analyze molecules and add them to comparison.</p>
    ) : (
      <div className="group-list">
        {rankedComparison.map((molecule, index) => {
    const bestAcid = molecule.acidityResults[0];
    const bestBase = molecule.basicityResults[0];

    const hasRankableSite =
      rankingMode === "acidity" ? Boolean(bestAcid) : Boolean(bestBase);

    return (
            <div className="group-card" key={molecule.id}>
              <div className="group-card-header">
              <h3>
                {hasRankableSite ? `#${index + 1}: ${molecule.label}` : `Unranked: ${molecule.label}`}
              </h3>

                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => deleteComparisonMolecule(molecule.id)}
                >
                  Delete
                </button>
              </div>

              {molecule.structureSvg && (
                <div
                  className="molecule-preview"
                  dangerouslySetInnerHTML={{ __html: molecule.structureSvg }}
                />
              )}

            {hasRankableSite ? (
              rankingMode === "anionStability" ? (
                <p>
                  <strong>Stability basis:</strong>{" "}
                  {bestBase.relatedGroup}
                </p>
              ) : (
                <p>
                  <strong>
                    {rankingMode === "acidity"
                      ? "Estimated pKa:"
                      : "Conjugate acid pKa:"}
                  </strong>{" "}
                  {rankingMode === "acidity"
                    ? bestAcid.estimatedPka
                    : bestBase.conjugateAcidPka}
                </p>
              )
            ) : (
              <p className="empty">
                No{" "}
                {rankingMode === "acidity"
                  ? "acidic"
                  : rankingMode === "basicity"
                  ? "basic"
                  : "anion stability"}{" "}
                site detected for ranking.
              </p>
            )}

              <p>
                <strong>SMILES:</strong> {molecule.smiles}
              </p>

              {hasRankableSite ? (
                rankingMode === "acidity" ? (
                  <>
                    <p>
                      <strong>Strongest acidic site:</strong> {bestAcid.acidicSite}
                    </p>
                    <p>{bestAcid.explanation}</p>
                  </>
                ) : (
                  <>
                    <p>
                      <strong>Strongest basic site:</strong> {bestBase.basicSite}
                    </p>
                    <p>{bestBase.explanation}</p>
                  </>
                )
              ) : null}
            </div>


          );
        })}
      </div>
    )}
  </div>

  </div>

    
        </section> ) : (
    <ReactionsPage initialPathways={reactionPathways} />
  )}

      </main>
    );
  }

  export default App;