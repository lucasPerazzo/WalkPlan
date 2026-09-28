import { useEffect, useMemo } from 'react';
import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape, ShapeGeometry, Vector2, Vector3, type Material } from 'three';
import { hipRoof } from '../geometry/hipRoof.ts';
import type { Point, Style } from '../model/schema.ts';

export const SLAB = 0.2;
const HIP_SLOPE = 25; // grados, teja colonial
const EAVE = 0.4; // alero, metros más allá de la cara exterior

// Losa plana de 0.20 m sobre el contorno exterior; desde adentro es el cielorraso.
// Con style.roof.type 'hip' (y contorno ortogonal) se le suma encima el techo a cuatro aguas con alero.
// 'gable' y 'shed' se siguen dibujando como la losa plana (pendiente explícito).
function hipGeometry(outlines: Point[][], base: number): BufferGeometry | null {
  const triangles = hipRoof(outlines, HIP_SLOPE, base, EAVE);
  if (!triangles) return null;
  const pos: number[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (const t of triangles) {
    const [p, q, r] = t.map(([x, y, z]) => new Vector3(x, z, -y));
    // Cara hacia arriba (el material es de dos caras, pero así la normal y las sombras son las correctas)
    const up = b.subVectors(q, p).cross(c.subVectors(r, p)).y >= 0;
    for (const v of up ? [p, q, r] : [p, r, q]) pos.push(...a.copy(v).toArray());
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function Roof({
  outlines,
  height,
  type,
  roof,
  pitched,
  edge,
  ceiling,
  visible,
}: {
  outlines: Point[][];
  height: number;
  type: Style['roof']['type'];
  roof: Material;
  pitched: Material; // cuatro aguas: de dos caras (el alero se ve desde abajo)
  edge: Material;
  ceiling: Material; // con side BackSide: la cara del ShapeGeometry mira hacia arriba y se ve desde abajo
  visible: boolean;
}) {
  const geometries = useMemo(
    () =>
      outlines.map((poly) => {
        const shape = new Shape(poly.map(([x, y]) => new Vector2(x, y)));
        const slab = new ExtrudeGeometry(shape, { depth: SLAB, bevelEnabled: false });
        slab.rotateX(-Math.PI / 2); // (x, y) -> (x, 0, -y) y la extrusión hacia +Y
        const under = new ShapeGeometry(shape);
        under.rotateX(-Math.PI / 2);
        return { slab, under };
      }),
    [outlines],
  );
  const hip = useMemo(() => (type === 'hip' ? hipGeometry(outlines, height + SLAB) : null), [type, outlines, height]);
  useEffect(
    () => () => {
      geometries.forEach((g) => {
        g.slab.dispose();
        g.under.dispose();
      });
      hip?.dispose();
    },
    [geometries, hip],
  );
  return (
    <group name="roof" visible={visible}>
      {geometries.map((g, i) => (
        <group key={i}>
          <mesh geometry={g.slab} material={[roof, edge]} position-y={height} castShadow receiveShadow />
          <mesh geometry={g.under} material={ceiling} position-y={height - 0.003} receiveShadow />
        </group>
      ))}
      {hip && <mesh geometry={hip} material={pitched} castShadow receiveShadow />}
    </group>
  );
}
