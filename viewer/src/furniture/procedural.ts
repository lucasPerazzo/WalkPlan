import { BoxGeometry, CylinderGeometry, type BufferGeometry } from 'three';
import type { CatalogEntry, ProceduralModel } from './catalog.ts';
import { groupParts, type ModelPart } from './parts.ts';

// Muebles sin modelo en el kit de Kenney, armados con cajas y cilindros a las medidas nominales.
// Mismas convenciones que un modelo normalizado: origen en el centro de la huella, piso en y = 0, frente hacia +Z.

const box = (w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry =>
  new BoxGeometry(w, h, d).translate(x, y, z);

const oval = (rTop: number, rBottom: number, h: number, stretchZ: number, y: number, z = 0): BufferGeometry =>
  new CylinderGeometry(rTop, rBottom, h, 28).scale(1, 1, stretchZ).translate(0, y, z);

type Builder = (w: number, h: number, d: number) => [string, BufferGeometry][];

const BUILDERS: Record<ProceduralModel, Builder> = {
  // Taza ovalada de loza contra la pared (-Z), con la grifería atrás.
  bidet: (w, h, d) => {
    const stretch = d / w;
    const bowl = h - 0.04;
    return [
      ['porcelain', oval(w / 2, w * 0.38, bowl, stretch, bowl / 2)],
      ['porcelainInner', oval(w * 0.4, w * 0.4, 0.006, stretch * 0.95, bowl + 0.003, 0.02)],
      ['metal', new CylinderGeometry(0.014, 0.014, 0.04, 12).translate(0, bowl + 0.02, -d / 2 + 0.06)],
    ];
  },
  // Parrillero de ladrillo: cuerpo, boca de la leña al frente, mesada, parrilla y un murete atrás.
  bbq: (w, h, d) => {
    const body = h - 0.15;
    return [
      ['brick', box(w, body, d, 0, body / 2, 0)],
      ['metalDark', box(w * 0.45, body * 0.35, 0.01, -w * 0.12, body * 0.3, d / 2 + 0.005)],
      ['stone', box(w, 0.04, d, 0, body + 0.02, 0)],
      ['metalDark', box(w * 0.65, 0.02, d * 0.65, -w * 0.08, body + 0.05, 0.03)],
      ['brick', box(w, h - body - 0.04, 0.08, 0, (body + 0.04 + h) / 2, -d / 2 + 0.04)],
    ];
  },
  // Reposera de madera con colchoneta; la cabecera (-Z) lleva un almohadón.
  lounger: (w, h, d) => {
    const legs: [string, BufferGeometry][] = [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz): [string, BufferGeometry] => ['teak', box(0.05, 0.25, 0.05, sx * (w / 2 - 0.05), 0.125, sz * (d / 2 - 0.08))]),
    );
    return [
      ...legs,
      ['teak', box(w, 0.06, d, 0, 0.28, 0)],
      ['outdoorFabric', box(w - 0.04, 0.05, d - 0.04, 0, 0.335, 0)],
      ['outdoorFabric', box(w - 0.1, h - 0.36, 0.3, 0, (0.36 + h) / 2, -d / 2 + 0.2)],
    ];
  },
};

export function proceduralModel(name: ProceduralModel, entry: CatalogEntry): ModelPart[] {
  return groupParts(BUILDERS[name](entry.width, entry.height, entry.depth));
}
