import { Box3, Matrix4, Vector3 } from 'three';

export interface NominalSize {
  width: number; // x local
  height: number;
  depth: number; // z local
}

// Lleva un modelo con caja `bounds` a las medidas nominales del catálogo: lo gira `yawDeg` alrededor de Y
// (para que su frente quede hacia +Z), centra la huella en el origen, lo apoya en y = 0 y lo escala a
// ancho × alto × profundidad. Se escala por las medidas nominales, no por las del archivo.
export function normalizeMatrix(bounds: Box3, yawDeg: number, size: NominalSize): Matrix4 {
  const rotate = new Matrix4().makeRotationY((yawDeg * Math.PI) / 180);
  const b = bounds.clone().applyMatrix4(rotate);
  const s = b.getSize(new Vector3());
  const c = b.getCenter(new Vector3());
  const factor = (nominal: number, actual: number) => (actual > 1e-6 ? nominal / actual : 1);
  const scale = new Matrix4().makeScale(factor(size.width, s.x), factor(size.height, s.y), factor(size.depth, s.z));
  const center = new Matrix4().makeTranslation(-c.x, -b.min.y, -c.z);
  return scale.multiply(center).multiply(rotate);
}
