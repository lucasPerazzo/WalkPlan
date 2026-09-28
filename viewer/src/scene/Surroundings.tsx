import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Matrix4, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3, type InstancedMesh, type Material, type Mesh } from 'three';
import type { Prop, PropKind, Surroundings as SurroundingsData } from '../environment/generate.ts';
import type { EnvironmentDef } from '../environment/presets.ts';
import { blockGeometries, PROP_FINISH, propParts, SHADED, streetGeometries, waterNormals, windowTexture } from '../environment/props.ts';
import type { ModelPart } from '../furniture/parts.ts';
import { GROUND_Y } from './Ground.tsx';
import type { MaterialCache } from './materials.ts';

// Entorno exterior del preset: niebla, calle, volúmenes (edificios, casas, cercos), props instanciados y agua.
// Los props cercanos proyectan sombra; los lejanos no.

const NEAR = 20; // metros más allá del radio de la casa con sombras
const LITE_FAR = 70; // modo liviano: árboles hasta acá; los arbustos lejanos no se dibujan
const UP = new Vector3(0, 1, 0);
const KINDS: PropKind[] = ['pine', 'broadleaf', 'bush', 'lamp', 'hill', 'dune'];

function Instances({ part, material, items, shadows }: { part: ModelPart; material: Material; items: Prop[]; shadows: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const pos = new Vector3();
    const scale = new Vector3();
    const shade = new Color();
    items.forEach((p, i) => {
      m.compose(pos.set(p.position[0], GROUND_Y, -p.position[1]), q.setFromAxisAngle(UP, p.angle), scale.set(...p.scale));
      mesh.setMatrixAt(i, m);
      if (SHADED.has(part.material)) mesh.setColorAt(i, shade.setScalar(p.shade));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [part, items]);
  return <instancedMesh ref={ref} args={[part.geometry, material, items.length]} castShadow={shadows} receiveShadow />;
}

function Water({ water, animate }: { water: NonNullable<SurroundingsData['water']>; animate: boolean }) {
  const { geometry, material } = useMemo(() => {
    const g = new PlaneGeometry(1200, 1200);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1200, uv.getY(i) * 1200);
    const normalMap = waterNormals();
    normalMap.repeat.set(1 / 9, 1 / 9); // UV en metros: una ola cada ~9 m
    const mat = new MeshStandardMaterial({ color: '#3f7f93', roughness: 0.12, metalness: 0.15, normalMap });
    return { geometry: g, material: mat };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.normalMap?.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const mesh = useRef<Mesh>(null);
  useFrame((_, delta) => {
    const normals = (mesh.current?.material as MeshStandardMaterial | undefined)?.normalMap;
    if (animate && normals) normals.offset.x += delta * 0.01; // oleaje (quieto en modo test)
  });
  // El plano arranca en la orilla y se extiende 1200 m hacia el mar.
  const [ox, oy] = water.origin;
  const [dx, dy] = water.out;
  const center: [number, number, number] = [ox + dx * 600, 0.02, -(oy + dy * 600)];
  return (
    <mesh ref={mesh} geometry={geometry} material={material} position={center} rotation={[-Math.PI / 2, 0, Math.atan2(dy, dx)]} receiveShadow />
  );
}

interface Props {
  env: SurroundingsData;
  def: EnvironmentDef;
  materials: MaterialCache;
  animate: boolean;
  props: boolean; // árboles, faroles y volúmenes (la maqueta los puede ocultar; el terreno queda)
  lite: boolean; // celular: menos props lejanos
}

export function Surroundings({ env, def, materials, animate, props, lite }: Props) {
  const groups = useMemo(() => {
    const near = new Map<PropKind, Prop[]>();
    const far = new Map<PropKind, Prop[]>();
    for (const p of env.props) {
      const d = Math.hypot(p.position[0] - env.center[0], p.position[1] - env.center[1]);
      const isNear = d < env.radius + NEAR;
      if (lite && !isNear && (p.kind === 'bush' || ((p.kind === 'pine' || p.kind === 'broadleaf') && d > env.radius + LITE_FAR))) continue;
      const target = isNear ? near : far;
      target.set(p.kind, [...(target.get(p.kind) ?? []), p]);
    }
    return { near, far };
  }, [env, lite]);

  const palette = useMemo(() => {
    const byName = new Map<string, MeshStandardMaterial>();
    for (const [name, f] of Object.entries(PROP_FINISH)) {
      byName.set(name, new MeshStandardMaterial({ color: f.color, roughness: f.roughness, metalness: f.metalness ?? 0 }));
    }
    return byName;
  }, []);
  const blocks = useMemo(() => blockGeometries(env.blocks), [env]);
  const street = useMemo(() => (env.street ? streetGeometries(env.street) : null), [env]);
  const blockMaterials = useMemo(
    () => ({
      facades: new MeshStandardMaterial({ map: windowTexture(), vertexColors: true, roughness: 0.85 }),
      plain: new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
      marks: new MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      palette.forEach((m) => m.dispose());
      blockMaterials.facades.map?.dispose();
      Object.values(blockMaterials).forEach((m) => m.dispose());
    },
    [palette, blockMaterials],
  );
  useEffect(
    () => () => {
      blocks.facades.dispose();
      blocks.plain.dispose();
      if (street) Object.values(street).forEach((g) => g.dispose());
    },
    [blocks, street],
  );

  return (
    <group name="surroundings">
      <fog attach="fog" args={[def.fog.color, def.fog.near, def.fog.far]} />
      {street && (
        <group position-y={GROUND_Y}>
          <mesh geometry={street.road} material={materials.terrain('asphalt', '#5b5a57', 1)} receiveShadow />
          <mesh geometry={street.sidewalk} material={materials.terrain('sidewalk', '#b5b1a9', 1)} receiveShadow />
          <mesh geometry={street.marks} material={blockMaterials.marks} />
        </group>
      )}
      {env.blocks.length > 0 && (
        <group position-y={GROUND_Y} visible={props}>
          <mesh geometry={blocks.facades} material={blockMaterials.facades} receiveShadow />
          <mesh geometry={blocks.plain} material={blockMaterials.plain} receiveShadow />
        </group>
      )}
      {KINDS.flatMap((kind) =>
        (['near', 'far'] as const).flatMap((zone) => {
          const items = groups[zone].get(kind);
          if (!items?.length) return [];
          const terrain = kind === 'hill' || kind === 'dune'; // lomas y médanos quedan aunque se oculte el entorno
          return propParts(kind).map((part) => (
            <group key={`${kind}-${zone}-${part.material}-${items.length}`} visible={terrain || props}>
              <Instances part={part} material={palette.get(part.material) as Material} items={items} shadows={zone === 'near'} />
            </group>
          ));
        }),
      )}
      {env.water && <Water water={env.water} animate={animate} />}
    </group>
  );
}
