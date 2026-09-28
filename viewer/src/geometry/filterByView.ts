import type { House, Status } from '../model/schema.ts';

// Cambios (diff) usa la geometría de la Reforma; lo que se demuele se dibuja encima aparte (changes.ts),
// así las aberturas viejas y nuevas de un mismo tramo no chocan.
export type ViewMode = 'actual' | 'reforma' | 'diff';

const VISIBLE: Record<ViewMode, readonly Status[]> = {
  actual: ['existing', 'demolish'],
  reforma: ['existing', 'new'],
  diff: ['existing', 'new'],
};

export const isVisible = (s: Status, mode: ViewMode) => VISIBLE[mode].includes(s);

// Se aplica al modelo antes de generar geometría: las esquinas dependen de qué paredes quedan.
export function filterByView(house: House, mode: ViewMode): House {
  const visible = (s: Status) => isVisible(s, mode);
  // Las aberturas de una pared oculta desaparecen con ella. Las que apuntan a una
  // pared inexistente se dejan pasar para que la geometría las reporte como error.
  const hiddenWalls = new Set(house.walls.filter((w) => !visible(w.status)).map((w) => w.id));
  return {
    ...house,
    walls: house.walls.filter((w) => visible(w.status)),
    openings: house.openings.filter((o) => visible(o.status) && !hiddenWalls.has(o.wall)),
    rooms: house.rooms.filter((r) => visible(r.status)),
    furniture: house.furniture.filter((f) => visible(f.status)),
  };
}
