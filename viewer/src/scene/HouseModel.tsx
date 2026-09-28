import { useEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, type Material } from 'three';
import type { HouseBuild } from '../geometry/buildHouse.ts';
import { floorGeometry } from '../geometry/floors.ts';
import { buildWallFaces, type FaceBuffers } from '../geometry/wallFaces.ts';
import { segmentTransform } from '../geometry/walls.ts';
import type { MaterialRef, Point } from '../model/schema.ts';
import { NEW_COLOR, newFloorMaterial, newMaterial } from './diffStyle.ts';
import type { MaterialCache } from './materials.ts';
import { PLAN_CUT_HEIGHT } from './PlanView.tsx';

const CUT_COLOR = '#34332f'; // poché: pared cortada en planta

function toGeometry(b: FaceBuffers): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(b.positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(b.normals, 3));
  g.setAttribute('uv', new Float32BufferAttribute(b.uvs, 2));
  g.setIndex(b.indices);
  g.computeBoundingSphere();
  return g;
}

function Floor({ polygon, material, overlay }: { polygon: Point[]; material: Material; overlay?: Material }) {
  const geometry = useMemo(() => floorGeometry(polygon), [polygon]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Elevado 1 mm para no pelear con el suelo exterior. Las UV del Shape ya están en metros.
  return (
    <>
      <mesh geometry={geometry} material={material} position-y={0.001} receiveShadow />
      {overlay && <mesh geometry={geometry} material={overlay} position-y={0.002} />}
    </>
  );
}

interface Props {
  build: HouseBuild;
  section: boolean;
  diff: boolean; // vista Cambios: muros, cortes y pisos nuevos en verde
  materials: MaterialCache;
  facade: MaterialRef;
  interior: MaterialRef;
}

// Muros fusionados en una malla por material (fachada / interior, y en Cambios los nuevos aparte),
// pisos por MaterialRef y, en planta, la tapa de corte.
export function HouseModel({ build, section, diff, materials, facade, interior }: Props) {
  const geometries = useMemo(() => {
    const faces = buildWallFaces(build.walls, diff);
    return { facade: toGeometry(faces.facade), interior: toGeometry(faces.interior), new: toGeometry(faces.new) };
  }, [build, diff]);
  useEffect(
    () => () => {
      geometries.facade.dispose();
      geometries.interior.dispose();
      geometries.new.dispose();
    },
    [geometries],
  );
  const own = useMemo(
    () => ({
      cut: new MeshStandardMaterial({ color: CUT_COLOR, roughness: 1 }),
      newCut: new MeshStandardMaterial({ color: NEW_COLOR, roughness: 1 }),
      newWall: newMaterial(),
      newFloor: newFloorMaterial(),
    }),
    [],
  );
  useEffect(() => () => Object.values(own).forEach((m) => m.dispose()), [own]);

  return (
    <group name="house">
      <mesh geometry={geometries.facade} material={materials.get(facade, 'surface')} castShadow receiveShadow />
      <mesh geometry={geometries.interior} material={materials.get(interior, 'surface')} castShadow receiveShadow />
      {diff && <mesh geometry={geometries.new} material={own.newWall} castShadow receiveShadow />}
      {/* Tapa de corte: sin ella, un piso que se apoya sobre un muro (pilares, remates) lo tapa en planta. */}
      {section &&
        build.walls.flatMap((w) =>
          w.segments
            .filter((s) => s.v0 < PLAN_CUT_HEIGHT && s.v1 > PLAN_CUT_HEIGHT)
            .map((s, i) => {
              const t = segmentTransform(w, s);
              return (
                <mesh
                  key={`cap-${w.wall.id}-${i}`}
                  position={[t.position[0], PLAN_CUT_HEIGHT - 0.002, t.position[2]]}
                  rotation-y={t.rotationY}
                  material={diff && w.wall.status === 'new' ? own.newCut : own.cut}
                >
                  <boxGeometry args={[t.size[0], 0.002, t.size[2]]} />
                </mesh>
              );
            }),
        )}
      {build.rooms.map((r) => (
        <Floor key={r.id} polygon={r.polygon} material={materials.get(r.floor, 'floor')} overlay={diff && r.status === 'new' ? own.newFloor : undefined} />
      ))}
    </group>
  );
}
