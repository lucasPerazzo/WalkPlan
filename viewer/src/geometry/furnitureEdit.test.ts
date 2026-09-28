import { describe, expect, it } from 'vitest';
import type { FurnitureItem, House, Room } from '../model/schema.ts';
import {
  addFurniture,
  deleteFurniture,
  exportHouse,
  footprint,
  frontOf,
  hitFurniture,
  moveFurniture,
  nextFurnitureId,
  rotateFurniture,
  roomAt,
  snapAngle,
} from './furnitureEdit.ts';

const item = (id: string, catalog: string, o: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id,
  catalog,
  position: [0, 0],
  rotation: 0,
  status: 'new',
  source: 'plan',
  ...o,
});
const room = (id: string, polygon: [number, number][]): Room => ({
  id,
  name: id,
  polygon,
  floor: { material: 'wood', color: '#aa8866' },
  status: 'existing',
});
const ROOMS = [room('r1', [[0, 0], [4, 0], [4, 3], [0, 3]]), room('r2', [[4, 0], [8, 0], [8, 3], [4, 3]])];

describe('footprint y frente', () => {
  it('rotation 0: ancho en x, profundidad en y', () => {
    const f = footprint(item('f1', 'sofa_3', { position: [2, 1] }));
    expect(f.map(([x, y]) => [Number(x.toFixed(3)), Number(y.toFixed(3))])).toEqual([
      [0.95, 0.55],
      [3.05, 0.55],
      [3.05, 1.45],
      [0.95, 1.45],
    ]);
  });

  it('rotation 90: el ancho pasa a y (antihorario) y el frente mira a +x', () => {
    const xs = footprint(item('f1', 'sofa_3', { rotation: 90 })).map(([x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.9);
    const [fx, fy] = frontOf(90);
    expect(fx).toBeCloseTo(1);
    expect(fy).toBeCloseTo(0);
    expect(frontOf(0)[1]).toBeCloseTo(-1);
  });

  it('respeta scale', () => {
    const xs = footprint(item('f1', 'sideboard', { scale: 0.75 })).map(([x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1.2);
  });
});

describe('selección', () => {
  const items = [item('f1', 'rug', { position: [2, 1.5] }), item('f2', 'coffee_table', { position: [2, 1.5] }), item('f3', 'chair', { position: [6, 1] })];

  it('elige la huella más chica bajo el punto (la mesa, no la alfombra)', () => {
    expect(hitFurniture([2, 1.5], items)).toBe('f2');
    expect(hitFurniture([1.2, 1.5], items)).toBe('f1');
    expect(hitFurniture([6, 1.1], items)).toBe('f3');
    expect(hitFurniture([7.5, 2.8], items)).toBeNull();
  });

  it('ambiente por punto en polígono; afuera = undefined', () => {
    expect(roomAt([1, 1], ROOMS)).toBe('r1');
    expect(roomAt([5, 1], ROOMS)).toBe('r2');
    expect(roomAt([9, 1], ROOMS)).toBeUndefined();
  });
});

describe('operaciones', () => {
  const items = [item('f1', 'chair', { position: [1, 1], room: 'r1' }), item('f7', 'bed_double', { position: [5, 1.5], room: 'r2' })];

  it('mover recalcula el ambiente, redondea al mm y marca source user', () => {
    const out = moveFurniture(items, 'f1', [5.12345, 2.00001], ROOMS);
    expect(out[0]).toMatchObject({ position: [5.123, 2], room: 'r2', source: 'user' });
    expect(out[1]).toBe(items[1]); // lo demás no se toca
    const outside = moveFurniture(items, 'f1', [10, 1], ROOMS)[0];
    expect('room' in outside).toBe(false);
  });

  it('rotar normaliza a [0, 360) y encaja de a 15°', () => {
    expect(rotateFurniture(items, 'f1', -15)[0]).toMatchObject({ rotation: 345, source: 'user' });
    expect(rotateFurniture(items, 'f1', 370)[0].rotation).toBe(10);
    expect(snapAngle(52)).toBe(45);
    expect(snapAngle(353)).toBe(0);
  });

  it('agregar usa el próximo id libre, status new y source user; borrar lo saca', () => {
    expect(nextFurnitureId(items)).toBe('f8');
    const { items: added, id } = addFurniture(items, 'plant', [2, 2], ROOMS);
    expect(id).toBe('f8');
    expect(added[2]).toEqual({ id: 'f8', catalog: 'plant', position: [2, 2], rotation: 0, status: 'new', source: 'user', room: 'r1' });
    expect(deleteFurniture(added, 'f1').map((f) => f.id)).toEqual(['f7', 'f8']);
  });

  it('exportar reemplaza solo furniture', () => {
    const house = { version: 3, meta: { source: 'x' }, walls: [], furniture: items } as unknown as House;
    const json = JSON.parse(exportHouse(house, [items[1]]));
    expect(json.furniture).toEqual([items[1]]);
    expect(json.meta).toEqual({ source: 'x' });
    expect(Object.keys(json)).toEqual(['version', 'meta', 'walls', 'furniture']);
  });
});
