import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Opening, Wall } from '../model/schema.ts';
import { buildWalls, compareIds, cornerExtensions, segmentTransform, wallFrame, wallSegments } from './walls.ts';

const wall = (id: string, start: [number, number], end: [number, number], thickness = 0.2): Wall => ({
  id,
  start,
  end,
  thickness,
  height: 2.6,
  kind: 'exterior',
  status: 'existing',
});

const opening = (id: string, wallId: string, o: Partial<Opening>): Opening => ({
  id,
  wall: wallId,
  type: 'door',
  offset: 0,
  width: 0.9,
  height: 2.1,
  sill: 0,
  status: 'existing',
  ...o,
});

const Y = new Vector3(0, 1, 0);
const expectVec = (v: Vector3, x: number, y: number, z: number) => {
  expect(v.x).toBeCloseTo(x, 6);
  expect(v.y).toBeCloseTo(y, 6);
  expect(v.z).toBeCloseTo(z, 6);
};

describe('wallFrame / rotación', () => {
  it('una pared hacia +y del plano gira +90° y su +x local apunta a -Z de Three', () => {
    const f = wallFrame(wall('w1', [0, 0], [0, 5]));
    expect(f.angle).toBeCloseTo(Math.PI / 2, 9);
    expectVec(new Vector3(1, 0, 0).applyAxisAngle(Y, f.angle), 0, 0, -1);
  });

  it('en diagonal, +x local sigue a start→end y +z local es la normal derecha (dy, -dx)/L', () => {
    const f = wallFrame(wall('w1', [0, 0], [3, 4]));
    // plano (0.6, 0.8) → Three (0.6, 0, -0.8)
    expectVec(new Vector3(1, 0, 0).applyAxisAngle(Y, f.angle), 0.6, 0, -0.8);
    // normal derecha en el plano (0.8, -0.6) → Three (0.8, 0, 0.6)
    expectVec(new Vector3(0, 0, 1).applyAxisAngle(Y, f.angle), 0.8, 0, 0.6);
  });

  it('segmentTransform ubica el tramo sobre el eje, con y del plano negada en Z', () => {
    const w = wall('w1', [2, 1], [2, 5]);
    const [build] = buildWalls([w], [], [], []);
    const t = segmentTransform(build, build.segments[0]);
    expect(t.position[0]).toBeCloseTo(2, 9);
    expect(t.position[1]).toBeCloseTo(1.3, 9);
    expect(t.position[2]).toBeCloseTo(-3, 9);
    expect(t.size).toEqual([4, 2.6, 0.2]);
  });
});

