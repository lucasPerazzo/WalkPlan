import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferGeometry, Float32BufferAttribute, MeshBasicMaterial, Shape, ShapeGeometry, Vector2, type Mesh } from 'three';
import type { UncertaintyTarget } from '../geometry/uncertainty.ts';
import { PLAN_CUT_HEIGHT } from './PlanView.tsx';

// Planta: el elemento de la duda elegida en naranja (titila salvo en modo test) y un "?" sobre cada
// elemento con duda mientras el panel está abierto.
const Y = PLAN_CUT_HEIGHT - 0.03;
const COLOR = '#e8780c';

export function Highlight({ target, markers, animate }: { target: UncertaintyTarget | null; markers: UncertaintyTarget[]; animate: boolean }) {
  const shapes = useMemo(() => {
    if (!target) return null;
    const fill = new ShapeGeometry(new Shape(target.outline.map(([x, y]) => new Vector2(x, y))));
    fill.rotateX(-Math.PI / 2);
    const pos: number[] = [];
    target.outline.forEach((a, i) => {
      const b = target.outline[(i + 1) % target.outline.length];
      pos.push(a[0], Y, -a[1], b[0], Y, -b[1]);
    });
    const line = new BufferGeometry();
    line.setAttribute('position', new Float32BufferAttribute(pos, 3));
    return { fill, line };
  }, [target]);
  useEffect(
    () => () => {
      shapes?.fill.dispose();
      shapes?.line.dispose();
    },
    [shapes],
  );
  const fillMaterial = useMemo(() => new MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.35, depthTest: false }), []);
  useEffect(() => () => fillMaterial.dispose(), [fillMaterial]);
  const t = useRef(0);
  const fill = useRef<Mesh>(null);
  useFrame((_, delta) => {
    const m = fill.current?.material as MeshBasicMaterial | undefined;
    if (!animate || !m) return;
    t.current += delta;
    m.opacity = 0.2 + 0.1 * (1 + Math.sin(t.current * 4));
  });

  return (
    <group name="highlight">
      {shapes && (
        <>
          <mesh ref={fill} geometry={shapes.fill} material={fillMaterial} position-y={Y} renderOrder={30} />
          <lineSegments geometry={shapes.line} renderOrder={31}>
            <lineBasicMaterial color={COLOR} depthTest={false} />
          </lineSegments>
        </>
      )}
      {markers.map((m) => (
        <Html key={m.id} position={[m.center[0], Y, -m.center[1]]} center zIndexRange={[15, 0]}>
          <span className="doubt-marker" data-focused={m.id === target?.id}>
            ?
          </span>
        </Html>
      ))}
    </group>
  );
}
