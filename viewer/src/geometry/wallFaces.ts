import type { Point, Wall } from '../model/schema.ts';
import { insideHouse } from './spawn.ts';
import type { WallBuild } from './walls.ts';

export type FaceRole = 'facade' | 'interior';

// Buffers crudos para una BufferGeometry indexada (sin depender de three).
export interface FaceBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

const empty = (): FaceBuffers => ({ positions: [], normals: [], uvs: [], indices: [] });
type V3 = [number, number, number];

function pushQuad(b: FaceBuffers, corners: V3[], normal: V3, uvs: [number, number][]) {
  // Orden tal que la cara frontal (antihoraria) mire hacia `normal`.
  const [a, c1, c2] = corners;
  const e1 = [c1[0] - a[0], c1[1] - a[1], c1[2] - a[2]];
  const e2 = [c2[0] - a[0], c2[1] - a[1], c2[2] - a[2]];
  const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const flip = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] < 0;
  const base = b.positions.length / 3;
  corners.forEach((p, i) => {
    b.positions.push(...p);
    b.normals.push(...normal);
    b.uvs.push(...uvs[i]);
  });
  if (flip) b.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  else b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// Lado de la fachada de un muro exterior: el que da afuera de la casa (derecha = normal (dy, -dx)).
export function facadeSide(wall: Wall, exteriorWalls: Wall[]): 'right' | 'left' | null {
  if (wall.kind !== 'exterior') return null;
  const dx = wall.end[0] - wall.start[0];
  const dy = wall.end[1] - wall.start[1];
  const L = Math.hypot(dx, dy);
  const off = wall.thickness / 2 + 0.3;
  const probe: Point = [(wall.start[0] + wall.end[0]) / 2 + (dy / L) * off, (wall.start[1] + wall.end[1]) / 2 - (dx / L) * off];
  return insideHouse(probe, exteriorWalls) ? 'left' : 'right';
}

/**
 * Caras de todos los tramos agrupadas por rol (una malla por material).
 * UV en metros: u = distancia sobre el eje desde el start de la pared (continua entre tramos), v = altura.
 * Muros exteriores: la cara que da afuera y los cantos van con la fachada; la de adentro, con el interior.
 * Con `splitNew` (vista Cambios), los muros nuevos van enteros a `new` para teñirlos.
 */
export function buildWallFaces(walls: WallBuild[], splitNew = false): Record<FaceRole | 'new', FaceBuffers> {
  const out: Record<FaceRole | 'new', FaceBuffers> = { facade: empty(), interior: empty(), new: empty() };
  const exterior = walls.map((w) => w.wall).filter((w) => w.kind === 'exterior');
  for (const w of walls) {
    const [dx, dy] = w.frame.dir;
    const n: Point = [dy, -dx];
    const s = w.wall.start;
    const h = w.wall.thickness / 2;
    const side = facadeSide(w.wall, exterior);
    const highlight = splitNew && w.wall.status === 'new';
    const roleOf = (face: 'right' | 'left' | 'edge'): FaceRole | 'new' =>
      highlight ? 'new' : side === null ? 'interior' : face === 'edge' || face === side ? 'facade' : 'interior';
    // Punto del tramo: u sobre el eje, off hacia la normal derecha, v en altura -> Three (x, v, -y).
    const P = (u: number, off: number, v: number): V3 => [s[0] + dx * u + n[0] * off, v, -(s[1] + dy * u + n[1] * off)];
    const N = (x: number, y: number, up = 0): V3 => [x, up, -y];

    for (const seg of w.segments) {
      const { u0, u1, v0, v1 } = seg;
      pushQuad(out[roleOf('right')], [P(u0, h, v0), P(u1, h, v0), P(u1, h, v1), P(u0, h, v1)], N(n[0], n[1]), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      pushQuad(out[roleOf('left')], [P(u0, -h, v0), P(u1, -h, v0), P(u1, -h, v1), P(u0, -h, v1)], N(-n[0], -n[1]), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      const edge = out[roleOf('edge')];
      pushQuad(edge, [P(u0, -h, v1), P(u1, -h, v1), P(u1, h, v1), P(u0, h, v1)], [0, 1, 0], [[u0, -h], [u1, -h], [u1, h], [u0, h]]);
      if (v0 > 1e-6) {
        pushQuad(edge, [P(u0, -h, v0), P(u1, -h, v0), P(u1, h, v0), P(u0, h, v0)], [0, -1, 0], [[u0, -h], [u1, -h], [u1, h], [u0, h]]);
      }
      for (const [u, sign] of [[u0, -1], [u1, 1]] as const) {
        pushQuad(edge, [P(u, -h, v0), P(u, h, v0), P(u, h, v1), P(u, -h, v1)], N(dx * sign, dy * sign), [[-h, v0], [h, v0], [h, v1], [-h, v1]]);
      }
    }
  }
  return out;
}
