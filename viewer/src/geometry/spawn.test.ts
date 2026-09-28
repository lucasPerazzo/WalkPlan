import { describe, expect, it } from 'vitest';
import example from '../../public/house.example.json';
import { parseHouse } from '../model/loadHouse.ts';
import type { Wall } from '../model/schema.ts';
import { buildDoors, type Door } from './doors.ts';
import { buildHouse } from './buildHouse.ts';
import { filterByView } from './filterByView.ts';
import { insideHouse, mainDoor, outwardNormal, spawnPoint } from './spawn.ts';
import { buildFrames } from './frames.ts';

const build = buildHouse(filterByView(parseHouse(example), 'reforma'));
const walls: Wall[] = build.walls.map((w) => w.wall);
const doors = buildDoors(build.walls);

describe('insideHouse / outwardNormal', () => {
  it('distingue adentro y afuera con los muros exteriores', () => {
    expect(insideHouse([4, 2.5], walls)).toBe(true);
    expect(insideHouse([2, 4.9], walls)).toBe(true);
    expect(insideHouse([4, -1], walls)).toBe(false);
    expect(insideHouse([9, 2.5], walls)).toBe(false);
  });

  it('la normal exterior de la puerta de entrada apunta a -y', () => {
    const entrance = doors.find((d) => d.opening.id === 'o1')!;
    const n = outwardNormal(entrance, walls);
    expect(n[0]).toBeCloseTo(0);
    expect(n[1]).toBeCloseTo(-1);
  });
});

describe('spawnPoint', () => {
  it('afuera, a 3 m de la puerta principal, mirando a la casa', () => {
    const s = spawnPoint(doors, walls, build.bounds);
    expect(s.doorId).toBe('o1');
    expect(s.position[0]).toBeCloseTo(1.95);
    expect(s.position[1]).toBeCloseTo(-3);
    expect(s.yaw).toBeCloseTo(90);
    expect(insideHouse(s.position, walls)).toBe(false);
  });

  it('la puerta principal es la batiente exterior más ancha', () => {
    const d = (id: string, width: number, exterior = true, type: Door['opening']['type'] = 'door') =>
      ({ exterior, opening: { id, type, width } }) as Door;
    expect(mainDoor([d('a', 0.8), d('b', 1.2), d('c', 1.2), d('i', 1.5, false), d('s', 3, true, 'sliding_door')])?.opening.id).toBe('b');
  });

  it('sin puertas exteriores: frente al centro del bounding box', () => {
    const s = spawnPoint([], walls, build.bounds);
    expect(s.position[1]).toBeLessThan(build.bounds.minY);
    expect(s.yaw).toBe(90);
  });
});

describe('buildFrames', () => {
  it('ventana: marco perimetral + vidrio con colisión; puerta: jambas y dintel del ancho del muro', () => {
    const frames = buildFrames(build.walls);
    const win = frames.filter((f) => f.openingId === 'o2');
    expect(win.filter((f) => f.kind === 'frame')).toHaveLength(4);
    const glass = win.filter((f) => f.kind === 'glass');
    expect(glass).toHaveLength(1);
    expect(glass[0].collider).toBe(true);
    const door = frames.filter((f) => f.openingId === 'o1');
    expect(door).toHaveLength(3);
    expect(door[0].size[2]).toBeCloseTo(0.22);
  });
});
