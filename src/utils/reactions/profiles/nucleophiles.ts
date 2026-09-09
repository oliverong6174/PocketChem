export type Sn2NucleophileId =
  | "hydroxide"
  | "cyanide"
  | "azide"
  | "ammonia"
  | "alkoxide"
  | "acetylide"
  | "iodide";

export type Sn1NucleophileId = "water" | "alcohol";
export type SubstitutionNucleophileId = Sn2NucleophileId | Sn1NucleophileId;

export type Sn2NucleophileProfile = {
  id: Sn2NucleophileId;
  forward: {
    /** Secondary-center SN2 pattern with inversion. */
    inversion: string;
    /** Methyl/primary or achiral fallback. */
    generic: string;
  };
  reverse: {
    productPattern: string;
    nucleophileProduct: string;
    leavingHalogens: readonly ("Cl" | "Br" | "I")[];
    chiral: boolean;
  };
};

export type Sn1NucleophileProfile = {
  id: Sn1NucleophileId;
  forward: {
    secondaryRacemization: string;
    tertiaryRacemization: string;
    generic: string;
  };
  reverse: {
    productPattern: string;
    nucleophileProduct: string;
  };
};

export const SN2_NUCLEOPHILE_PROFILES: Readonly<
  Record<Sn2NucleophileId, Sn2NucleophileProfile>
> = Object.freeze({
  hydroxide: {
    id: "hydroxide",
    forward: {
      inversion:
        "[C@H:1]([*:3])([*:4])[Cl,Br,I:2].[O-;H1:5]>>[C@@H:1]([*:3])([*:4])[O+0:5]",
      generic: "[C;X4:1][Cl,Br,I:2].[O-;H1:5]>>[C:1][O+0:5]",
    },
    reverse: {
      productPattern: "[O;H1;+0:5]",
      nucleophileProduct: "[O-;H1:5]",
      leavingHalogens: ["Cl", "Br", "I"],
      chiral: true,
    },
  },
  cyanide: {
    id: "cyanide",
    forward: {
      inversion:
        "[C@H:1]([*:3])([*:4])[Cl,Br,I:2].[C-:5]#[N:6]>>[C@@H:1]([*:3])([*:4])[C+0:5]#[N:6]",
      generic: "[C;X4:1][Cl,Br,I:2].[C-:5]#[N:6]>>[C:1][C+0:5]#[N:6]",
    },
    reverse: {
      productPattern: "[C:5]#[N:6]",
      nucleophileProduct: "[C-:5]#[N:6]",
      leavingHalogens: ["Cl", "Br", "I"],
      chiral: true,
    },
  },
  azide: {
    id: "azide",
    forward: {
      inversion:
        "[C@H:1]([*:3])([*:4])[Cl,Br,I:2].[N-:5]~[N+:6]~[N:7]>>[C@@H:1]([*:3])([*:4])[N+0:5]=[N+:6]=[N-:7]",
      generic:
        "[C;X4:1][Cl,Br,I:2].[N-:5]~[N+:6]~[N:7]>>[C:1][N+0:5]=[N+:6]=[N-:7]",
    },
    reverse: {
      productPattern: "[N+0:5]=[N+:6]=[N-:7]",
      nucleophileProduct: "[N-:5]~[N+:6]~[N:7]",
      leavingHalogens: ["Cl", "Br", "I"],
      chiral: true,
    },
  },
  ammonia: {
    id: "ammonia",
    forward: {
      inversion:
        "[C@H:1]([*:3])([*:4])[Cl,Br,I:2].[N;H3;+0:5]>>[C@@H:1]([*:3])([*:4])[N;H2;+0:5]",
      generic: "[C;X4:1][Cl,Br,I:2].[N;H3;+0:5]>>[C:1][N;H2;+0:5]",
    },
    reverse: {
      productPattern: "[N;H2;+0:5]",
      nucleophileProduct: "[N;H3;+0:5]",
      leavingHalogens: ["Cl", "Br", "I"],
      chiral: true,
    },
  },
  alkoxide: {
    id: "alkoxide",
    forward: {
      inversion:
        "[C@H:1]([*:3])([*:4])[Cl,Br,I:2].[#6:6][O-:5]>>[C@@H:1]([*:3])([*:4])[O+0:5][#6:6]",
      generic:
        "[C;X4:1][Cl,Br,I:2].[#6:6][O-:5]>>[C:1][O+0:5][#6:6]",
    },
    reverse: {
      productPattern: "[O+0:5][#6:6]",
      nucleophileProduct: "[O-:5][#6:6]",
      leavingHalogens: ["Cl", "Br", "I"],
      chiral: true,
    },
  },
  acetylide: {
    id: "acetylide",
    forward: {
      inversion:
        "[C@H:1]([*:3])([*:4])[Cl,Br,I:2].[#6:5]#[C-:6]>>[C@@H:1]([*:3])([*:4])[C+0:6]#[#6:5]",
      generic:
        "[C;X4:1][Cl,Br,I:2].[#6:5]#[C-:6]>>[C:1][C+0:6]#[#6:5]",
    },
    reverse: {
      productPattern: "[C:6]#[#6:5]",
      nucleophileProduct: "[C-:6]#[#6:5]",
      leavingHalogens: ["Cl", "Br", "I"],
      chiral: true,
    },
  },
  iodide: {
    id: "iodide",
    forward: {
      inversion:
        "[C@H:1]([*:3])([*:4])[Cl,Br:2].[I-:5]>>[C@@H:1]([*:3])([*:4])[I+0:5]",
      generic: "[C;X4:1][Cl,Br:2].[I-:5]>>[C:1][I+0:5]",
    },
    reverse: {
      productPattern: "[I:5]",
      nucleophileProduct: "[I-:5]",
      leavingHalogens: ["Cl", "Br"],
      chiral: true,
    },
  },
});

