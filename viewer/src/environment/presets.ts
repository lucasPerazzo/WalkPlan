import type { EnvironmentPreset } from '../model/schema.ts';

// Presets de entorno como datos. El cielo visible es siempre el procedural que sigue al sol (Lighting.tsx);
// el HDRI de cada preset solo ilumina y refleja. Las texturas de terreno las baja fetch_assets.py.
export interface EnvironmentDef {
  id: EnvironmentPreset;
  label: string;
  hdri: string; // public/hdri/<hdri>.hdr
  ground: { texture: string; color: string }; // carpeta de textura y color plano si falta
  fog: { color: string; near: number; far: number }; // near > distancia de la maqueta: la casa no se empaña
  walkRadius: number; // metros caminables alrededor de la casa
  street: boolean;
  seed: number;
}

export const ENVIRONMENTS: Record<EnvironmentPreset, EnvironmentDef> = {
  forest: {
    id: 'forest',
    label: 'Bosque',
    hdri: 'forest',
    ground: { texture: 'forest_floor', color: '#6f7a4c' },
    fog: { color: '#cdd5cf', near: 60, far: 190 },
    walkRadius: 25,
    street: false,
    seed: 1101,
  },
  city: {
    id: 'city',
    label: 'Ciudad',
    hdri: 'city',
    ground: { texture: 'sidewalk', color: '#a9a59d' },
    fog: { color: '#d9dee2', near: 100, far: 480 },
    walkRadius: 25,
    street: true,
    seed: 2202,
  },
  suburb: {
    id: 'suburb',
    label: 'Barrio',
    hdri: 'suburb',
    ground: { texture: 'grass', color: '#6f8a4a' },
    fog: { color: '#dbe1e4', near: 100, far: 450 },
    walkRadius: 25,
    street: true,
    seed: 3303,
  },
  countryside: {
    id: 'countryside',
    label: 'Campo',
    hdri: 'countryside',
    ground: { texture: 'grass', color: '#77904f' },
    fog: { color: '#dde3e6', near: 150, far: 700 },
    walkRadius: 40,
    street: false,
    seed: 4404,
  },
  beach: {
    id: 'beach',
    label: 'Playa',
    hdri: 'beach',
    ground: { texture: 'sand', color: '#d6c49c' },
    fog: { color: '#dfe6ea', near: 120, far: 600 },
    walkRadius: 25,
    street: false,
    seed: 5505,
  },
};

export const ENVIRONMENT_IDS = Object.keys(ENVIRONMENTS) as EnvironmentPreset[];
