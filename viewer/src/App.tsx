import { useCallback, useEffect, useMemo, useState } from 'react';
import { generateSurroundings, houseFront } from './environment/generate.ts';
import { houseKeepOut } from './environment/keepout.ts';
import { ENVIRONMENTS } from './environment/presets.ts';
import { buildHouse } from './geometry/buildHouse.ts';
import { roofOutlines } from './geometry/contour.ts';
import { buildDoors } from './geometry/doors.ts';
import { filterByView, isVisible, type ViewMode } from './geometry/filterByView.ts';
import { changeCounts, demolitions } from './geometry/changes.ts';
import { distance, snapTargets } from './geometry/measure.ts';
import { modeShowing, uncertaintyEntries, type UncertaintyEntry } from './geometry/uncertainty.ts';
import { buildFrames } from './geometry/frames.ts';
import { placeFurniture } from './geometry/furniture.ts';
import { addFurniture, deleteFurniture, exportHouse, moveFurniture, normalizeAngle, rotateFurniture } from './geometry/furnitureEdit.ts';
import { spawnPoint } from './geometry/spawn.ts';
import { DEFAULT_LATITUDE, sunPosition, type Season } from './geometry/sun.ts';
import { useKeyboard } from './input/useKeyboard.ts';
import { fetchHouse, readHouseFile } from './model/loadHouse.ts';
import type { EnvironmentPreset, FurnitureItem, House, Point } from './model/schema.ts';
import { PLAN_CUT_HEIGHT } from './scene/PlanView.tsx';
import { measureUi, planView, player } from './scene/runtime.ts';
import { Viewer, type ViewKind } from './scene/Viewer.tsx';
import { createProbe, parseUrlParams, updateProbe } from './testMode.ts';
import { EditorPanel } from './ui/EditorPanel.tsx';
import { ErrorsPanel } from './ui/ErrorsPanel.tsx';
import { FpsOverlay } from './ui/FpsOverlay.tsx';
import { Legend } from './ui/Legend.tsx';
import { UncertaintiesPanel } from './ui/UncertaintiesPanel.tsx';
import { SunPanel } from './ui/SunPanel.tsx';
import { Toolbar } from './ui/Toolbar.tsx';

// Los parámetros de URL no cambian durante la vida de la app.
const params = parseUrlParams(window.location.search);
if (params.test) createProbe();
const touch = params.mobile || window.matchMedia('(pointer: coarse)').matches;
const AT: Point | undefined = params.x !== undefined && params.y !== undefined ? [params.x, params.y] : undefined;
const ORBIT_FROM = params.view === 'orbit' ? AT : undefined;
const FPS_FROM = params.view === 'fps' && AT ? { position: AT, yaw: params.yaw ?? 90 } : undefined;
const VIEW_KEYS: Record<string, ViewKind> = { Digit1: 'fps', Digit2: 'orbit', Digit3: 'plan' };
const HOUSE_URL = `${import.meta.env.BASE_URL}${params.test && params.house ? params.house : 'house.json'}`;
const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLSelectElement;

