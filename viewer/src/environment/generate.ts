import type { Point, Site } from '../model/schema.ts';
import { clearance, isFree, keepOutBounds, rectFree, type KeepOut, type Rect } from './keepout.ts';
import type { EnvironmentDef } from './presets.ts';
import { between, seeded, type Random } from './random.ts';

// Ubicación del entorno: funciones puras con semilla fija. Nada cae en la zona prohibida (keepout.ts)
// ni sobre la calle. Ángulos en radianes, antihorarios en el plano (= rotation.y de Three).

export type PropKind = 'pine' | 'broadleaf' | 'bush' | 'lamp' | 'hill' | 'dune';

export interface Prop {
  kind: PropKind;
  position: Point;
  angle: number;
  scale: [number, number, number]; // x, alto, z
  shade: number; // brillo de la instancia (variación de color), ~1
}

// Volúmenes que se dibujan fusionados (cada uno con su tamaño): edificios, casas vecinas y cercos vivos.
export interface Block {
  kind: 'building' | 'house' | 'hedge';
  center: Point;
  w: number; // a lo largo de `angle`
  d: number;
  h: number;
  angle: number;
  color: string;
  roof?: string;
}

export interface StreetBand {
  kind: 'sidewalk' | 'road';
  from: number; // metros desde el borde, hacia `out`
  to: number;
}

export interface Street {
  origin: Point; // sobre el borde del lado de la casa
  along: Point; // unitario, a lo largo de la calle
  out: Point; // unitario, alejándose de la casa
  length: number; // media longitud
  bands: StreetBand[];
}

export interface Water {
  origin: Point; // punto de la orilla
  out: Point; // unitario, hacia el mar
}

export interface Obstacle {
  center: Point;
  size: [number, number, number]; // x (a lo largo de angle), alto, z
  angle: number;
}

export interface Surroundings {
  props: Prop[];
  blocks: Block[];
  street: Street | null;
  water: Water | null;
  center: Point; // centro de la zona prohibida
  radius: number; // medio diagonal de la zona prohibida
  walk: Rect; // área caminable (el límite de colisión)
  obstacles: Obstacle[]; // colliders dentro del área caminable
}

export interface Front {
  center: Point; // puerta principal
  normal: Point; // hacia afuera de la casa
}

// Puerta principal (la del punto de llegada) con su normal hacia afuera. Sin puerta, el spawn queda
// 3 m al sur del bounding box mirando al norte: el frente es ese lado.
export function houseFront(spawn: { position: Point; doorId?: string }, doors: { opening: { id: string }; center: Point }[]): Front {
  const door = doors.find((d) => d.opening.id === spawn.doorId);
  const center: Point = door ? door.center : [spawn.position[0], spawn.position[1] + 3];
  return { center, normal: unit(sub(spawn.position, center)) };
}

const SIDEWALK = 2;
const ROAD = 7;
const STREET_WIDTH = SIDEWALK * 2 + ROAD;
const STREET_HALF_LENGTH = 150;

const add = (a: Point, b: Point, k = 1): Point => [a[0] + b[0] * k, a[1] + b[1] * k];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const unit = (v: Point): Point => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

// Calle: sobre street_edge (la calzada del lado derecho de start→end) o, si falta, frente a la puerta
// principal, paralela a la fachada y más allá de la zona prohibida.
export function makeStreet(k: KeepOut, front: Front, site?: Site): Street {
  const bands: StreetBand[] = [
    { kind: 'sidewalk', from: 0, to: SIDEWALK },
    { kind: 'road', from: SIDEWALK, to: SIDEWALK + ROAD },
    { kind: 'sidewalk', from: SIDEWALK + ROAD, to: STREET_WIDTH },
  ];
  if (site?.street_edge) {
    const [a, b] = site.street_edge;
    const along = unit(sub(b, a));
    return { origin: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], along, out: [along[1], -along[0]], length: STREET_HALF_LENGTH, bands };
  }
  const out = unit(front.normal);
  const reach = Math.max(...k.polygons.flat().map((v) => dot(sub(v, front.center), out)));
  return {
    origin: add(front.center, out, reach + k.margin + 1),
    along: [-out[1], out[0]],
    out,
    length: STREET_HALF_LENGTH,
    bands,
  };
}