describe('wallSegments', () => {
  const w = wall('w1', [0, 0], [4, 0]);
  const noExt = { start: 0, end: 0 };

  it('puerta: dos tramos llenos más dintel, sin antepecho', () => {
    const errors: string[] = [];
    const { segments } = wallSegments(w, [opening('o1', 'w1', { offset: 1.5 })], noExt, errors);
    expect(errors).toEqual([]);
    expect(segments.map((s) => s.kind)).toEqual(['full', 'lintel', 'full']);
    expect(segments[0].u0).toBeCloseTo(0);
    expect(segments[0]).toMatchObject({ u1: 1.5, v0: 0, v1: 2.6 });
    expect(segments[1].u0).toBeCloseTo(1.5);
    expect(segments[1].u1).toBeCloseTo(2.4);
    expect(segments[1].v0).toBeCloseTo(2.1);
    expect(segments[2].u0).toBeCloseTo(2.4);
    expect(segments[2].u1).toBeCloseTo(4);
  });

  it('ventana: tramos llenos, antepecho y dintel', () => {
    const win = opening('o2', 'w1', { type: 'window', offset: 1.4, width: 1.2, height: 1.1, sill: 0.9 });
    const { segments } = wallSegments(w, [win], noExt, []);
    expect(segments.map((s) => s.kind)).toEqual(['full', 'sill', 'lintel', 'full']);
    expect(segments[1]).toMatchObject({ v0: 0, v1: 0.9 });
    expect(segments[2].v0).toBeCloseTo(2.0);
    expect(segments[2].v1).toBeCloseTo(2.6);
  });

  it('abertura a ras de start y a toda altura: sin tramos vacíos', () => {
    const full = opening('o1', 'w1', { offset: 0, width: 1, height: 2.6 });
    const { segments } = wallSegments(w, [full], noExt, []);
    expect(segments.map((s) => s.kind)).toEqual(['full']);
    expect(segments[0]).toMatchObject({ u0: 1, u1: 4 });
  });

  it('la extensión de esquina alarga los tramos extremos', () => {
    const { segments } = wallSegments(w, [opening('o1', 'w1', { offset: 1.5 })], { start: 0.1, end: 0.2 }, []);
    expect(segments[0].u0).toBeCloseTo(-0.1);
    expect(segments[segments.length - 1].u1).toBeCloseTo(4.2);
  });

  it('abertura fuera de rango: se omite y se reporta con su id', () => {
    const errors: string[] = [];
    const { segments, openings } = wallSegments(w, [opening('o9', 'w1', { offset: 3.5 })], noExt, errors);
    expect(openings).toEqual([]);
    expect(segments).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('o9');
  });

  it('ventana más alta que la pared: se omite y se reporta', () => {
    const errors: string[] = [];
    wallSegments(w, [opening('o3', 'w1', { sill: 1.0, height: 2.0 })], noExt, errors);
    expect(errors[0]).toContain('o3');
  });

  it('aberturas superpuestas: queda la primera y se reporta la segunda', () => {
    const errors: string[] = [];
    const { openings } = wallSegments(
      w,
      [opening('o2', 'w1', { offset: 1.0 }), opening('o1', 'w1', { offset: 0.5 })],
      noExt,
      errors,
    );
    expect(openings.map((o) => o.id)).toEqual(['o1']);
    expect(errors[0]).toContain('o2');
  });
});

describe('esquinas', () => {
  it('compareIds usa orden natural', () => {
    expect(compareIds('w2', 'w10')).toBeLessThan(0);
    expect(compareIds('w10', 'w9')).toBeGreaterThan(0);
  });

  it('en una L se extiende solo la de id menor, maxThickness/2', () => {
    const ext = cornerExtensions([wall('w10', [0, 0], [4, 0]), wall('w2', [0, 5], [0, 0], 0.3)], []);
    expect(ext.get('w2')).toEqual({ start: 0, end: 0.15 });
    expect(ext.get('w10')).toEqual({ start: 0, end: 0 });
  });

  it('colineales y T no se extienden', () => {
    const warnings: string[] = [];
    const ext = cornerExtensions(
      [wall('w1', [0, 0], [4, 0]), wall('w2', [4, 0], [8, 0]), wall('w7', [4, 0], [4, 5], 0.14)],
      warnings,
    );
    for (const id of ['w1', 'w2', 'w7']) expect(ext.get(id)).toEqual({ start: 0, end: 0 });
    expect(warnings).toEqual([]);
  });

  it('encuentro de tres paredes sin par colineal: sin extensión y con aviso', () => {
    const warnings: string[] = [];
    const ext = cornerExtensions(
      [wall('w1', [0, 0], [4, 0]), wall('w2', [0, 0], [0, 4]), wall('w3', [0, 0], [-3, -3])],
      warnings,
    );
    for (const id of ['w1', 'w2', 'w3']) expect(ext.get(id)).toEqual({ start: 0, end: 0 });
    expect(warnings).toHaveLength(1);
  });
});

describe('buildWalls', () => {
  it('omite y reporta paredes degeneradas y aberturas huérfanas', () => {
    const errors: string[] = [];
    const walls = buildWalls(
      [wall('w1', [0, 0], [4, 0]), wall('w2', [1, 1], [1, 1.01])],
      [opening('o1', 'w2', {}), opening('o2', 'w99', {})],
      errors,
      [],
    );
    expect(walls.map((w) => w.wall.id)).toEqual(['w1']);
    expect(errors).toHaveLength(3);
    expect(errors.join('\n')).toMatch(/w2[\s\S]*o1[\s\S]*o2/);
  });
});
