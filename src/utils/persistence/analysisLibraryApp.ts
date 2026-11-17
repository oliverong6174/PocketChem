/**
 * The app's Saved Analyses library with the validators of every page that can save into it:
 * Synthesis (Stage 8B-3A), Ranking and Spectroscopy (Stage 8B-3B-1), Properties and Reactions
 * (Stage 8B-3B-2), and the Multi-Catalytic workspace (Stage 9B-2B).
 */
import { CONFORMATIONS_ENGINE_VERSION, validateConformationsInputs, validateConformationsResults } from "./conformationsWorkspace";
import { GENCHEM_ENGINE_VERSION, validateGenChemInputs, validateGenChemResults } from "./generalChemWorkspace";
import {
  EQUILIBRIUM_ENGINE_VERSION, KINETICS_ENGINE_VERSION, THERMO_ENGINE_VERSION,
  validateEquilibriumInputs, validateEquilibriumResults, validateKineticsInputs, validateKineticsResults, validateThermoInputs, validateThermoResults,
} from "./generalChemTools";
import {
  ELECTROCHEM_ENGINE_VERSION, GASLAWS_ENGINE_VERSION, STOICHIOMETRY_ENGINE_VERSION, validateElectroInputs, validateGasInputs, validateGcResults22, validateStoichInputs,
} from "./gcTools22";
import {
  CIRCUITS_ENGINE_VERSION, COLLISIONS_ENGINE_VERSION, INTERFERENCE_ENGINE_VERSION, OPTICS_ENGINE_VERSION, WAVES_ENGINE_VERSION, ENERGY_ENGINE_VERSION, FORCES_ENGINE_VERSION, MECHANICS_ENGINE_VERSION, RC_ENGINE_VERSION,
  validateCircuitsInputs, validateCollisionsInputs, validateInterferenceInputs, validateOpticsInputs, validateWavesInputs, validateEnergyInputs, validateForcesInputs, validateMechanicsInputs, validatePhysicsResults, validateRcInputs,
} from "./physicsTools";
import {
  DOGMA_ENGINE_VERSION, REPLICATION_ENGINE_VERSION, TRANSCRIPTION_ENGINE_VERSION, TRANSLATION_ENGINE_VERSION,
  validateBiologyResults, validateDogmaInputs, validateReplicationInputs, validateTranscriptionInputs, validateTranslationInputs,
} from "./biologyTools";
import {
  CELLDIVISION_ENGINE_VERSION, GENETICS_ENGINE_VERSION, REGULATION_ENGINE_VERSION,
  validateCellDivisionInputs, validateGeneticsInputs, validateRegulationInputs,
} from "./biologyTools16";
import {
  MEMBRANE_ENGINE_VERSION, NEURON_ENGINE_VERSION, SIGNALING_ENGINE_VERSION, validateMembraneInputs, validateNeuronInputs, validateSignalingInputs,
} from "./biologyTools23";
import {
  AMINOACIDS_ENGINE_VERSION, ENZYMES_ENGINE_VERSION, PROTEINS_ENGINE_VERSION, validateAminoAcidsInputs, validateEnzymesInputs, validateProteinsInputs,
} from "./biochemTools17";
import {
  ETC_ENGINE_VERSION, GLUCONEOGENESIS_ENGINE_VERSION, GLYCOLYSIS_ENGINE_VERSION, METABOLISM_ENGINE_VERSION, TCA_ENGINE_VERSION,
  validateEtcInputs, validateGluconeogenesisInputs, validateGlycolysisInputs, validateMetabolismInputs, validateTcaInputs,
} from "./biochemTools18";
import { getAnalysisLibrary, registerAnalysisValidators, type AnalysisLibrary } from "./analysisLibrary";
import {
  MULTICATALYTIC_ENGINE_VERSION,
  validateMulticatalyticInputs,
  validateMulticatalyticResults,
} from "./multicatalyticWorkspace";
import { PROPERTIES_ENGINE_VERSION, validatePropertiesInputs, validatePropertiesResults } from "./propertiesWorkspace";
import { REACTIONS_ENGINE_VERSION, validateReactionsInputs, validateReactionsResults } from "./reactionsWorkspace";
import { RANKING_ENGINE_VERSION, validateRankingInputs, validateRankingResults } from "./rankingWorkspace";
import { SPECTROSCOPY_ENGINE_VERSION, validateSpectroscopyInputs, validateSpectroscopyResults } from "./spectroscopyWorkspace";
import {
  SYNTHESIS_ENGINE_VERSION,
  validateSynthesisInputs,
  validateSynthesisResults,
} from "./synthesisWorkspace";

