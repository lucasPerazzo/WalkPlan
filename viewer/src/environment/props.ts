import {
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  Float32BufferAttribute,
  IcosahedronGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  BoxGeometry,
  Vector3,
} from 'three';
import { groupParts, type ModelPart } from '../furniture/parts.ts';
import type { Block, PropKind, Street } from './generate.ts';

// Geometría del entorno, armada en código en el estilo maqueta de los muebles.
// Props repetidos (árboles, faroles, lomas): una geometría por material, para InstancedMesh.
// Volúmenes (edificios, casas, cercos) y calle: fusionados en pocas geometrías con color por vértice.

export const PROP_FINISH: Record<string, { color: string; roughness: number; metalness?: number }> = {
  trunk: { color: '#6b4f3a', roughness: 0.9 },
  pine: { color: '#3f5b37', roughness: 0.9 },
  leaves: { color: '#5d7c3e', roughness: 0.9 },
  bush: { color: '#587a3c', roughness: 0.9 },
  lamp: { color: '#3a3d40', roughness: 0.5, metalness: 0.4 },
  hill: { color: '#7b9357', roughness: 1 },
  dune: { color: '#c7b184', roughness: 1 },
};
export const SHADED = new Set(['pine', 'leaves', 'bush', 'hill', 'dune']); // varían de tono por instancia

const cylinder = (rTop: number, rBottom: number, h: number, y: number, seg = 6) => new CylinderGeometry(rTop, rBottom, h, seg).translate(0, y, 0);
const cone = (r: number, h: number, y: number) => new ConeGeometry(r, h, 7).translate(0, y, 0);

// Tamaños con scale 1: pino de ~8 m, árbol de copa de ~6.5 m, arbusto de ~1 m, farol de 4.5 m.
// Lomas y médanos: media esfera de radio 1 que la instancia escala a (ancho/2, alto, fondo/2).
const BUILDERS: Record<PropKind, () => [string, BufferGeometry][]> = {
  pine: () => [
    ['trunk', cylinder(0.14, 0.22, 2.4, 1.2)],
    ['pine', cone(2, 3.2, 3.4)],
    ['pine', cone(1.55, 2.8, 5.1)],
    ['pine', cone(1.1, 2.4, 6.7)],
  ],
  broadleaf: () => [
    ['trunk', cylinder(0.16, 0.25, 2.8, 1.4)],
    ['leaves', new IcosahedronGeometry(2.3, 1).scale(1, 0.85, 1).translate(0, 4.3, 0)],
  ],
  bush: () => [['bush', new IcosahedronGeometry(0.75, 0).scale(1, 0.7, 1).translate(0, 0.45, 0)]],
  lamp: () => [
    ['lamp', cylinder(0.06, 0.08, 4.5, 2.25)],
    ['lamp', new BoxGeometry(1, 0.06, 0.06).translate(0.5, 4.42, 0)],
    ['lamp', new BoxGeometry(0.42, 0.12, 0.22).translate(0.95, 4.34, 0)],
  ],
  hill: () => [['hill', new SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.5, 1, 0.5)]],
  dune: () => [['dune', new SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.5, 1, 0.5)]],
};

const cache = new Map<PropKind, ModelPart[]>();
export function propParts(kind: PropKind): ModelPart[] {
  let parts = cache.get(kind);
  if (!parts) {
    parts = groupParts(BUILDERS[kind]());
    cache.set(kind, parts);
  }
  return parts;
}

// ---------------------------------------------------------------- volúmenes y calle

type V = [number, number, number];
const toThree = ([x, y]: [number, number], h: number): V => [x, h, -y];

