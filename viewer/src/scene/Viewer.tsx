import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { BackSide, DoubleSide, type Material, type Mesh, type Texture } from 'three';
import type { Surroundings as SurroundingsData } from '../environment/generate.ts';
import type { EnvironmentDef } from '../environment/presets.ts';
import type { HouseBuild } from '../geometry/buildHouse.ts';
import type { ChangeBox } from '../geometry/changes.ts';
import type { SnapTargets } from '../geometry/measure.ts';
import type { UncertaintyTarget } from '../geometry/uncertainty.ts';
import type { Door } from '../geometry/doors.ts';
import type { FrameBox } from '../geometry/frames.ts';
import type { FurniturePlacement } from '../geometry/furniture.ts';
import type { Spawn } from '../geometry/spawn.ts';
import type { SunPosition } from '../geometry/sun.ts';
import type { FurnitureItem, Point, Style } from '../model/schema.ts';
import { updateProbe } from '../testMode.ts';
import { Colliders, FurnitureColliders } from './Colliders.tsx';
import { Demolitions } from './Demolitions.tsx';
import { Doors } from './Doors.tsx';
import { Frames } from './Frames.tsx';
import { FurnitureEditor } from './FurnitureEditor.tsx';
import { FurnitureModels } from './FurnitureModels.tsx';
import { Highlight } from './Highlight.tsx';
import { MeasureFps, MeasurePlan } from './Measure.tsx';
import { Ground } from './Ground.tsx';
import { HouseModel } from './HouseModel.tsx';
import { Lighting } from './Lighting.tsx';
import { MaterialCache } from './materials.ts';
import { OrbitView } from './OrbitView.tsx';
import { PlanView } from './PlanView.tsx';
import { Player } from './Player.tsx';
import { PlayerMarker } from './PlayerMarker.tsx';
import { Roof } from './Roof.tsx';
import { Surroundings } from './Surroundings.tsx';
import { assets, player } from './runtime.ts';

export type ViewKind = 'fps' | 'orbit' | 'plan';

interface Props {
  build: HouseBuild;
  doors: Door[];
  frames: FrameBox[];
  diff: { boxes: ChangeBox[]; newOpenings: Set<string> } | null; // vista Cambios
  mode: string; // actual | reforma | diff: remonta colliders y puertas al cambiar de vista
  furniture: FurniturePlacement[];
  editor: {
    items: FurnitureItem[]; // muebles visibles, para el editor en planta
    selected: string | null;
    onSelect: (id: string | null) => void;
    onMove: (id: string, to: Point) => void;
    onRotate: (id: string, rotation: number) => void;
  };
  measure: { active: boolean; targets: SnapTargets; measures: [Point, Point][]; onAdd: (m: [Point, Point]) => void }; // planta
  highlight: { target: UncertaintyTarget | null; markers: UncertaintyTarget[] }; // dudas del plano, en planta
  spawn: Spawn;
  environment: { def: EnvironmentDef; data: SurroundingsData };
  style: Style;
  sun: SunPosition;
  roofOutlines: Point[][];
  wallHeight: number;
  showRoof: boolean; // maqueta: el botón de techo (en primera persona siempre hay cielorraso)
  showSurroundings: boolean; // árboles, edificios y cercos (la maqueta los puede ocultar)
  loadId: number; // cambia con cada casa cargada: remonta la escena y libera la geometría anterior
  view: ViewKind;
  orbitFrom?: Point;
  fpsFrom?: { position: Point; yaw: number }; // modo test
  touch: boolean;
  lite: boolean; // celular: menos resolución, sombras más chicas y menos props lejanos
  test: boolean;
  onLockChange: (locked: boolean) => void;
}

const PLAYER_SETTLE_FRAMES = 30;
const TEXTURE_KEYS = ['map', 'normalMap', 'roughnessMap'] as const;

// Cuando terminan de cargar texturas y HDRI: sube las texturas y compila todos los shaders de una vez.
// Sin esto, cada material nuevo que entra en cuadro congela el recorrido (y la física pierde tiempo).
function Warmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const started = useRef(false);
  useFrame(() => {
    if (started.current || assets.pending > 0 || !assets.environmentReady || !assets.modelsReady) return;
    started.current = true;
    assets.warm = false;
    scene.traverse((o) => {
      const mats = (o as Mesh).material;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        for (const k of TEXTURE_KEYS) {
          const t = (m as Material & Partial<Record<(typeof TEXTURE_KEYS)[number], Texture | null>>)[k];
          if (t) gl.initTexture(t);
        }
      }
    });
    gl.compileAsync(scene, camera).then(() => {
      assets.warm = true;
    });
  });
  return null;
}

// Modo test: marca ready y publica los triángulos dibujados. Solo refs, nada de setState.
function Probe({ playerFrames, needsPlayer }: { playerFrames: { current: number }; needsPlayer: boolean }) {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    updateProbe((p) => {
      p.stats.triangles = gl.info.render.triangles;
      p.player = needsPlayer ? { x: player.x, y: player.y, yaw: player.yaw, t: player.simTime } : null;
      const loaded = assets.pending === 0 && assets.environmentReady && assets.modelsReady && assets.warm;
      if (loaded && (needsPlayer ? playerFrames.current >= PLAYER_SETTLE_FRAMES : frames.current >= 3)) p.ready = true;
    });
  });
  return null;
}

