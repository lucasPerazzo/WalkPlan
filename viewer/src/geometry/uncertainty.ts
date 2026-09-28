import type { House, Point, Status, Uncertainty } from '../model/schema.ts';
import type { ViewMode } from './filterByView.ts';
import { footprint } from './furnitureEdit.ts';

// Panel de dudas del plano: a qué elemento apunta cada incertidumbre, su huella en planta (para
// resaltarlo) y en qué vistas existe (un muro a demoler no está en la Reforma).

export interface UncertaintyTarget {
  id: string;
  label: string; // "Ventana o1", "Muro w59 (a demoler)", nombre del ambiente...
  outline: Point[]; // huella en planta
  center: Point;
  status: Status;
}

export interface UncertaintyEntry extends Uncertainty {
  target: UncertaintyTarget | null; // null: duda general o id que no existe
}

const STATUS_LABEL: Record<Status, string> = { existing: '', new: ' (nuevo)', demolish: ' (a demoler)' };
const OPENING_LABEL: Record<string, string> = { door: 'Puerta', window: 'Ventana', sliding_door: 'Corrediza', opening: 'Vano' };

function rect(a: Point, b: Point, half: number): Point[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const n: Point = [(dy / L) * half, (-dx / L) * half];
  return [
    [a[0] + n[0], a[1] + n[1]],
    [b[0] + n[0], b[1] + n[1]],
    [b[0] - n[0], b[1] - n[1]],
    [a[0] - n[0], a[1] - n[1]],
  ];
}

const centroid = (pts: Point[]): Point => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

export function resolveTarget(house: House, id: string): UncertaintyTarget | null {
  const wall = house.walls.find((w) => w.id === id);
  if (wall) {
    const outline = rect(wall.start, wall.end, wall.thickness / 2 + 0.05);
    return { id, label: `Muro ${id}${STATUS_LABEL[wall.status]}`, outline, center: centroid(outline), status: wall.status };
  }
  const o = house.openings.find((x) => x.id === id);
  if (o) {
    const w = house.walls.find((x) => x.id === o.wall);
    if (!w) return null;
    const L = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
    const at = (u: number): Point => [w.start[0] + ((w.end[0] - w.start[0]) * u) / L, w.start[1] + ((w.end[1] - w.start[1]) * u) / L];
    const outline = rect(at(o.offset), at(o.offset + o.width), w.thickness / 2 + 0.12);
    return { id, label: `${OPENING_LABEL[o.type] ?? 'Abertura'} ${id}${STATUS_LABEL[o.status]}`, outline, center: centroid(outline), status: o.status };
  }
  const room = house.rooms.find((r) => r.id === id);
  if (room) return { id, label: `${room.name} (${id})${STATUS_LABEL[room.status]}`, outline: room.polygon, center: centroid(room.polygon), status: room.status };
  const f = house.furniture.find((x) => x.id === id);
  if (f) {
    const outline = footprint(f);
    return { id, label: `${f.catalog} ${id}`, outline, center: f.position, status: f.status };
  }
  return null;
}

// Primero las de confianza baja (las que más conviene consultar con el arquitecto).
export function uncertaintyEntries(house: House): UncertaintyEntry[] {
  const order = { low: 0, medium: 1 } as const;
  return [...(house.meta.uncertainties ?? [])]
    .sort((a, b) => order[a.confidence] - order[b.confidence])
    .map((u) => ({ ...u, target: u.element_id ? resolveTarget(house, u.element_id) : null }));
}

// Vista donde se ve el elemento: la actual si ya se ve; si no, Cambios (muestra lo nuevo y lo demolido).
export function modeShowing(status: Status, current: ViewMode): ViewMode {
  if (status === 'existing' || current === 'diff') return current;
  if (status === 'new') return current === 'reforma' ? current : 'diff';
  return current === 'actual' ? current : 'diff';
}
