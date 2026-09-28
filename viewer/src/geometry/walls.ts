import type { Opening, Point, Wall } from '../model/schema.ts';

export const MIN_WALL_LENGTH = 0.05;
const RANGE_TOL = 1e-3; // 1 mm de tolerancia al chequear aberturas
const EPS = 1e-6; // tramos más cortos que esto no se generan
const COLLINEAR_TOL_DEG = 1;

export interface WallFrame {
  length: number;
  dir: Point; // unitario de start a end, en el plano
  angle: number; // rotation.y de Three: atan2 con el delta del PLANO (no el de Z de Three)
}

export function wallFrame(wall: Wall): WallFrame {
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dy);
  return { length, dir: [dx / length, dy / length], angle: Math.atan2(dy, dx) };
}

// Tramo lleno de pared en coordenadas locales: u sobre el eje desde start, v en altura.
export interface WallSegment {
  kind: 'full' | 'sill' | 'lintel';
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export interface Extension {
  start: number;
  end: number;
}

export interface WallBuild {
  wall: Wall;
  frame: WallFrame;
  extension: Extension;
  openings: Opening[]; // las que se pudieron colocar, ordenadas por offset
  segments: WallSegment[];
}

// Orden natural de ids: w2 < w10.
export function compareIds(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

const fmt = (n: number) => n.toFixed(2);
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isPoint = (p: unknown): p is Point => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);
const nodeKey = (p: Point) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;

function wallProblem(w: Wall): string | null {
  if (!isPoint(w.start) || !isPoint(w.end)) return 'coordenadas inválidas';
  if (!isNum(w.thickness) || w.thickness <= 0) return `espesor inválido (${String(w.thickness)})`;
  if (!isNum(w.height) || w.height <= 0) return `altura inválida (${String(w.height)})`;
  const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
  if (len < MIN_WALL_LENGTH) return `largo ${fmt(len)} m menor a ${MIN_WALL_LENGTH} m`;
  return null;
}

function openingProblem(o: Opening, length: number, height: number): string | null {
  if (![o.offset, o.width, o.height, o.sill].every(isNum)) return 'medidas no numéricas';
  if (o.width <= 0 || o.height <= 0) return 'ancho o alto no positivo';
  if (o.offset < -RANGE_TOL) return `offset negativo (${fmt(o.offset)})`;
  if (o.offset + o.width > length + RANGE_TOL) {
    return `se sale de la pared (offset ${fmt(o.offset)} + ancho ${fmt(o.width)} > largo ${fmt(length)})`;
  }
  if (o.sill < -RANGE_TOL) return `antepecho negativo (${fmt(o.sill)})`;
  if (o.sill + o.height > height + RANGE_TOL) {
    return `supera la altura de la pared (antepecho + alto = ${fmt(o.sill + o.height)} > ${fmt(height)})`;
  }
  return null;
}

// Esquinas: en un nodo en L se extiende solo la pared de id menor, maxThickness/2.
// Nodos colineales (pared partida) y encuentros en T no se extienden: el tallo
// termina en el eje de la pasante y queda oculto dentro de ella.
export function cornerExtensions(walls: Wall[], warnings: string[]): Map<string, Extension> {
  const ext = new Map<string, Extension>(walls.map((w) => [w.id, { start: 0, end: 0 }]));
  const nodes = new Map<string, { wall: Wall; end: keyof Extension; out: Point; at: Point }[]>();
  const add = (p: Point, item: { wall: Wall; end: keyof Extension; out: Point; at: Point }) => {
    const key = nodeKey(p);
    const list = nodes.get(key);
    if (list) list.push(item);
    else nodes.set(key, [item]);
  };
  for (const w of walls) {
    const { dir } = wallFrame(w);
    add(w.start, { wall: w, end: 'start', out: dir, at: w.start });
    add(w.end, { wall: w, end: 'end', out: [-dir[0], -dir[1]], at: w.end });
  }

  const cosTol = Math.cos((COLLINEAR_TOL_DEG * Math.PI) / 180);
  const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
  const where = (p: Point) => `(${fmt(p[0])}, ${fmt(p[1])})`;

  for (const inc of nodes.values()) {
    if (inc.length === 2) {
      const [a, b] = inc;
      const d = dot(a.out, b.out);
      if (d < -cosTol) continue; // colineales
      if (d > cosTol) {
        warnings.push(`paredes ${a.wall.id} y ${b.wall.id} se superponen en ${where(a.at)}`);
        continue;
      }
      const first = compareIds(a.wall.id, b.wall.id) <= 0 ? a : b;
      ext.get(first.wall.id)![first.end] = Math.max(a.wall.thickness, b.wall.thickness) / 2;
    } else if (inc.length >= 3) {
      const hasCollinearPair = inc.some((a, i) => inc.some((b, j) => j > i && dot(a.out, b.out) < -cosTol));
      if (!hasCollinearPair) {
        const ids = inc.map((i) => i.wall.id).join(', ');
        warnings.push(`encuentro de ${inc.length} paredes sin par colineal en ${where(inc[0].at)} (${ids}); no se extiende ninguna`);
      }
    }
  }
  return ext;
}

// Parte la pared en tramos llenos: entre vanos a toda altura, y antepecho y dintel en cada vano.
export function wallSegments(
  wall: Wall,
  openings: Opening[],
  extension: Extension,
  errors: string[],
): { segments: WallSegment[]; openings: Opening[] } {
  const { length } = wallFrame(wall);
  const H = wall.height;
  const placed: Opening[] = [];
  for (const o of [...openings].sort((a, b) => a.offset - b.offset)) {
    const problem = openingProblem(o, length, H);
    if (problem) {
      errors.push(`abertura ${o.id} (pared ${wall.id}): ${problem}; se omite`);
      continue;
    }
    const prev = placed[placed.length - 1];
    if (prev && o.offset < prev.offset + prev.width - RANGE_TOL) {
      errors.push(`abertura ${o.id} se superpone con ${prev.id} en la pared ${wall.id}; se omite`);
      continue;
    }
    placed.push(o);
  }

  const segments: WallSegment[] = [];
  let cursor = -extension.start;
  for (const o of placed) {
    const u0 = Math.max(o.offset, cursor);
    const u1 = Math.min(o.offset + o.width, length);
    const top = Math.min(o.sill + o.height, H);
    if (u0 - cursor > EPS) segments.push({ kind: 'full', u0: cursor, u1: u0, v0: 0, v1: H });
    if (o.sill > EPS) segments.push({ kind: 'sill', u0, u1, v0: 0, v1: o.sill });
    if (H - top > EPS) segments.push({ kind: 'lintel', u0, u1, v0: top, v1: H });
    cursor = u1;
  }
  const uEnd = length + extension.end;
  if (uEnd - cursor > EPS) segments.push({ kind: 'full', u0: cursor, u1: uEnd, v0: 0, v1: H });
  return { segments, openings: placed };
}

export function buildWalls(walls: Wall[], openings: Opening[], errors: string[], warnings: string[]): WallBuild[] {
  const valid: Wall[] = [];
  const omitted = new Set<string>();
  const seen = new Set<string>();
  for (const w of walls) {
    const problem = seen.has(w.id) ? 'id duplicado' : wallProblem(w);
    seen.add(w.id);
    if (problem) {
      errors.push(`pared ${w.id}: ${problem}; se omite`);
      omitted.add(w.id);
    } else {
      valid.push(w);
    }
  }

  const byWall = new Map<string, Opening[]>(valid.map((w) => [w.id, []]));
  for (const o of openings) {
    const list = byWall.get(o.wall);
    if (list) list.push(o);
    else if (omitted.has(o.wall)) errors.push(`abertura ${o.id}: su pared ${o.wall} fue omitida; se omite`);
    else errors.push(`abertura ${o.id}: la pared ${o.wall} no existe; se omite`);
  }

  const extensions = cornerExtensions(valid, warnings);
  return valid.map((wall) => {
    const extension = extensions.get(wall.id)!;
    const { segments, openings: placed } = wallSegments(wall, byWall.get(wall.id)!, extension, errors);
    return { wall, frame: wallFrame(wall), extension, openings: placed, segments };
  });
}

export interface SegmentTransform {
  position: [number, number, number]; // Three
  rotationY: number;
  size: [number, number, number]; // largo (x local), alto, espesor (z local)
}

// Un tramo se ubica en start + dir * (u0 + u1)/2, a altura (v0 + v1)/2; plano (x, y) → Three (x, h, -y).
export function segmentTransform(build: WallBuild, s: WallSegment): SegmentTransform {
  const { wall, frame } = build;
  const um = (s.u0 + s.u1) / 2;
  const x = wall.start[0] + frame.dir[0] * um;
  const y = wall.start[1] + frame.dir[1] * um;
  return {
    position: [x, (s.v0 + s.v1) / 2, -y],
    rotationY: frame.angle,
    size: [s.u1 - s.u0, s.v1 - s.v0, wall.thickness],
  };
}
