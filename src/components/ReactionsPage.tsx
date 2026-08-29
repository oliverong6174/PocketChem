import { useEffect, useState } from "react";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import {
  analyzeFunctionalGroupHierarchy,
  getMoleculeSvg,
} from "../utils/functionalGroups";

import {
  predictReactionPathways,
  type ReactionPathway,
} from "../utils/reactionUtils";
import "ketcher-react/dist/index.css";


type Props = {
  initialPathways: ReactionPathway[];
};

type SvgMap = Record<string, string | null>;

export default function ReactionsPage({ initialPathways }: Props) {
  const [ketcher, setKetcher] = useState<KetcherApi | null>(null);
  const [reactionSmiles, setReactionSmiles] = useState("");
  const [pathways, setPathways] = useState<ReactionPathway[]>(initialPathways);
  const [reactantSvgs, setReactantSvgs] = useState<SvgMap>({});
  const [productSvgs, setProductSvgs] = useState<SvgMap>({});
  const [reactionError, setReactionError] = useState<string | null>(null);

  useEffect(() => {
    setPathways(initialPathways);
  }, [initialPathways]);

  useEffect(() => {
    async function buildSvgs() {
      const nextReactants: SvgMap = {};
      const nextProducts: SvgMap = {};

      for (const pathway of pathways) {
        nextReactants[pathway.id] = await getMoleculeSvg(pathway.reactantSmiles);

        if (pathway.productSmiles) {
          nextProducts[pathway.id] = await getMoleculeSvg(pathway.productSmiles);
        } else {
          nextProducts[pathway.id] = null;
        }
      }

      setReactantSvgs(nextReactants);
      setProductSvgs(nextProducts);
    }

    buildSvgs();
  }, [pathways]);

    async function analyzeReactionMolecule() {
        if (!ketcher) return;

        let smiles: string;

        try {
          smiles = await ketcher.getSmiles();
        } catch (error) {
          console.error("Ketcher could not export reaction SMILES:", error);
          setReactionError(
            "This Ketcher structure could not be exported as SMILES. For a generic R group, use the pseudoatom R / wildcard atom (*) rather than a full Markush R-group definition."
          );
          setPathways([]);
          return;
        }

        setReactionError(null);

        if (!smiles.trim()) {
            setReactionSmiles("");
            setPathways([]);
            return;
        }

        setReactionSmiles(smiles);

        // A dot-separated SMILES represents disconnected structures. The
        // reaction engine now analyzes each component independently and can
        // match multi-reactant rules without requiring a second Ketcher.
        const isMultiReactant = smiles.includes(".");
        const hierarchy = isMultiReactant
          ? null
          : await analyzeFunctionalGroupHierarchy(smiles);

        const pathways = await predictReactionPathways(
            smiles,
            hierarchy?.primaryGroups ?? []
            );

            setPathways(pathways);
    }

  return (
    <section className="card reactions-page-card">
      <h2>Reactions</h2>

      <div className="reaction-ketcher-panel">
        <h3>Reaction Drawer</h3>
        <p className="empty">
          Draw one molecule, or draw multiple disconnected molecules for a multi-reactant reaction. Ketcher exports disconnected structures as dot-separated SMILES (for example, CCO.CC(=O)O).
        </p>
        <p className="empty">
          Generic R groups are accepted as wildcard atoms. For reaction calculations, the safest Ketcher workaround is the pseudoatom R (keyboard r) or a wildcard atom (*), rather than a full Markush R-group definition. PocketChem also normalizes [R], R1, R2, and mapped wildcard forms such as [*:1].
        </p>

        <div className="reaction-ketcher-box">
          <div className="reaction-ketcher-box">
            <MoleculeDrawer
                globalKey="reactionKetcher"
                onReady={(api) => setKetcher(api)}
            />
            </div>
        </div>

          <div className="reaction-actions">

{/*MAIN ANALYSIS BUTTON*/}

          <button
            className="primary-button"
            onClick={analyzeReactionMolecule}
          >
            Predict Reactions
          </button>

{/*CLEAR ANALYSIS BUTTON*/}

          <button
            className="secondary-button"
            onClick={async () => {
              await ketcher?.setMolecule("");
              setReactionSmiles("");
              setReactionError(null);
              setPathways([]);
            }}
          >
            Clear Analysis
          </button>
        </div>

        {reactionSmiles && (
          <p className="empty">
            Current reaction input: <code>{reactionSmiles}</code>
          </p>
        )}
        {reactionError && (
          <p className="reaction-detail reaction-limitation">{reactionError}</p>
        )}
      </div>

      {pathways.length === 0 ? (
        <p className="empty">
          {reactionSmiles
            ? "No supported reactions found yet for this molecule."
            : "Draw and analyze a molecule first."}
        </p>
        ) : (
        <>
          <p className="empty">
            Computed products are drawn when the structures on the canvas are enough to determine them. Multi-reactant rules use disconnected structures from the same Ketcher canvas; generic wildcard inputs are marked as generic products.
          </p>

          <div className="reaction-pathway-list">
            {pathways.map((pathway) => (
              <div className="reaction-pathway-card" key={pathway.id}>
                <div className="reaction-card-heading">
                  <div>
                    <h3>{pathway.title}</h3>
                    <p className="reaction-curriculum">
                      {pathway.course === "ochem-1" ? "O-Chem I" : pathway.course === "ochem-2" ? "O-Chem II" : "Advanced"}
                      {" · "}{pathway.chapter}
                      {pathway.mechanism ? ` · ${pathway.mechanism}` : ""}
                    </p>
                  </div>
                  <span className={`reaction-status reaction-status-${pathway.productStatus}`}>
                    {pathway.productStatus === "computed"
                      ? "Computed product"
                      : pathway.productStatus === "generic"
                        ? "Generic R-group product"
                        : pathway.productStatus === "representative"
                          ? "Representative product"
                          : "Concept only"}
                  </span>
                </div>

                <div className="reaction-three-column">
                  <div className="reaction-column">
                    <div
                      className="reaction-svg-box"
                      dangerouslySetInnerHTML={{
                        __html: reactantSvgs[pathway.id] ?? "",
                      }}
                    />
                    <p>{pathway.reactantLabel}</p>
                  </div>

                  <div className="reaction-column reagent-column">
                    <div className="reagent-pill">{pathway.reagentLabel}</div>
                    <span className="reaction-arrow">→</span>
                    <p>{pathway.reagentNote}</p>
                  </div>

                  <div className="reaction-column">
                    {productSvgs[pathway.id] ? (
                      <div
                        className="reaction-svg-box"
                        dangerouslySetInnerHTML={{
                          __html: productSvgs[pathway.id] ?? "",
                        }}
                      />
                    ) : (
                      <div className="reaction-svg-box reaction-placeholder">
                        {pathway.productStatus === "concept-only"
                          ? "Exact structure needs more reaction input"
                          : "No valid product structure was generated"}
                      </div>
                    )}
                    <p>{pathway.productLabel}</p>
                  </div>
                </div>

                <p className="reaction-note">{pathway.shortExplanation}</p>

                {pathway.selectivity.length > 0 && (
                  <p className="reaction-detail">
                    <strong>Selectivity:</strong> {pathway.selectivity.join(" · ")}
                  </p>
                )}

                {pathway.limitations.length > 0 && (
                  <p className="reaction-detail reaction-limitation">
                    <strong>Model note:</strong> {pathway.limitations.join(" ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}