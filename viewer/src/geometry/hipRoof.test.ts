import { describe, expect, it } from 'vitest';
import type { Point } from '../model/schema.ts';
import { hipRoof, isOrthogonal, maximalRectangles, offsetOrthogonal, rectHipRoof, roofHeightAt } from './hipRoof.ts';

// L de 10 × 8 con un recorte de 6 × 4 arriba a la derecha.
const L: Point[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]];

describe('techo a cuatro aguas', () => {
  it('reconoce contornos ortogonales', () => {
    expect(isOrthogonal(L)).toBe(true);
    expect(isOrthogonal([[0, 0], [4, 0], [2, 3]])).toBe(false);
  });

  it('una L tiene dos rectángulos máximos (los dos brazos, que se superponen en la esquina)', () => {
    const rects = maximalRectangles(L);
    expect(rects).toHaveLength(2);
    expect(rects).toContainEqual({ x0: 0, y0: 0, x1: 10, y1: 4 });
    expect(rects).toContainEqual({ x0: 0, y0: 0, x1: 4, y1: 8 });
  });

  it('la altura es la distancia L∞ al borde por la pendiente (esqueleto recto)', () => {
    const rects = maximalRectangles(L);
    const k = Math.tan((30 * Math.PI) / 180);
    // En la esquina interior de la L (3.9, 3.9) la distancia al borde es 0.1 hacia (4, *) y (*, 4)... pero
    // dentro del brazo horizontal la distancia al borde superior (y = 4) es 0.1; el punto (2, 2) está a 2.
    expect(roofHeightAt([2, 2], rects, 30, 0)).toBeCloseTo(2 * k);
    // Sobre la cumbrera del brazo vertical (x = 2, y = 6): a 2 del borde izquierdo y del derecho.
    expect(roofHeightAt([2, 6], rects, 30, 0)).toBeCloseTo(2 * k);
    // Cerca del alero siempre baja a la base.
    expect(roofHeightAt([9.99, 2], rects, 30, 0)).toBeCloseTo(0.01 * k);
  });

  it('un rectángulo da 6 triángulos con la cumbrera sobre el eje largo', () => {
    const tris = rectHipRoof({ x0: 0, y0: 0, x1: 8, y1: 4 }, 45, 3);
    expect(tris).toHaveLength(6);
    const tops = tris.flat().filter((p) => p[2] > 3);
    expect(Math.max(...tops.map((p) => p[2]))).toBeCloseTo(5); // 3 + 4/2 · tan 45°
    expect(new Set(tops.map((p) => p[1]))).toEqual(new Set([2]));
  });

  it('el alero agranda el contorno hacia afuera en cualquier sentido de giro', () => {
    const cw = [...L].reverse();
    for (const poly of [L, cw]) {
      const out = offsetOrthogonal(poly, 0.5);
      expect(Math.min(...out.map((p) => p[0]))).toBeCloseTo(-0.5);
      expect(Math.max(...out.map((p) => p[1]))).toBeCloseTo(8.5);
    }
  });

  it('contorno no ortogonal: sin techo inclinado (queda la losa)', () => {
    expect(hipRoof([[[0, 0], [4, 0], [2, 3]]], 25, 2.8, 0.4)).toBeNull();
    expect(hipRoof([L], 25, 2.8, 0.4)?.length).toBe(12);
  });
});
