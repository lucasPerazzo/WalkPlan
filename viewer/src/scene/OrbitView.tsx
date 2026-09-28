import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { boundsCenter, boundsSize, type Bounds } from '../geometry/bounds.ts';
import type { Point } from '../model/schema.ts';

// Maqueta: cámara orbital apuntando al centro del bounding box.
// `from` es la posición de la cámara en coordenadas del plano; por defecto, frente-izquierda.
export function OrbitView({ bounds, from, animate }: { bounds: Bounds; from?: Point; animate: boolean }) {
  const [cx, cy] = boundsCenter(bounds);
  const [sx, sy] = boundsSize(bounds);
  const r = Math.max(sx, sy, 4);
  const [px, py] = from ?? [cx - r * 0.8, cy - r * 1.1];
  return (
    <>
      <PerspectiveCamera makeDefault fov={50} near={0.1} far={1000} position={[px, r * 0.85, -py]} />
      <OrbitControls
        makeDefault
        target={[cx, 1, -cy]}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={1}
        maxDistance={r * 6}
        enableDamping={animate}
      />
    </>
  );
}
