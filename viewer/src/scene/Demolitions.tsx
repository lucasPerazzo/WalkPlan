import { useEffect, useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import type { ChangeBox } from '../geometry/changes.ts';
import { DEMOLISH_COLOR, demolishMaterial } from './diffStyle.ts';
import { PLAN_CUT_HEIGHT } from './PlanView.tsx';

// Vista Cambios: muros a demoler y aberturas que se cierran, en rojo semitransparente.
// En planta, además, la tapa de corte en rojo (como en un plano de demolición).
export function Demolitions({ boxes, section }: { boxes: ChangeBox[]; section: boolean }) {
  const materials = useMemo(() => ({ box: demolishMaterial(), cut: new MeshStandardMaterial({ color: DEMOLISH_COLOR, roughness: 1 }) }), []);
  useEffect(
    () => () => {
      materials.box.dispose();
      materials.cut.dispose();
    },
    [materials],
  );
  return (
    <group name="demolitions">
      {boxes.map((b, i) => (
        <mesh key={`d-${b.id}-${i}`} position={[b.center[0], b.z, -b.center[1]]} rotation-y={b.angle} material={materials.box} renderOrder={2}>
          <boxGeometry args={b.size} />
        </mesh>
      ))}
      {section &&
        boxes
          .filter((b) => b.z - b.size[1] / 2 < PLAN_CUT_HEIGHT && b.z + b.size[1] / 2 > PLAN_CUT_HEIGHT)
          .map((b, i) => (
            <mesh key={`dc-${b.id}-${i}`} position={[b.center[0], PLAN_CUT_HEIGHT - 0.001, -b.center[1]]} rotation-y={b.angle} material={materials.cut}>
              <boxGeometry args={[b.size[0], 0.002, b.size[2]]} />
            </mesh>
          ))}
    </group>
  );
}
