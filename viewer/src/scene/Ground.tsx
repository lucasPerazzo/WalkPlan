import { Grid } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { PlaneGeometry, type Material } from 'three';
import { boundsCenter, type Bounds } from '../geometry/bounds.ts';

// Terreno del entorno (textura del preset, UV en metros) y, en planta, grilla de 1 m (gruesas cada 5 m)
// alineada al origen del plano. Va por debajo de y=0: si coincide con la cara inferior de las paredes,
// en planta hay z-fighting.
export const GROUND_Y = -0.01;
const GRID_Y = -0.005;
const SIZE = 1200; // la niebla del preset esconde el borde

export function Ground({ bounds, material, grid }: { bounds: Bounds; material: Material; grid: boolean }) {
  const [cx, cy] = boundsCenter(bounds);
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(SIZE, SIZE);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * SIZE, uv.getY(i) * SIZE);
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <>
      <mesh geometry={geometry} material={material} rotation-x={-Math.PI / 2} position={[cx, GROUND_Y, -cy]} receiveShadow />
      {grid && (
        <Grid
          position={[0, GRID_Y, 0]}
          args={[10, 10]}
          infiniteGrid
          cellSize={1}
          cellThickness={0.6}
          cellColor="#b4b0a6"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#948f84"
          fadeDistance={70}
          fadeStrength={1.5}
        />
      )}
    </>
  );
}
