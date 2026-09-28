import type { Point } from '../model/schema.ts';
import type { HouseBuild } from './buildHouse.ts';
import { segmentTransform } from './walls.ts';

// Vista Cambios: lo que se demuele, para dibujar en rojo semitransparente sobre la geometría de la Reforma.
// - Muros a demoler: sus tramos tal como están hoy (de la vista Actual, con sus vanos).
// - Aberturas que se cierran en muros que quedan: un paño en el vano viejo, salvo donde una abertura
//   nueva de la misma pared lo vuelve a ocupar (cambio de abertura).
// Las cajas se agrandan 1 cm por lado para no pelear en profundidad con los muros que quedan.

export interface ChangeBox {
  id: string; // muro o abertura
  kind: 'wall' | 'opening';
  center: Point; // plano
  z: number; // centro en altura
  size: [number, number, number]; // a lo largo de la pared, alto, espesor
  angle: number; // rotation.y
}

const INFLATE = 0.01;

// Intervalo [a, b] menos otros intervalos.
export function subtractSpans([a, b]: [number, number], cuts: [number, number][]): [number, number][] {
  let out: [number, number][] = [[a, b]];
  for (const [c, d] of cuts) {
    out = out.flatMap(([x, y]): [number, number][] => {
      if (d <= x || c >= y) return [[x, y]];
      const parts: [number, number][] = [];
      if (c > x) parts.push([x, c]);
      if (d < y) parts.push([d, y]);
      return parts;
    });
  }
  return out.filter(([x, y]) => y - x > 1e-3);
}

export function demolitions(actual: HouseBuild, reforma: HouseBuild): ChangeBox[] {
  const out: ChangeBox[] = [];
  const reopened = new Map(reforma.walls.map((w) => [w.wall.id, w.openings.filter((o) => o.status === 'new')]));
  for (const w of actual.walls) {
    if (w.wall.status === 'demolish') {
      for (const s of w.segments) {
        const t = segmentTransform(w, s);
        out.push({
          id: w.wall.id,
          kind: 'wall',
          center: [t.position[0], -t.position[2]],
          z: t.position[1],
          size: [t.size[0] + 2 * INFLATE, t.size[1] + INFLATE, t.size[2] + 2 * INFLATE],
          angle: t.rotationY,
        });
      }
      continue;
    }
    const [dx, dy] = w.frame.dir;
    for (const o of w.openings) {
      if (o.status !== 'demolish') continue;
      const cuts = (reopened.get(w.wall.id) ?? []).map((n): [number, number] => [n.offset, n.offset + n.width]);
      for (const [u0, u1] of subtractSpans([o.offset, o.offset + o.width], cuts)) {
        const um = (u0 + u1) / 2;
        out.push({
          id: o.id,
          kind: 'opening',
          center: [w.wall.start[0] + dx * um, w.wall.start[1] + dy * um],
          z: o.sill + o.height / 2,
          size: [u1 - u0, o.height, w.wall.thickness + 2 * INFLATE],
          angle: w.frame.angle,
        });
      }
    }
  }
  return out;
}

export interface ChangeCounts {
  newWalls: number;
  newOpenings: number;
  demolishWalls: number;
  demolishOpenings: number;
}

export function changeCounts(actual: HouseBuild, reforma: HouseBuild): ChangeCounts {
  return {
    newWalls: reforma.walls.filter((w) => w.wall.status === 'new').length,
    newOpenings: reforma.walls.reduce((n, w) => n + w.openings.filter((o) => o.status === 'new').length, 0),
    demolishWalls: actual.walls.filter((w) => w.wall.status === 'demolish').length,
    demolishOpenings: actual.walls.reduce((n, w) => n + w.openings.filter((o) => o.status === 'demolish').length, 0),
  };
}
