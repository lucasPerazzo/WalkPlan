import type { UncertaintyEntry } from '../geometry/uncertainty.ts';

const CONFIDENCE = { low: 'baja', medium: 'media' } as const;

interface Props {
  entries: UncertaintyEntry[];
  open: boolean;
  onToggle: () => void;
  focused: string | null;
  onFocus: (entry: UncertaintyEntry) => void;
}

// Lo que la extracción tuvo que suponer (para consultar con el arquitecto). Las que apuntan a un
// elemento lo muestran en planta; las generales solo se listan.
export function UncertaintiesPanel({ entries, open, onToggle, focused, onFocus }: Props) {
  const low = entries.filter((e) => e.confidence === 'low').length;
  return (
    <section className="panel doubts" aria-label="Dudas del plano">
      <button type="button" className="doubts-head" aria-expanded={open} onClick={onToggle}>
        <span className="eyebrow">Dudas del plano</span>
        <span className="count count-warn">{entries.length}</span>
        {low > 0 && <span className="doubts-low">{low} de confianza baja</span>}
        <span className="issues-toggle">{open ? 'Ocultar' : 'Ver'}</span>
      </button>
      {open && (
        <ol className="doubts-list">
          {entries.map((e, i) => (
            <li key={i}>
              <button
                type="button"
                className="doubt"
                data-confidence={e.confidence}
                aria-current={e.target !== null && e.target.id === focused}
                disabled={!e.target}
                title={e.target ? 'Ver en planta' : undefined}
                onClick={() => onFocus(e)}
              >
                <span className="doubt-target">
                  {e.target?.label ?? (e.element_id ? `${e.element_id} (no está en el modelo)` : 'General')}
                  <span className="doubt-badge">{CONFIDENCE[e.confidence]}</span>
                </span>
                <span className="doubt-note">{e.note}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
