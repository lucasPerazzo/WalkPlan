import type { BufferGeometry } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Un modelo listo para dibujar: una geometría por material de la paleta, ya normalizada
// (origen en el centro de la huella a nivel del piso, frente hacia +Z, medidas nominales).
export interface ModelPart {
  material: string; // nombre en palette.ts
  geometry: BufferGeometry;
}

// Junta las piezas por material. Deja solo posición y normal (los muebles no llevan textura)
// y todas indexadas, que es lo que pide mergeGeometries.
export function groupParts(pieces: [string, BufferGeometry][]): ModelPart[] {
  const byMaterial = new Map<string, BufferGeometry[]>();
  for (const [material, geometry] of pieces) {
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    }
    const g = geometry.index ? geometry : mergeVertices(geometry);
    byMaterial.set(material, [...(byMaterial.get(material) ?? []), g]);
  }
  const parts: ModelPart[] = [];
  for (const [material, list] of byMaterial) {
    const geometry = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!geometry) continue;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    parts.push({ material, geometry });
  }
  return parts;
}
