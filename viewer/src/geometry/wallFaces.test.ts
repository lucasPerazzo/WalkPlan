import { describe, expect, it } from 'vitest';
import example from '../../public/house.example.json';
import { parseHouse } from '../model/loadHouse.ts';
import type { Wall } from '../model/schema.ts';
import { buildHouse } from './buildHouse.ts';
import { exteriorContours, offsetOutward, roofOutlines } from './contour.ts';
import { filterByView } from './filterByView.ts';
import { polygonArea } from './floors.ts';
import { buildWallFaces, facadeSide, type FaceBuffers } from './wallFaces.ts';

const build = buildHouse(filterByView(parseHouse(example), 'reforma'));
const walls = build.walls.map((w) => w.wall);
const exterior = walls.filter((w) => w.kind === 'exterior');
const byId = (id: string) => walls.find((w) => w.id === id)!;

const triangles = (b: FaceBuffers) => b.indices.length / 3;

describe('facadeSide', () => {
  it('muros exteriores: la fachada es el lado que da afuera; interiores no tienen', () => {
    expect(facadeSide(byId('w1'), exterior)).toBe('right'); // w1 (0,0)->(4,0): derecha = -y = afuera
    expect(facadeSide(byId('w4'), exterior)).toBe('right'); // w4 (8,5)->(4,5): derecha = +y = afuera
    expect(facadeSide(byId('w7'), exterior)).toBeNull();
  });
});

describe('buildWallFaces', () => {
  const faces = buildWallFaces(build.walls);

  it('agrupa por rol: una malla para fachada y otra para interior', () => {
    expect(triangles(faces.facade)).toBeGreaterThan(0);
    expect(triangles(faces.interior)).toBeGreaterThan(0);
    // por tramo: 2 caras + techo + 2 cantos (+ fondo de dintel) = 10 o 12 triángulos
    const segments = build.stats.segments;
    const lintelsAndSills = build.walls.flatMap((w) => w.segments).filter((s) => s.v0 > 0).length;
    expect(triangles(faces.facade) + triangles(faces.interior)).toBe(segments * 10 + lintelsAndSills * 2);
  });

  it('cada triángulo mira hacia su normal', () => {
    for (const b of [faces.facade, faces.interior]) {
      for (let t = 0; t < b.indices.length; t += 3) {
        const [ia, ib, ic] = b.indices.slice(t, t + 3);
        const p = (i: number) => b.positions.slice(i * 3, i * 3 + 3);
        const [a, bb, c] = [p(ia), p(ib), p(ic)];
        const e1 = bb.map((v, k) => v - a[k]);
        const e2 = c.map((v, k) => v - a[k]);
        const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const n = b.normals.slice(ia * 3, ia * 3 + 3);
        expect(cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2]).toBeGreaterThan(0);
      }
    }
  });

  it('vista Cambios: el muro nuevo w7 va entero a su propia malla; sin splitNew, al interior', () => {
    const w7 = build.walls.filter((w) => w.wall.id === 'w7');
    const split = buildWallFaces(w7, true);
    expect(triangles(split.new)).toBeGreaterThan(0);
    expect(triangles(split.interior) + triangles(split.facade)).toBe(0);
    expect(triangles(buildWallFaces(w7).new)).toBe(0);
    expect(triangles(buildWallFaces(build.walls, true).new)).toBe(triangles(split.new));
  });

  it('la cara exterior de w1 va con la fachada y mira a +Z (-y del plano)', () => {
    const only = buildWallFaces(build.walls.filter((w) => w.wall.id === 'w1'));
    const normals = new Set<string>();
    for (let i = 0; i < only.facade.normals.length; i += 3) normals.add(only.facade.normals.slice(i, i + 3).map((v) => Math.round(v) + 0).join(','));
    expect(normals).toContain('0,0,1');
    expect(normals).not.toContain('0,0,-1');
  });

  it('UV en metros y continuas a lo largo del muro: los tramos de w1 cubren u de -0.1 a 4', () => {
    const only = buildWallFaces(build.walls.filter((w) => w.wall.id === 'w1'));
    const us: number[] = [];
    const vs: number[] = [];
    for (let i = 0; i < only.interior.uvs.length; i += 2) {
      us.push(only.interior.uvs[i]);
      vs.push(only.interior.uvs[i + 1]);
    }
    expect(Math.min(...us)).toBeCloseTo(-0.1); // extensión de esquina
    expect(Math.max(...us)).toBeCloseTo(4);
    expect(Math.max(...vs)).toBeCloseTo(2.6);
    expect(us).toContain(1.5); // la puerta corta el muro, pero u no se reinicia
  });
});

describe('contorno exterior y losa', () => {
  it('el ejemplo tiene un contorno de 40 m² por ejes, antihorario', () => {
    const faces = exteriorContours(walls);
    expect(faces).toHaveLength(1);
    expect(polygonArea(faces[0].map((e) => e.from))).toBeCloseTo(40);
  });

  it('la losa cubre hasta la cara exterior de los muros', () => {
    const [outline] = roofOutlines(walls);
    const xs = outline.map((p) => p[0]);
    const ys = outline.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(-0.1);
    expect(Math.max(...xs)).toBeCloseTo(8.1);
    expect(Math.min(...ys)).toBeCloseTo(-0.1);
    expect(Math.max(...ys)).toBeCloseTo(5.1);
    expect(polygonArea(outline)).toBeCloseTo(8.2 * 5.2);
  });

  it('planta en L con quiebre y espesores distintos', () => {
    const w = (id: string, a: [number, number], b: [number, number], t = 0.3): Wall => ({ id, start: a, end: b, thickness: t, height: 2.6, kind: 'exterior', status: 'existing' });
    const L = [w('a', [0, 0], [6, 0]), w('b', [6, 0], [6, 3]), w('c', [6, 3], [3, 3], 0.2), w('d', [3, 3], [3, 5], 0.2), w('e', [3, 5], [0, 5]), w('f', [0, 5], [0, 0])];
    const faces = exteriorContours(L);
    expect(faces).toHaveLength(1);
    expect(polygonArea(faces[0].map((e) => e.from))).toBeCloseTo(6 * 3 + 3 * 2);
    const out = offsetOutward(faces[0]);
    expect(out).toContainEqual([3.1, 3.1]); // esquina entrante: media losa de 0.2 hacia afuera
    expect(polygonArea(out)).toBeGreaterThan(24);
  });

  it('los pilares y muros interiores no forman contorno', () => {
    const pillar: Wall = { id: 'p', start: [20, 0], end: [20.3, 0], thickness: 0.3, height: 2.6, kind: 'interior', status: 'existing' };
    expect(exteriorContours([...walls, pillar])).toHaveLength(1);
  });
});