export function Viewer(props: Props) {
  const { build, doors, frames, diff, mode, furniture, editor, measure, highlight, spawn, environment, style, sun, roofOutlines, wallHeight, showRoof, showSurroundings, loadId, view, orbitFrom, fpsFrom, touch, lite, test, onLockChange } = props;
  const animate = !test;
  const inFps = view === 'fps';
  const playerFrames = useRef(0);

  // Al entrar a primera persona: el punto del test, el último punto del recorrido o la llegada.
  // Se toma una foto al entrar: después la posición la maneja la física.
  const start = useMemo(() => {
    if (fpsFrom) return fpsFrom;
    if (inFps && player.placed) return { position: [player.x, player.y] as Point, yaw: player.yaw };
    return spawn;
  }, [inFps, spawn, fpsFrom]);

  // Un material por MaterialRef; se libera al cambiar de casa.
  const materials = useMemo(() => new MaterialCache(), [loadId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => materials.dispose(), [materials]);
  const roofVisible = inFps || (view === 'orbit' && showRoof);

  return (
    // zIndex 0: las etiquetas HTML de la escena (cotas, "?" de dudas) quedan debajo de los paneles.
    <Canvas shadows="percentage" dpr={lite ? [1, 1.5] : [1, 2]} gl={{ preserveDrawingBuffer: test, antialias: true }} style={{ zIndex: 0 }}>
      <color attach="background" args={['#e8e6e1']} />
      <Lighting sun={sun} bounds={build.bounds} hdri={environment.def.hdri} shadowSize={lite ? 1024 : 2048} />
      <Ground bounds={build.bounds} material={materials.terrain(environment.def.ground.texture, environment.def.ground.color)} grid={view === 'plan'} />
      <Surroundings key={`env-${loadId}-${environment.def.id}`} env={environment.data} def={environment.def} materials={materials} animate={animate} props={showSurroundings} lite={lite} />
      <HouseModel
        key={`house-${loadId}`}
        build={build}
        section={view === 'plan'}
        diff={diff !== null}
        materials={materials}
        facade={style.facade}
        interior={style.interior_walls}
      />
      {diff && <Demolitions boxes={diff.boxes} section={view === 'plan'} />}
      <Roof
        key={`roof-${loadId}`}
        outlines={roofOutlines}
        height={wallHeight}
        type={style.roof.type}
        roof={materials.get(style.roof.material, 'roof')}
        pitched={materials.get(style.roof.material, 'roof', DoubleSide)}
        edge={materials.get(style.facade, 'surface')}
        ceiling={materials.get(style.interior_walls, 'surface', BackSide)}
        visible={roofVisible}
      />
      <Frames key={`frames-${loadId}`} frames={frames} frame={materials.get(style.window_frames, 'surface')} highlight={diff?.newOpenings} />
      <FurnitureModels key={`furniture-${loadId}`} items={furniture} />
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} paused={!inFps}>
          <Colliders
            key={`col-${loadId}-${environment.def.id}-${mode}`}
            build={build}
            frames={frames}
            walk={environment.data.walk}
            obstacles={environment.data.obstacles}
          />
          {inFps && <FurnitureColliders key={`fcol-${loadId}`} furniture={furniture} />}
          <Doors key={`doors-${loadId}-${mode}`} doors={doors} wood={materials.get(style.doors, 'surface')} animate={animate} interactive={inFps} />
          {inFps && (
            <Player
              key={`player-${loadId}`}
              start={start.position}
              yaw={start.yaw}
              pointerLock={!touch && !test}
              onLockChange={onLockChange}
              onFrame={() => (playerFrames.current += 1)}
            />
          )}
        </Physics>
      </Suspense>
      {view === 'plan' && <PlanView key={`plan-${loadId}`} bounds={build.bounds} animate={animate} test={test} />}
      {view === 'plan' && !measure.active && <FurnitureEditor key={`edit-${loadId}`} {...editor} />}
      {view === 'plan' && (measure.active || measure.measures.length > 0) && (
        <MeasurePlan key={`measure-${loadId}-${measure.active}`} targets={measure.targets} measures={measure.measures} onAdd={measure.onAdd} active={measure.active} />
      )}
      {inFps && <MeasureFps key={`measure-fps-${loadId}`} />}
      {view === 'plan' && (highlight.target || highlight.markers.length > 0) && (
        <Highlight target={highlight.target} markers={highlight.markers} animate={animate} />
      )}
      {view === 'orbit' && <OrbitView key={`orbit-${loadId}`} bounds={build.bounds} from={orbitFrom} animate={animate} />}
      {!inFps && <PlayerMarker />}
      <Warmup key={`warm-${loadId}-${view}-${environment.def.id}`} />
      {test && <Probe playerFrames={playerFrames} needsPlayer={inFps} />}
    </Canvas>
  );
}
