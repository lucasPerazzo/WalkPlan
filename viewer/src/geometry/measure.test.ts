import { describe, expect, it } from 'vitest';
import example from '../../public/house.example.json';
import { parseHouse } from '../model/loadHouse.ts';
import { buildHouse } from './buildHouse.ts';
import { filterByView } from './filterByView.ts';
import { constrainAxis, distance, formatMeters, snapPoint, snapTargets } from './measure.ts';

const build = buildHouse(filterByView(parseHouse(example), 'reforma'));
const targets = snapTargets(build.walls, 1.2);

describe('medición', () => {
  it('engancha a la cara del muro más cercana dentro de 10 cm', () => {
    // w6 (x = 0, espesor 0.2): cara interior en x = 0.1
    const s = snapPoint([0.17, 2.3], targets);
    expect(s.kind).toBe('face');
    expect(s.point[0]).toBeCloseTo(0.1);
    expect(s.point[1]).toBeCloseTo(2.3);
    expect(snapPoint([0.3, 2.3], targets).kind).toBeNull();
  });

  it('una esquina gana sobre una cara', () => {
    const s = snapPoint([0.13, 0.12], targets); // esquina interior w1/w6 en (0.1, 0.1)
    expect(s.kind).toBe('corner');
    expect(s.point[0]).toBeCloseTo(0.1);
    expect(s.point[1]).toBeCloseTo(0.1);
  });

  it('de cara a cara da el ancho del ambiente', () => {
    const w7 = build.walls.find((w) => w.wall.id === 'w7');
    const face = 4 - (w7?.wall.thickness ?? 0) / 2;
    const a = snapPoint([0.15, 1.0], targets).point; // a y = 1.0: w7 tiene la puerta o3 entre y 2.0 y 2.8
    const b = snapPoint([face - 0.05, 1.0], targets).point;
    expect(distance(a, b)).toBeCloseTo(face - 0.1);
  });

  it('los vanos no enganchan: la puerta o1 de w1 deja libre su tramo', () => {
    // o1: offset 1.5, ancho 0.9 -> sin cara entre x 1.5 y 2.4 en y = 0.1
    const s = snapPoint([1.95, 0.15], targets);
    expect(s.kind === null || Math.abs(s.point[1] - 0.1) > 1e-6).toBe(true);
  });

  it('Shift deja la cota recta y el formato usa coma decimal', () => {
    expect(constrainAxis([0, 0], [3, 0.4])).toEqual([3, 0]);
    expect(constrainAxis([0, 0], [0.4, 3])).toEqual([0, 3]);
    expect(formatMeters(3.456)).toBe('3,46 m');
  });
});
