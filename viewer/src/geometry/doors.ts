import type { Opening, Point } from '../model/schema.ts';
import type { WallBuild } from './walls.ts';

export const LEAF_THICKNESS = 0.04;
const DOUBLE_LEAF_MIN = 1.2; // puertas batientes más anchas: dos hojas (pivot, doble)
const SLIDING_DOUBLE_MIN = 1.6;
const GAP = 0.01;

// Hoja de puerta en coordenadas del plano. Las batientes giran sobre `hinge`; las corredizas se desplazan
// sobre el eje de la pared.
export interface DoorLeaf {
  id: string; // `${opening.id}-${i}`
  openingId: string;
  kind: 'hinged' | 'sliding';
  width: number;
  height: number;
  hinge: Point; // batiente: bisagra; corrediza: posición cerrada del borde de arranque
  dirAngle: number; // ángulo en planta de la hoja cerrada, de la bisagra hacia el otro extremo
  rightTurn: number; // batiente: giro (±π/2) que lleva la hoja hacia el lado derecho de la pared
  slide: Point; // corrediza: desplazamiento total al abrir
}

export interface Door {
  opening: Opening;
  wallId: string;
  exterior: boolean;
  center: Point; // centro del vano sobre el eje
  normal: Point; // normal derecha de la pared (dy, -dx)
  leaves: DoorLeaf[];
}

export function buildDoors(walls: WallBuild[]): Door[] {
  const doors: Door[] = [];
  for (const w of walls) {
    const [dx, dy] = w.frame.dir;
    const at = (u: number): Point => [w.wall.start[0] + dx * u, w.wall.start[1] + dy * u];
    const along = Math.atan2(dy, dx);
    for (const o of w.openings) {
      if (o.type !== 'door' && o.type !== 'sliding_door') continue;
      const u0 = o.offset;
      const u1 = o.offset + o.width;
      const height = o.height - GAP;
      const leaves: DoorLeaf[] = [];
      if (o.type === 'door') {
        const n = o.width > DOUBLE_LEAF_MIN ? 2 : 1;
        const lw = o.width / n - GAP;
        // Hoja 0 en la jamba de start, abre llevando +dir hacia la normal derecha (giro -90°).
        leaves.push({ id: `${o.id}-0`, openingId: o.id, kind: 'hinged', width: lw, height, hinge: at(u0), dirAngle: along, rightTurn: -Math.PI / 2, slide: [0, 0] });
        if (n === 2) {
          // Hoja 1 en la jamba de end, apunta hacia -dir: el giro hacia la derecha es +90°.
          leaves.push({ id: `${o.id}-1`, openingId: o.id, kind: 'hinged', width: lw, height, hinge: at(u1), dirAngle: along + Math.PI, rightTurn: Math.PI / 2, slide: [0, 0] });
        }
      } else {
        const n = o.width > SLIDING_DOUBLE_MIN ? 2 : 1;
        const lw = o.width / n + (n === 2 ? 0.05 : 0); // las dos hojas se solapan un poco al cerrar
        const shift = n === 2 ? o.width / 2 - 0.05 : o.width; // una sola hoja entra en la pared
        leaves.push({ id: `${o.id}-0`, openingId: o.id, kind: 'sliding', width: lw, height, hinge: at(u0), dirAngle: along, rightTurn: 0, slide: [dx * shift, dy * shift] });
        if (n === 2) {
          leaves.push({ id: `${o.id}-1`, openingId: o.id, kind: 'sliding', width: lw, height, hinge: at(u1 - lw), dirAngle: along, rightTurn: 0, slide: [0, 0] });
        }
      }
      doors.push({
        opening: o,
        wallId: w.wall.id,
        exterior: w.wall.kind === 'exterior',
        center: at((u0 + u1) / 2),
        normal: [dy, -dx],
        leaves,
      });
    }
  }
  return doors;
}

export interface LeafPose {
  hinge: Point; // punto de giro (batiente) o arranque desplazado (corrediza)
  angle: number; // rotación en planta: rotation.y de Three
}

// openness 0 = cerrada, 1 = abierta. side +1 abre hacia la derecha de la pared, -1 hacia la izquierda.
export function leafPose(leaf: DoorLeaf, openness: number, side: 1 | -1): LeafPose {
  if (leaf.kind === 'sliding') {
    return { hinge: [leaf.hinge[0] + leaf.slide[0] * openness, leaf.hinge[1] + leaf.slide[1] * openness], angle: leaf.dirAngle };
  }
  return { hinge: leaf.hinge, angle: leaf.dirAngle + leaf.rightTurn * side * openness };
}

// Centro de la hoja (plano) para una pose dada: a medio ancho de la bisagra, en la dirección de la hoja.
export function leafCenter(leaf: DoorLeaf, pose: LeafPose): Point {
  return [pose.hinge[0] + Math.cos(pose.angle) * (leaf.width / 2), pose.hinge[1] + Math.sin(pose.angle) * (leaf.width / 2)];
}

// Hacia qué lado abrir para empujar la puerta: el opuesto a donde está la persona.
export function pushSide(door: Door, person: Point): 1 | -1 {
  const s = (person[0] - door.center[0]) * door.normal[0] + (person[1] - door.center[1]) * door.normal[1];
  return s > 0 ? -1 : 1;
}
