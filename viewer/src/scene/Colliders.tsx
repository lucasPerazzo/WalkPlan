import { CuboidCollider, RigidBody } from '@react-three/rapier';
import type { Obstacle } from '../environment/generate.ts';
import type { Rect } from '../environment/keepout.ts';
import type { HouseBuild } from '../geometry/buildHouse.ts';
import type { FrameBox } from '../geometry/frames.ts';
import type { FurniturePlacement } from '../geometry/furniture.ts';
import { segmentTransform } from '../geometry/walls.ts';

// Colisión estática: un cuboide por tramo de pared (los vanos quedan libres), vidrios, suelo,
// límite del área caminable y obstáculos del entorno (troncos, edificios, casas, cercos) dentro de ella.
// Las puertas tienen su propio collider (Doors.tsx).
export function Colliders({ build, frames, walk, obstacles }: { build: HouseBuild; frames: FrameBox[]; walk: Rect; obstacles: Obstacle[] }) {
  const { minX: x0, maxX: x1, minY: y0, maxY: y1 } = walk;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2;
  const hy = (y1 - y0) / 2;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[hx + 1, 0.1, hy + 1]} position={[cx, -0.1, -cy]} />
      <CuboidCollider args={[0.1, 2, hy]} position={[x0, 2, -cy]} />
      <CuboidCollider args={[0.1, 2, hy]} position={[x1, 2, -cy]} />
      <CuboidCollider args={[hx, 2, 0.1]} position={[cx, 2, -y0]} />
      <CuboidCollider args={[hx, 2, 0.1]} position={[cx, 2, -y1]} />
      {build.walls.flatMap((w) =>
        w.segments.map((s, i) => {
          const t = segmentTransform(w, s);
          return (
            <CuboidCollider
              key={`w-${w.wall.id}-${i}`}
              args={[t.size[0] / 2, t.size[1] / 2, t.size[2] / 2]}
              position={t.position}
              rotation={[0, t.rotationY, 0]}
            />
          );
        }),
      )}
      {frames
        .filter((f) => f.collider)
        .map((f, i) => (
          <CuboidCollider
            key={`g-${f.openingId}-${i}`}
            args={[f.size[0] / 2, f.size[1] / 2, 0.02]}
            position={[f.center[0], f.z, -f.center[1]]}
            rotation={[0, f.angle, 0]}
          />
        ))}
      {obstacles.map((o, i) => (
        <CuboidCollider
          key={`e-${i}`}
          args={[o.size[0] / 2, o.size[1] / 2, o.size[2] / 2]}
          position={[o.center[0], o.size[1] / 2, -o.center[1]]}
          rotation={[0, o.angle, 0]}
        />
      ))}
    </RigidBody>
  );
}

// Muebles: un cuboide por huella (salvo rug). Se montan al entrar a primera persona, así siguen
// lo que se editó en planta sin rehacer colliders en cada arrastre.
export function FurnitureColliders({ furniture }: { furniture: FurniturePlacement[] }) {
  return (
    <RigidBody type="fixed" colliders={false}>
      {furniture
        .filter((p) => p.collider)
        .map((p) => (
          <CuboidCollider
            key={`f-${p.item.id}`}
            args={[p.size[0] / 2, p.size[1] / 2, p.size[2] / 2]}
            position={p.position}
            rotation={[0, p.rotationY, 0]}
          />
        ))}
    </RigidBody>
  );
}