// Acumula caras con posición, normal, UV (en metros o en módulos) y color por vértice.
class Mesher {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  // Polígono convexo; la normal se toma del orden de los vértices y se da vuelta si no mira hacia `facing`.
  face(pts: V[], uvs: [number, number][], color: Color, facing: V) {
    const [a, b, c] = pts.map((p) => new Vector3(...p));
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    let order = pts.map((_, i) => i);
    if (n.dot(new Vector3(...facing)) < 0) {
      order = order.reverse();
      n.negate();
    }
    const base = this.pos.length / 3;
    for (const i of order) {
      this.pos.push(...pts[i]);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(...uvs[i]);
      this.col.push(color.r, color.g, color.b);
    }
    for (let i = 1; i < pts.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export const BAY = 3; // un módulo de fachada: 3 m de ancho × 3 m de alto (un piso)

function corners(b: Block): [number, number][] {
  const cos = Math.cos(b.angle);
  const sin = Math.sin(b.angle);
  return [
    [-b.w / 2, -b.d / 2],
    [b.w / 2, -b.d / 2],
    [b.w / 2, b.d / 2],
    [-b.w / 2, b.d / 2],
  ].map(([u, v]) => [b.center[0] + u * cos - v * sin, b.center[1] + u * sin + v * cos]);
}

function walls(m: Mesher, b: Block, h: number, color: Color) {
  const c = corners(b);
  const [cx, cy] = b.center;
  c.forEach((p, i) => {
    const q = c[(i + 1) % 4];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const mid: [number, number] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const out = toThree([mid[0] - cx, mid[1] - cy], 0);
    m.face(
      [toThree(p, 0), toThree(q, 0), toThree(q, h), toThree(p, h)],
      [[0, 0], [len / BAY, 0], [len / BAY, h / BAY], [0, h / BAY]],
      color,
      out,
    );
  });
}

// Fachadas con ventanas (textura por módulo) y el resto liso (techos, cercos vivos).
export function blockGeometries(blocks: Block[]): { facades: BufferGeometry; plain: BufferGeometry } {
  const facades = new Mesher();
  const plain = new Mesher();
  const zero: [number, number][] = [[0, 0], [0, 0], [0, 0], [0, 0]];
  for (const b of blocks) {
    const color = new Color(b.color);
    const c = corners(b);
    if (b.kind === 'hedge') {
      walls(plain, b, b.h, color);
      plain.face(c.map((p) => toThree(p, b.h)), zero, color, [0, 1, 0]);
      continue;
    }
    walls(facades, b, b.h, color);
    const roof = new Color(b.roof ?? '#8d8a85');
    if (b.kind === 'building') {
      plain.face(c.map((p) => toThree(p, b.h)), zero, roof, [0, 1, 0]);
      continue;
    }
    // Casa: techo a dos aguas con la cumbrera a lo largo del lado largo (w), 0.3 m de alero.
    const o = 0.3;
    const rise = Math.min(2.4, b.d * 0.3);
    const big = corners({ ...b, w: b.w + 2 * o, d: b.d + 2 * o });
    const ridgeA: [number, number] = [(big[0][0] + big[3][0]) / 2, (big[0][1] + big[3][1]) / 2];
    const ridgeB: [number, number] = [(big[1][0] + big[2][0]) / 2, (big[1][1] + big[2][1]) / 2];
    const top = b.h + rise;
    const sideA: [number, number] = [(c[0][0] + c[1][0]) / 2 - b.center[0], (c[0][1] + c[1][1]) / 2 - b.center[1]];
    plain.face([toThree(big[0], b.h), toThree(big[1], b.h), toThree(ridgeB, top), toThree(ridgeA, top)], zero, roof, toThree(sideA, 1));
    plain.face([toThree(big[3], b.h), toThree(big[2], b.h), toThree(ridgeB, top), toThree(ridgeA, top)], zero, roof, toThree([-sideA[0], -sideA[1]], 1));
    const gA: [number, number] = [(c[0][0] + c[3][0]) / 2, (c[0][1] + c[3][1]) / 2];
    const gB: [number, number] = [(c[1][0] + c[2][0]) / 2, (c[1][1] + c[2][1]) / 2];
    plain.face([toThree(c[0], b.h), toThree(c[3], b.h), toThree(gA, top)], zero, color, toThree([gA[0] - b.center[0], gA[1] - b.center[1]], 0));
    plain.face([toThree(c[1], b.h), toThree(c[2], b.h), toThree(gB, top)], zero, color, toThree([gB[0] - b.center[0], gB[1] - b.center[1]], 0));
  }
  return { facades: facades.build(), plain: plain.build() };
}

// Bandas de la calle (UV en metros) y la línea central discontinua.
export function streetGeometries(s: Street): { road: BufferGeometry; sidewalk: BufferGeometry; marks: BufferGeometry } {
  const road = new Mesher();
  const sidewalk = new Mesher();
  const marks = new Mesher();
  const white = new Color('#ffffff');
  const at = (t: number, d: number): [number, number] => [
    s.origin[0] + s.along[0] * t + s.out[0] * d,
    s.origin[1] + s.along[1] * t + s.out[1] * d,
  ];
  const band = (m: Mesher, t0: number, t1: number, d0: number, d1: number) =>
    m.face(
      [toThree(at(t0, d0), 0), toThree(at(t1, d0), 0), toThree(at(t1, d1), 0), toThree(at(t0, d1), 0)],
      [[t0, d0], [t1, d0], [t1, d1], [t0, d1]],
      white,
      [0, 1, 0],
    );
  for (const b of s.bands) band(b.kind === 'road' ? road : sidewalk, -s.length, s.length, b.from, b.to);
  const mid = (s.bands[1].from + s.bands[1].to) / 2;
  for (let t = -s.length; t < s.length; t += 6) band(marks, t, t + 3, mid - 0.06, mid + 0.06);
  return { road: road.build(), sidewalk: sidewalk.build(), marks: marks.build() };
}

// Textura de un módulo de fachada: pared blanca (la tiñe el color del volumen) con una ventana.
export function windowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 128);
    const glass = ctx.createLinearGradient(0, 30, 0, 98);
    glass.addColorStop(0, '#7b8a92');
    glass.addColorStop(1, '#3e4b53');
    ctx.fillStyle = '#d8d6d0';
    ctx.fillRect(26, 26, 76, 76);
    ctx.fillStyle = glass;
    ctx.fillRect(30, 30, 68, 68);
  }
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

// Mapa de normales de oleaje, repetible: suma de senos con frecuencias enteras.
export function waterNormals(size = 128): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const waves: [number, number, number][] = [
    [3, 1, 0.5],
    [1, 4, 0.35],
    [5, 3, 0.2],
    [2, 7, 0.12],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      for (const [fx, fy, a] of waves) {
        const ph = ((x * fx + y * fy) / size) * Math.PI * 2;
        dx += a * fx * Math.cos(ph);
        dy += a * fy * Math.cos(ph);
      }
      const n = new Vector3(-dx * 0.08, -dy * 0.08, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new DataTexture(data, size, size);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
