import type {
  EnvironmentProfile,
  SiteEnvironment,
} from "./environmentTypes";
import type {
  AcidBaseRuleKind,
  MatchedAcidBaseSite,
} from "./types";

type ProfileResolver = (
  site: MatchedAcidBaseSite,
  environment: SiteEnvironment
) => EnvironmentProfile;

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function shiftRange(
  range: readonly [number, number],
  delta: number
): readonly [number, number] {
  return [
    roundToTenth(range[0] + delta),
    roundToTenth(range[1] + delta),
  ];
}

function getDefaultProfile(site: MatchedAcidBaseSite): EnvironmentProfile {
  return {
    relatedGroup: site.rule.relatedGroup,
    pkaCenter: site.rule.pkaCenter,
    pkaRange: site.rule.pkaRange,
    confidence: site.rule.confidence,
    description: "",
  };
}

function getAlcoholAcidityProfile(
  _site: MatchedAcidBaseSite,
  environment: SiteEnvironment
): EnvironmentProfile {
  const count = environment.attachedCarbonSubstituentCount;

  if (count === 0) {
    return {
      relatedGroup: "Methanol",
      pkaCenter: 15.5,
      pkaRange: [15.2, 16],
      confidence: "Medium",
      description: "The carbon bearing OH has no carbon substituents.",
    };
  }

  if (count === 1) {
    return {
      relatedGroup: "Primary alcohol",
      pkaCenter: 16,
      pkaRange: [15.5, 16.8],
      confidence: "Medium",
      description: "The carbon bearing OH has one carbon substituent.",
    };
  }

  if (count === 2 && environment.isAttachedCarbonInRing) {
    return {
      relatedGroup: "Cyclic secondary alcohol",
      pkaCenter: 16.5,
      pkaRange: [15.8, 17.3],
      confidence: "Medium",
      description:
        "The carbon bearing OH is a ring carbon with two carbon neighbors.",
    };
  }

  if (count === 2) {
    return {
      relatedGroup: "Secondary alcohol",
      pkaCenter: 17,
      pkaRange: [16.2, 17.8],
      confidence: "Medium",
      description: "The carbon bearing OH has two carbon substituents.",
    };
  }

  return {
    relatedGroup: "Tertiary alcohol",
    pkaCenter: 18,
    pkaRange: [17, 19],
    confidence: "Medium",
    description: "The carbon bearing OH has three carbon substituents.",
  };
}

function getAmineAcidityProfile(
  _site: MatchedAcidBaseSite,
  environment: SiteEnvironment
): EnvironmentProfile {
  const count = environment.carbonNeighborCount;

  if (count === 0) {
    return {
      relatedGroup: "Ammonia",
      pkaCenter: 38,
      pkaRange: [36, 40],
      confidence: "Medium",
      description: "Nitrogen has no carbon substituents.",
    };
  }

  if (count === 1) {
    return {
      relatedGroup: "Primary amine",
      pkaCenter: 38.5,
      pkaRange: [36, 41],
      confidence: "Low",
      description: "Nitrogen has one carbon substituent.",
    };
  }

  return {
    relatedGroup: "Secondary amine",
    pkaCenter: 39.2,
    pkaRange: [37, 42],
    confidence: "Low",
    description: "Nitrogen has two carbon substituents and still bears N–H.",
  };
}

function getNitrileAlphaAcidityProfile(
  _site: MatchedAcidBaseSite,
  environment: SiteEnvironment
): EnvironmentProfile {
  const substitutionDelta = environment.siteCarbonSubstituentCount * 0.5;

  return {
    relatedGroup: "Carbon alpha to a nitrile",
    pkaCenter: roundToTenth(25 + substitutionDelta),
    pkaRange: shiftRange([23, 27], substitutionDelta),
    confidence: "Low",
    description: `The alpha carbon has ${environment.siteCarbonSubstituentCount} additional carbon substituent(s).`,
  };
}