const streetCoords = (s: Street, p: Point) => ({ t: dot(sub(p, s.origin), s.along), s: dot(sub(p, s.origin), s.out) });
const streetPoint = (s: Street, t: number, d: number): Point => add(add(s.origin, s.along, t), s.out, d);

export function onStreet(p: Point, radius: number, street: Street | null): boolean {
  if (!street) return false;
  const c = streetCoords(street, p);
  return c.s > -radius && c.s < STREET_WIDTH + radius && Math.abs(c.t) < street.length + radius;
}

// ---------------------------------------------------------------- generadores

interface Ctx {
  rand: Random;
  k: KeepOut;
  street: Street | null;
  center: Point;
  radius: number; // medio diagonal de la zona prohibida
  props: Prop[];
  blocks: Block[];
}

// Árbol o arbusto si hay lugar (`need` = radio libre pedido). En veredas (árboles de calle) se permite la calle.
function tree(ctx: Ctx, kind: PropKind, p: Point, size: number, need: number, sidewalk = false): boolean {
  if (!isFree(p, need, ctx.k) || (!sidewalk && onStreet(p, need, ctx.street))) return false;
  const { rand } = ctx;
  const w = size * between(rand, 0.85, 1.15);
  ctx.props.push({ kind, position: p, angle: between(rand, 0, Math.PI * 2), scale: [w, size, w], shade: between(rand, 0.82, 1.12) });
  return true;
}

// Fila de volúmenes a lo largo de la calle: `s0` es el frente (del lado de la calle) y `side` hacia dónde crecen.
// `decorate` agrega lo que acompaña a cada volumen aceptado (cercos, árboles del lote).
function row(
  ctx: Ctx,
  s0: number,
  side: 1 | -1,
  width: [number, number],
  depth: [number, number],
  gap: [number, number],
  make: (t: number, s: number, w: number, d: number) => Block,
  decorate?: (t: number, s: number, w: number, d: number) => void,
) {
  const { rand, street } = ctx;
  if (!street) return;
  const angle = Math.atan2(street.along[1], street.along[0]);
  for (let t = -street.length + between(rand, 0, 6); t < street.length; ) {
    const w = between(rand, ...width);
    const d = between(rand, ...depth);
    const s = s0 + (side * d) / 2;
    const block = make(t + w / 2, s, w, d);
    if (rectFree(block.center, block.w, block.d, angle, ctx.k)) {
      ctx.blocks.push({ ...block, angle });
      decorate?.(t + w / 2, s, w, d);
    }
    t += w + between(rand, ...gap);
  }
}

const FACADES = ['#d9d4c7', '#c9b8a3', '#b7aea1', '#e3dfd6', '#a89f93', '#c4c7c9', '#b59a86', '#d1c3ad'];
const HOUSES = ['#ece6da', '#e0d5c1', '#c9b59a', '#b98d6e', '#d8dcd6', '#f0ebe0'];
const ROOFS = ['#9c5b43', '#7d4a3a', '#6d6a66', '#8a6a55'];
const pick = <T,>(rand: Random, list: T[]) => list[Math.floor(rand() * list.length)];

function lamps(ctx: Ctx, step: number, sides: number[]) {
  const street = ctx.street;
  if (!street) return;
  for (const s of sides) {
    const toRoad = s < STREET_WIDTH / 2 ? street.out : ([-street.out[0], -street.out[1]] as Point);
    for (let t = -street.length + step / 2; t < street.length; t += step) {
      ctx.props.push({ kind: 'lamp', position: streetPoint(street, t, s), angle: Math.atan2(toRoad[1], toRoad[0]), scale: [1, 1, 1], shade: 1 });
    }
  }
}

function forest(ctx: Ctx) {
  const { rand, center } = ctx;
  const HALF = 100;
  const CELL = 5;
  for (let x = -HALF; x < HALF; x += CELL) {
    for (let y = -HALF; y < HALF; y += CELL) {
      const p: Point = [center[0] + x + between(rand, 0.3, CELL - 0.3), center[1] + y + between(rand, 0.3, CELL - 0.3)];
      const c = clearance(p, ctx.k);
      if (c < 1.2 || rand() > Math.min(0.85, 0.25 + c / 45)) continue; // más denso hacia afuera
      tree(ctx, rand() < 0.75 ? 'pine' : 'broadleaf', p, between(rand, 0.9, 1.5), 1.2);
    }
  }
  // Sotobosque
  for (let x = -HALF; x < HALF; x += 6) {
    for (let y = -HALF; y < HALF; y += 6) {
      if (rand() > 0.3) continue;
      const p: Point = [center[0] + x + between(rand, 0, 6), center[1] + y + between(rand, 0, 6)];
      tree(ctx, 'bush', p, between(rand, 0.8, 1.6), 0.6);
    }
  }
}

