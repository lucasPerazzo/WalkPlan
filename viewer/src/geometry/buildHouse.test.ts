import { describe, expect, it } from 'vitest';
import example from '../../public/house.example.json';
import { parseHouse } from '../model/loadHouse.ts';
import type { House } from '../model/schema.ts';
import { buildHouse } from './buildHouse.ts';
import { filterByView } from './filterByView.ts';

const house = parseHouse(example);

describe('house.example.json', () => {
  it('vista reforma: 7 paredes, 3 aberturas, 2 ambientes, sin errores', () => {
    const b = buildHouse(filterByView(house, 'reforma'));
    expect(b.errors).toEqual([]);
    expect(b.warnings).toEqual([]);
    expect(b.stats).toEqual({ walls: 7, segments: 14, openings: 3, rooms: 2 });
  });

  it('vista actual: sin la pared nueva w7, su puerta ni el ambiente nuevo', () => {
    const b = buildHouse(filterByView(house, 'actual'));
    expect(b.errors).toEqual([]);
    expect(b.stats).toMatchObject({ walls: 6, openings: 2, rooms: 1 });
  });

  it('esquinas del ejemplo: una sola pared extendida por L, ninguna en la T', () => {
    const b = buildHouse(filterByView(house, 'reforma'));
    const ext = Object.fromEntries(b.walls.map((w) => [w.wall.id, w.extension]));
    expect(ext).toEqual({
      w1: { start: 0.1, end: 0 },
      w2: { start: 0, end: 0.1 },
      w3: { start: 0, end: 0.1 },
      w4: { start: 0, end: 0 },
      w5: { start: 0, end: 0.1 },
      w6: { start: 0, end: 0 },
      w7: { start: 0, end: 0 },
    });
  });

  it('bounds incluye el espesor de las paredes', () => {
    const { bounds } = buildHouse(filterByView(house, 'reforma'));
    expect(bounds).toEqual({ minX: -0.1, minY: -0.1, maxX: 8.1, maxY: 5.1 });
  });
});

describe('filterByView', () => {
  const h: House = {
    ...house,
    walls: [...house.walls, { ...house.walls[6], id: 'w8', status: 'demolish' }],
    openings: [
      ...house.openings,
      { ...house.openings[0], id: 'o8', wall: 'w8', status: 'existing' },
      { ...house.openings[1], id: 'o9', status: 'new' },
    ],
  };

  it('actual = existing + demolish; las aberturas de una pared oculta se van con ella', () => {
    const f = filterByView(h, 'actual');
    expect(f.walls.map((w) => w.id)).toContain('w8');
    expect(f.openings.map((o) => o.id)).toEqual(['o1', 'o2', 'o8']);
  });

  it('reforma = existing + new', () => {
    const f = filterByView(h, 'reforma');
    expect(f.walls.map((w) => w.id)).not.toContain('w8');
    expect(f.openings.map((o) => o.id)).toEqual(['o1', 'o2', 'o3', 'o9']);
  });

  it('una abertura a una pared inexistente pasa para que la geometría la reporte', () => {
    const f = filterByView({ ...house, openings: [{ ...house.openings[0], wall: 'w99' }] }, 'reforma');
    expect(buildHouse(f).errors[0]).toContain('w99');
  });
});

describe('parseHouse', () => {
  it('acepta v2 (lo lee como v3) y rechaza otras versiones o arrays faltantes', () => {
    expect(parseHouse({ ...example, version: 2 }).version).toBe(3);
    expect(() => parseHouse({ ...example, version: 1 })).toThrow(/versión/i);
    expect(() => parseHouse({ version: 2, openings: [], rooms: [] })).toThrow(/walls/);
  });
});