function createCarbonylAlphaResolver(
  baseline: number,
  range: readonly [number, number],
  relatedGroup: string
): ProfileResolver {
  return (_site, environment) => {
    const substitutionDelta = environment.siteCarbonSubstituentCount * 0.4;

    return {
      relatedGroup,
      pkaCenter: roundToTenth(baseline + substitutionDelta),
      pkaRange: shiftRange(range, substitutionDelta),
      confidence: "Low",
      description: `The alpha carbon has ${environment.siteCarbonSubstituentCount} additional carbon substituent(s).`,
    };
  };
}

function getAlkaneAcidityProfile(
  _site: MatchedAcidBaseSite,
  environment: SiteEnvironment
): EnvironmentProfile {
  if (environment.isBenzylic) {
    return {
      relatedGroup: "Benzylic C–H",
      pkaCenter: 41,
      pkaRange: [38, 43],
      confidence: "Low",
      description:
        "Deprotonation gives a benzylic carbanion that can delocalize into the aromatic ring.",
    };
  }

  if (environment.isAllylic) {
    return {
      relatedGroup: "Allylic C–H",
      pkaCenter: 43,
      pkaRange: [40, 45],
      confidence: "Low",
      description:
        "Deprotonation gives an allylic carbanion stabilized by resonance.",
    };
  }

  const count = environment.siteCarbonSubstituentCount;
  const center = count === 0 ? 50 : count === 1 ? 50.5 : count === 2 ? 51.5 : 52.5;
  const label =
    count === 0
      ? "Methane C–H"
      : count === 1
      ? "Primary alkane C–H"
      : count === 2
      ? "Secondary alkane C–H"
      : "Tertiary alkane C–H";

  return {
    relatedGroup: label,
    pkaCenter: center,
    pkaRange: [roundToTenth(center - 2), roundToTenth(center + 2)],
    confidence: "Low",
    description: `Deprotonation gives a ${label
      .replace(" C–H", "")
      .toLowerCase()} carbanion environment.`,
  };
}

function getAliphaticAmineBasicityProfile(
  _site: MatchedAcidBaseSite,
  environment: SiteEnvironment
): EnvironmentProfile {
  const count = environment.carbonNeighborCount;

  if (count <= 1) {
    return {
      relatedGroup: "Primary amine",
      pkaCenter: 10.6,
      pkaRange: [9.5, 11.5],
      confidence: "Medium",
      description:
        "A primary amine has one carbon substituent donating electron density to nitrogen.",
    };
  }

  if (count === 2) {
    return {
      relatedGroup: environment.isSiteInRing
        ? "Cyclic secondary amine"
        : "Secondary amine",
      pkaCenter: environment.isSiteInRing ? 11.1 : 11,
      pkaRange: [10, 12],
      confidence: "Medium",
      description:
        "Two carbon substituents donate electron density while aqueous solvation remains favorable.",
    };
  }

  return {
    relatedGroup: "Tertiary amine",
    pkaCenter: 10.7,
    pkaRange: [9.5, 11.5],
    confidence: "Medium",
    description:
      "Three carbon substituents donate electron density, but steric effects and weaker aqueous solvation limit the increase in basicity.",
  };
}

function getAlkoxideBasicityProfile(
  site: MatchedAcidBaseSite,
  environment: SiteEnvironment
): EnvironmentProfile {
  const alcoholProfile = getAlcoholAcidityProfile(site, environment);

  return {
    ...alcoholProfile,
    relatedGroup: (alcoholProfile.relatedGroup ?? "Alcohol").replace(
      "alcohol",
      "alkoxide"
    ),
    description: `${alcoholProfile.description} The conjugate-acid pKa follows the corresponding alcohol environment.`,
  };
}

