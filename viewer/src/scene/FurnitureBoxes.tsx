import { Edges } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { CanvasTexture, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace, type Material } from 'three';
import type { FurniturePlacement } from '../geometry/furniture.ts';

// Respaldo cuando falta el modelo de una clave: caja con las medidas nominales y la clave escrita arriba.
const GROUPS: [RegExp, string][] = [
  [/^(sofa|armchair|chair|stool|desk_chair|bench|outdoor_chair|lounger)/, '#b9a58c'], // asientos
  [/^(bed|nightstand)/, '#c7b9a6'],
  [/^(table|coffee_table|desk|outdoor_table)/, '#a88963'],
  [/^(wardrobe|shelf|tv_unit|sideboard|tall_cabinet)/, '#9c8f80'],
  [/^(kitchen|fridge|stove|sink_kitchen|washing_machine)/, '#b3b0aa'],
  [/^(toilet|sink_bath|shower|bathtub|bidet)/, '#e4e4e0'],
  [/^(plant)/, '#7f9a6e'],
];
const colorFor = (key: string) => GROUPS.find(([re]) => re.test(key))?.[1] ?? '#b5ada3';

const boxColor = (p: FurniturePlacement) => p.item.color ?? colorFor(p.item.catalog);

function labelMaterial(text: string): MeshBasicMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#2b2824';
    ctx.font = '600 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 33, 244);
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  return new MeshBasicMaterial({ map, transparent: true });
}

export function FurnitureBoxes({ items }: { items: FurniturePlacement[] }) {
  // Un material por color y una etiqueta por clave, no por mueble.
  const materials = useMemo(() => {
    const byColor = new Map<string, MeshStandardMaterial>();
    for (const p of items) {
      const color = boxColor(p);
      if (!byColor.has(color)) byColor.set(color, new MeshStandardMaterial({ color, roughness: 0.85 }));
    }
    return byColor;
  }, [items]);
  const labels = useMemo(() => {
    const byKey = new Map<string, MeshBasicMaterial>();
    for (const p of items) if (!byKey.has(p.item.catalog)) byKey.set(p.item.catalog, labelMaterial(p.item.catalog));
    return byKey;
  }, [items]);
  useEffect(() => () => materials.forEach((m: Material) => m.dispose()), [materials]);
  useEffect(
    () => () =>
      labels.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      }),
    [labels],
  );
  return (
    <group name="furniture-boxes">
      {items.map((p) => {
        const [w, h, d] = p.size;
        const lw = Math.min(w * 0.9, 1.2);
        return (
          <mesh key={p.item.id} position={p.position} rotation-y={p.rotationY} material={materials.get(boxColor(p))} castShadow receiveShadow>
            <boxGeometry args={p.size} />
            <Edges color="#5b544b" threshold={20} />
            <mesh position-y={h / 2 + 0.005} rotation-x={-Math.PI / 2} material={labels.get(p.item.catalog)}>
              <planeGeometry args={[lw, Math.min(lw / 4, d * 0.9)]} />
            </mesh>
          </mesh>
        );
      })}
    </group>
  );
}