function city(ctx: Ctx) {
  const { rand } = ctx;
  const building = (row: number) => (t: number, s: number, w: number, d: number): Block => ({
    kind: 'building',
    center: streetPoint(ctx.street as Street, t, s),
    w,
    d,
    h: row === 0 ? between(rand, 9, 24) : between(rand, 12, 45),
    angle: 0,
    color: pick(rand, FACADES),
  });
  const B = STREET_WIDTH;
  [B + 1, B + 27, B + 53].forEach((s0, i) => row(ctx, s0, 1, [10, 22], [12, 20], [2, 5], building(i)));
  [-1, -27, -53, -79].forEach((s0, i) => row(ctx, s0, -1, [10, 22], [12, 20], [2, 5], building(i)));
  lamps(ctx, 25, [0.4, B - 0.4]);
  const street = ctx.street as Street;
  for (let t = -street.length + 12.5; t < street.length; t += 25) {
    for (const s of [1.2, B - 1.2]) tree(ctx, 'broadleaf', streetPoint(street, t, s), between(rand, 0.7, 0.9), 0, true);
  }
}

function suburb(ctx: Ctx) {
  const { rand } = ctx;
  const street = ctx.street as Street;
  const B = STREET_WIDTH;
  const angle = Math.atan2(street.along[1], street.along[0]);
  const house = (t: number, s: number, w: number, d: number): Block => ({
    kind: 'house',
    center: streetPoint(street, t, s),
    w,
    d,
    h: rand() < 0.7 ? 3 : 5.6,
    angle: 0,
    color: pick(rand, HOUSES),
    roof: pick(rand, ROOFS),
  });
  // Frente propio sobre la calle (la zona prohibida proyectada, con 3 m de más): ahí no va el cerco de un vecino.
  const ts = ctx.k.polygons.flat().map((v) => streetCoords(street, v).t);
  const [ownFrom, ownTo] = [Math.min(...ts) - 3, Math.max(...ts) + 3];
  // Cerco vivo al frente del lote (con hueco para la entrada), un árbol al fondo y arbustos al frente.
  const lot = (side: 1 | -1) => (t: number, s: number, w: number, d: number) => {
    const hedge: Block = { kind: 'hedge', center: streetPoint(street, t - 1.5, side === 1 ? B + 0.4 : -0.4), w: w + 4, d: 0.5, h: 1.1, angle, color: '#4f6e35' };
    const [h0, h1] = [t - 1.5 - hedge.w / 2, t - 1.5 + hedge.w / 2];
    const inFront = side === -1 && h1 > ownFrom && h0 < ownTo;
    if (!inFront && rectFree(hedge.center, hedge.w, hedge.d, angle, ctx.k)) ctx.blocks.push(hedge);
    tree(ctx, 'broadleaf', streetPoint(street, t + between(rand, -w / 2, w / 2), s + side * (d / 2 + between(rand, 3, 8))), between(rand, 0.8, 1.2), 1);
    for (let i = 0; i < 2; i++) {
      tree(ctx, 'bush', streetPoint(street, t + between(rand, -w / 2, w / 2), s - side * (d / 2 + between(rand, 1, 3))), between(rand, 0.7, 1.1), 0.3);
    }
  };
  [B + 6, B + 42].forEach((s0) => row(ctx, s0, 1, [8, 12], [8, 11], [8, 13], house, lot(1)));
  [-6, -42].forEach((s0) => row(ctx, s0, -1, [8, 12], [8, 11], [8, 13], house, lot(-1)));
  lamps(ctx, 35, [0.4]);
}

