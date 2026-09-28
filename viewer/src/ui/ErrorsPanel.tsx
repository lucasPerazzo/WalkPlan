import { useState } from 'react';

// Elementos omitidos por datos inválidos (errors) y avisos que no bloquean (warnings).
export function ErrorsPanel({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  const [open, setOpen] = useState(false);
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <aside className="panel issues">
      <button type="button" className="issues-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {errors.length > 0 && <span className="count count-err">{errors.length} omitidos</span>}
        {warnings.length > 0 && <span className="count count-warn">{warnings.length} avisos</span>}
        <span className="issues-toggle">{open ? 'Ocultar' : 'Ver detalle'}</span>
      </button>
      {open && (
        <ul className="issues-list">
          {errors.map((e) => (
            <li key={`e-${e}`} className="issue-err">
              {e}
            </li>
          ))}
          {warnings.map((w) => (
            <li key={`w-${w}`} className="issue-warn">
              {w}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
