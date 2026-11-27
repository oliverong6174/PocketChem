import { useState } from "react";
import type { MoleculeNameResolution } from "../utils/moleculeNameResolver";

const PAGE = 4;

type Props = {
  forms: MoleculeNameResolution[];
  busy: boolean;
  /** The loaded form when switching between forms; absent while the user still has to pick the first one. */
  current?: MoleculeNameResolution | null;
  onChoose: (form: MoleculeNameResolution) => void;
};

const nameOf = (form: MoleculeNameResolution) => form.variantLabel ?? form.title ?? form.query;

function Choices({ forms, busy, current, onChoose }: Props) {
  const [shown, setShown] = useState(PAGE);
  return (
    <>
      <ul aria-label="Matching structures" className="molecule-name-choices" data-testid="name-variant-choices">
        {forms.slice(0, shown).map((form) => {
          const active = Boolean(current) && form.sourceId === current?.sourceId;
          return (
            <li key={form.sourceId ?? form.smiles}>
              <button aria-current={active || undefined} className="secondary-button" disabled={busy || active} onClick={() => onChoose(form)} type="button">
                <strong>{nameOf(form)}</strong>
                {form.variantDetail ? <span>{form.variantDetail}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {forms.length > shown ? (
        <button className="molecule-forms-more" data-testid="name-forms-next" onClick={() => setShown(shown + PAGE)} type="button">
          Show more ({forms.length - shown})
        </button>
      ) : null}
    </>
  );
}

/** With a loaded form: one line naming it and a "More forms" disclosure. Without one: the choices themselves. */
export default function NameVariantChooser(props: Props) {
  const [open, setOpen] = useState(false);
  if (!props.current) return <Choices {...props} />;
  return (
    <div className="molecule-forms" data-testid="name-forms">
      <p>
        Loaded form: <strong data-testid="name-forms-current">{nameOf(props.current)}</strong>
      </p>
      <button aria-expanded={open} className="secondary-button" data-testid="name-forms-toggle" onClick={() => setOpen(!open)} type="button">
        More forms
      </button>
      {open ? <Choices {...props} /> : null}
    </div>
  );
}
