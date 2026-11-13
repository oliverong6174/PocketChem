import { BIOLOGY_TOOLS, getSubject, type BiologyToolId } from "../../navigation/subjects";
import { Badge, Callout, EvidenceBadge, Panel, ToolHeader } from "../ui/primitives";
import { Icon } from "../ui/Icon";
import "../../styles/generalChem.css";
import "../../styles/physics.css";
import "../../styles/biology.css";

/**
 * Landing page of the Biology subject. It lists only tools that exist (with a way to open them) and, separately and clearly
 * marked, the areas that are planned. Planned items have no buttons and no diagrams.
 */
const FEATURES: Record<string, string[]> = {
  bioReplication: [
    "A replication fork whose every base is a real base of your sequence, with the leading and lagging strands built 5′→3′",
    "Helicase, primase, polymerases, primer removal and ligase, named for a bacterium or a eukaryote and never mixed",
    "Okazaki fragments with RNA primers, gap filling and nick sealing, one step at a time",
    "Reverse the fork direction and watch the leading and lagging roles of the two parental strands swap",
  ],
  bioTranscription: [
    "Template and coding strands with the RNA built 5′→3′ one nucleotide at a time, inside a transcription bubble",
    "Bacterial transcription (σ factor, no processing) and eukaryotic transcription kept separate",
    "Eukaryotic 5′ capping, GU…AG splicing through a lariat, and cleavage and polyadenylation at AAUAAA",
    "Edit the intron positions and see whether they are valid splice sites",
  ],
  bioTranslation: [
    "A ribosome with A, P and E sites, the mRNA codons, each tRNA's anticodon and the peptide as it grows",
    "Initiation, elongation (bind, peptide bond, translocate) and termination with release factors",
    "Bacterial (Shine–Dalgarno, fMet, RF1/RF2) and eukaryotic (cap scanning, Met, eRF1) differences",
    "The complete standard genetic code, with the codon in the A site highlighted",
  ],
  bioDogma: [
    "One gene from DNA to peptide: coding and template strands, mRNA, anticodons and amino acids in one ladder",
    "All three reading frames and every AUG in the mRNA",
    "Substitutions, insertions and deletions, with the consequence derived by translating the mutant",
    "Challenge: predict whether a mutation is silent, missense, nonsense or a frameshift before it is applied",
  ],
  bioRegulation: [
    "The lac operon: repressor, allolactose, operator, promoter, cAMP–CRP and RNA polymerase, with leaky basal expression and a second copy to test cis versus trans",
    "The trp operon: the corepressor, the leader peptide and the competing 2:3 and 3:4 RNA structures that decide attenuation",
    "A eukaryotic gene: enhancer, silencer, Mediator, chromatin accessibility, histone acetylation, DNA methylation and Pol II, with uncertain outcomes where the model cannot decide",
    "Challenge: predict whether a regulatory change increases, decreases or leaves expression about the same",
  ],
  bioGenetics: [
    "Parents' chromosome pairs with their alleles, the gametes each makes, a Punnett square and exact genotype and phenotype ratios",
    "Monohybrid and dihybrid crosses, test crosses, incomplete dominance, codominance, ABO multiple alleles and an X-linked gene",
    "Two linked genes: coupling and repulsion, a recombination fraction you set, and parental and recombinant chromatids",
    "Practice picking the gametes; Challenge predicting a fraction before the square is shown",
  ],
  bioDivision: [
    "Mitosis and meiosis of a small cell, with chromosomes, sister chromatids, centromeres and the spindle drawn from the process engine",
    "Chromosome number and DNA content counted at every stage; homologs separate in meiosis I and sister chromatids in meiosis II",
    "Crossing over, independent assortment and meiosis I or II nondisjunction, with the resulting gametes compared with the Genetics tool's expectation",
    "Select any chromosome to inspect its origin, chromatids, alleles and spindle attachment",
  ],
};

export default function BiologyOverview({ onOpenTool }: { onOpenTool: (id: BiologyToolId) => void }) {
  const subject = getSubject("biology");
  const implemented = BIOLOGY_TOOLS.filter((tool) => tool.id in FEATURES);
  return (
    <div className="gc-page gc-overview ph-page bio-page">
      <ToolHeader
        group="Analyze"
        headingLevel={1}
        purpose="Interactive study guides for how genetic information is copied, transcribed, translated and regulated, and how it is inherited through meiosis. Every diagram is drawn from the sequence and process state you are looking at, and every tool has Explore, Practice and Challenge modes."
        title="Biology"
      />

      <Panel subtitle="Working tools you can open now." title="Available now">
        {(["geneExpression", "inheritance"] as const).map((group) => (
        <div key={group}>
        <h3 className="ph-group-heading">{group === "geneExpression" ? "Gene expression" : "Genetics & cell division"}</h3>
        <ul className="gc-tool-cards">
          {implemented.filter((tool) => tool.group === group).map((tool) => (
            <li className="gc-tool-card" key={tool.id}>
              <Icon name={tool.icon} size={26} />
              <div>
                <h3>{tool.label}</h3>
                <p>{tool.summary}</p>
                <ul className="gc-feature-list">
                  {FEATURES[tool.id].map((line) => <li key={line}>{line}</li>)}
                </ul>
                <div className="gc-tool-card-foot">
                  <EvidenceBadge level="model" />
                  <button className="primary-button" onClick={() => onOpenTool(tool.id as BiologyToolId)} type="button">Open {tool.label}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        </div>
        ))}
      </Panel>

      <Panel subtitle="How to use the learning modes." title="Explore, Practice, Challenge">
        <ul className="gc-assumptions">
          <li><strong>Explore</strong>: everything is labelled; step through the process and read why each step happens.</li>
          <li><strong>Practice</strong>: labels are hidden and questions ask about the diagram in front of you. The reason is shown after you answer.</li>
          <li><strong>Challenge</strong>: you predict the next step (or a mutation's effect) first; it is revealed only after you commit.</li>
        </ul>
      </Panel>

      <Panel subtitle="Not built yet. These are plans, not features, and nothing here can be opened." title="Planned">
        <ul aria-label="Planned Biology areas" className="gc-planned">
          {(subject.planned ?? []).map((item) => (
            <li key={item}>
              <span>{item}</span>
              <Badge tone="neutral">Planned</Badge>
            </li>
          ))}
        </ul>
      </Panel>

      <Callout tone="info" title="Scope of the tools">
        <p>These are simplified teaching models. Gene-regulation levels are ordinal and qualitative, not measured rates. Genetics shows expected proportions from the stated rules, and one illustrated meiosis is one random outcome, not a distribution. Replication shows one fork with a few nucleotides per primer and Okazaki fragment. Transcription places the promoter and terminator outside the sequence shown and accepts only GU…AG introns. Translation uses the standard genetic code with one tRNA per codon (no wobble). Bacterial and eukaryotic machinery are shown separately and never combined. The models describe textbook mechanisms; they do not predict the behaviour of a real gene or organism.</p>
      </Callout>
    </div>
  );
}
