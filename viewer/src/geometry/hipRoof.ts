import type { Point } from '../model/schema.ts';

// Techo a cuatro aguas sobre un contorno ortogonal (todos los lados paralelos a x o a y).
// Se arma como la unión de los techos a cuatro aguas de todos los rectángulos máximos que caben en el
// contorno, con la misma pendiente. Para polígonos ortogonales eso es exactamente el techo del esqueleto
// recto: la altura en cada punto es tan(pendiente) × la distancia L∞ al borde (el cuadrado más grande
// centrado en el punto que entra en el contorno está dentro de algún rectángulo máximo). Las caras que
// se superponen quedan una dentro de otra; con el mismo material no se nota.
// Si el contorno no es ortogonal devuelve null y queda la losa plana.

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const EPS = 1e-4;

export function isOrthogonal(poly: Point[]): boolean {
  return poly.every((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return Math.abs(a[0] - b[0]) < EPS || Math.abs(a[1] - b[1]) < EPS;
  });
}

function inside([px, py]: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const signedArea = (poly: Point[]) => poly.reduce((s, [x0, y0], i) => s + x0 * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * y0, 0) / 2;

// Desplaza un contorno ortogonal hacia afuera `d` metros (alero). En esquinas a 90°, el inglete es n1 + n2.
export function offsetOrthogonal(poly: Point[], d: number): Point[] {
  const ccw = signedArea(poly) > 0 ? 1 : -1;
  const normal = (a: Point, b: Point): Point => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [((b[1] - a[1]) / L) * ccw, (-(b[0] - a[0]) / L) * ccw]; // derecha del borde en un antihorario = afuera
  };
  return poly.map((v, i) => {
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const next = poly[(i + 1) % poly.length];
    const n1 = normal(prev, v);
    const n2 = normal(v, next);
    return [v[0] + d * (n1[0] + n2[0]), v[1] + d * (n1[1] + n2[1])];
  });
}

// Rectángulos máximos (que no se pueden agrandar para ningún lado) sobre la grilla de coordenadas del contorno.
export function maximalRectangles(poly: Point[]): Rect[] {
  const xs = [...new Set(poly.map((p) => Math.round(p[0] * 1e4) / 1e4))].sort((a, b) => a - b);
  const ys = [...new Set(poly.map((p) => Math.round(p[1] * 1e4) / 1e4))].sort((a, b) => a - b);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const cell: boolean[][] = [];
  for (let i = 0; i < nx; i++) {
    cell.push([]);
    for (let j = 0; j < ny; j++) cell[i].push(inside([(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2], poly));
  }
  const full = (i0: number, i1: number, j0: number, j1: number) => {
    if (i0 < 0 || j0 < 0 || i1 >= nx || j1 >= ny) return false;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (!cell[i][j]) return false;
    return true;
  };
  const out: Rect[] = [];
  for (let i0 = 0; i0 < nx; i0++) {
    for (let i1 = i0; i1 < nx; i1++) {
      for (let j0 = 0; j0 < ny; j0++) {
        for (let j1 = j0; j1 < ny; j1++) {
          if (!full(i0, i1, j0, j1)) continue;
          const grows = full(i0 - 1, i1, j0, j1) || full(i0, i1 + 1, j0, j1) || full(i0, i1, j0 - 1, j1) || full(i0, i1, j0, j1 + 1);
          if (!grows) out.push({ x0: xs[i0], y0: ys[j0], x1: xs[i1 + 1], y1: ys[j1 + 1] });
        }
      }
    }
  }
  return out;
}

export type Triangle = [[number, number, number], [number, number, number], [number, number, number]]; // (x, y del plano, altura)

// Cuatro aguas de un rectángulo: cumbrera sobre el eje largo, a (lado corto / 2) × tan(pendiente).
export function rectHipRoof(r: Rect, slopeDeg: number, base: number): Triangle[] {
  const w = r.x1 - r.x0;
  const d = r.y1 - r.y0;
  const k = Math.tan((slopeDeg * Math.PI) / 180);
  const top = base + (Math.min(w, d) / 2) * k;
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  const P = (x: number, y: number, z = base): [number, number, number] => [x, y, z];
  const quad = (a: Triangle[0], b: Triangle[0], c: Triangle[0], e: Triangle[0]): Triangle[] => [[a, b, c], [a, c, e]];
  if (w >= d) {
    const h = d / 2;
    const ra = P(r.x0 + h, cy, top);
    const rb = P(r.x1 - h, cy, top);
    return [
      ...quad(P(r.x0, r.y0), P(r.x1, r.y0), rb, ra),
      ...quad(P(r.x1, r.y1), P(r.x0, r.y1), ra, rb),
      [P(r.x0, r.y1), P(r.x0, r.y0), ra],
      [P(r.x1, r.y0), P(r.x1, r.y1), rb],
    ];
  }
  const h = w / 2;
  const ra = P(cx, r.y0 + h, top);
  const rb = P(cx, r.y1 - h, top);
  return [
    ...quad(P(r.x1, r.y0), P(r.x1, r.y1), rb, ra),
    ...quad(P(r.x0, r.y1), P(r.x0, r.y0), ra, rb),
    [P(r.x0, r.y0), P(r.x1, r.y0), ra],
    [P(r.x1, r.y1), P(r.x0, r.y1), rb],
  ];
}

// Techo completo: alero `overhang` alrededor de cada contorno y unión de los cuatro aguas.
export function hipRoof(outlines: Point[][], slopeDeg: number, base: number, overhang: number): Triangle[] | null {
  if (!outlines.length || !outlines.every(isOrthogonal)) return null;
  return outlines.flatMap((poly) => maximalRectangles(offsetOrthogonal(poly, overhang)).flatMap((r) => rectHipRoof(r, slopeDeg, base)));
}

// Altura del techo en un punto (máximo de los cuatro aguas que lo cubren): la usan los tests.
export function roofHeightAt(p: Point, rects: Rect[], slopeDeg: number, base: number): number | null {
  const k = Math.tan((slopeDeg * Math.PI) / 180);
  let best: number | null = null;
  for (const r of rects) {
    if (p[0] < r.x0 - EPS || p[0] > r.x1 + EPS || p[1] < r.y0 - EPS || p[1] > r.y1 + EPS) continue;
    const h = base + Math.min(p[0] - r.x0, r.x1 - p[0], p[1] - r.y0, r.y1 - p[1]) * k;
    best = best === null ? h : Math.max(best, h);
  }
  return best;
}
