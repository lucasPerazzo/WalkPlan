import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Matrix4, Quaternion, Vector3, type InstancedMesh, type Material } from 'three';
import { useFurnitureModels } from '../furniture/models.ts';
import { fabricInstanceColor, isFabric, PaletteMaterials } from '../furniture/palette.ts';
import type { ModelPart } from '../furniture/parts.ts';
import type { FurniturePlacement } from '../geometry/furniture.ts';
import { updateProbe } from '../testMode.ts';
import { FurnitureBoxes } from './FurnitureBoxes.tsx';
import { assets } from './runtime.ts';

const UP = new Vector3(0, 1, 0);

// Una InstancedMesh por clave y material: los muebles repetidos (sillas, módulos de cocina) cuestan un draw call.
function Instances({ part, material, items }: { part: ModelPart; material: Material; items: FurniturePlacement[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const pos = new Vector3();
    const scale = new Vector3();
    const tinted = isFabric(part.material) && items.some((p) => p.item.color);
    items.forEach((p, i) => {
      m.compose(pos.set(...p.origin), q.setFromAxisAngle(UP, p.rotationY), scale.setScalar(p.scale));
      mesh.setMatrixAt(i, m);
      if (tinted) mesh.setColorAt(i, fabricInstanceColor(part.material, p.item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); // el recorte por frustum usa la esfera de todas las instancias
  }, [part, items]);
  return <instancedMesh ref={ref} args={[part.geometry, material, items.length]} castShadow receiveShadow />;
}

export function FurnitureModels({ items }: { items: FurniturePlacement[] }) {
  const byKey = useMemo(() => {
    const map = new Map<string, FurniturePlacement[]>();
    for (const p of items) map.set(p.item.catalog, [...(map.get(p.item.catalog) ?? []), p]);
    return map;
  }, [items]);
  const keys = useMemo(() => [...byKey.keys()].sort(), [byKey]);
  const { models, ready } = useFurnitureModels(keys);
  const palette = useMemo(() => new PaletteMaterials(), []);
  useEffect(() => () => palette.dispose(), [palette]);

  // Sin modelo (falta el archivo): caja con la clave. Mientras carga, nada.
  const boxes = ready ? items.filter((p) => models.get(p.item.catalog) === null) : [];

  // Después del commit: los modelos ya están en la escena cuando el modo test marca ready.
  useEffect(() => {
    assets.modelsReady = ready;
    if (ready) updateProbe((p) => (p.stats.placeholders = boxes.length));
  }, [ready, boxes.length]);

  return (
    <group name="furniture">
      {keys.map((key) => {
        const parts = models.get(key);
        const list = byKey.get(key) ?? [];
        return parts?.map((part) => (
          <Instances key={`${key}-${part.material}-${list.length}`} part={part} material={palette.get(part.material)} items={list} />
        ));
      })}
      <FurnitureBoxes items={boxes} />
    </group>
  );
}
