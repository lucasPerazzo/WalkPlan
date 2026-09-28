import type { Season } from './geometry/sun.ts';
import type { EnvironmentPreset } from './model/schema.ts';

// Parámetros de URL para capturas deterministas (ver r3f-arch-viz/references/visual-testing.md).
export type ViewKind = 'orbit' | 'plan' | 'fps';

export interface UrlParams {
  test: boolean;
  view?: ViewKind;
  x?: number; // coordenadas del plano
  y?: number;
  yaw?: number; // grados, fps
  mode?: 'actual' | 'reforma' | 'diff';
  env?: EnvironmentPreset;
  mobile: boolean; // fuerza los controles táctiles
  hour?: number; // hora solar
  season?: Season;
  roof: boolean; // maqueta con techo
  house?: string; // otro JSON de public/ (ej. la lámina de catálogo de las capturas)
}

const oneOf = <T extends string>(value: string | null, options: readonly T[]): T | undefined =>
  options.includes(value as T) ? (value as T) : undefined;

const num = (value: string | null): number | undefined => {
  if (value === null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export function parseUrlParams(search: string): UrlParams {
  const q = new URLSearchParams(search);
  return {
    test: q.get('test') === '1',
    view: oneOf(q.get('view'), ['orbit', 'plan', 'fps'] as const),
    x: num(q.get('x')),
    y: num(q.get('y')),
    yaw: num(q.get('yaw')),
    mode: oneOf(q.get('mode'), ['actual', 'reforma', 'diff'] as const),
    env: oneOf(q.get('env'), ['forest', 'city', 'suburb', 'countryside', 'beach'] as const),
    mobile: q.get('mobile') === '1',
    hour: num(q.get('hour')),
    season: oneOf(q.get('season'), ['summer', 'equinox', 'winter'] as const),
    roof: q.get('roof') === '1',
    house: /^[\w.-]+\.json$/.test(q.get('house') ?? '') ? (q.get('house') as string) : undefined,
  };
}

export interface ViewerProbe {
  ready: boolean;
  stats: {
    walls: number;
    segments: number;
    openings: number;
    rooms: number;
    furniture: number;
    placeholders: number;
    doors: number;
    triangles: number;
  };
  spawnDoor: string | null; // abertura usada para el punto de llegada
  player: { x: number; y: number; yaw: number; t: number } | null; // primera persona: plano + segundos simulados
  environment: { id: string; props: number; blocks: number } | null; // entorno activo y cuánto generó
  mode: string; // actual | reforma | diff
  changes: { newWalls: number; newOpenings: number; demolishWalls: number; demolishOpenings: number; boxes: number } | null; // vista Cambios
  measure: { plan: number[]; fps: number | null; marks: number }; // cotas en metros; marks: puntos marcados en primera persona
  uncertainties: { total: number; focused: string | null }; // panel de dudas del plano
  errors: string[];
  warnings: string[];
}

declare global {
  interface Window {
    __viewer?: ViewerProbe;
    __planToScreen?: (x: number, y: number) => [number, number]; // vista planta: plano -> píxeles de la página
  }
}

export function createProbe(): void {
  window.__viewer = {
    ready: false,
    stats: { walls: 0, segments: 0, openings: 0, rooms: 0, furniture: 0, placeholders: 0, doors: 0, triangles: 0 },
    spawnDoor: null,
    player: null,
    environment: null,
    mode: 'reforma',
    changes: null,
    measure: { plan: [], fps: null, marks: 0 },
    uncertainties: { total: 0, focused: null },
    errors: [],
    warnings: [],
  };
}

// No-op fuera del modo test.
export function updateProbe(update: (probe: ViewerProbe) => void): void {
  if (window.__viewer) update(window.__viewer);
}