export const SN1_NUCLEOPHILE_PROFILES: Readonly<
  Record<Sn1NucleophileId, Sn1NucleophileProfile>
> = Object.freeze({
  water: {
    id: "water",
    forward: {
      secondaryRacemization:
        "[C;H1;X4:1]([*:3])([*:4])[Cl,Br,I:2].[O;H2;+0:5]>>[C@H:1]([*:3])([*:4])[O;H1;+0:5]",
      tertiaryRacemization:
        "[C;H0;X4:1]([*:3])([*:4])([*:7])[Cl,Br,I:2].[O;H2;+0:5]>>[C@:1]([*:3])([*:4])([*:7])[O;H1;+0:5]",
      generic: "[C;X4:1][Cl,Br,I:2].[O;H2;+0:5]>>[C:1][O;H1;+0:5]",
    },
    reverse: {
      productPattern: "[O;H1;+0:5]",
      nucleophileProduct: "[O;H2;+0:5]",
    },
  },
  alcohol: {
    id: "alcohol",
    forward: {
      secondaryRacemization:
        "[C;H1;X4:1]([*:3])([*:4])[Cl,Br,I:2].[#6:6][O;H1;+0:5]>>[C@H:1]([*:3])([*:4])[O+0:5][#6:6]",
      tertiaryRacemization:
        "[C;H0;X4:1]([*:3])([*:4])([*:7])[Cl,Br,I:2].[#6:6][O;H1;+0:5]>>[C@:1]([*:3])([*:4])([*:7])[O+0:5][#6:6]",
      generic:
        "[C;X4:1][Cl,Br,I:2].[#6:6][O;H1;+0:5]>>[C:1][O+0:5][#6:6]",
    },
    reverse: {
      productPattern: "[O+0:5][#6:6]",
      nucleophileProduct: "[O;H1;+0:5][#6:6]",
    },
  },
});

export const SUBSTITUTION_NUCLEOPHILE_IDS = Object.freeze([
  ...Object.keys(SN2_NUCLEOPHILE_PROFILES),
  ...Object.keys(SN1_NUCLEOPHILE_PROFILES),
] as SubstitutionNucleophileId[]);

export function isSn2NucleophileId(value: string): value is Sn2NucleophileId {
  return value in SN2_NUCLEOPHILE_PROFILES;
}

export function isSn1NucleophileId(value: string): value is Sn1NucleophileId {
  return value in SN1_NUCLEOPHILE_PROFILES;
}
