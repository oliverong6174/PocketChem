const COMMON_NAME_MAP: Record<string, string> = {
    // ----------------------------
    // Carboxylic acids
    // ----------------------------
    "methanoic acid": "formic acid",
    "ethanoic acid": "acetic acid",
    "propanoic acid": "propionic acid",
    "butanoic acid": "butyric acid",
    "pentanoic acid": "valeric acid",
    "hexanoic acid": "caproic acid",
    "heptanoic acid": "enanthic acid",
    "octanoic acid": "caprylic acid",
    "nonanoic acid": "pelargonic acid",
    "decanoic acid": "capric acid",
    "dodecanoic acid": "lauric acid",
    "tetradecanoic acid": "myristic acid",
    "hexadecanoic acid": "palmitic acid",
    "octadecanoic acid": "stearic acid",

    // Unsaturated fatty acids
    "octadec-9-enoic acid": "oleic acid",
    "octadeca-9,12-dienoic acid": "linoleic acid",
    "octadeca-9,12,15-trienoic acid": "linolenic acid",
    "eicosanoic acid": "arachidic acid",
    "eicosa-5,8,11,14-tetraenoic acid": "arachidonic acid",

    // Dicarboxylic acids
    "ethanedioic acid": "oxalic acid",
    "propanedioic acid": "malonic acid",
    "butanedioic acid": "succinic acid",
    "pentanedioic acid": "glutaric acid",
    "hexanedioic acid": "adipic acid",
    "heptanedioic acid": "pimelic acid",
    "octanedioic acid": "suberic acid",
    "nonanedioic acid": "azelaic acid",
    "decanedioic acid": "sebacic acid",

    // Hydroxy acids / keto acids
    "2-hydroxypropanoic acid": "lactic acid",
    "2-hydroxybutanedioic acid": "malic acid",
    "2,3-dihydroxybutanedioic acid": "tartaric acid",
    "2-hydroxypropane-1,2,3-tricarboxylic acid": "citric acid",
    "2-oxopropanoic acid": "pyruvic acid",
    "2-oxobutanedioic acid": "oxaloacetic acid",
    "2-oxopentanedioic acid": "alpha-ketoglutaric acid",

    // Aromatic acids
    "benzenecarboxylic acid": "benzoic acid",
    "2-hydroxybenzoic acid": "salicylic acid",
    "4-hydroxybenzoic acid": "p-hydroxybenzoic acid",
    "benzene-1,2-dicarboxylic acid": "phthalic acid",
    "benzene-1,3-dicarboxylic acid": "isophthalic acid",
    "benzene-1,4-dicarboxylic acid": "terephthalic acid",

    // ----------------------------
    // Carboxylates
    // ----------------------------
    "methanoate": "formate",
    "ethanoate": "acetate",
    "propanoate": "propionate",
    "butanoate": "butyrate",
    "pentanoate": "valerate",
    "hexanoate": "caproate",
    "benzoate": "benzoate",
    "2-hydroxypropanoate": "lactate",
    "2-oxopropanoate": "pyruvate",
    "ethanedioate": "oxalate",
    "propanedioate": "malonate",
    "butanedioate": "succinate",
    "pentanedioate": "glutarate",
    "hexanedioate": "adipate",

    // ----------------------------
    // Aldehydes
    // ----------------------------
    "methanal": "formaldehyde",
    "ethanal": "acetaldehyde",
    "propanal": "propionaldehyde",
    "butanal": "butyraldehyde",
    "pentanal": "valeraldehyde",
    "hexanal": "caproaldehyde",
    "benzaldehyde": "benzaldehyde",
    "2-hydroxybenzaldehyde": "salicylaldehyde",
    "4-hydroxybenzaldehyde": "p-hydroxybenzaldehyde",
    "2-oxopropanedial": "mesoxaldehyde",

    // ----------------------------
    // Ketones
    // ----------------------------
    "propanone": "acetone",
    "butanone": "methyl ethyl ketone",
    "pentan-2-one": "methyl propyl ketone",
    "pentan-3-one": "diethyl ketone",
    "hexan-2-one": "methyl butyl ketone",
    "hexan-3-one": "ethyl propyl ketone",
    "cyclohexanone": "cyclohexanone",
    "phenylethanone": "acetophenone",
    "1-phenylethanone": "acetophenone",
    "diphenylmethanone": "benzophenone",

    // ----------------------------
    // Alcohols
    // ----------------------------
    "methanol": "methyl alcohol",
    "ethanol": "ethyl alcohol",
    "propanol": "propyl alcohol",
    "propan-1-ol": "n-propyl alcohol",
    "propan-2-ol": "isopropyl alcohol",
    "butanol": "butyl alcohol",
    "butan-1-ol": "n-butyl alcohol",
    "butan-2-ol": "sec-butyl alcohol",
    "2-methylpropan-1-ol": "isobutyl alcohol",
    "2-methylpropan-2-ol": "tert-butyl alcohol",
    "ethane-1,2-diol": "ethylene glycol",
    "propane-1,2-diol": "propylene glycol",
    "propane-1,2,3-triol": "glycerol",
    "cyclohexanol": "cyclohexanol",
    "phenylmethanol": "benzyl alcohol",

    // ----------------------------
    // Phenols / aromatic alcohol-like compounds
    // ----------------------------
    "hydroxybenzene": "phenol",
    "methylphenol": "cresol",
    "2-methylphenol": "o-cresol",
    "3-methylphenol": "m-cresol",
    "4-methylphenol": "p-cresol",
    "benzene-1,2-diol": "catechol",
    "benzene-1,3-diol": "resorcinol",
    "benzene-1,4-diol": "hydroquinone",
    "benzene-1,2,3-triol": "pyrogallol",

    // ----------------------------
    // Ethers
    // ----------------------------
    "methoxybenzene": "anisole",
    "ethoxybenzene": "phenetole",
    "methoxymethane": "dimethyl ether",
    "ethoxyethane": "diethyl ether",
    "methoxyethane": "methyl ethyl ether",
    "2-methoxy-2-methylpropane": "MTBE",

    // ----------------------------
    // Amines
    // ----------------------------
    "methanamine": "methylamine",
    "ethanamine": "ethylamine",
    "propan-1-amine": "propylamine",
    "propan-2-amine": "isopropylamine",
    "butan-1-amine": "butylamine",
    "aminobenzene": "aniline",
    "phenylmethanamine": "benzylamine",
    "dimethylamine": "dimethylamine",
    "trimethylamine": "trimethylamine",
    "diethylamine": "diethylamine",
    "triethylamine": "triethylamine",

    // ----------------------------
    // Amides
    // ----------------------------
    "methanamide": "formamide",
    "ethanamide": "acetamide",
    "propanamide": "propionamide",
    "butanamide": "butyramide",
    "benzamide": "benzamide",
    "n,n-dimethylmethanamide": "DMF",
    "n,n-dimethylformamide": "DMF",
    "n,n-dimethylethanamide": "DMA",
    "n,n-dimethylacetamide": "DMA",

    // ----------------------------
    // Esters
    // ----------------------------
    "methyl methanoate": "methyl formate",
    "methyl ethanoate": "methyl acetate",
    "ethyl ethanoate": "ethyl acetate",
    "propyl ethanoate": "propyl acetate",
    "butyl ethanoate": "butyl acetate",
    "methyl propanoate": "methyl propionate",
    "ethyl propanoate": "ethyl propionate",
    "methyl butanoate": "methyl butyrate",
    "ethyl butanoate": "ethyl butyrate",

    // ----------------------------
    // Nitriles
    // ----------------------------
    "methanenitrile": "hydrogen cyanide",
    "ethanenitrile": "acetonitrile",
    "propanenitrile": "propionitrile",
    "butanenitrile": "butyronitrile",
    "benzenecarbonitrile": "benzonitrile",

    // ----------------------------
    // Thiols / sulfur compounds
    // ----------------------------
    "methanethiol": "methyl mercaptan",
    "ethanethiol": "ethyl mercaptan",
    "propanethiol": "propyl mercaptan",
    "benzenethiol": "thiophenol",
    "dimethyl sulfide": "dimethyl sulfide",
    "dimethyl sulfoxide": "DMSO",

    // ----------------------------
    // Aromatic hydrocarbons
    // ----------------------------
    "benzene": "benzene",
    "methylbenzene": "toluene",
    "ethylbenzene": "ethylbenzene",
    "ethenylbenzene": "styrene",
    "vinylbenzene": "styrene",
    "dimethylbenzene": "xylene",
    "1,2-dimethylbenzene": "o-xylene",
    "1,3-dimethylbenzene": "m-xylene",
    "1,4-dimethylbenzene": "p-xylene",
    "isopropylbenzene": "cumene",
    "propan-2-ylbenzene": "cumene",
    "naphthalene": "naphthalene",
    "anthracene": "anthracene",
    "phenanthrene": "phenanthrene",

    // ----------------------------
    // Halogenated compounds
    // ----------------------------
    "chloromethane": "methyl chloride",
    "dichloromethane": "methylene chloride",
    "trichloromethane": "chloroform",
    "tetrachloromethane": "carbon tetrachloride",
    "bromoethane": "ethyl bromide",
    "iodoethane": "ethyl iodide",
    "chloroethane": "ethyl chloride",
    "fluoroethane": "ethyl fluoride",
    "1,1,1-trichloroethane": "methyl chloroform",
    "tetrachloroethene": "perchloroethylene",
    "trichloroethene": "trichloroethylene",

    // ----------------------------
    // Common small inorganic/simple molecules
    // ----------------------------
    "water": "water",
    "ammonia": "ammonia",
    "methane": "methane",
    "ethane": "ethane",
    "propane": "propane",
    "butane": "butane",
    "ethene": "ethylene",
    "propene": "propylene",
    "ethyne": "acetylene",
    "carbon dioxide": "carbon dioxide",
    "carbon monoxide": "carbon monoxide",

    // ----------------------------
    // Sugars / biomolecule names
    // ----------------------------
    "glucose": "glucose",
    "fructose": "fructose",
    "galactose": "galactose",
    "ribose": "ribose",
    "deoxyribose": "deoxyribose",
    "sucrose": "sucrose",
    "lactose": "lactose",
    "maltose": "maltose",

    // ----------------------------
    // Amino acids
    // ----------------------------
    "2-aminoethanoic acid": "glycine",
    "2-aminopropanoic acid": "alanine",
    "2-amino-3-methylbutanoic acid": "valine",
    "2-amino-4-methylpentanoic acid": "leucine",
    "2-amino-3-methylpentanoic acid": "isoleucine",
    "2-amino-3-hydroxypropanoic acid": "serine",
    "2-amino-3-hydroxybutanoic acid": "threonine",
    "2-amino-3-phenylpropanoic acid": "phenylalanine",
    "2-amino-3-(4-hydroxyphenyl)propanoic acid": "tyrosine",
    "2-amino-3-sulfanylpropanoic acid": "cysteine",
    "2-amino-4-methylsulfanylbutanoic acid": "methionine",
    "2-aminopentanedioic acid": "glutamic acid",
    "2-aminobutanedioic acid": "aspartic acid",
    "2,6-diaminohexanoic acid": "lysine",
    "2-amino-5-guanidinopentanoic acid": "arginine",
    "2-amino-3-(1h-imidazol-4-yl)propanoic acid": "histidine",
    "pyrrolidine-2-carboxylic acid": "proline",
    "2-amino-3-(1h-indol-3-yl)propanoic acid": "tryptophan",
    "2-amino-3-carbamoylpropanoic acid": "asparagine",
    "2-amino-4-carbamoylbutanoic acid": "glutamine",

    //Alkenes
    "2-methylprop-1-ene": "isobutylene",
    "2-methylpropene": "isobutylene",
};

export function getCommonName(estimatedName: string | null | undefined) {
  if (!estimatedName) return null;

  const normalized = estimatedName.trim().toLowerCase();

  return COMMON_NAME_MAP[normalized] ?? null;
}