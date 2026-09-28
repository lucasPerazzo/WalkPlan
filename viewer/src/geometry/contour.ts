import type { Point, Wall } from '../model/schema.ts';
import { polygonArea } from './floors.ts';

const key = (p: Point) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;

export interface ContourEdge {
  from: Point;
  to: Point;
  thickness: number;
}

// Caras interiores del grafo formado por los ejes de los muros exteriores (antihorarias).
// Recorrido de caras planar: en cada nodo se toma la arista siguiente en sentido horario desde la de llegada.
export function exteriorContours(walls: Wall[]): ContourEdge[][] {
  const nodes = new Map<string, { p: Point; out: { to: string; angle: number; thickness: number }[] }>();
  const node = (p: Point) => {
    const k = key(p);
    if (!nodes.has(k)) nodes.set(k, { p, out: [] });
    return k;
  };
  for (const w of walls) {
    if (w.kind !== 'exterior') continue;
    const a = node(w.start);
    const b = node(w.end);
    if (a === b) continue;
    const ang = Math.atan2(w.end[1] - w.start[1], w.end[0] - w.start[0]);
    nodes.get(a)!.out.push({ to: b, angle: ang, thickness: w.thickness });
    nodes.get(b)!.out.push({ to: a, angle: ang + Math.PI, thickness: w.thickness });
  }
  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const used = new Set<string>();
  const faces: ContourEdge[][] = [];
  for (const [ka, na] of nodes) {
    for (const first of na.out) {
      if (used.has(`${ka}>${first.to}`)) continue;
      const face: ContourEdge[] = [];
      let from = ka;
      let edge = first;
      for (let guard = 0; guard < 10000; guard++) {
        const id = `${from}>${edge.to}`;
        if (used.has(id)) break;
        used.add(id);
        face.push({ from: nodes.get(from)!.p, to: nodes.get(edge.to)!.p, thickness: edge.thickness });
        // En el nodo de llegada, la próxima arista es la primera girando en sentido horario desde la vuelta.
        const back = norm(edge.angle + Math.PI);
        const candidates = nodes.get(edge.to)!.out;
        let best = candidates[0];
        let bestTurn = Infinity;
        for (const c of candidates) {
          let turn = norm(back - c.angle);
          if (turn < 1e-9) turn = 2 * Math.PI; // volver por la misma arista, último recurso
          if (turn < bestTurn) {
            bestTurn = turn;
            best = c;
          }
        }
        from = edge.to;
        edge = best;
      }
      if (face.length >= 3 && polygonArea(face.map((e) => e.from)) > 1e-6) faces.push(face);
    }
  }
  return faces;
}

// Polígono desplazado hacia afuera arista por arista (distancia = medio espesor de cada muro).
// Para una cara antihoraria, afuera es la derecha de cada arista.
export function offsetOutward(face: ContourEdge[]): Point[] {
  const lines = face.map((e) => {
    const dx = e.to[0] - e.from[0];
    const dy = e.to[1] - e.from[1];
    const L = Math.hypot(dx, dy);
    const n: Point = [dy / L, -dx / L];
    const d = e.thickness / 2;
    return { p: [e.from[0] + n[0] * d, e.from[1] + n[1] * d] as Point, dir: [dx / L, dy / L] as Point };
  });
  return lines.map((cur, i) => {
    const prev = lines[(i - 1 + lines.length) % lines.length];
    const den = prev.dir[0] * cur.dir[1] - prev.dir[1] * cur.dir[0];
    if (Math.abs(den) < 1e-9) return cur.p; // colineales: el punto desplazado del inicio
    const t = ((cur.p[0] - prev.p[0]) * cur.dir[1] - (cur.p[1] - prev.p[1]) * cur.dir[0]) / den;
    return [prev.p[0] + prev.dir[0] * t, prev.p[1] + prev.dir[1] * t];
  });
}

// Contorno exterior de la casa por las caras externas de los muros: base de la losa de techo.
export function roofOutlines(walls: Wall[]): Point[][] {
  return exteriorContours(walls).map(offsetOutward);
}
