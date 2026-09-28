import type { ChangeCounts } from '../geometry/changes.ts';
import { DEMOLISH_COLOR, NEW_COLOR } from '../scene/diffStyle.ts';

// Vista Cambios: qué significa cada color y cuántos elementos hay de cada uno.
export function Legend({ counts }: { counts: ChangeCounts }) {
  return (
    <div className="panel legend" aria-label="Leyenda de cambios">
      <span className="legend-item">
        <i style={{ background: NEW_COLOR }} />
        Nuevo · {counts.newWalls} muros, {counts.newOpenings} aberturas
      </span>
      <span className="legend-item">
        <i style={{ background: DEMOLISH_COLOR, opacity: 0.6 }} />
        Se demuele · {counts.demolishWalls} muros, {counts.demolishOpenings} aberturas
      </span>
    </div>
  );
}
