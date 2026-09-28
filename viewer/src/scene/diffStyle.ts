import { DoubleSide, MeshStandardMaterial } from 'three';

// Colores de la vista Cambios (también los usa la leyenda).
export const NEW_COLOR = '#3f9d4a'; // se construye
export const DEMOLISH_COLOR = '#d8392b'; // se demuele

export const newMaterial = () => new MeshStandardMaterial({ color: NEW_COLOR, roughness: 0.8 });

// Rojo semitransparente: deja ver lo que queda detrás.
export const demolishMaterial = () =>
  new MeshStandardMaterial({ color: DEMOLISH_COLOR, roughness: 0.8, transparent: true, opacity: 0.38, depthWrite: false, side: DoubleSide });

// Velo verde sobre el piso de un ambiente nuevo.
export const newFloorMaterial = () =>
  new MeshStandardMaterial({ color: NEW_COLOR, roughness: 0.9, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
