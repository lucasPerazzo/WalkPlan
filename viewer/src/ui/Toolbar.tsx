import { useRef } from 'react';
import type { ViewMode } from '../geometry/filterByView.ts';
import type { ViewKind } from '../scene/Viewer.tsx';

const VIEWS: { id: ViewKind; label: string; key: string }[] = [
  { id: 'fps', label: 'Primera persona', key: '1' },
  { id: 'orbit', label: 'Maqueta', key: '2' },
  { id: 'plan', label: 'Planta', key: '3' },
];

const HINTS: Record<ViewKind, string> = {
  fps: 'WASD: caminar · Shift: correr · E: puertas · M: medir · Esc: soltar el mouse',
  orbit: 'Arrastrar: girar · Rueda: zoom · Clic derecho: desplazar · 1: volver al recorrido',
  plan: 'Mueble: arrastrar para mover · Manija o Q/E: girar (Shift: libre) · Supr: borrar · M: medir · 1: recorrido',
};

const TOUCH_HINTS: Record<ViewKind, string> = {
  fps: 'Joystick: caminar · Arrastrar a la derecha: mirar',
  orbit: 'Arrastrar: girar · Pellizcar: zoom',
  plan: 'Mueble: arrastrar para mover · Manija: girar · Pellizcar: zoom',
};

interface Props {
  view: ViewKind;
  onView: (v: ViewKind) => void;
  onOpenFile: (f: File) => void;
  title: string;
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
  touch: boolean;
  dirty: boolean; // muebles editados sin exportar
  onExport: () => void;
}

const MODES: { id: ViewMode; label: string; title: string }[] = [
  { id: 'actual', label: 'Actual', title: 'La casa hoy: lo existente y lo que se va a demoler' },
  { id: 'reforma', label: 'Reforma', title: 'La casa reformada: lo existente y lo nuevo' },
  { id: 'diff', label: 'Cambios', title: 'Lo nuevo en verde y lo que se demuele en rojo' },
];

export function Toolbar({ view, onView, onOpenFile, title, mode, onMode, touch, dirty, onExport }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <header className="toolbar">
        <div className="panel brand">
          <span className="eyebrow">Recorrido 3D</span>
          <span className="brand-title" title={title}>
            {title}
          </span>
        </div>
        <div className="toolbar-center">
          <nav className="panel segmented" aria-label="Vista">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={view === v.id}
                title={touch ? undefined : `Tecla ${v.key}`}
                onClick={() => onView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </nav>
          <nav className="panel segmented" aria-label="Proyecto">
            {MODES.map((m) => (
              <button key={m.id} type="button" aria-pressed={mode === m.id} title={m.title} onClick={() => onMode(m.id)}>
                {m.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="panel actions">
          <button type="button" className="btn" onClick={() => input.current?.click()}>
            Abrir JSON
          </button>
          <button
            type="button"
            className="btn"
            data-dirty={dirty}
            onClick={onExport}
            title={dirty ? 'Hay cambios en los muebles sin exportar' : 'Descargar el house.json'}
          >
            Exportar JSON
          </button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onOpenFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </header>
      {!(touch && view === 'fps') && <p className="panel hint">{(touch ? TOUCH_HINTS : HINTS)[view]}</p>}
    </>
  );
}
