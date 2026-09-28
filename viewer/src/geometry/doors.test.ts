import { describe, expect, it } from 'vitest';
import type { Opening, Wall } from '../model/schema.ts';
import { buildDoors, leafCenter, leafPose, pushSide } from './doors.ts';
import { buildWalls } from './walls.ts';

const wall: Wall = { id: 'w1', start: [0, 0], end: [8, 0], thickness: 0.2, height: 2.6, kind: 'exterior', status: 'existing' };
const op = (id: string, type: Opening['type'], offset: number, width: number): Opening => ({
  id,
  wall: 'w1',
  type,
  offset,
  width,
  height: type === 'window' ? 1.1 : 2.1,
  sill: type === 'window' ? 0.9 : 0,
  status: 'existing',
});
const doorsFor = (...ops: Opening[]) => buildDoors(buildWalls([wall], ops, [], []));
const close = (p: number[], q: number[]) => p.forEach((v, i) => expect(v).toBeCloseTo(q[i], 6));

describe('buildDoors', () => {
  it('solo puertas y corredizas; ventanas y vanos no tienen hoja', () => {
    const doors = doorsFor(op('o1', 'door', 0.5, 0.9), op('o2', 'window', 2, 1), op('o3', 'opening', 4, 1), op('o4', 'sliding_door', 6, 1));
    expect(doors.map((d) => d.opening.id)).toEqual(['o1', 'o4']);
    expect(doors[0].exterior).toBe(true);
    close(doors[0].center, [0.95, 0]);
  });

  it('batiente simple: bisagra en la jamba de start y abre girando hacia el lado pedido', () => {
    const [door] = doorsFor(op('o1', 'door', 1.5, 0.9));
    const [leaf] = door.leaves;
    expect(door.leaves).toHaveLength(1);
    close(leaf.hinge, [1.5, 0]);
    expect(leafPose(leaf, 0, 1).angle).toBeCloseTo(0);
    // abierta hacia la derecha de la pared (0,0)->(8,0): la derecha es -y
    close(leafCenter(leaf, leafPose(leaf, 1, 1)), [1.5, -leaf.width / 2]);
    close(leafCenter(leaf, leafPose(leaf, 1, -1)), [1.5, leaf.width / 2]);
  });

  it('batiente de más de 1.20 m: dos hojas desde cada jamba, ambas abren hacia el mismo lado', () => {
    const [door] = doorsFor(op('o1', 'door', 1.5, 1.45));
    const [a, b] = door.leaves;
    expect(door.leaves).toHaveLength(2);
    close(b.hinge, [2.95, 0]);
    close(leafCenter(b, leafPose(b, 0, 1)), [2.95 - b.width / 2, 0]);
    close(leafCenter(a, leafPose(a, 1, 1)), [1.5, -a.width / 2]);
    close(leafCenter(b, leafPose(b, 1, 1)), [2.95, -b.width / 2]);
  });

  it('corrediza ancha: dos hojas, abrir desplaza la primera sobre la segunda', () => {
    const [door] = doorsFor(op('o1', 'sliding_door', 1, 3));
    const [a, b] = door.leaves;
    expect(door.leaves).toHaveLength(2);
    close(leafPose(a, 1, 1).hinge, [1 + 1.45, 0]);
    close(leafPose(b, 1, 1).hinge, b.hinge);
  });

  it('corrediza angosta: una hoja que entra en la pared', () => {
    const [door] = doorsFor(op('o1', 'sliding_door', 1, 1));
    expect(door.leaves).toHaveLength(1);
    close(leafPose(door.leaves[0], 1, 1).hinge, [2, 0]);
  });

  it('pushSide abre hacia el lado opuesto a la persona', () => {
    const [door] = doorsFor(op('o1', 'door', 1.5, 0.9));
    expect(pushSide(door, [1.95, 1])).toBe(1); // persona a la izquierda (+y) -> abre a la derecha
    expect(pushSide(door, [1.95, -1])).toBe(-1);
  });
});