/** Pages whose saved analyses can be opened again by this version. */
export const OPENABLE_ANALYSIS_PAGES = ["synthesis", "ranking", "spectroscopy", "properties", "reactions", "multicatalytic", "conformations", "genchem", "equilibrium", "kinetics", "thermo", "stoichiometry", "gaslaws", "electrochem", "mechanics", "circuits", "rc", "forces", "energy", "collisions", "waves", "optics", "interference", "replication", "transcription", "translation", "dogma", "regulation", "genetics", "celldivision", "membrane", "signaling", "neuron", "aminoacids", "proteins", "enzymes", "glycolysis", "gluconeogenesis", "tca", "etc", "metabolism"] as const;

/** The app page each saved analysis type opens on. */
export const ANALYSIS_APP_PAGE = {
  synthesis: "multiStep",
  ranking: "acidBase",
  spectroscopy: "spectroscopy",
  properties: "analysis",
  reactions: "reactions",
  multicatalytic: "multiCatalytic",
  conformations: "conformations",
  genchem: "gcAcidBase",
  equilibrium: "gcEquilibrium",
  kinetics: "gcKinetics",
  thermo: "gcThermo",
  stoichiometry: "gcStoichiometry",
  gaslaws: "gcGas",
  electrochem: "gcElectro",
  mechanics: "phMechanics",
  circuits: "phCircuits",
  rc: "phRc",
  forces: "phForces",
  energy: "phEnergy",
  collisions: "phCollisions",
  waves: "phWaves",
  optics: "phOptics",
  interference: "phInterference",
  replication: "bioReplication",
  transcription: "bioTranscription",
  translation: "bioTranslation",
  dogma: "bioDogma",
  regulation: "bioRegulation",
  genetics: "bioGenetics",
  celldivision: "bioDivision",
  membrane: "bioMembrane",
  signaling: "bioSignaling",
  neuron: "bioNeuron",
  aminoacids: "bcAminoAcids",
  proteins: "bcProteins",
  enzymes: "bcEnzymes",
  glycolysis: "bcGlycolysis",
  gluconeogenesis: "bcGluconeogenesis",
  tca: "bcTca",
  etc: "bcEtc",
  metabolism: "bcMetabolism",
} as const;

let registered = false;

