import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferGeometry, Float32BufferAttribute, Shape, ShapeGeometry, Vector2, Vector3 } from 'three';
import { footprint, frontOf, hitFurniture, snapAngle } from '../geometry/furnitureEdit.ts';
import type { FurnitureItem, Point } from '../model/schema.ts';
import { PLAN_CUT_HEIGHT } from './PlanView.tsx';
import { planView } from './runtime.ts';

// Editor de muebles en la vista planta: huellas de todos los muebles (también los que quedan por
// encima del corte, como alacenas), selección, arrastre para mover y manija para rotar.
// Los cambios suben por callbacks; acá no hay estado de la casa.

const Y = PLAN_CUT_HEIGHT - 0.05; // por debajo del plano de corte
const HANDLE_GAP = 0.35; // m entre el frente y la manija de rotación
const HANDLE_R = 0.14;
const ACCENT = '#d9731f';
const LINE = '#3d3a35';

const toThree = ([x, y]: Point, h = Y) => new Vector3(x, h, -y);
const toPlan = (v: Vector3): Point => [v.x, -v.z];

function outlineGeometry(polys: Point[][]): BufferGeometry {
  const pos: number[] = [];
  for (const poly of polys) {
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      pos.push(a[0], Y, -a[1], b[0], Y, -b[1]);
    });
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

function handleOf(item: FurnitureItem): Point {
  const poly = footprint(item);
  const [fx, fy] = frontOf(item.rotation);
  // distancia del centro al borde del frente: la mitad de la profundidad rotada
  const reach = Math.max(...poly.map(([x, y]) => (x - item.position[0]) * fx + (y - item.position[1]) * fy));
  return [item.position[0] + fx * (reach + HANDLE_GAP), item.position[1] + fy * (reach + HANDLE_GAP)];
}

interface Props {
  items: FurnitureItem[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, to: Point) => void;
  onRotate: (id: string, rotation: number) => void;
}

type Drag = { mode: 'move'; id: string; offset: Point } | { mode: 'rotate'; id: string };

export function FurnitureEditor({ items, selected, onSelect, onMove, onRotate }: Props) {
  // Controles y canvas se leen con get() en los handlers: se modifican (enabled, cursor), no son estado de React.
  const get = useThree((s) => s.get);
  const controls = () => get().controls as unknown as { enabled: boolean; target?: Vector3 } | null;
  const drag = useRef<Drag | null>(null);

  const outlines = useMemo(() => outlineGeometry(items.map(footprint)), [items]);
  useEffect(() => () => outlines.dispose(), [outlines]);

  const current = items.find((f) => f.id === selected) ?? null;
  const selection = useMemo(() => {
    if (!current) return null;
    const poly = footprint(current);
    const fill = new ShapeGeometry(new Shape(poly.map(([x, y]) => new Vector2(x, y))));
    fill.rotateX(-Math.PI / 2); // (x, y) -> (x, 0, -y)
    const handle = handleOf(current);
    const line = new BufferGeometry().setFromPoints([toThree(current.position), toThree(handle)]); // marca el frente
    return { outline: outlineGeometry([poly]), fill, line, handle };
  }, [current]);
  useEffect(
    () => () => {
      selection?.outline.dispose();
      selection?.fill.dispose();
      selection?.line.dispose();
    },
    [selection],
  );

  // Centro de la vista (para agregar muebles). La proyección plano -> pantalla del modo test la publica PlanView.
  useFrame(() => {
    const target = controls()?.target;
    if (target) planView.center = toPlan(target);
  });

  const setCursor = (c: string) => {
    get().gl.domElement.style.cursor = c;
  };
  useEffect(
    () => () => {
      get().gl.domElement.style.cursor = '';
    },
    [get],
  );
  const setControls = (enabled: boolean) => {
    const c = controls();
    if (c) c.enabled = enabled;
  };

  const overHandle = (p: Point) => selection !== null && Math.hypot(p[0] - selection.handle[0], p[1] - selection.handle[1]) < HANDLE_R * 1.4;

  const end = () => {
    drag.current = null;
    setControls(true);
  };

  const down = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const p = toPlan(e.point);
    let next: Drag | null = null;
    if (current && overHandle(p)) {
      next = { mode: 'rotate', id: current.id };
    } else {
      const id = hitFurniture(p, items);
      const item = items.find((f) => f.id === id);
      if (!item) return; // espacio vacío: la cámara se desplaza (y el clic deselecciona)
      onSelect(item.id);
      next = { mode: 'move', id: item.id, offset: [item.position[0] - p[0], item.position[1] - p[1]] };
    }
    e.stopPropagation();
    drag.current = next;
    setControls(false); // que MapControls no desplace la vista mientras se arrastra
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
  };

  const move = (e: ThreeEvent<PointerEvent>) => {
    const p = toPlan(e.point);
    const d = drag.current;
    if (!d) {
      setCursor(overHandle(p) ? 'grab' : hitFurniture(p, items) ? 'move' : '');
      return;
    }
    if (d.mode === 'move') {
      onMove(d.id, [p[0] + d.offset[0], p[1] + d.offset[1]]);
    } else if (current) {
      // frente = (sin r, -cos r)  =>  r = atan2(dx, -dy)
      const deg = (Math.atan2(p[0] - current.position[0], -(p[1] - current.position[1])) * 180) / Math.PI;
      onRotate(d.id, e.shiftKey ? Math.round(deg) : snapAngle(deg));
    }
  };

  const up = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    (e.target as unknown as Element).releasePointerCapture(e.pointerId);
    end();
  };

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return; // fue un arrastre
    const p = toPlan(e.point);
    if (!overHandle(p) && !hitFurniture(p, items)) onSelect(null);
  };

  return (
    <group name="furniture-editor">
      <mesh rotation-x={-Math.PI / 2} position-y={Y} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={click}>
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <lineSegments geometry={outlines} renderOrder={10}>
        <lineBasicMaterial color={LINE} transparent opacity={0.75} depthTest={false} />
      </lineSegments>
      {selection && (
        <>
          <mesh geometry={selection.fill} position-y={Y} renderOrder={11}>
            <meshBasicMaterial color={ACCENT} transparent opacity={0.22} depthTest={false} />
          </mesh>
          <lineSegments geometry={selection.outline} renderOrder={12}>
            <lineBasicMaterial color={ACCENT} depthTest={false} />
          </lineSegments>
          <lineSegments geometry={selection.line} renderOrder={12}>
            <lineBasicMaterial color={ACCENT} depthTest={false} />
          </lineSegments>
          <mesh position={toThree(selection.handle)} rotation-x={-Math.PI / 2} renderOrder={13}>
            <circleGeometry args={[HANDLE_R, 24]} />
            <meshBasicMaterial color={ACCENT} depthTest={false} />
          </mesh>
        </>
      )}
    </group>
  );
}
