import { useEffect, useMemo } from 'react';
import { MeshStandardMaterial, type Material } from 'three';
import type { FrameBox } from '../geometry/frames.ts';
import { newMaterial } from './diffStyle.ts';

// Marcos (material de style.window_frames) y vidrios. En la vista Cambios, los de aberturas nuevas en verde.
export function Frames({ frames, frame, highlight }: { frames: FrameBox[]; frame: Material; highlight?: Set<string> }) {
  const glass = useMemo(
    () => new MeshStandardMaterial({ color: '#cfe3ea', transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false }),
    [],
  );
  const green = useMemo(() => newMaterial(), []);
  useEffect(
    () => () => {
      glass.dispose();
      green.dispose();
    },
    [glass, green],
  );
  return (
    <group name="frames">
      {frames.map((f, i) => (
        <mesh
          key={`${f.openingId}-${i}`}
          position={[f.center[0], f.z, -f.center[1]]}
          rotation-y={f.angle}
          material={f.kind === 'glass' ? glass : highlight?.has(f.openingId) ? green : frame}
          castShadow={f.kind === 'frame'}
        >
          <boxGeometry args={f.size} />
        </mesh>
      ))}
    </group>
  );
}
