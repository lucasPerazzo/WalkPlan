import { describe, expect, it } from 'vitest';
import example from '../../public/house.example.json';
import { parseHouse } from '../model/loadHouse.ts';
import type { House, Opening, Wall } from '../model/schema.ts';
import { buildHouse } from './buildHouse.ts';
import { changeCounts, demolitions, subtractSpans } from './changes.ts';
import { filterByView } from './filterByView.ts';

const base = parseHouse(example);

describe('subtractSpans', () => {
  it('resta intervalos', () => {
    expect(subtractSpans([0, 3], [[1, 2]])).toEqual([[0, 1], [2, 3]]);
    expect(subtractSpans([0, 3], [[-1, 1], [2.5, 4]])).toEqual([[1, 2.5]]);
    expect(subtractSpans([0, 3], [[0, 3]])).toEqual([]);
    expect(subtractSpans([0, 3], [[4, 5]])).toEqual([[0, 3]]);
  });
});

describe('vista Cambios', () => {
  // Ejemplo + un muro a demoler, una ventana que se cierra y un cambio de abertura en w2.
  const house: House = {
    ...base,
    walls: [...base.walls, { id: 'w8', start: [0, 2.5], end: [4, 2.5], thickness: 0.15, height: 2.6, kind: 'interior', status: 'demolish' } as Wall],
    openings: [
      ...base.openings.map((o) => (o.id === 'o2' ? { ...o, status: 'demolish' as const } : o)),
      { id: 'o9', wall: 'w2', type: 'window', offset: 1.8, width: 1.6, sill: 0.9, height: 1.2, status: 'new' } as Opening,
      { id: 'o10', wall: 'w5', type: 'window', offset: 1, width: 1, sill: 0.9, height: 1.2, status: 'demolish' } as Opening,
    ],
  };
  const actual = buildHouse(filterByView(house, 'actual'));
  const reforma = buildHouse(filterByView(house, 'diff'));
  const boxes = demolitions(actual, reforma);

  it('la geometría de Cambios es la de la Reforma', () => {
    expect(filterByView(house, 'diff')).toEqual(filterByView(house, 'reforma'));
  });

  it('el muro a demoler sale entero, agrandado 1 cm por lado', () => {
    const wall = boxes.filter((b) => b.id === 'w8');
    expect(wall).toHaveLength(1);
    expect(wall[0].size[0]).toBeCloseTo(4.02);
    expect(wall[0].size[2]).toBeCloseTo(0.17);
    expect(wall[0].center).toEqual([2, 2.5]);
  });

  it('la ventana que se cierra es un paño en su vano viejo', () => {
    const [p] = boxes.filter((b) => b.id === 'o10');
    expect(p.kind).toBe('opening');
    expect(p.size[0]).toBeCloseTo(1);
    expect(p.z).toBeCloseTo(1.5);
    expect(p.center[0]).toBeCloseTo(4 - 1.5); // w5 va de (4,5) a (0,5): offset 1 + ancho/2
  });

  it('cambio de abertura: solo queda roja la parte del vano viejo que la nueva no ocupa', () => {
    // o2: vano viejo 1.4..2.6; o9 nueva 1.8..3.4 -> queda 1.4..1.8
    const parts = boxes.filter((b) => b.id === 'o2');
    expect(parts).toHaveLength(1);
    expect(parts[0].size[0]).toBeCloseTo(0.4);
    expect(parts[0].center[0]).toBeCloseTo(4 + 1.6);
  });

  it('cuenta los cambios', () => {
    expect(changeCounts(actual, reforma)).toEqual({ newWalls: 1, newOpenings: 2, demolishWalls: 1, demolishOpenings: 2 });
  });
});
