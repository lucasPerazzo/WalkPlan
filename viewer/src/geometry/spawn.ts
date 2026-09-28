import type { Point, Wall } from '../model/schema.ts';
import { boundsCenter, type Bounds } from './bounds.ts';
import type { Door } from './doors.ts';

export const SPAWN_DISTANCE = 3;

// Punto dentro de la casa: rayo hacia +x, cruces impares con los ejes de las paredes exteriores.
export function insideHouse(p: Point, walls: Wall[]): boolean {
  let inside = false;
  for (const w of walls) {
    if (w.kind !== 'exterior') continue;
    const [x0, y0] = w.start;
    const [x1, y1] = w.end;
    if (y0 > p[1] !== y1 > p[1]) {
      const x = x0 + ((p[1] - y0) * (x1 - x0)) / (y1 - y0);
      if (x > p[0]) inside = !inside;
    }
  }
  return inside;
}

// Normal de la pared que apunta hacia afuera de la casa.
export function outwardNormal(door: Door, walls: Wall[]): Point {
  const [nx, ny] = door.normal;
  const probe: Point = [door.center[0] + nx * 0.5, door.center[1] + ny * 0.5];
  return insideHouse(probe, walls) ? [-nx, -ny] : [nx, ny];
}

export interface Spawn {
  position: Point; // plano
  yaw: number; // grados antihorario desde +x del plano
  doorId?: string;
}

// Puerta principal: la batiente exterior más ancha visible (a igual ancho, la primera).
export function mainDoor(doors: Door[]): Door | undefined {
  let best: Door | undefined;
  for (const d of doors) {
    if (!d.exterior || d.opening.type !== 'door') continue;
    if (!best || d.opening.width > best.opening.width + 1e-6) best = d;
  }
  return best;
}

// Afuera, a 3 m frente a la puerta principal, mirando hacia la casa.
export function spawnPoint(doors: Door[], walls: Wall[], bounds: Bounds): Spawn {
  const door = mainDoor(doors);
  if (!door) {
    const [cx] = boundsCenter(bounds);
    return { position: [cx, bounds.minY - SPAWN_DISTANCE], yaw: 90 };
  }
  const [nx, ny] = outwardNormal(door, walls);
  return {
    position: [door.center[0] + nx * SPAWN_DISTANCE, door.center[1] + ny * SPAWN_DISTANCE],
    yaw: (Math.atan2(-ny, -nx) * 180) / Math.PI,
    doorId: door.opening.id,
  };
}
