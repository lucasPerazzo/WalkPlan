import type { House, Room } from '../model/schema.ts';
import { houseBounds, type Bounds } from './bounds.ts';
import { roomProblem } from './floors.ts';
import { buildWalls, type WallBuild } from './walls.ts';

export interface HouseBuild {
  walls: WallBuild[];
  rooms: Room[];
  bounds: Bounds;
  errors: string[]; // elementos omitidos por datos inválidos
  warnings: string[]; // no bloquean
  stats: { walls: number; segments: number; openings: number; rooms: number };
}

// Recibe el modelo ya filtrado por vista (filterByView).
export function buildHouse(house: House): HouseBuild {
  const errors: string[] = [];
  const warnings: string[] = [];
  const walls = buildWalls(house.walls, house.openings, errors, warnings);
  const rooms = house.rooms.filter((r) => {
    const problem = roomProblem(r);
    if (problem) errors.push(`ambiente ${r.id}: ${problem}; se omite`);
    return !problem;
  });
  return {
    walls,
    rooms,
    bounds: houseBounds(
      walls.map((w) => w.wall),
      rooms,
    ),
    errors,
    warnings,
    stats: {
      walls: walls.length,
      segments: walls.reduce((n, w) => n + w.segments.length, 0),
      openings: walls.reduce((n, w) => n + w.openings.length, 0),
      rooms: rooms.length,
    },
  };
}
