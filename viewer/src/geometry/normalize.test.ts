import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { normalizeMatrix } from './normalize.ts';

const SOFA = { width: 2.1, height: 0.85, depth: 0.9 };
const corners = (b: Box3) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
const boundsAfter = (b: Box3, yaw: number) => {
  const m = normalizeMatrix(b, yaw, SOFA);
  return new Box3().setFromPoints(corners(b).map((p) => p.applyMatrix4(m)));
};

describe('normalizeMatrix', () => {
  // Caja real del loungeSofa de Kenney: x 0..0.98, y 0..0.46, z -0.41..0
  const kenney = new Box3(new Vector3(0, 0, -0.41), new Vector3(0.98, 0.46, 0));

  it('centra la huella, apoya en el piso y escala a las medidas nominales', () => {
    const b = boundsAfter(kenney, 0);
    expect(b.min.x).toBeCloseTo(-1.05);
    expect(b.max.x).toBeCloseTo(1.05);
    expect(b.min.y).toBeCloseTo(0);
    expect(b.max.y).toBeCloseTo(0.85);
    expect(b.min.z).toBeCloseTo(-0.45);
    expect(b.max.z).toBeCloseTo(0.45);
  });

  it('el giro se aplica antes de medir: con 90° el largo del archivo pasa a z y se reescala igual', () => {
    const b = boundsAfter(kenney, 90);
    expect(b.max.x - b.min.x).toBeCloseTo(2.1);
    expect(b.max.z - b.min.z).toBeCloseTo(0.9);
    expect(b.min.y).toBeCloseTo(0);
  });

  it('con 180° el lado que miraba a -Z queda en +Z (frente)', () => {
    const m = normalizeMatrix(kenney, 180, SOFA);
    const back = new Vector3(0.49, 0.2, -0.41).applyMatrix4(m); // punto del lado -Z del archivo
    expect(back.z).toBeCloseTo(0.45);
  });

  it('un modelo plano (alfombra) no divide por cero', () => {
    const flat = new Box3(new Vector3(-1, 0, -1), new Vector3(1, 0, 1));
    const m = normalizeMatrix(flat, 0, { width: 2, height: 0.01, depth: 1.4 });
    expect(Number.isFinite(m.elements[5])).toBe(true);
  });
});