function getAlcoholBasicityProfile(
  _site: MatchedAcidBaseSite,
  environment: SiteEnvironment
): EnvironmentProfile {
  const count = environment.attachedCarbonSubstituentCount;
  const center = count === 0 ? -2.2 : count === 1 ? -2 : count === 2 ? -1.8 : -1.5;

  return {
    relatedGroup:
      count === 0
        ? "Methanol"
        : count === 1
        ? "Primary alcohol"
        : count === 2
        ? "Secondary alcohol"
        : "Tertiary alcohol",
    pkaCenter: center,
    pkaRange: [roundToTenth(center - 1), roundToTenth(center + 1)],
    confidence: "Low",
    description:
      "Alkyl substitution weakly increases oxygen electron density, but protonated alcohols remain strong acids and neutral alcohols remain weak bases.",
  };
}

function getCarbanionBasicityProfile(
  _site: MatchedAcidBaseSite,
  environment: SiteEnvironment
): EnvironmentProfile {
  const count = environment.carbonNeighborCount;
  const center = count === 0 ? 50 : count === 1 ? 50.5 : count === 2 ? 51.5 : 52.5;

  return {
    relatedGroup:
      count === 0
        ? "Methyl carbanion"
        : count === 1
        ? "Primary carbanion"
        : count === 2
        ? "Secondary carbanion"
        : "Tertiary carbanion",
    pkaCenter: center,
    pkaRange: [roundToTenth(center - 2), roundToTenth(center + 2)],
    confidence: "Low",
    description:
      "Additional alkyl substitution destabilizes localized negative charge on carbon, making the carbanion a stronger base.",
  };
}

function getNitrileBasicityProfile(
  _site: MatchedAcidBaseSite,
  environment: SiteEnvironment
): EnvironmentProfile {
  const isArylNitrile = environment.attachedCarbonHasAromaticNeighbor;

  return {
    relatedGroup: isArylNitrile ? "Aryl nitrile" : "Alkyl nitrile",
    pkaCenter: isArylNitrile ? -9 : -10,
    pkaRange: isArylNitrile ? [-11, -7] : [-12, -8],
    confidence: "Low",
    description:
      "The nitrile lone pair is held in an sp orbital; substitution changes this only modestly compared with the strong orbital effect.",
  };
}

const ACID_PROFILE_RESOLVERS: Readonly<Record<string, ProfileResolver>> = {
  "alcohol-oh": getAlcoholAcidityProfile,
  "amine-nh": getAmineAcidityProfile,
  "ammonia-nh": getAmineAcidityProfile,
  "nitrile-alpha-ch": getNitrileAlphaAcidityProfile,
  "ketone-aldehyde-alpha-ch": createCarbonylAlphaResolver(
    20,
    [18, 22],
    "Carbon alpha to an aldehyde or ketone"
  ),
  "ester-alpha-ch": createCarbonylAlphaResolver(
    25,
    [23, 27],
    "Carbon alpha to an ester"
  ),
  "amide-alpha-ch": createCarbonylAlphaResolver(
    30,
    [28, 32],
    "Carbon alpha to an amide"
  ),
  "alkane-ch": getAlkaneAcidityProfile,
};

const BASE_PROFILE_RESOLVERS: Readonly<Record<string, ProfileResolver>> = {
  "aliphatic-amine": getAliphaticAmineBasicityProfile,
  alkoxide: getAlkoxideBasicityProfile,
  "alcohol-base": getAlcoholBasicityProfile,
  "alkyl-carbanion": getCarbanionBasicityProfile,
  "nitrile-nitrogen": getNitrileBasicityProfile,
};

export function resolveSiteProfile(
  kind: AcidBaseRuleKind,
  site: MatchedAcidBaseSite,
  environment: SiteEnvironment
): EnvironmentProfile {
  const resolvers =
    kind === "acid" ? ACID_PROFILE_RESOLVERS : BASE_PROFILE_RESOLVERS;
  const resolver = resolvers[site.rule.id];

  return resolver?.(site, environment) ?? getDefaultProfile(site);
}