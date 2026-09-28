import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { BufferGeometry, Raycaster, Vector2, Vector3, type Intersection, type Object3D } from 'three';
import { constrainAxis, distance, formatMeters, snapPoint, type Snapped, type SnapTargets } from '../geometry/measure.ts';
import type { Point } from '../model/schema.ts';
import { updateProbe } from '../testMode.ts';
import { PLAN_CUT_HEIGHT } from './PlanView.tsx';
import { measureUi } from './runtime.ts';

const Y = PLAN_CUT_HEIGHT - 0.04; // cotas de planta, por debajo del plano de corte
const COLOR = '#1d6fd6';
const NO_RAYCAST = () => null; // las ayudas de medición no se miden a sí mismas

const toThree = ([x, y]: Point, h = Y) => new Vector3(x, h, -y);

// Línea (siempre visible) con etiqueta en el medio.
function Dimension({ a, b, label }: { a: Vector3; b: Vector3; label: string }) {
  const geometry = useMemo(() => new BufferGeometry().setFromPoints([a, b]), [a, b]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return (
    <>
      <lineSegments geometry={geometry} renderOrder={20} raycast={NO_RAYCAST}>
        <lineBasicMaterial color={COLOR} depthTest={false} />
      </lineSegments>
      {[a, b].map((p, i) => (
        <mesh key={i} position={p} renderOrder={21} raycast={NO_RAYCAST}>
          <sphereGeometry args={[0.035, 10, 6]} />
          <meshBasicMaterial color={COLOR} depthTest={false} />
        </mesh>
      ))}
      <Html position={mid} center zIndexRange={[20, 0]}>
        <span className="cota">{label}</span>
      </Html>
    </>
  );
}

// ---------------------------------------------------------------- planta

interface PlanProps {
  targets: SnapTargets;
  measures: [Point, Point][];
  onAdd: (m: [Point, Point]) => void;
  active: boolean; // herramienta encendida; apagada, solo se ven las cotas hechas
}

// Clic y clic: cada extremo se engancha a esquinas y caras de muro; Shift deja la cota recta; Esc cancela.
export function MeasurePlan({ targets, measures, onAdd, active }: PlanProps) {
  const [first, setFirst] = useState<Point | null>(null);
  const [hover, setHover] = useState<Snapped | null>(null);
  const [shift, setShift] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setShift(e.shiftKey);
      if (e.code === 'Escape') setFirst(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>): Point => {
    const s = snapPoint([e.point.x, -e.point.z], targets).point;
    return first && e.shiftKey ? constrainAxis(first, s) : s;
  };
  const move = (e: ThreeEvent<PointerEvent>) => setHover({ ...snapPoint([e.point.x, -e.point.z], targets), point: pick(e) });
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return; // fue un arrastre de la vista
    const p = pick(e);
    if (!first) setFirst(p);
    else {
      onAdd([first, p]);
      setFirst(null);
    }
  };
  const preview = first && hover ? (shift ? constrainAxis(first, hover.point) : hover.point) : null;

  return (
    <group name="measure-plan">
      {active && (
        <mesh rotation-x={-Math.PI / 2} position-y={Y} onPointerMove={move} onClick={click}>
          <planeGeometry args={[400, 400]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
      {measures.map(([a, b], i) => (
        <Dimension key={i} a={toThree(a)} b={toThree(b)} label={formatMeters(distance(a, b))} />
      ))}
      {first && preview && <Dimension a={toThree(first)} b={toThree(preview)} label={formatMeters(distance(first, preview))} />}
      {hover?.kind && (
        <mesh position={toThree(hover.point)} rotation-x={-Math.PI / 2} renderOrder={22} raycast={NO_RAYCAST}>
          <ringGeometry args={[0.06, 0.1, 16]} />
          <meshBasicMaterial color={COLOR} depthTest={false} />
        </mesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------- primera persona

const CENTER = new Vector2(0, 0);
const RAY = new Raycaster();
RAY.far = 60; // metros: más allá no hay nada que medir (y así no se engancha el cielo)

function visibleChain(o: Object3D | null): boolean {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

// M marca el punto bajo la mira (pared, piso, mueble); la segunda M da la distancia 3D; la tercera empieza otra.
export function MeasureFps() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const [points, setPoints] = useState<Vector3[]>([]);

  useFrame(() => {
    if (!measureUi.request) return;
    measureUi.request = false;
    RAY.setFromCamera(CENTER, camera);
    const hit = RAY.intersectObjects(scene.children, true).find((h: Intersection) => visibleChain(h.object));
    if (!hit) return;
    setPoints((prev) => (prev.length === 1 ? [prev[0], hit.point.clone()] : [hit.point.clone()]));
  });

  const d = points.length === 2 ? points[0].distanceTo(points[1]) : null;
  useEffect(() => {
    updateProbe((p) => {
      p.measure.fps = d;
      p.measure.marks = points.length;
    });
  }, [d, points.length]);

  if (points.length === 0) return null;
  return points.length === 2 ? (
    <Dimension a={points[0]} b={points[1]} label={formatMeters(d ?? 0)} />
  ) : (
    <mesh position={points[0]} renderOrder={21} raycast={NO_RAYCAST}>
      <sphereGeometry args={[0.035, 10, 6]} />
      <meshBasicMaterial color={COLOR} depthTest={false} />
    </mesh>
  );
}