function countryside(ctx: Ctx) {
  const { rand, center } = ctx;
  const polar = (r0: number, r1: number): Point => {
    const a = between(rand, 0, Math.PI * 2);
    const r = between(rand, r0, r1);
    return [center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r];
  };
  for (let i = 0; i < 14; i++) {
    const c = polar(ctx.radius + 25, 190);
    const n = 3 + Math.floor(rand() * 5);
    for (let j = 0; j < n; j++) tree(ctx, 'broadleaf', add(c, [between(rand, -9, 9), between(rand, -9, 9)]), between(rand, 0.9, 1.4), 1);
  }
  for (let i = 0; i < 25; i++) tree(ctx, 'broadleaf', polar(ctx.radius + 10, 220), between(rand, 0.9, 1.5), 1);
  for (let i = 0; i < 50; i++) tree(ctx, 'bush', polar(ctx.radius + 4, 120), between(rand, 0.8, 1.5), 0.5);
  for (let i = 0; i < 12; i++) {
    const p = polar(240, 420);
    ctx.props.push({ kind: 'hill', position: p, angle: between(rand, 0, Math.PI), scale: [between(rand, 45, 85), between(rand, 12, 34), between(rand, 30, 60)], shade: between(rand, 0.9, 1.08) });
  }
}

function beach(ctx: Ctx, front: Front): Water {
  const { rand, center } = ctx;
  const sea = unit([-front.normal[0], -front.normal[1]]); // el mar detrás de la casa, del lado opuesto a la entrada
  const across: Point = [-sea[1], sea[0]];
  const back = Math.max(...ctx.k.polygons.flat().map((v) => dot(sub(v, center), sea))) + ctx.k.margin;
  const shore = back + 35;
  const at = (s: number, t: number): Point => add(add(center, sea, s), across, t);
  for (let i = 0; i < 14; i++) {
    const p = at(between(rand, back + 6, shore - 6), between(rand, -80, 80));
    const w = between(rand, 6, 14);
    if (!isFree(p, w / 2, ctx.k)) continue;
    ctx.props.push({ kind: 'dune', position: p, angle: Math.atan2(across[1], across[0]) + between(rand, -0.3, 0.3), scale: [w, between(rand, 0.8, 2.2), between(rand, 4, 8)], shade: between(rand, 0.95, 1.05) });
  }
  for (let i = 0; i < 90; i++) {
    const p = at(between(rand, -130, shore - 4), between(rand, -130, 130));
    tree(ctx, 'bush', p, between(rand, 0.7, 1.4), 0.5);
  }
  for (let i = 0; i < 60; i++) {
    const p = at(between(rand, -140, -12), between(rand, -140, 140)); // pinos del lado de tierra
    tree(ctx, 'pine', p, between(rand, 0.9, 1.4), 1.5);
  }
  return { origin: at(shore, 0), out: sea };
}

// ---------------------------------------------------------------- entrada

export function generateSurroundings(def: EnvironmentDef, k: KeepOut, front: Front, site?: Site): Surroundings {
  const b = keepOutBounds(k);
  const center: Point = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  const ctx: Ctx = {
    rand: seeded(def.seed),
    k,
    street: def.street ? makeStreet(k, front, site) : null,
    center,
    radius: Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2,
    props: [],
    blocks: [],
  };
  let water: Water | null = null;
  if (def.id === 'forest') forest(ctx);
  else if (def.id === 'city') city(ctx);
  else if (def.id === 'suburb') suburb(ctx);
  else if (def.id === 'countryside') countryside(ctx);
  else water = beach(ctx, front);

  const walk: Rect = {
    minX: b.minX - def.walkRadius,
    maxX: b.maxX + def.walkRadius,
    minY: b.minY - def.walkRadius,
    maxY: b.maxY + def.walkRadius,
  };
  const inWalk = ([x, y]: Point, r: number) => x > walk.minX - r && x < walk.maxX + r && y > walk.minY - r && y < walk.maxY + r;
  const obstacles: Obstacle[] = [];
  for (const p of ctx.props) {
    if (!inWalk(p.position, 1)) continue;
    if (p.kind === 'pine' || p.kind === 'broadleaf') obstacles.push({ center: p.position, size: [0.45 * p.scale[0], 5 * p.scale[1], 0.45 * p.scale[2]], angle: p.angle });
    else if (p.kind === 'lamp') obstacles.push({ center: p.position, size: [0.2, 4.5, 0.2], angle: p.angle });
  }
  for (const bl of ctx.blocks) {
    if (inWalk(bl.center, Math.max(bl.w, bl.d) / 2)) obstacles.push({ center: bl.center, size: [bl.w, bl.h, bl.d], angle: bl.angle });
  }
  return { props: ctx.props, blocks: ctx.blocks, street: ctx.street, water, center, radius: ctx.radius, walk, obstacles };
}
