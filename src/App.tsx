 import {
    getMoleculeAnnotation,
    getHighlightedMoleculeSvg,
    type AnnotationConcept,
    type MoleculeAnnotation,
  } from "./utils/moleculeAnnotation";
  import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
  } from "react";
  import MoleculeDrawer from "./components/MoleculeDrawer";
  import {
    analyzeFunctionalGroupHierarchy,
    flattenFunctionalGroupOccurrences,
    getRDKit,
    type FunctionalGroupResult,
    type FunctionalGroupOccurrence,
  } from "./utils/functionalGroups";
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

  import type { ReactionPathway } from "./utils/reactionUtils";

  import { initializeFunctionalGroups } from "./utils/functionalGroups/bootstrap";

  const ReactionsPage = lazy(() => import("./components/ReactionsPage"));
  const AcidBasePage = lazy(() => import("./components/AcidBasePage"));
  const SynthesisPage = lazy(() => import("./components/SynthesisPage"));
  const MultiCatalyticPage = lazy(() => import("./components/MultiCatalyticPage"));


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
    

  type AnalysisPanel = "overview" | "groups" | "concepts" | "properties";
  type AppPage = "analysis" | "acidBase" | "reactions" | "multiStep" | "multiCatalytic";

  const APP_PAGES: Array<{ id: AppPage; label: string }> = [
    { id: "analysis", label: "Analysis" },
    { id: "acidBase", label: "Acid/Base" },
    { id: "reactions", label: "Reactions" },
    { id: "multiStep", label: "Multi-Step" },
    { id: "multiCatalytic", label: "Multi-Catalytic" },
  ];

  const ANALYSIS_PANELS: Array<{ id: AnalysisPanel; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "groups", label: "Groups" },
    { id: "concepts", label: "Concepts" },
    { id: "properties", label: "Properties" },
  ];

  const CONCEPT_OPTIONS: Array<{ id: AnnotationConcept; label: string }> = [
    { id: "functionalGroups", label: "Functional Groups" },
    { id: "hybridization", label: "Hybridization" },
    { id: "bondOrbitals", label: "Bond Orbitals" },
    { id: "lonePairs", label: "Lone Pairs" },
    { id: "acidBaseSites", label: "Acid/Base Sites" },
    { id: "reactiveSites", label: "Reactive Sites" },
    { id: "resonance", label: "Resonance Sites" },
    { id: "chirality", label: "Chirality" },
  ];

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
    const [isMainEditorReady, setIsMainEditorReady] = useState(false);
    const [smiles, setSmiles] = useState("Not analyzed yet");
    const [status, setStatus] = useState("Draw a molecule first");
    const [, setMainGroup] = useState<FunctionalGroupResult | null>(
      null
    );
    const [functionalGroups, setFunctionalGroups] = useState<
      FunctionalGroupResult[]
    >([]);
    const [resonanceResults, setResonanceResults] = useState<ResonanceResult[]>([]);
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

    const [activePage, setActivePage] = useState<AppPage>("analysis");
    const [analysisPanel, setAnalysisPanel] = useState<AnalysisPanel>("overview");
    const [reactionPathways, setReactionPathways] = useState<ReactionPathway[]>([]);
    const appShellRef = useRef<HTMLElement | null>(null);

    const handleMainEditorReady = useCallback(() => {
      setIsMainEditorReady(true);
      window.setTimeout(() => {
        void getRDKit().catch((error) => {
          console.warn("RDKit warm-up was deferred after a load failure.", error);
        });
      }, 800);
    }, []);

    const scrollToAppTop = () => {
      const activeElement = document.activeElement as HTMLElement | null;
      activeElement?.blur?.();

      appShellRef.current?.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto",
      });

      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto",
      });

    };

    const switchPage = (page: AppPage) => {
      setActivePage(page);
    };

    const handlePageTabKeyDown = (
      event: ReactKeyboardEvent<HTMLButtonElement>,
      currentPage: AppPage,
    ) => {
      const currentIndex = APP_PAGES.findIndex((page) => page.id === currentPage);
      let nextIndex = currentIndex;

      if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % APP_PAGES.length;
      if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + APP_PAGES.length) % APP_PAGES.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = APP_PAGES.length - 1;
      if (nextIndex === currentIndex) return;

      event.preventDefault();
      const nextPage = APP_PAGES[nextIndex].id;
      switchPage(nextPage);
      requestAnimationFrame(() => {
        document.getElementById(`page-tab-${nextPage}`)?.focus();
      });
    };

    useLayoutEffect(() => {
      scrollToAppTop();
    }, [activePage]);

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
      if (analyzeInFlightRef.current) return;

      const editor = window.ketcher;
      if (!editor) {
        setStatus("The molecule editor is still loading.");
        return;
      }

      const runId = latestAnalyzeRunRef.current + 1;
      latestAnalyzeRunRef.current = runId;
      analyzeInFlightRef.current = true;
      setIsAnalyzing(true);
      setStatus("Reading the structure…");

      try {
        const [result, currentMolfile] = await Promise.all([
          editor.getSmiles(),
          editor.getMolfile(),
        ]);
        const safeSmiles = sanitizeDisplayedSmiles(result);

        if (!safeSmiles) {
          setSmiles("No molecule detected");
          setMolfile(null);
          setStatus("Draw a molecule before analyzing.");
          return;
        }

        const moleculeSource = currentMolfile || safeSmiles;
        setSmiles(safeSmiles);
        setMolfile(currentMolfile);
        setStatus("Finding groups, orbitals, and stereochemistry…");

        const [annotation, resonance, chirality, hierarchy] = await Promise.all([
          getMoleculeAnnotation(moleculeSource),
          analyzeResonance(moleculeSource),
          analyzeChirality(safeSmiles, currentMolfile),
          analyzeFunctionalGroupHierarchy(moleculeSource),
        ]);

        if (latestAnalyzeRunRef.current !== runId) return;

        const detectedFunctionalGroups = hierarchy.functionalGroups ?? [];
        setMoleculeAnnotation(annotation);
        setResonanceResults(resonance);
        setChiralityResults(chirality);
        setMainGroup(hierarchy.mainGroup ?? detectedFunctionalGroups[0] ?? null);
        setFunctionalGroups(detectedFunctionalGroups);
        setStatus("Calculating properties and supported reactions…");

        const [pathways, identity] = await Promise.all([
          import("./utils/reactionUtils").then(({ predictReactionPathways }) =>
            predictReactionPathways(safeSmiles, detectedFunctionalGroups),
          ),
          analyzeNomenclatureAndProperties(
            safeSmiles,
            hierarchy.primaryGroups,
            hierarchy.mainGroup,
          ).catch((nomenclatureError) => {
            console.error(
              "Nomenclature/property analysis failed:",
              nomenclatureError,
            );
            return null;
          }),
        ]);

        if (latestAnalyzeRunRef.current !== runId) return;

        setReactionPathways(pathways);
        setMoleculeIdentity(identity);
        setStatus("Analysis complete");
      } catch (error) {
        console.error("Analyze error:", error);
        if (latestAnalyzeRunRef.current === runId) {
          setStatus("Analysis failed. Check the structure and try again.");
        }
      } finally {
        if (latestAnalyzeRunRef.current === runId) {
          analyzeInFlightRef.current = false;
          setIsAnalyzing(false);
        }
      }
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

  const getVisibleAtomAnnotations = useCallback(() => {

    
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
  }, [moleculeAnnotation, selectedConcept, selectedHybridization]);

  const getVisibleBondAnnotations = useCallback(() => {
    if (!moleculeAnnotation) return [];

    if (selectedConcept === "bondOrbitals") {
      return moleculeAnnotation.bonds.filter((bond) => {
        if (selectedBondType === "all") return true;
        return bond.bondType === selectedBondType;
      });
    }

    return [];
  }, [moleculeAnnotation, selectedBondType, selectedConcept]);

  const getHighlightedAtomIndices = useCallback(() => {
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
  }, [
    chiralityResults,
    functionalGroupOccurrences,
    getVisibleAtomAnnotations,
    moleculeAnnotation,
    resonanceResults,
    selectedAtomIndex,
    selectedBondIndex,
    selectedConcept,
  ]);

  const getHighlightedBondIndices = useCallback(() => {
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
  }, [
    functionalGroupOccurrences,
    getVisibleBondAnnotations,
    resonanceResults,
    selectedBondIndex,
    selectedConcept,
  ]);

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
    selectedConcept,
    resonanceResults,
    chiralityResults,
    functionalGroupOccurrences,
    getVisibleAtomAnnotations,
    getVisibleBondAnnotations,
  ]);

  const currentAnnotationItem =
    annotationCarouselItems[annotationCardIndex] ?? null;

  const getSelectedFunctionalGroupAtomIndices = useCallback(() => {
    if (
      selectedConcept !== "functionalGroups" ||
      currentAnnotationItem?.kind !== "functionalGroup"
    ) { 
      return [];
    }

    return currentAnnotationItem.functionalGroup.atoms;
  }, [currentAnnotationItem, selectedConcept]);

  const getSelectedFunctionalGroupBondIndices = useCallback(() => {
    if (
      selectedConcept !== "functionalGroups" ||
      currentAnnotationItem?.kind !== "functionalGroup"
    ) {
      return [];
    }

    return currentAnnotationItem.functionalGroup.bonds;
  }, [currentAnnotationItem, selectedConcept]);

  const getSelectedResonanceAtomIndices = useCallback(() => {
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
  }, [currentAnnotationItem, selectedConcept]);

  const getSelectedResonanceBondIndices = useCallback(() => {
    if (
      selectedConcept !== "resonance" ||
      currentAnnotationItem?.kind !== "resonance"
    ) {
      return [];
    }

    return Array.from(
      new Set(currentAnnotationItem.resonance.resonanceBondIndices ?? [])
    );
  }, [currentAnnotationItem, selectedConcept]);

  const getSelectedChiralityAtomIndices = useCallback(() => {
    if (
      selectedConcept !== "chirality" ||
      currentAnnotationItem?.kind !== "chirality"
    ) {
      return [];
    }

    return [currentAnnotationItem.chirality.atomIndex];
  }, [currentAnnotationItem, selectedConcept]);

  useEffect(() => {
    let cancelled = false;

    const updateHighlightedSvg = async () => {
      if (!moleculeAnnotation || smiles === "Not analyzed yet") {
        if (!cancelled) setHighlightedMoleculeSvg(null);
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

      if (!cancelled) setHighlightedMoleculeSvg(svg);
    };

    void updateHighlightedSvg();

    return () => {
      cancelled = true;
    };
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
    getHighlightedAtomIndices,
    getHighlightedBondIndices,
    getSelectedChiralityAtomIndices,
    getSelectedFunctionalGroupAtomIndices,
    getSelectedFunctionalGroupBondIndices,
    getSelectedResonanceAtomIndices,
    getSelectedResonanceBondIndices,
  ]);

  useEffect(() => {
    initializeFunctionalGroups();
  }, []);

  useEffect(() => {
    const nextAtomIndex =
      currentAnnotationItem?.kind === "atom"
        ? currentAnnotationItem.atom.atomIndex
        : null;
    const nextBondIndex =
      currentAnnotationItem?.kind === "bond"
        ? currentAnnotationItem.bond.bondIndex
        : null;

    const frame = requestAnimationFrame(() => {
      setSelectedAtomIndex(nextAtomIndex);
      setSelectedBondIndex(nextBondIndex);
    });

    return () => cancelAnimationFrame(frame);
  }, [currentAnnotationItem]);

  const goToPreviousAnnotationCard = useCallback(() => {
    if (annotationCarouselItems.length === 0) return;

    setAnnotationCardIndex((currentIndex) =>
      currentIndex === 0 ? annotationCarouselItems.length - 1 : currentIndex - 1
    );
  }, [annotationCarouselItems.length]);

  const goToNextAnnotationCard = useCallback(() => {
    if (annotationCarouselItems.length === 0) return;

    setAnnotationCardIndex((currentIndex) =>
      currentIndex === annotationCarouselItems.length - 1 ? 0 : currentIndex + 1
    );
  }, [annotationCarouselItems.length]);

  {/* FAST MOLECULE NAVIGATION CLICKER */}

  const jumpToAnnotationItem = useCallback((kind: "atom" | "bond", index: number) => {

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
  }, [annotationCarouselItems, selectedConcept]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnnotationCardIndex(0));
    return () => cancelAnimationFrame(frame);
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
  }, [
    annotationCarouselItems.length,
    goToNextAnnotationCard,
    goToPreviousAnnotationCard,
  ]);

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
  }, [highlightedMoleculeSvg, annotationCarouselItems, jumpToAnnotationItem]);

  const renderCurrentAnnotationCard = () => {
    if (!currentAnnotationItem) return null;

    if (currentAnnotationItem.kind === "atom") {
      return (
        <div
          className={getAtomCardClassName(currentAnnotationItem.atom)}
          onClick={() => {
            setSelectedAtomIndex(currentAnnotationItem.atom.atomIndex);
            setSelectedBondIndex(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setSelectedAtomIndex(currentAnnotationItem.atom.atomIndex);
            setSelectedBondIndex(null);
          }}
          role="button"
          tabIndex={0}
        >
          <h3>
            Atom {currentAnnotationItem.atom.atomIndex + 1}: {" "}
            {currentAnnotationItem.atom.element}
          </h3>

          {selectedAtomIndex === currentAnnotationItem.atom.atomIndex && (
            <p className="selected-note">Selected atom</p>
          )}

          <p>
            <strong>Hybridization:</strong> {" "}
            {currentAnnotationItem.atom.hybridization}
          </p>

          {selectedConcept === "lonePairs" && (
            <>
              <p>
                <strong>Lone pairs:</strong> {" "}
                {currentAnnotationItem.atom.lonePairInfo.count}
              </p>
              <p>
                <strong>Lone pair orbital:</strong> {" "}
                {currentAnnotationItem.atom.lonePairInfo.orbital}
              </p>
              <p>
                <strong>Resonance participation:</strong> {" "}
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
                <strong>Site type:</strong> {" "}
                {currentAnnotationItem.atom.siteTypes.join(", ")}
              </p>
            )}

          {selectedConcept !== "lonePairs" && (
            <p>{currentAnnotationItem.atom.explanation}</p>
          )}
        </div>
      );
    }

    if (currentAnnotationItem.kind === "bond") {
      return (
        <div
          className={getBondCardClassName(currentAnnotationItem.bond)}
          onClick={() => {
            setSelectedBondIndex(currentAnnotationItem.bond.bondIndex);
            setSelectedAtomIndex(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            setSelectedBondIndex(currentAnnotationItem.bond.bondIndex);
            setSelectedAtomIndex(null);
          }}
          role="button"
          tabIndex={0}
        >
          <h3>
            {currentAnnotationItem.bond.bondType} bond: Atom {" "}
            {currentAnnotationItem.bond.atomIndices[0] + 1}–Atom {" "}
            {currentAnnotationItem.bond.atomIndices[1] + 1}
          </h3>

          {selectedBondIndex === currentAnnotationItem.bond.bondIndex && (
            <p className="selected-note">Selected bond</p>
          )}

          <p>
            <strong>Sigma overlap:</strong> {" "}
            {currentAnnotationItem.bond.sigmaOverlap}
          </p>

          {currentAnnotationItem.bond.piOverlap && (
            <p>
              <strong>Pi overlap:</strong> {" "}
              {currentAnnotationItem.bond.piOverlap}
            </p>
          )}

          <p>
            <strong>Orbital info:</strong> {" "}
            {currentAnnotationItem.bond.orbitalInfo.join(", ")}
          </p>

          <p>{currentAnnotationItem.bond.explanation}</p>
        </div>
      );
    }

    if (currentAnnotationItem.kind === "chirality") {
      return (
        <div className="annotation-card annotation-card-selected">
          <h3>
            Atom {currentAnnotationItem.chirality.atomIndex + 1}: {" "}
            {currentAnnotationItem.chirality.element}
          </h3>

          <p className="selected-note">Selected chiral center</p>

          <p>
            <strong>Configuration:</strong> {" "}
            {currentAnnotationItem.chirality.configuration === "unknown"
              ? "Not assigned"
              : currentAnnotationItem.chirality.configuration}
          </p>

          <p>
            <strong>Assignment source:</strong> {" "}
            {currentAnnotationItem.chirality.assignmentSource === "rdkit"
              ? "Automatic Analysis"
              : currentAnnotationItem.chirality.assignmentSource ===
                "pocketchem-fallback"
              ? "Manual Analysis"
              : "Unassigned"}
          </p>

          {currentAnnotationItem.chirality.configuration === "unknown" && (
            <p className="empty">
              Add wedge/dash bonds in Ketcher to specify stereochemistry for R/S
              assignment.
            </p>
          )}

          <p>
            <strong>Type:</strong> {currentAnnotationItem.chirality.label}
          </p>

          <p>{currentAnnotationItem.chirality.explanation}</p>

          <p>
            <strong>Why this is chiral:</strong> {" "}
            {currentAnnotationItem.chirality.whyChiralExplanation}
          </p>

          <p>
            <strong>How the configuration was assigned:</strong> {" "}
            {currentAnnotationItem.chirality.configurationExplanation}
          </p>
        </div>
      );
    }

    if (currentAnnotationItem.kind === "functionalGroup") {
      return (
        <div className="annotation-card annotation-card-selected">
          <h3>{currentAnnotationItem.functionalGroup.groupName}</h3>

          <p className="selected-note">
            Occurrence {currentAnnotationItem.functionalGroup.occurrence} / {" "}
            {currentAnnotationItem.functionalGroup.totalOccurrences}
          </p>

          <p>
            <strong>Confidence:</strong> {" "}
            {currentAnnotationItem.functionalGroup.group.confidence}
          </p>

          <p>
            <strong>Suffix:</strong> {" "}
            {currentAnnotationItem.functionalGroup.group.suffix}
          </p>

          <p>
            <strong>Prefix:</strong> {" "}
            {currentAnnotationItem.functionalGroup.group.prefix}
          </p>

          <p>
            <strong>Highlighted atoms:</strong> {" "}
            {currentAnnotationItem.functionalGroup.atoms
              .map((atomIndex) => atomIndex + 1)
              .join(", ")}
          </p>

          <p>{currentAnnotationItem.functionalGroup.group.mcatNote}</p>
        </div>
      );
    }

    return null;
  };

  const clearAnalysis = () => {
    analyzeInFlightRef.current = false;
    latestAnalyzeRunRef.current += 1;
    setIsAnalyzing(false);

    setSmiles("Not analyzed yet");
    setStatus("Draw a molecule first");
    setMainGroup(null);
    setFunctionalGroups([]);
    setResonanceResults([]);
    setChiralityResults([]);
    setReactionPathways([]);
    setActivePage("analysis");
    setAnalysisPanel("overview");
    setMoleculeAnnotation(null);
    setSelectedAtomIndex(null);
    setSelectedBondIndex(null);
    setMolfile(null);
    setMoleculeIdentity(null);
  };

  {/*RETURN STATEMENT*/}

  return (
    <main className="app" ref={appShellRef}>
      <a className="skip-link" href="#page-panel-analysis">
        Skip to molecule workspace
      </a>

      <header className="hero">
        <div>
          <div className="brand-row">
            <h1>PocketChem</h1>
            <p className="eyebrow">Organic chemistry workspace</p>
          </div>
          <p className="subtitle">
            Draw, analyze, compare, and predict reactions in one workspace.
          </p>
        </div>
      </header>

      <nav className="page-tabs" aria-label="PocketChem tools" role="tablist">
        {APP_PAGES.map((page) => (
          <button
            aria-controls={`page-panel-${page.id}`}
            aria-selected={activePage === page.id}
            className={activePage === page.id ? "page-tab active" : "page-tab"}
            id={`page-tab-${page.id}`}
            key={page.id}
            onClick={() => switchPage(page.id)}
            onKeyDown={(event) => handlePageTabKeyDown(event, page.id)}
            role="tab"
            tabIndex={activePage === page.id ? 0 : -1}
            type="button"
          >
            {page.label}
          </button>
        ))}
      </nav>

      {activePage === "analysis" ? (
        <section
          aria-labelledby="page-tab-analysis"
          className="workspace workspace-compact"
          id="page-panel-analysis"
          role="tabpanel"
        >
          <div className="card molecule-card molecule-card-compact">
            <div className="card-header">
              <div>
                <h2>Molecule Drawer</h2>
                <p>Draw a molecule, then click Analyze Molecule.</p>
              </div>
              <span className={`status ${isMainEditorReady ? "ready" : "loading"}`}>
                {isMainEditorReady ? "Editor ready" : "Loading editor"}
              </span>
            </div>

            <div className="drawer-placeholder drawer-placeholder-compact">
              <MoleculeDrawer onReady={handleMainEditorReady} />
            </div>

            <div className="button-row">
              <button
                className="primary-button"
                onClick={analyzeMolecule}
                disabled={isAnalyzing || !isMainEditorReady}
                type="button"
              >
                {isAnalyzing ? "Analyzing…" : "Analyze Molecule"}
              </button>

              <button
                className="secondary-button"
                onClick={clearAnalysis}
                disabled={isAnalyzing}
                type="button"
              >
                Clear Analysis
              </button>
            </div>
          </div>

          <div className="card analysis-card analysis-dashboard-card">
            <div className="dashboard-header">
              <div>
                <h2>Analysis Dashboard</h2>
                <p>
                  {moleculeIdentity
                    ? moleculeIdentity.nomenclature.displayName ||
                      moleculeIdentity.nomenclature.estimatedName
                    : "Analyze a molecule to fill this dashboard."}
                </p>
              </div>

              <span className="status">
                {functionalGroupOccurrences.length} group
                {functionalGroupOccurrences.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="dashboard-mini-grid">
              <div>
                <p className="label">Status</p>
                <strong aria-live="polite">{status}</strong>
              </div>

              <div>
                <p className="label">Formula</p>
                <strong>
                  {moleculeIdentity?.properties.molecularFormula ?? "—"}
                </strong>
              </div>

              <div>
                <p className="label">DBE</p>
                <strong>
                  {moleculeIdentity?.properties.degreesOfUnsaturation ?? "—"}
                </strong>
              </div>

              <div>
                <p className="label">Reactions</p>
                <strong>{reactionPathways.length}</strong>
              </div>
            </div>

            <div className="dashboard-tab-row">
              {ANALYSIS_PANELS.map((panel) => (
                <button
                  aria-pressed={analysisPanel === panel.id}
                  key={panel.id}
                  className={
                    analysisPanel === panel.id
                      ? "dashboard-tab active"
                      : "dashboard-tab"
                  }
                  onClick={() => setAnalysisPanel(panel.id)}
                  type="button"
                >
                  {panel.label}
                </button>
              ))}
            </div>

            <div className="dashboard-panel-scroll">
              {analysisPanel === "overview" && (
                <div className="dashboard-panel">
                  <div className="analysis-section compact-section">
                    <p className="label">SMILES</p>
                    <p className="smiles-output">{smiles}</p>
                  </div>

                  <div className="analysis-section compact-section">
                    <p className="label">Identity</p>

                    {!moleculeIdentity ? (
                      <p className="empty">
                        Analyze a molecule to estimate its name, formula, DBE,
                        and molecular properties.
                      </p>
                    ) : (
                      <div className="group-card">
                        <div className="group-card-header">
                          <h3>
                            {moleculeIdentity.nomenclature.displayName ||
                              moleculeIdentity.nomenclature.estimatedName}
                          </h3>
                          <span>
                            {moleculeIdentity.nomenclature.namingConfidence} {" "}
                            confidence
                          </span>
                        </div>

                        {moleculeIdentity.nomenclature.commonName && (
                          <p>
                            <strong>Common name:</strong> {" "}
                            {moleculeIdentity.nomenclature.commonName}
                          </p>
                        )}

                        <p>
                          <strong>Main suffix:</strong> {" "}
                          {moleculeIdentity.nomenclature.mainSuffix ??
                            "Hydrocarbon / no suffix group detected"}
                        </p>

                        <p>{moleculeIdentity.nomenclature.explanation}</p>
                      </div>
                    )}
                  </div>

                  <div className="analysis-section compact-section">
                    <p className="label">Quick Counts</p>

                    <div className="property-grid compact-properties">
                      <PropertyTile
                        label="Functional groups"
                        value={functionalGroupOccurrences.length}
                        info="Number of detected functional-group occurrences."
                      />

                      <PropertyTile
                        label="Chiral centers"
                        value={chiralityResults.length}
                        info="Possible stereocenters detected from the structure."
                      />

                      <PropertyTile
                        label="H-bond donors"
                        value={
                          moleculeIdentity?.properties.hydrogenBondDonors ?? "N/A"
                        }
                        info={PROPERTY_INFO.hbd}
                      />

                      <PropertyTile
                        label="H-bond acceptors"
                        value={
                          moleculeIdentity?.properties.hydrogenBondAcceptors ??
                          "N/A"
                        }
                        info={PROPERTY_INFO.hba}
                      />
                    </div>
                  </div>
                </div>
              )}

              {analysisPanel === "groups" && (
                <div className="dashboard-panel">
                  <div className="analysis-section compact-section">
                    <p className="label">Functional Groups</p>

                    {functionalGroupOccurrences.length === 0 ? (
                      <p className="empty">
                        No functional groups detected yet. Analyze a molecule
                        first.
                      </p>
                    ) : (
                      <div className="group-list compact-group-list">
                        {functionalGroupOccurrences.map((occurrence) => (
                          <div
                            className="group-card"
                            key={`${occurrence.groupName}-${occurrence.occurrence}`}
                          >
                            <div className="group-card-header">
                              <h3>{occurrence.groupName}</h3>
                              <span>{occurrence.group.confidence}</span>
                            </div>

                            <p>
                              <strong>Occurrence:</strong> {" "}
                              {occurrence.occurrence} / {" "}
                              {occurrence.totalOccurrences}
                            </p>

                            <p>
                              <strong>Suffix:</strong> {occurrence.group.suffix}
                            </p>

                            <p>
                              <strong>Prefix:</strong> {occurrence.group.prefix}
                            </p>

                            <p>{occurrence.group.mcatNote}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {analysisPanel === "concepts" && (
                <div className="dashboard-panel">
                  <div className="analysis-section compact-section">
                    <p className="label">Concept View</p>

                    <div className="concept-button-row compact-concept-grid">
                      {CONCEPT_OPTIONS.map((concept) => (
                        <button
                          aria-pressed={selectedConcept === concept.id}
                          key={concept.id}
                          className={
                            selectedConcept === concept.id
                              ? "concept-button active"
                              : "concept-button"
                          }
                          onClick={() => {
                            setSelectedConcept(concept.id);
                            setSelectedAtomIndex(null);
                            setSelectedBondIndex(null);
                          }}
                          type="button"
                        >
                          {concept.label}
                        </button>
                      ))}
                    </div>

                    {selectedConcept === "hybridization" && (
                      <div className="concept-subfilter-row">
                        {(["all", "sp", "sp2", "sp3"] as const).map(
                          (hybridization) => (
                            <button
                              aria-pressed={selectedHybridization === hybridization}
                              key={hybridization}
                              className={
                                selectedHybridization === hybridization
                                  ? "concept-subfilter-button active"
                                  : "concept-subfilter-button"
                              }
                              onClick={() =>
                                setSelectedHybridization(hybridization)
                              }
                              type="button"
                            >
                              {hybridization === "all" ? "All" : hybridization}
                            </button>
                          )
                        )}
                      </div>
                    )}

                    {selectedConcept === "bondOrbitals" && (
                      <div className="concept-subfilter-row">
                        {(["all", "single", "double", "triple"] as const).map(
                          (bondType) => (
                            <button
                              aria-pressed={selectedBondType === bondType}
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
                        <p className="annotation-summary">
                          Highlighted molecule preview:
                        </p>

                        <div className="highlight-preview">
                          <div
                            ref={highlightedSvgRef}
                            className="highlighted-molecule-svg"
                            dangerouslySetInnerHTML={{
                              __html: highlightedMoleculeSvg,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {!moleculeAnnotation ? (
                      <p className="empty">
                        Analyze a molecule to see concept annotations.
                      </p>
                    ) : (
                      <div className="annotation-list">
                        {selectedConcept === "hybridization" && (
                          <p className="annotation-summary">
                            Showing {" "}
                            {selectedHybridization === "all"
                              ? "all hybridized atoms"
                              : `${selectedHybridization} atoms`}
                            .
                          </p>
                        )}

                        {selectedConcept === "bondOrbitals" && (
                          <p className="annotation-summary">
                            Showing {" "}
                            {selectedBondType === "all"
                              ? "all bond orbital overlaps"
                              : `${selectedBondType} bond orbital overlaps`}
                            .
                          </p>
                        )}

                        {selectedConcept === "resonance" && (
                          <p className="annotation-summary">
                            Showing atoms or bonds that can participate in resonance, conjugation, or
                            electron delocalization.
                          </p>
                        )}

                        {selectedConcept === "chirality" && (
                          <p className="annotation-summary">
                            Showing possible chiral centers. Specific R/S
                            assignment requires wedge/dash stereochemistry.
                          </p>
                        )}

                        {annotationCarouselItems.length === 0 ? (
                          <p className="empty">
                            No annotations found for this concept yet.
                          </p>
                        ) : (
                          <div className="annotation-carousel compact-carousel">
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
                                Card {annotationCardIndex + 1} of {" "}
                                {annotationCarouselItems.length}
                              </p>

                              {renderCurrentAnnotationCard()}
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
                </div>
              )}

              {analysisPanel === "properties" && (
                <div className="dashboard-panel">
                  <div className="analysis-section compact-section">
                    <p className="label">Nomenclature & Core Properties</p>

                    {!moleculeIdentity ? (
                      <p className="empty">
                        Analyze a molecule to estimate its name, formula, DBE,
                        and molecular properties.
                      </p>
                    ) : (
                      <div className="group-list">
                        <div className="group-card">
                          <div className="group-card-header">
                            <h3>
                              {moleculeIdentity.nomenclature.displayName ||
                                moleculeIdentity.nomenclature.estimatedName}
                            </h3>

                            <span>
                              {moleculeIdentity.nomenclature.namingConfidence} {" "}
                              confidence
                            </span>
                          </div>

                          {moleculeIdentity.nomenclature.commonName && (
                            <p>
                              <strong>Common name:</strong> {" "}
                              {moleculeIdentity.nomenclature.commonName}
                            </p>
                          )}

                          <p>
                            <strong>Parent chain:</strong> {" "}
                            {moleculeIdentity.nomenclature.parentChain ??
                              "Not assigned"}
                            {moleculeIdentity.nomenclature.parentChainLength > 0
                              ? ` (${moleculeIdentity.nomenclature.parentChainLength} C)`
                              : ""}
                          </p>

                          <p>
                            <strong>Main suffix:</strong> {" "}
                            {moleculeIdentity.nomenclature.mainSuffix ??
                              "Hydrocarbon / no suffix group detected"}
                          </p>

                          {moleculeIdentity.nomenclature.prefixes.length > 0 && (
                            <p>
                              <strong>Detected prefixes:</strong> {" "}
                              {moleculeIdentity.nomenclature.prefixes.join(", ")}
                            </p>
                          )}

                          <p>{moleculeIdentity.nomenclature.explanation}</p>

                          <div className="limitation-list">
                            {moleculeIdentity.nomenclature.limitations.map(
                              (limitation) => (
                                <p className="empty" key={limitation}>
                                  {limitation}
                                </p>
                              )
                            )}
                          </div>
                        </div>

                        <div className="property-grid compact-properties">
                          <PropertyTile
                            label="Formula"
                            value={moleculeIdentity.properties.molecularFormula}
                            info={PROPERTY_INFO.formula}
                          />

                          <PropertyTile
                            label="DBE / unsaturation"
                            value={
                              moleculeIdentity.properties
                                .degreesOfUnsaturation ?? "N/A"
                            }
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
                            value={
                              moleculeIdentity.properties.waterSolubilityTendency
                                .level
                            }
                            info={PROPERTY_INFO.waterSolubility}
                          />

                          <PropertyTile
                            label="Membrane permeability"
                            value={
                              moleculeIdentity.properties
                                .membranePermeabilityTendency.level
                            }
                            info={PROPERTY_INFO.membranePermeability}
                          />

                          <PropertyTile
                            label="Boiling point tendency"
                            value={
                              moleculeIdentity.properties.boilingPointTendency
                                .level
                            }
                            info={PROPERTY_INFO.boilingPoint}
                          />

                          <PropertyTile
                            label="Volatility"
                            value={
                              moleculeIdentity.properties.volatilityTendency.level
                            }
                            info={PROPERTY_INFO.volatility}
                          />

                          <PropertyTile
                            label="H-bond donors"
                            value={
                              moleculeIdentity.properties.hydrogenBondDonors ??
                              "N/A"
                            }
                            info={PROPERTY_INFO.hbd}
                          />

                          <PropertyTile
                            label="H-bond acceptors"
                            value={
                              moleculeIdentity.properties.hydrogenBondAcceptors ??
                              "N/A"
                            }
                            info={PROPERTY_INFO.hba}
                          />

                          <PropertyTile
                            label="Rotatable bonds"
                            value={
                              moleculeIdentity.properties.rotatableBonds ?? "N/A"
                            }
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
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section
          aria-labelledby={`page-tab-${activePage}`}
          className="page-panel"
          id={`page-panel-${activePage}`}
          role="tabpanel"
        >
          <Suspense fallback={<div className="card page-loading" role="status"><span className="loading-spinner" aria-hidden="true" />Loading tool…</div>}>
            {activePage === "acidBase" ? (
              <AcidBasePage />
            ) : activePage === "reactions" ? (
              <ReactionsPage initialPathways={reactionPathways} />
            ) : activePage === "multiStep" ? (
              <SynthesisPage />
            ) : (
              <MultiCatalyticPage />
            )}
          </Suspense>
        </section>
      )}
    </main>
  );
}

export default App;