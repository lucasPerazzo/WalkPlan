import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { player } from './runtime.ts';

// Dónde quedó la persona del recorrido, visible en maqueta y planta.
export function PlayerMarker() {
  const g = useRef<Group>(null);
  useFrame(() => {
    if (!g.current) return;
    g.current.visible = player.placed;
    g.current.position.set(player.x, 0, -player.y);
    g.current.rotation.y = ((player.yaw - 90) * Math.PI) / 180;
  });
  return (
    <group ref={g} visible={false}>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 1.8, 20]} />
        <meshStandardMaterial color="#d2542d" />
      </mesh>
      {/* nariz: hacia dónde mira (-Z local = dirección de la cámara) */}
      <mesh position={[0, 1.1, -0.32]} rotation-x={-Math.PI / 2}>
        <coneGeometry args={[0.14, 0.3, 16]} />
        <meshStandardMaterial color="#d2542d" />
      </mesh>
    </group>
  );
}
