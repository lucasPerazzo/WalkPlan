import { MapControls, OrthographicCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Plane, Vector3 } from 'three';
import { boundsCenter, boundsSize, type Bounds } from '../geometry/bounds.ts';
import { planView } from './runtime.ts';

// Plano de corte horizontal, como una planta de arquitectura: puertas y ventanas se ven como huecos.
export const PLAN_CUT_HEIGHT = 1.2;
const MARGIN = 1.5; // metros alrededor de la casa al encuadrar

export function PlanView({ bounds, animate, test }: { bounds: Bounds; animate: boolean; test: boolean }) {
  const size = useThree((s) => s.size);
  const get = useThree((s) => s.get);
  const [cx, cy] = boundsCenter(bounds);
  const [sx, sy] = boundsSize(bounds);
  const zoom = Math.min(size.width / (sx + 2 * MARGIN), size.height / (sy + 2 * MARGIN));

  useEffect(() => {
    const { gl } = get();
    gl.clippingPlanes = [new Plane(new Vector3(0, -1, 0), PLAN_CUT_HEIGHT)];
    return () => {
      gl.clippingPlanes = [];
    };
  }, [get]);

  // Modo test: proyección plano -> píxeles de la página, para hacer clic sobre muebles y cotas.
  useEffect(() => {
    if (!test) return;
    window.__planToScreen = (x: number, y: number) => {
      const { camera, gl } = get();
      const v = new Vector3(x, 0, -y).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
    };
    return () => {
      delete window.__planToScreen;
    };
  }, [test, get]);

  // Centrar un punto pedido (panel de dudas): se mueven juntos el objetivo y la cámara, sin girar.
  useFrame(() => {
    const focus = planView.focus;
    if (!focus) return;
    planView.focus = null;
    const { camera, controls } = get();
    const c = controls as unknown as { target: Vector3; update: () => void } | null;
    camera.position.set(focus[0], camera.position.y, -focus[1] + 1e-3);
    c?.target.set(focus[0], 0, -focus[1]);
    c?.update();
  });

  return (
    <>
      {/* Cenital con un desvío mínimo en Z: así +y del plano (-Z de Three) queda hacia arriba en pantalla. */}
      <OrthographicCamera makeDefault position={[cx, 50, -cy + 1e-3]} zoom={zoom} near={0.1} far={200} />
      <MapControls makeDefault target={[cx, 0, -cy]} enableRotate={false} enableDamping={animate} />
    </>
  );
}