export default function App() {
  const [view, setView] = useState<ViewKind>(params.view ?? 'fps');
  const [locked, setLocked] = useState(false);
  const [hour, setHour] = useState(params.hour ?? 11);
  const [season, setSeason] = useState<Season>(params.season ?? 'equinox');
  const [showRoof, setShowRoof] = useState(params.roof); // maqueta: por defecto sin techo para ver adentro
  const [showSurroundings, setShowSurroundings] = useState(true); // maqueta: árboles y edificios pueden tapar la casa
  const [mode, setMode] = useState<ViewMode>(params.mode ?? 'reforma'); // Actual / Reforma / Cambios

  const [house, setHouse] = useState<House | null>(null);
  const [loadId, setLoadId] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Muebles: estado aparte de la casa, así editarlos no reconstruye paredes. `saved` = lo último exportado o cargado.
  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);
  const [saved, setSaved] = useState<FurnitureItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const dirty = furniture !== saved;
  // Entorno elegido en la UI; null = el default de la casa (site.environment).
  const [envChoice, setEnvChoice] = useState<EnvironmentPreset | null>(params.env ?? null);
  // Medición en planta: herramienta prendida y cotas hechas.
  const [measuring, setMeasuring] = useState(false);
  const [measures, setMeasures] = useState<[Point, Point][]>([]);
  // Panel de dudas del plano: abierto (muestra los "?" en planta) y el elemento resaltado.
  const [doubtsOpen, setDoubtsOpen] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const applyHouse = useCallback((h: House) => {
    player.placed = false; // casa nueva: se vuelve a llegar por la puerta principal
    setHouse(h);
    setEnvChoice(params.env ?? null);
    setMeasures([]);
    setFocused(null);
    setFurniture(h.furniture);
    setSaved(h.furniture);
    setSelected(null);
    setLoadId((n) => n + 1);
    setLoadError(null);
  }, []);

  const openFile = useCallback(
    (file: File) => {
      readHouseFile(file).then(applyHouse, (e: Error) => setLoadError(e.message));
    },
    [applyHouse],
  );

  const changeView = useCallback((v: ViewKind) => {
    if (document.pointerLockElement) document.exitPointerLock();
    setView(v);
  }, []);

  useEffect(() => {
    fetchHouse(HOUSE_URL).then(applyHouse, (e: Error) => setLoadError(e.message));
  }, [applyHouse]);

  useKeyboard(view === 'fps');

  // 1 / 2 / 3: primera persona, maqueta, planta.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = VIEW_KEYS[e.code];
      if (v && !typing(e.target)) changeView(v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changeView]);

  // Drag & drop de un house.json en cualquier parte de la ventana.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) openFile(file);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [openFile]);

  // Las dos geometrías se arman una vez por casa: cambiar de vista es inmediato. Cambios usa la de la Reforma.
  const builds = useMemo(() => {
    if (!house) return null;
    const actual = buildHouse(filterByView(house, 'actual'));
    const reforma = buildHouse(filterByView(house, 'reforma'));
    const doors = buildDoors(reforma.walls);
    const spawn = spawnPoint(doors, reforma.walls.map((w) => w.wall), reforma.bounds);
    return { actual, reforma, front: houseFront(spawn, doors) }; // el entorno se orienta con la Reforma
  }, [house]);

  const scene = useMemo(() => {
    if (!house || !builds) return null;
    const build = mode === 'actual' ? builds.actual : builds.reforma;
    const doors = buildDoors(build.walls);
    const walls = build.walls.map((w) => w.wall);
    const warnings = [...build.warnings];
    if (house.site?.latitude === undefined) warnings.push(`site.latitude ausente: el sol se calcula con ${DEFAULT_LATITUDE}°`);
    const diff =
      mode === 'diff'
        ? {
            boxes: demolitions(builds.actual, builds.reforma),
            counts: changeCounts(builds.actual, builds.reforma),
            newOpenings: new Set(build.walls.flatMap((w) => w.openings.filter((o) => o.status === 'new').map((o) => o.id))),
          }
        : null;
    return {
      build,
      doors,
      rooms: build.rooms,
      frames: buildFrames(build.walls, mode === 'diff'),
      spawn: spawnPoint(doors, walls, build.bounds),
      roof: roofOutlines(walls),
      diff,
      errors: build.errors,
      warnings,
    };
  }, [house, builds, mode]);

  const placed = useMemo(() => {
    const items = furniture.filter((f) => isVisible(f.status, mode));
    const errors: string[] = [];
    return { items, placements: placeFurniture(items, errors), errors };
  }, [furniture, mode]);
  const errors = useMemo(() => [...(scene?.errors ?? []), ...placed.errors], [scene, placed.errors]);

  // Entorno: cambia en runtime sin tocar la casa. La zona prohibida no depende de la vista actual/reforma.
  const envId: EnvironmentPreset = envChoice ?? house?.site?.environment ?? 'suburb';
  const keep = useMemo(() => (house ? houseKeepOut(house) : null), [house]);
  const environment = useMemo(() => {
    if (!builds || !keep || !house) return null;
    const def = ENVIRONMENTS[envId];
    return { def, data: generateSurroundings(def, keep, builds.front, house.site) };
  }, [builds, keep, house, envId]);

  useEffect(() => {
    if (environment) {
      updateProbe((p) => (p.environment = { id: environment.def.id, props: environment.data.props.length, blocks: environment.data.blocks.length }));
    }
  }, [environment]);

  useEffect(() => {
    if (!scene) return;
    for (const e of scene.errors) console.warn('[house] omitido:', e);
    for (const w of scene.warnings) console.info('[house] aviso:', w);
    updateProbe((p) => {
      Object.assign(p.stats, scene.build.stats, { doors: scene.doors.length });
      p.spawnDoor = scene.spawn.doorId ?? null;
      p.warnings = [...scene.warnings];
      p.mode = mode;
      p.changes = scene.diff ? { ...scene.diff.counts, boxes: scene.diff.boxes.length } : null;
    });
  }, [scene, mode]);

  useEffect(() => {
    for (const e of placed.errors) console.warn('[house] omitido:', e);
    updateProbe((p) => (p.stats.furniture = placed.placements.length)); // placeholders: los cuenta FurnitureModels
  }, [placed]);

  useEffect(() => {
    if (scene) updateProbe((p) => (p.errors = [...errors]));
  }, [scene, errors]);

  // Editor en planta
  const rooms = scene?.rooms;
  const onMove = useCallback((id: string, to: Point) => setFurniture((items) => moveFurniture(items, id, to, rooms ?? [])), [rooms]);
  const onRotate = useCallback((id: string, deg: number) => setFurniture((items) => rotateFurniture(items, id, deg)), []);
  const selectedItem = placed.items.find((f) => f.id === selected) ?? null;
  const rotateBy = useCallback(
    (delta: number) => {
      if (selectedItem) onRotate(selectedItem.id, normalizeAngle(selectedItem.rotation + delta));
    },
    [selectedItem, onRotate],
  );
  const removeSelected = useCallback(() => {
    if (!selected) return;
    setFurniture((items) => deleteFurniture(items, selected));
    setSelected(null);
  }, [selected]);
  const add = useCallback(
    (key: string) => {
      const out = addFurniture(furniture, key, planView.center, rooms ?? []);
      setFurniture(out.items);
      setSelected(out.id);
    },
    [furniture, rooms],
  );
  const exportJson = useCallback(() => {
    if (!house) return;
    const url = URL.createObjectURL(new Blob([exportHouse(house, furniture)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'house.json';
    a.click();
    URL.revokeObjectURL(url);
    setSaved(furniture);
  }, [house, furniture]);

  // Q/E: girar ±15° (Shift: 1°) · Supr/Retroceso: borrar · Esc: soltar la selección.
  useEffect(() => {
    if (view !== 'plan' || !selectedItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const step = e.shiftKey ? 1 : 15;
      if (e.code === 'KeyQ') rotateBy(step);
      else if (e.code === 'KeyE') rotateBy(-step);
      else if (e.code === 'Delete' || e.code === 'Backspace') removeSelected();
      else if (e.code === 'Escape') setSelected(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, selectedItem, rotateBy, removeSelected]);

  // Medición. Planta: M prende y apaga la herramienta (cotas de clic a clic). Primera persona: M marca el
  // punto bajo la mira (dos marcas = una distancia).
  const toggleMeasuring = useCallback(() => {
    setMeasuring((m) => !m);
    setSelected(null);
  }, []);
  const targets = useMemo(() => (scene ? snapTargets(scene.build.walls, PLAN_CUT_HEIGHT) : { corners: [], faces: [] }), [scene]);
  const addMeasure = useCallback((m: [Point, Point]) => setMeasures((list) => [...list, m]), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyM' || typing(e.target)) return;
      if (view === 'plan') toggleMeasuring();
      else if (view === 'fps') measureUi.request = true;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, toggleMeasuring]);
  useEffect(() => {
    updateProbe((p) => (p.measure.plan = measures.map(([a, b]) => Number(distance(a, b).toFixed(3)))));
  }, [measures]);

  // Dudas del plano: clic en una con elemento -> planta centrada en él, resaltado, y la vista del proyecto
  // cambia a una donde exista (un muro a demoler no está en la Reforma).
  const doubts = useMemo(() => (house ? uncertaintyEntries(house) : []), [house]);
  const focusedTarget = doubts.find((d) => d.target?.id === focused)?.target ?? null;
  const focusDoubt = useCallback(
    (e: UncertaintyEntry) => {
      if (!e.target) return;
      setMode((m) => modeShowing(e.target!.status, m));
      changeView('plan');
      setFocused(e.target.id);
      planView.focus = e.target.center;
    },
    [changeView],
  );
  useEffect(() => {
    updateProbe((p) => (p.uncertainties = { total: doubts.length, focused }));
  }, [doubts, focused]);

  // Avisar antes de cerrar con muebles editados sin exportar.
  useEffect(() => {
    if (!dirty || params.test) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (loadError) updateProbe((p) => (p.errors = [loadError]));
  }, [loadError]);

  const sun = useMemo(
    () => sunPosition(house?.site?.latitude ?? DEFAULT_LATITUDE, season, hour, house?.site?.north_deg ?? 0),
    [house, season, hour],
  );
  const immersed = view === 'fps' && locked; // con el mouse capturado se ocultan los paneles

  return (
    <div className="app" data-view={view}>
      {scene && house && environment && (
        <Viewer
          build={scene.build}
          doors={scene.doors}
          frames={scene.frames}
          diff={scene.diff}
          mode={mode}
          furniture={placed.placements}
          editor={{ items: placed.items, selected, onSelect: setSelected, onMove, onRotate }}
          measure={{ active: measuring, targets, measures, onAdd: addMeasure }}
          highlight={{ target: focusedTarget, markers: doubtsOpen ? doubts.flatMap((d) => (d.target ? [d.target] : [])) : [] }}
          spawn={scene.spawn}
          environment={environment}
          style={house.style}
          sun={sun}
          roofOutlines={scene.roof}
          wallHeight={house.meta.default_wall_height}
          showRoof={showRoof}
          showSurroundings={view !== 'orbit' || showSurroundings}
          loadId={loadId}
          view={view}
          orbitFrom={ORBIT_FROM}
          fpsFrom={FPS_FROM}
          touch={touch}
          lite={touch}
          test={params.test}
          onLockChange={setLocked}
        />
      )}
      {view === 'fps' && scene && <FpsOverlay touch={touch} locked={locked} test={params.test} />}
      {!immersed && (
        <Toolbar
          view={view}
          onView={changeView}
          onOpenFile={openFile}
          title={house?.meta?.source ?? 'Sin casa cargada'}
          mode={mode}
          onMode={setMode}
          touch={touch}
          dirty={dirty}
          onExport={exportJson}
        />
      )}
      {scene && !immersed && <ErrorsPanel errors={errors} warnings={scene.warnings} />}
      {scene && !immersed && (
        <div className="left-stack">
          {scene.diff && <Legend counts={scene.diff.counts} />}
          {doubts.length > 0 && (
            <UncertaintiesPanel entries={doubts} open={doubtsOpen} onToggle={() => setDoubtsOpen((o) => !o)} focused={focused} onFocus={focusDoubt} />
          )}
        </div>
      )}
      {scene && view === 'plan' && (
        <EditorPanel
          selected={selectedItem}
          roomName={house?.rooms.find((r) => r.id === selectedItem?.room)?.name ?? null}
          touch={touch}
          onRotate={rotateBy}
          onDelete={removeSelected}
          onAdd={add}
          measuring={measuring}
          measureCount={measures.length}
          onToggleMeasure={toggleMeasuring}
          onClearMeasures={() => setMeasures([])}
        />
      )}
      {scene && !immersed && (
        <SunPanel
          hour={hour}
          season={season}
          onHour={setHour}
          onSeason={setSeason}
          roof={view === 'orbit' ? showRoof : null}
          onRoof={setShowRoof}
          environment={envId}
          onEnvironment={setEnvChoice}
          surroundings={view === 'orbit' ? showSurroundings : null}
          onSurroundings={setShowSurroundings}
        />
      )}
      {!house && !loadError && <div className="status">Cargando casa…</div>}
      {loadError && (
        <div className={house ? 'banner' : 'status status-error'} role="alert">
          {loadError}
        </div>
      )}
      {dragging && (
        <div className="dropzone">
          <span>Soltá el house.json para cargarlo</span>
        </div>
      )}
    </div>
  );
}
