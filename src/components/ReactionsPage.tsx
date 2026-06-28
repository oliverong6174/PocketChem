import { useEffect, useState } from "react";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import {
  analyzeFunctionalGroupHierarchy,
  getMoleculeSvg,
} from "../utils/analyzeGroups";

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

        const smiles = await ketcher.getSmiles();

        if (!smiles.trim()) {
            setReactionSmiles("");
            setPathways([]);
            return;
        }

        if (smiles.includes(".")) {
          setReactionSmiles(smiles);
          setPathways([]);
          alert("Please draw only one molecule at a time for reaction prediction.");
          return;
        }

        setReactionSmiles(smiles);

        const hierarchy = await analyzeFunctionalGroupHierarchy(smiles);

        const pathways = await predictReactionPathways(
            smiles,
            hierarchy.primaryGroups
            );

            setPathways(pathways);
    }

  return (
    <section className="card reactions-page-card">
      <h2>Reactions</h2>

      <div className="reaction-ketcher-panel">
        <h3>Reaction Drawer</h3>
        <p className="empty">
          Draw a molecule here for the reactions workspace.
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
              setPathways([]);
            }}
          >
            Clear Analysis
          </button>
        </div>

        {reactionSmiles && (
          <p className="empty">
            Current reaction molecule: <code>{reactionSmiles}</code>
          </p>
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
            These are starter predicted reaction pathways. Product structures are representative and will become more exact as the reaction engine develops.
          </p>

          <div className="reaction-pathway-list">
            {pathways.map((pathway) => (
              <div className="reaction-pathway-card" key={pathway.id}>
                <h3>{pathway.title}</h3>

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
                        Product not drawn yet
                      </div>
                    )}
                    <p>{pathway.productLabel}</p>
                  </div>
                </div>

                <p className="reaction-note">{pathway.shortExplanation}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}