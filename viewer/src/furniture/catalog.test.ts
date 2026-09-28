import { describe, expect, it } from 'vitest';
import contract from '../../../.claude/skills/house-schema/references/furniture-catalog.md?raw';
import { placeFurniture } from '../geometry/furniture.ts';
import type { FurnitureItem } from '../model/schema.ts';
import { CATALOG } from './catalog.ts';

describe('catálogo del visor', () => {
  it('tiene exactamente las claves y medidas de furniture-catalog.md', () => {
    const rows = contract
      .split('\n')
      .filter((l) => l.trim().startsWith('|'))
      .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
      .filter((c) => c.length >= 4 && [1, 2, 3].every((i) => c[i] !== '' && !Number.isNaN(Number(c[i]))));
    expect(Object.keys(CATALOG).sort()).toEqual(rows.map((r) => r[0]).sort());
    for (const [key, w, d, h] of rows) {
      expect(CATALOG[key], key).toMatchObject({ width: Number(w), depth: Number(d), height: Number(h) });
    }
  });
});

describe('placeFurniture', () => {
  const item = (catalog: string, o: Partial<FurnitureItem> = {}): FurnitureItem => ({
    id: 'f1',
    catalog,
    position: [2, 3],
    rotation: 0,
    status: 'new',
    source: 'suggested',
    ...o,
  });

  it('ubica la caja apoyada en el piso, con (x, y) -> (x, h/2, -y) y rotación directa', () => {
    const errors: string[] = [];
    const [p] = placeFurniture([item('sofa_3', { rotation: 90 })], errors);
    expect(errors).toEqual([]);
    expect(p.position).toEqual([2, 0.425, -3]);
    expect(p.rotationY).toBeCloseTo(Math.PI / 2);
    expect(p.size).toEqual([2.1, 0.85, 0.9]);
  });

  it('respeta la altura de montaje, la escala y los muebles sin colisión', () => {
    const [upper, rug, scaled] = placeFurniture([item('kitchen_upper'), item('rug'), item('sideboard', { scale: 0.75 })], []);
    expect(upper.position[1]).toBeCloseTo(1.5 + 0.35);
    expect(rug.collider).toBe(false);
    expect(scaled.size[0]).toBeCloseTo(1.2);
  });

  it('una clave fuera del catálogo se omite y se reporta', () => {
    const errors: string[] = [];
    expect(placeFurniture([item('trono')], errors)).toEqual([]);
    expect(errors[0]).toContain('trono');
  });
});
