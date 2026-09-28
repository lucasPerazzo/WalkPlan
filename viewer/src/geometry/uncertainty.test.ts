import { describe, expect, it } from 'vitest';
import example from '../../public/house.example.json';
import { parseHouse } from '../model/loadHouse.ts';
import type { House } from '../model/schema.ts';
import { modeShowing, resolveTarget, uncertaintyEntries } from './uncertainty.ts';

const base = parseHouse(example);

describe('dudas del plano', () => {
  const house: House = {
    ...base,
    meta: {
      ...base.meta,
      uncertainties: [
        { note: 'general', confidence: 'medium' },
        { element_id: 'o2', note: 'antepecho asumido', confidence: 'medium' },
        { element_id: 'w7', note: 'espesor', confidence: 'low' },
        { element_id: 'x99', note: 'id inexistente', confidence: 'low' },
      ],
    },
  };

  it('ordena por confianza (baja primero) y resuelve el elemento', () => {
    const entries = uncertaintyEntries(house);
    expect(entries.map((e) => e.element_id ?? null)).toEqual(['w7', 'x99', null, 'o2']);
    expect(entries[0].target?.label).toBe('Muro w7 (nuevo)');
    expect(entries[1].target).toBeNull();
    expect(entries[3].target?.label).toBe('Ventana o2');
  });

  it('la huella de una abertura va sobre su tramo de pared', () => {
    // o2: w2 de (4,0) a (8,0), offset 1.4, ancho 1.2 -> x 5.4..6.6 alrededor de y = 0
    const t = resolveTarget(house, 'o2');
    const xs = t?.outline.map((p) => p[0]) ?? [];
    expect(Math.min(...xs)).toBeCloseTo(5.4);
    expect(Math.max(...xs)).toBeCloseTo(6.6);
    expect(t?.center[1]).toBeCloseTo(0);
  });

  it('un ambiente usa su polígono y su nombre', () => {
    const t = resolveTarget(house, 'r1');
    expect(t?.outline).toEqual(house.rooms[0].polygon);
    expect(t?.label).toContain(house.rooms[0].name);
  });

  it('elige una vista donde el elemento exista', () => {
    expect(modeShowing('existing', 'actual')).toBe('actual');
    expect(modeShowing('new', 'actual')).toBe('diff');
    expect(modeShowing('new', 'reforma')).toBe('reforma');
    expect(modeShowing('demolish', 'reforma')).toBe('diff');
    expect(modeShowing('demolish', 'actual')).toBe('actual');
  });
});
