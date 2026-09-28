import { describe, expect, it } from 'vitest';
import example from '../../public/house.example.json';
import { buildDoors } from '../geometry/doors.ts';
import { buildHouse } from '../geometry/buildHouse.ts';
import { filterByView } from '../geometry/filterByView.ts';
import { spawnPoint } from '../geometry/spawn.ts';
import { parseHouse } from '../model/loadHouse.ts';
import type { House, Point } from '../model/schema.ts';
import { generateSurroundings, houseFront, onStreet } from './generate.ts';
import { clearance, houseKeepOut, isFree, keepOut, rectFree } from './keepout.ts';
import { ENVIRONMENTS, ENVIRONMENT_IDS } from './presets.ts';
import { seeded } from './random.ts';

// El ejemplo sin terreno (lot): la zona prohibida es el contorno + ambientes + 3 m.
const base = parseHouse(example);
const house: House = { ...base, site: { ...base.site, lot: undefined, street_edge: undefined } };

function setup(h: House) {
  const build = buildHouse(filterByView(h, 'reforma'));
  const doors = buildDoors(build.walls);
  const spawn = spawnPoint(doors, build.walls.map((w) => w.wall), build.bounds);
  return { k: houseKeepOut(h), front: houseFront(spawn, doors), spawn };
}

describe('random', () => {
  it('misma semilla, misma secuencia', () => {
    const a = seeded(7);
    const b = seeded(7);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seeded(8)()).not.toBe(xs[0]);
  });
});

describe('zona prohibida', () => {
  const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const k = keepOut(undefined, [square], []);

  it('contorno + 3 m', () => {
    expect(clearance([5, 5], k)).toBeCloseTo(-8); // 5 m adentro + 3 de margen
    expect(isFree([12.9, 5], 0, k)).toBe(false);
    expect(isFree([13.1, 5], 0, k)).toBe(true);
    expect(isFree([14, 5], 1.5, k)).toBe(false);
  });

  it('con terreno (lot) manda el terreno, sin margen', () => {
    const lot: Point[] = [[-5, -5], [20, -5], [20, 20], [-5, 20]];
    const kl = keepOut({ environment: 'suburb', north_deg: 0, lot }, [square], []);
    expect(isFree([19, 5], 0, kl)).toBe(false);
    expect(isFree([20.5, 5], 0, kl)).toBe(true);
  });

  it('un rectángulo que abraza la zona no queda libre aunque sus bordes sí', () => {
    expect(rectFree([5, 5], 40, 40, 0, k)).toBe(false);
    expect(rectFree([30, 5], 6, 6, 0, k)).toBe(true);
    expect(rectFree([15, 5], 6, 6, 0, k)).toBe(false);
  });

  it('la de la casa incluye los ambientes fuera del contorno', () => {
    const { k: hk } = setup(house);
    for (const r of house.rooms) for (const v of r.polygon) expect(isFree(v, 0, hk)).toBe(false);
  });
});

describe.each(ENVIRONMENT_IDS)('entorno %s', (id) => {
  const def = ENVIRONMENTS[id];
  const { k, front, spawn } = setup(house);
  const env = generateSurroundings(def, k, front, house.site);

  it('es determinista', () => {
    expect(generateSurroundings(def, k, front, house.site)).toEqual(env);
  });

  it('nada cae en la zona prohibida ni tapa la llegada', () => {
    for (const p of env.props) {
      if (p.kind === 'hill' || p.kind === 'dune') continue;
      expect(isFree(p.position, 0, k), `${p.kind} en ${p.position}`).toBe(true);
    }
    for (const b of env.blocks) expect(rectFree(b.center, b.w, b.d, b.angle, k), `${b.kind} en ${b.center}`).toBe(true);
    const blocked = env.obstacles.some((o) => Math.hypot(o.center[0] - spawn.position[0], o.center[1] - spawn.position[1]) < 1.5);
    expect(blocked).toBe(false);
  });

  it('pone props y deja la casa dentro del área caminable', () => {
    expect(env.props.length + env.blocks.length).toBeGreaterThan(20);
    const [sx, sy] = spawn.position;
    expect(sx > env.walk.minX && sx < env.walk.maxX && sy > env.walk.minY && sy < env.walk.maxY).toBe(true);
  });

  if (def.street) {
    it('calle frente a la puerta principal, más allá de la zona prohibida, sin nada encima', () => {
      const s = env.street;
      expect(s).not.toBeNull();
      if (!s) return;
      expect(s.out[0] * front.normal[0] + s.out[1] * front.normal[1]).toBeCloseTo(1);
      for (let t = -40; t <= 40; t += 5) {
        for (const d of [0, 5.5, 11]) {
          expect(isFree([s.origin[0] + s.along[0] * t + s.out[0] * d, s.origin[1] + s.along[1] * t + s.out[1] * d], 0, k)).toBe(true);
        }
      }
      for (const b of env.blocks) {
        if (b.kind !== 'hedge') expect(onStreet(b.center, 0, s)).toBe(false);
      }
      for (const p of env.props) if (p.kind === 'pine' || p.kind === 'bush') expect(onStreet(p.position, 0, s)).toBe(false);
    });
  } else {
    it('sin calle', () => expect(env.street).toBeNull());
  }

  if (id === 'beach') {
    it('el mar queda detrás de la casa, lejos de la zona prohibida', () => {
      const w = env.water;
      expect(w).not.toBeNull();
      if (!w) return;
      expect(w.out[0] * front.normal[0] + w.out[1] * front.normal[1]).toBeCloseTo(-1);
      expect(clearance(w.origin, k)).toBeGreaterThan(20);
    });
  }
});
