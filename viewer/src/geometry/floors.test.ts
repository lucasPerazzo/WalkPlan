import { Box3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Point, Room } from '../model/schema.ts';
import { floorGeometry, polygonArea, roomProblem } from './floors.ts';

const rect: Point[] = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
];

const normalsUp = (polygon: Point[]) => {
  const n = floorGeometry(polygon).getAttribute('normal');
  for (let i = 0; i < n.count; i++) {
    expect(n.getX(i)).toBeCloseTo(0, 9);
    expect(n.getY(i)).toBeCloseTo(1, 9);
    expect(n.getZ(i)).toBeCloseTo(0, 9);
  }
};

describe('floorGeometry', () => {
  it('lleva (x, y) del plano a (x, 0, -y)', () => {
    const g = floorGeometry(rect);
    const box = new Box3().setFromBufferAttribute(g.getAttribute('position') as never);
    [0, 0, -3].forEach((v, i) => expect(box.min.getComponent(i)).toBeCloseTo(v, 9));
    [4, 0, 0].forEach((v, i) => expect(box.max.getComponent(i)).toBeCloseTo(v, 9));
  });

  it('la normal queda hacia +Y (antihorario)', () => normalsUp(rect));
  it('la normal queda hacia +Y también si el polígono viene horario', () => normalsUp([...rect].reverse()));
});

describe('roomProblem', () => {
  const room = (polygon: Point[]): Room => ({
    id: 'r1',
    name: 'x',
    polygon,
    floor: { material: 'wood', color: '#000000' },
    status: 'existing',
  });

  it('acepta un rectángulo y calcula área con signo', () => {
    expect(roomProblem(room(rect))).toBeNull();
    expect(polygonArea(rect)).toBeCloseTo(12);
    expect(polygonArea([...rect].reverse())).toBeCloseTo(-12);
  });

  it('rechaza polígonos degenerados', () => {
    expect(roomProblem(room(rect.slice(0, 2)))).not.toBeNull();
    expect(
      roomProblem(
        room([
          [0, 0],
          [1, 0],
          [2, 0],
        ]),
      ),
    ).not.toBeNull();
  });
});
