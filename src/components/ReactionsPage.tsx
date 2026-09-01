import { useEffect, useState } from "react";
import MoleculeDrawer, { type KetcherApi } from "./MoleculeDrawer";
import {
  analyzeFunctionalGroupHierarchy,
  getMoleculeSvg,
} from "../utils/functionalGroups";

import {
  predictReactionPathways,
  predictRetrosynthesisPathways,
  type ReactionPathway,
  type RetrosynthesisPathway,
} from "../utils/reactionUtils";
import "ketcher-react/dist/index.css";

type Props = {
  initialPathways: ReactionPathway[];
};

type SvgListMap = Record<string, string[]>;
type AnalysisMode = "forward" | "retrosynthesis";

function courseLabel(course: ReactionPathway["course"]) {
  return course === "ochem-1"
    ? "O-Chem I"
    : course === "ochem-2"
      ? "O-Chem II"
      : "Advanced";
}

export default function ReactionsPage({ initialPathways }: Props) {
  const [ketcher, setKetcher] = useState<KetcherApi | null>(null);
  const [reactionSmiles, setReactionSmiles] = useState("");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("forward");
  const [pathways, setPathways] = useState<ReactionPathway[]>(initialPathways);
  const [retroPathways, setRetroPathways] = useState<RetrosynthesisPathway[]>([]);
  const [reactantSvgs, setReactantSvgs] = useState<SvgListMap>({});
  const [productSvgs, setProductSvgs] = useState<SvgListMap>({});
  const [retroTargetSvgs, setRetroTargetSvgs] = useState<SvgListMap>({});
  const [retroPrecursorSvgs, setRetroPrecursorSvgs] = useState<SvgListMap>({});
  const [reactionError, setReactionError] = useState<string | null>(null);

  useEffect(() => {
    setPathways(initialPathways);
  }, [initialPathways]);

  useEffect(() => {
    async function buildSvgs() {
      const nextReactants: SvgListMap = {};
      const nextProducts: SvgListMap = {};

      for (const pathway of pathways) {
        const reactantComponents = pathway.reactantComponents.length > 0
          ? pathway.reactantComponents
          : pathway.reactantSmiles.split(".").filter(Boolean);

        nextReactants[pathway.id] = (
          await Promise.all(
            reactantComponents.map((component) => getMoleculeSvg(component)),
          )
        ).filter((svg): svg is string => Boolean(svg));

        if (pathway.productSmiles) {
          const productComponents = pathway.productSmiles
            .split(".")
            .map((component) => component.trim())
            .filter(Boolean);

          nextProducts[pathway.id] = (
            await Promise.all(
              productComponents.map((component) => getMoleculeSvg(component)),
            )
          ).filter((svg): svg is string => Boolean(svg));
        } else {
          nextProducts[pathway.id] = [];
        }
      }

      setReactantSvgs(nextReactants);
      setProductSvgs(nextProducts);
    }

    void buildSvgs();
  }, [pathways]);

  useEffect(() => {
    async function buildRetroSvgs() {
      const nextTargets: SvgListMap = {};
      const nextPrecursors: SvgListMap = {};

      for (const pathway of retroPathways) {
        const targetComponents = pathway.targetSmiles
          .split(".")
          .map((component) => component.trim())
          .filter(Boolean);

        nextTargets[pathway.id] = (
          await Promise.all(
            targetComponents.map((component) => getMoleculeSvg(component)),
          )
        ).filter((svg): svg is string => Boolean(svg));

        nextPrecursors[pathway.id] = (
          await Promise.all(
            pathway.precursorComponents.map((component) =>
              getMoleculeSvg(component),
            ),
          )
        ).filter((svg): svg is string => Boolean(svg));
      }

      setRetroTargetSvgs(nextTargets);
      setRetroPrecursorSvgs(nextPrecursors);
    }

    void buildRetroSvgs();
  }, [retroPathways]);

  async function getDrawerSmiles(): Promise<string | null> {
    if (!ketcher) return null;

    try {
      return await ketcher.getSmiles();
    } catch (error) {
      console.error("Ketcher could not export reaction SMILES:", error);
      setReactionError(
        "This Ketcher structure could not be exported as SMILES. For a generic R group, use the pseudoatom R / wildcard atom (*) rather than a full Markush R-group definition.",
      );
      setPathways([]);
      setRetroPathways([]);
      return null;
    }
  }

  async function analyzeReactionMolecule(mode: AnalysisMode) {
    const smiles = await getDrawerSmiles();
    if (smiles === null) return;

    setReactionError(null);
    setAnalysisMode(mode);

    if (!smiles.trim()) {
      setReactionSmiles("");
      setPathways([]);
      setRetroPathways([]);
      return;
    }

    setReactionSmiles(smiles);

    if (mode === "retrosynthesis") {
      setPathways([]);
      setRetroPathways(await predictRetrosynthesisPathways(smiles));
      return;
    }

    setRetroPathways([]);

    // A dot-separated SMILES represents disconnected structures. The forward
    // engine analyzes each component independently and can match multi-reactant
    // rules without requiring a second Ketcher.
    const isMultiReactant = smiles.includes(".");
    const hierarchy = isMultiReactant
      ? null
      : await analyzeFunctionalGroupHierarchy(smiles);

    setPathways(
      await predictReactionPathways(smiles, hierarchy?.primaryGroups ?? []),
    );
  }

  async function clearAnalysis() {
    await ketcher?.setMolecule("");
    setReactionSmiles("");
    setReactionError(null);
    setPathways([]);
    setRetroPathways([]);
  }

  return (
    <section className="card reactions-page-card">
      <h2>Reactions</h2>

      <div className="reaction-ketcher-panel">
        <h3>Reaction Drawer</h3>
        <p className="empty">
          For forward prediction, draw one reactant or multiple disconnected
          reactants. For retrosynthesis, draw the product you want to make and
          choose Predict Reactants.
        </p>
        <p className="empty">
          Generic R groups are accepted as wildcard atoms. The safest Ketcher
          workaround is the pseudoatom R (keyboard r) or a wildcard atom (*),
          rather than a full Markush R-group definition.
        </p>

        <div className="reaction-ketcher-box">
          <MoleculeDrawer
            globalKey="reactionKetcher"
            onReady={(api) => setKetcher(api)}
          />
        </div>

        <div className="reaction-actions">
          <button
            className="primary-button"
            onClick={() => void analyzeReactionMolecule("forward")}
          >
            Predict Products
          </button>

          <button
            className="primary-button"
            onClick={() => void analyzeReactionMolecule("retrosynthesis")}
          >
            Predict Reactants
          </button>

          <button
            className="secondary-button"
            onClick={() => void clearAnalysis()}
          >
            Clear Analysis
          </button>
        </div>

        {reactionSmiles && (
          <p className="empty">
            {analysisMode === "retrosynthesis"
              ? "Current target product: "
              : "Current reaction input: "}
            <code>{reactionSmiles}</code>
          </p>
        )}
        {reactionError && (
          <p className="reaction-detail reaction-limitation">{reactionError}</p>
        )}
      </div>

      {analysisMode === "forward" ? (
        pathways.length === 0 ? (
          <p className="empty">
            {reactionSmiles
              ? "No supported reactions found yet for this molecule."
              : "Draw and analyze a molecule first."}
          </p>
        ) : (
          <>
            <p className="empty">
              Computed products are drawn when the structures on the canvas are
              enough to determine them. Multi-reactant rules use disconnected
              structures from the same Ketcher canvas.
            </p>

            <div className="reaction-pathway-list">
              {pathways.map((pathway) => (
                <div className="reaction-pathway-card" key={pathway.id}>
                  <div className="reaction-card-heading">
                    <div>
                      <h3>{pathway.title}</h3>
                      <p className="reaction-curriculum">
                        {courseLabel(pathway.course)} · {pathway.chapter}
                        {pathway.mechanism ? ` · ${pathway.mechanism}` : ""}
                      </p>
                    </div>
                    <span
                      className={`reaction-status reaction-status-${pathway.productStatus}`}
                    >
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
                      <div className="reaction-svg-box reaction-component-box">
                        {(reactantSvgs[pathway.id] ?? []).map((svg, index) => (
                          <div
                            className="reaction-component-item"
                            key={`${pathway.id}-reactant-${index}`}
                          >
                            {index > 0 && (
                              <span className="reaction-component-plus">+</span>
                            )}
                            <div dangerouslySetInnerHTML={{ __html: svg }} />
                          </div>
                        ))}
                      </div>
                      <p>{pathway.reactantLabel}</p>
                    </div>

                    <div className="reaction-column reagent-column">
                      <div className="reagent-pill">{pathway.reagentLabel}</div>
                      <span className="reaction-arrow">→</span>
                      <p>{pathway.reagentNote}</p>
                    </div>

                    <div className="reaction-column">
                      {(productSvgs[pathway.id] ?? []).length > 0 ? (
                        <div className="reaction-svg-box reaction-component-box">
                          {(productSvgs[pathway.id] ?? []).map((svg, index) => (
                            <div
                              className="reaction-component-item"
                              key={`${pathway.id}-product-${index}`}
                            >
                              {index > 0 && (
                                <span className="reaction-component-plus">+</span>
                              )}
                              <div dangerouslySetInnerHTML={{ __html: svg }} />
                            </div>
                          ))}
                        </div>
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
                      <strong>Selectivity:</strong>{" "}
                      {pathway.selectivity.join(" · ")}
                    </p>
                  )}

                  {pathway.limitations.length > 0 && (
                    <p className="reaction-detail reaction-limitation">
                      <strong>Model note:</strong>{" "}
                      {pathway.limitations.join(" ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )
      ) : retroPathways.length === 0 ? (
        <p className="empty">
          {reactionSmiles
            ? "No forward-verified precursor sets were found from the current reaction catalog."
            : "Draw a target product, then choose Predict Reactants."}
        </p>
      ) : (
        <>
          <p className="empty">
            Retrosynthesis runs the existing PocketChem reaction catalog
            backward, then replays each proposed precursor set through the
            original forward reaction. Suggestions that cannot regenerate the
            target are discarded.
          </p>

          <div className="reaction-pathway-list">
            {retroPathways.map((pathway) => (
              <div className="reaction-pathway-card" key={pathway.id}>
                <div className="reaction-card-heading">
                  <div>
                    <h3>Retrosynthesis via {pathway.title}</h3>
                    <p className="reaction-curriculum">
                      {courseLabel(pathway.course)} · {pathway.chapter}
                      {pathway.mechanism ? ` · ${pathway.mechanism}` : ""}
                    </p>
                  </div>
                  <span
                    className={`reaction-status ${
                      pathway.confidence === "confirmed"
                        ? "reaction-status-computed"
                        : "reaction-status-representative"
                    }`}
                  >
                    {pathway.confidence === "confirmed"
                      ? "Forward-verified"
                      : "Connectivity verified"}
                  </span>
                </div>

                <div className="reaction-three-column">
                  <div className="reaction-column">
                    <div className="reaction-svg-box reaction-component-box">
                      {(retroTargetSvgs[pathway.id] ?? []).map((svg, index) => (
                        <div
                          className="reaction-component-item"
                          key={`${pathway.id}-target-${index}`}
                        >
                          {index > 0 && (
                            <span className="reaction-component-plus">+</span>
                          )}
                          <div dangerouslySetInnerHTML={{ __html: svg }} />
                        </div>
                      ))}
                    </div>
                    <p>{pathway.targetLabel}</p>
                  </div>

                  <div className="reaction-column reagent-column">
                    <div className="reagent-pill">{pathway.reagentLabel}</div>
                    <span className="reaction-arrow">←</span>
                    <p>{pathway.reagentNote}</p>
                    {pathway.requiredReactantLabels.length > 0 && (
                      <p>
                        Rule requires: {pathway.requiredReactantLabels.join(", ")}
                      </p>
                    )}
                  </div>

                  <div className="reaction-column">
                    <div className="reaction-svg-box reaction-component-box">
                      {(retroPrecursorSvgs[pathway.id] ?? []).map((svg, index) => (
                        <div
                          className="reaction-component-item"
                          key={`${pathway.id}-precursor-${index}`}
                        >
                          {index > 0 && (
                            <span className="reaction-component-plus">+</span>
                          )}
                          <div dangerouslySetInnerHTML={{ __html: svg }} />
                        </div>
                      ))}
                    </div>
                    <p>{pathway.precursorLabel}</p>
                  </div>
                </div>

                <p className="reaction-note">{pathway.shortExplanation}</p>

                {pathway.alternativeRoutes.length > 0 && (
                  <p className="reaction-detail">
                    <strong>Alternative conditions:</strong>{" "}
                    {pathway.alternativeRoutes
                      .map(
                        (route) =>
                          `${route.reagentLabel} — ${route.title}${
                            route.reagentNote ? ` (${route.reagentNote})` : ""
                          }`,
                      )
                      .join(" · ")}
                  </p>
                )}

                {pathway.selectivity.length > 0 && (
                  <p className="reaction-detail">
                    <strong>Forward selectivity:</strong>{" "}
                    {pathway.selectivity.join(" · ")}
                  </p>
                )}

                {pathway.limitations.length > 0 && (
                  <p className="reaction-detail reaction-limitation">
                    <strong>Model note:</strong>{" "}
                    {pathway.limitations.join(" ")}
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
