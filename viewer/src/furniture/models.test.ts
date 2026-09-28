import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { CATALOG, type ProceduralModel } from './catalog.ts';
import { prepareModel } from './models.ts';
import type { ModelPart } from './parts.ts';
import { proceduralModel } from './procedural.ts';

const bounds = (parts: ModelPart[]) => parts.reduce((b, p) => b.union(p.geometry.boundingBox ?? new Box3()), new Box3());

describe('prepareModel', () => {
  // Un "sofá" de archivo: dos piezas en otra escala, corridas del origen y con una transformación de nodo.
  const file = () => {
    const root = new Group();
    const seat = new Mesh(new BoxGeometry(1, 0.2, 0.4), new MeshStandardMaterial({ name: 'carpet' }));
    seat.position.set(0.5, 0.1, -0.2);
    const legs = new Mesh(new BoxGeometry(1, 0.1, 0.4), new MeshStandardMaterial({ name: 'wood' }));
    legs.position.set(0.5, -0.05, -0.2);
    const node = new Group();
    node.scale.setScalar(0.5);
    node.add(seat, legs);
    root.add(node);
    return root;
  };

  it('normaliza a las medidas nominales: huella centrada, apoyado en y = 0', () => {
    const b = bounds(prepareModel(file(), 'sofa_3'));
    const { width, height, depth } = CATALOG.sofa_3;
    expect(b.min.x).toBeCloseTo(-width / 2);
    expect(b.max.x).toBeCloseTo(width / 2);
    expect(b.min.y).toBeCloseTo(0);
    expect(b.max.y).toBeCloseTo(height);
    expect(b.min.z).toBeCloseTo(-depth / 2);
    expect(b.max.z).toBeCloseTo(depth / 2);
  });

  it('una geometría por material y reasignación por clave (cocina: metal -> stone)', () => {
    expect(prepareModel(file(), 'sofa_3').map((p) => p.material).sort()).toEqual(['carpet', 'wood']);
    const root = file();
    (root.children[0].children[1] as Mesh<BoxGeometry, MeshStandardMaterial>).material.name = 'metal';
    expect(prepareModel(root, 'kitchen_counter').map((p) => p.material).sort()).toEqual(['carpet', 'stone']);
  });

  it('no modifica la geometría del archivo (table_dining_4/6/8 comparten el mismo)', () => {
    const root = file();
    const before = (root.children[0].children[0] as Mesh).geometry.attributes.position.array.slice();
    prepareModel(root, 'sofa_3');
    expect((root.children[0].children[0] as Mesh).geometry.attributes.position.array).toEqual(before);
  });
});

describe('modelos en código', () => {
  const procedural = Object.entries(CATALOG).filter(([, e]) => e.model.source === 'procedural');

  it('bidet, bbq y lounger', () => {
    expect(procedural.map(([k]) => k).sort()).toEqual(['bbq', 'bidet', 'lounger']);
  });

  it.each(procedural)('%s entra en sus medidas nominales y apoya en el piso', (_, entry) => {
    const b = bounds(proceduralModel((entry.model as { name: ProceduralModel }).name, entry));
    const eps = 0.02;
    expect(b.min.y).toBeCloseTo(0);
    expect(b.max.y).toBeLessThanOrEqual(entry.height + eps);
    expect(b.max.x - b.min.x).toBeLessThanOrEqual(entry.width + eps);
    expect(b.max.z - b.min.z).toBeLessThanOrEqual(entry.depth + eps);
    expect(b.max.x - b.min.x).toBeGreaterThan(entry.width * 0.9);
    expect(b.max.z - b.min.z).toBeGreaterThan(entry.depth * 0.9);
  });
});
