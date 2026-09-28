import { useState } from 'react';
import { CATALOG, CATALOG_KEYS } from '../furniture/catalog.ts';
import { ROTATE_STEP } from '../geometry/furnitureEdit.ts';
import type { FurnitureItem } from '../model/schema.ts';

const fmt = (v: number) => v.toFixed(2).replace('.', ',');

interface Props {
  selected: FurnitureItem | null;
  roomName: string | null; // null = exterior
  touch: boolean;
  onRotate: (delta: number) => void;
  onDelete: () => void;
  onAdd: (catalog: string) => void;
  measuring: boolean;
  measureCount: number;
  onToggleMeasure: () => void;
  onClearMeasures: () => void;
}

// Vista planta: medición, el mueble seleccionado y el alta desde el catálogo.
export function EditorPanel(props: Props) {
  const { selected, roomName, touch, onRotate, onDelete, onAdd, measuring, measureCount, onToggleMeasure, onClearMeasures } = props;
  const [key, setKey] = useState(CATALOG_KEYS[0]);
  return (
    <aside className="panel editor" aria-label="Planta">
      <div className="editor-measure">
        <button type="button" className="btn toggle" aria-pressed={measuring} onClick={onToggleMeasure} title={touch ? undefined : 'Tecla M'}>
          Medir
        </button>
        {measureCount > 0 && (
          <button type="button" className="btn" onClick={onClearMeasures}>
            Borrar cotas ({measureCount})
          </button>
        )}
      </div>
      {measuring ? (
        <p className="editor-empty">Clic en dos puntos: se enganchan a esquinas y caras de muro. Shift: cota recta · Esc: cancelar · M: terminar.</p>
      ) : (
        <>
          <span className="eyebrow">Muebles</span>
          {selected ? (
            <div className="editor-item">
              <div className="editor-title">
                <strong>{selected.catalog}</strong>
                <span className="chip">{selected.id}</span>
              </div>
              <dl className="editor-facts">
                <dt>Ambiente</dt>
                <dd>{roomName ?? 'Exterior'}</dd>
                <dt>Posición</dt>
                <dd>
                  {fmt(selected.position[0])} ; {fmt(selected.position[1])} m
                </dd>
                <dt>Giro</dt>
                <dd>{selected.rotation}°</dd>
              </dl>
              <div className="editor-actions">
                <button type="button" className="btn" onClick={() => onRotate(ROTATE_STEP)} title={touch ? undefined : 'Tecla Q (Shift: 1°)'}>
                  ⟲ {ROTATE_STEP}°
                </button>
                <button type="button" className="btn" onClick={() => onRotate(-ROTATE_STEP)} title={touch ? undefined : 'Tecla E (Shift: 1°)'}>
                  ⟳ {ROTATE_STEP}°
                </button>
                <button type="button" className="btn btn-danger" onClick={onDelete} title={touch ? undefined : 'Tecla Supr'}>
                  Borrar
                </button>
              </div>
            </div>
          ) : (
            <p className="editor-empty">Tocá un mueble para moverlo, girarlo o borrarlo.</p>
          )}
          <div className="editor-add">
            <select value={key} onChange={(e) => setKey(e.target.value)} aria-label="Mueble del catálogo">
              {CATALOG_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k} · {fmt(CATALOG[k].width)}×{fmt(CATALOG[k].depth)}
                </option>
              ))}
            </select>
            <button type="button" className="btn" onClick={() => onAdd(key)}>
              Agregar
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