export function getAppAnalysisLibrary(): AnalysisLibrary {
  if (!registered) {
    registerAnalysisValidators({
      synthesis: {
        engineVersion: SYNTHESIS_ENGINE_VERSION,
        validateInputs: validateSynthesisInputs,
        validateResults: validateSynthesisResults,
      },
      ranking: {
        engineVersion: RANKING_ENGINE_VERSION,
        validateInputs: validateRankingInputs,
        validateResults: validateRankingResults,
      },
      spectroscopy: {
        engineVersion: SPECTROSCOPY_ENGINE_VERSION,
        validateInputs: validateSpectroscopyInputs,
        validateResults: validateSpectroscopyResults,
      },
      properties: {
        engineVersion: PROPERTIES_ENGINE_VERSION,
        validateInputs: validatePropertiesInputs,
        validateResults: validatePropertiesResults,
      },
      reactions: {
        engineVersion: REACTIONS_ENGINE_VERSION,
        validateInputs: validateReactionsInputs,
        validateResults: validateReactionsResults,
      },
      conformations: {
        engineVersion: CONFORMATIONS_ENGINE_VERSION,
        validateInputs: validateConformationsInputs,
        validateResults: validateConformationsResults,
      },
      genchem: {
        engineVersion: GENCHEM_ENGINE_VERSION,
        validateInputs: validateGenChemInputs,
        validateResults: validateGenChemResults,
      },
      equilibrium: { engineVersion: EQUILIBRIUM_ENGINE_VERSION, validateInputs: validateEquilibriumInputs, validateResults: validateEquilibriumResults },
      kinetics: { engineVersion: KINETICS_ENGINE_VERSION, validateInputs: validateKineticsInputs, validateResults: validateKineticsResults },
      thermo: { engineVersion: THERMO_ENGINE_VERSION, validateInputs: validateThermoInputs, validateResults: validateThermoResults },
      stoichiometry: { engineVersion: STOICHIOMETRY_ENGINE_VERSION, validateInputs: validateStoichInputs, validateResults: validateGcResults22 },
      gaslaws: { engineVersion: GASLAWS_ENGINE_VERSION, validateInputs: validateGasInputs, validateResults: validateGcResults22 },
      electrochem: { engineVersion: ELECTROCHEM_ENGINE_VERSION, validateInputs: validateElectroInputs, validateResults: validateGcResults22 },
      mechanics: { engineVersion: MECHANICS_ENGINE_VERSION, validateInputs: validateMechanicsInputs, validateResults: validatePhysicsResults },
      circuits: { engineVersion: CIRCUITS_ENGINE_VERSION, validateInputs: validateCircuitsInputs, validateResults: validatePhysicsResults },
      rc: { engineVersion: RC_ENGINE_VERSION, validateInputs: validateRcInputs, validateResults: validatePhysicsResults },
      forces: { engineVersion: FORCES_ENGINE_VERSION, validateInputs: validateForcesInputs, validateResults: validatePhysicsResults },
      energy: { engineVersion: ENERGY_ENGINE_VERSION, validateInputs: validateEnergyInputs, validateResults: validatePhysicsResults },
      collisions: { engineVersion: COLLISIONS_ENGINE_VERSION, validateInputs: validateCollisionsInputs, validateResults: validatePhysicsResults },
      waves: { engineVersion: WAVES_ENGINE_VERSION, validateInputs: validateWavesInputs, validateResults: validatePhysicsResults },
      optics: { engineVersion: OPTICS_ENGINE_VERSION, validateInputs: validateOpticsInputs, validateResults: validatePhysicsResults },
      interference: { engineVersion: INTERFERENCE_ENGINE_VERSION, validateInputs: validateInterferenceInputs, validateResults: validatePhysicsResults },
      replication: { engineVersion: REPLICATION_ENGINE_VERSION, validateInputs: validateReplicationInputs, validateResults: validateBiologyResults },
      transcription: { engineVersion: TRANSCRIPTION_ENGINE_VERSION, validateInputs: validateTranscriptionInputs, validateResults: validateBiologyResults },
      translation: { engineVersion: TRANSLATION_ENGINE_VERSION, validateInputs: validateTranslationInputs, validateResults: validateBiologyResults },
      dogma: { engineVersion: DOGMA_ENGINE_VERSION, validateInputs: validateDogmaInputs, validateResults: validateBiologyResults },
      regulation: { engineVersion: REGULATION_ENGINE_VERSION, validateInputs: validateRegulationInputs, validateResults: validateBiologyResults },
      genetics: { engineVersion: GENETICS_ENGINE_VERSION, validateInputs: validateGeneticsInputs, validateResults: validateBiologyResults },
      celldivision: { engineVersion: CELLDIVISION_ENGINE_VERSION, validateInputs: validateCellDivisionInputs, validateResults: validateBiologyResults },
      membrane: { engineVersion: MEMBRANE_ENGINE_VERSION, validateInputs: validateMembraneInputs, validateResults: validateBiologyResults },
      signaling: { engineVersion: SIGNALING_ENGINE_VERSION, validateInputs: validateSignalingInputs, validateResults: validateBiologyResults },
      neuron: { engineVersion: NEURON_ENGINE_VERSION, validateInputs: validateNeuronInputs, validateResults: validateBiologyResults },
      aminoacids: { engineVersion: AMINOACIDS_ENGINE_VERSION, validateInputs: validateAminoAcidsInputs, validateResults: validateBiologyResults },
      proteins: { engineVersion: PROTEINS_ENGINE_VERSION, validateInputs: validateProteinsInputs, validateResults: validateBiologyResults },
      enzymes: { engineVersion: ENZYMES_ENGINE_VERSION, validateInputs: validateEnzymesInputs, validateResults: validateBiologyResults },
      glycolysis: { engineVersion: GLYCOLYSIS_ENGINE_VERSION, validateInputs: validateGlycolysisInputs, validateResults: validateBiologyResults },
      gluconeogenesis: { engineVersion: GLUCONEOGENESIS_ENGINE_VERSION, validateInputs: validateGluconeogenesisInputs, validateResults: validateBiologyResults },
      tca: { engineVersion: TCA_ENGINE_VERSION, validateInputs: validateTcaInputs, validateResults: validateBiologyResults },
      etc: { engineVersion: ETC_ENGINE_VERSION, validateInputs: validateEtcInputs, validateResults: validateBiologyResults },
      metabolism: { engineVersion: METABOLISM_ENGINE_VERSION, validateInputs: validateMetabolismInputs, validateResults: validateBiologyResults },
      multicatalytic: {
        engineVersion: MULTICATALYTIC_ENGINE_VERSION,
        validateInputs: validateMulticatalyticInputs,
        validateResults: validateMulticatalyticResults,
      },
    });
    registered = true;
  }
  return getAnalysisLibrary();
}
