import { Environment, Sky } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { Object3D } from 'three';
import { boundsCenter, boundsSize, type Bounds } from '../geometry/bounds.ts';
import type { SunPosition } from '../geometry/sun.ts';
import { assets } from './runtime.ts';
import { setMaxAnisotropy } from './materials.ts';

const SUN_DISTANCE = 60;

// Si falta el HDRI (no se corrió fetch_assets.py) la escena sigue, solo sin reflejos del entorno.
class Optional extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    console.info('[hdri] no se pudo cargar el HDRI del entorno en public/hdri/ (correr viewer/scripts/fetch_assets.py)');
    assets.environmentReady = true;
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function MarkReady() {
  useEffect(() => {
    assets.environmentReady = true;
  }, []);
  return null;
}

// Sol direccional con sombras (encuadradas a la casa), cielo procedural que lo acompaña,
// luz hemisférica y el HDRI del entorno para iluminación y reflejos (no como fondo: su sol está fijo en la foto).
export function Lighting({ sun, bounds, hdri, shadowSize }: { sun: SunPosition; bounds: Bounds; hdri: string; shadowSize: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => setMaxAnisotropy(gl.capabilities.getMaxAnisotropy()), [gl]);

  const [cx, cy] = boundsCenter(bounds);
  const [sx, sy] = boundsSize(bounds);
  const radius = Math.hypot(sx, sy) / 2 + 4;
  const target = useMemo(() => new Object3D(), []);
  useEffect(() => {
    target.position.set(cx, 0, -cy);
    target.updateMatrixWorld();
  }, [target, cx, cy]);

  const [dx, dy, dz] = sun.direction;
  const up = Math.max(0, dy);
  const intensity = up > 0 ? 3.2 * Math.min(1, up * 2.5) : 0; // se apaga al atardecer
  return (
    <>
      <Sky distance={4500} sunPosition={[dx, dy, dz]} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.85} />
      {/* Cielo arriba, rebote cálido abajo: sin iluminación global, esto evita cielorrasos y sombras negras. */}
      <hemisphereLight args={['#e6ecf2', '#d9cdbd', 0.75 + 0.35 * up]} />
      <ambientLight color="#fff8ef" intensity={0.3} />
      <primitive object={target} />
      <directionalLight
        position={[cx + dx * SUN_DISTANCE, dy * SUN_DISTANCE, -cy + dz * SUN_DISTANCE]}
        target={target}
        intensity={intensity}
        color="#fff4e5"
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-radius}
        shadow-camera-right={radius}
        shadow-camera-top={radius}
        shadow-camera-bottom={-radius}
        shadow-camera-near={1}
        shadow-camera-far={SUN_DISTANCE * 2 + radius}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <Optional key={hdri}>
        <Suspense fallback={null}>
          <Environment files={`${import.meta.env.BASE_URL}hdri/${hdri}.hdr`} environmentIntensity={0.7} />
          <MarkReady />
        </Suspense>
      </Optional>
    </>
  );
}
