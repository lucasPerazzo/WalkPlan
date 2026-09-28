import type { Point } from '../model/schema.ts';
import type { WallBuild } from './walls.ts';

const PROFILE = 0.05; // ancho visto del marco
const FRAME_DEPTH = 0.07; // marco de ventana
const GLASS = 0.012;

// Caja de carpintería en el plano: centro sobre el eje de la pared (+ desplazamiento normal), en altura z.
export interface FrameBox {
  kind: 'frame' | 'glass';
  openingId: string;
  center: Point;
  z: number; // centro en altura
  size: [number, number, number]; // a lo largo de la pared, alto, espesor
  angle: number; // rotation.y
  collider: boolean;
}

// Ventanas: marco perimetral + vidrio (con colisión, hay paños con antepecho 0).
// Puertas y corredizas: jambas y dintel del ancho del muro. Los vanos 'opening' quedan libres, salvo
// con `outlineOpenings` (vista Cambios), que les pone jambas y dintel para que un paso nuevo se vea.
export function buildFrames(walls: WallBuild[], outlineOpenings = false): FrameBox[] {
  const out: FrameBox[] = [];
  for (const w of walls) {
    const [dx, dy] = w.frame.dir;
    const angle = w.frame.angle;
    const at = (u: number): Point => [w.wall.start[0] + dx * u, w.wall.start[1] + dy * u];
    for (const o of w.openings) {
      if (o.type === 'opening' && !(outlineOpenings && o.status === 'new')) continue;
      const u0 = o.offset;
      const u1 = o.offset + o.width;
      const v0 = o.sill;
      const v1 = o.sill + o.height;
      const depth = o.type === 'window' ? FRAME_DEPTH : w.wall.thickness + 0.02;
      const box = (kind: FrameBox['kind'], a: number, b: number, lo: number, hi: number, d: number, collider = false) =>
        out.push({ kind, openingId: o.id, center: at((a + b) / 2), z: (lo + hi) / 2, size: [b - a, hi - lo, d], angle, collider });
      box('frame', u0, u0 + PROFILE, v0, v1, depth); // jambas
      box('frame', u1 - PROFILE, u1, v0, v1, depth);
      box('frame', u0, u1, v1 - PROFILE, v1, depth); // dintel
      if (o.type === 'window') {
        box('frame', u0, u1, v0, v0 + PROFILE, depth); // alféizar
        box('glass', u0 + PROFILE, u1 - PROFILE, v0 + PROFILE, v1 - PROFILE, GLASS, true);
      }
    }
  }
  return out;
}
