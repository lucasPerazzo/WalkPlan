import { CATALOG } from '../furniture/catalog.ts';
import type { FurnitureItem } from '../model/schema.ts';

export interface FurniturePlacement {
  item: FurnitureItem;
  position: [number, number, number]; // Three: centro de la caja
  origin: [number, number, number]; // Three: centro de la huella a la altura de montaje (origen del modelo)
  rotationY: number;
  scale: number; // item.scale; el modelo ya viene con las medidas nominales
  size: [number, number, number]; // ancho (x local), alto, profundidad (z local)
  collider: boolean;
}

// Con rotation 0 el frente mira hacia -y del plano = +Z de Three: rotation.y = grados * π/180, sin más.
export function placeFurniture(items: FurnitureItem[], errors: string[]): FurniturePlacement[] {
  const out: FurniturePlacement[] = [];
  for (const item of items) {
    const entry = CATALOG[item.catalog];
    if (!entry) {
      errors.push(`mueble ${item.id}: clave '${item.catalog}' fuera del catálogo; se omite`);
      continue;
    }
    const s = item.scale ?? 1;
    const h = entry.height * s;
    out.push({
      item,
      position: [item.position[0], entry.base + h / 2, -item.position[1]],
      origin: [item.position[0], entry.base, -item.position[1]],
      rotationY: (item.rotation * Math.PI) / 180,
      scale: s,
      size: [entry.width * s, h, entry.depth * s],
      collider: entry.collider,
    });
  }
  return out;
}
