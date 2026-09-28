import { useEffect, useState } from 'react';
import { Box3, type BufferGeometry, type Material, type Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { normalizeMatrix } from '../geometry/normalize.ts';
import { CATALOG } from './catalog.ts';
import { groupParts, type ModelPart } from './parts.ts';
import { proceduralModel } from './procedural.ts';

// Modelos por clave del catálogo, normalizados una sola vez y compartidos entre casas.
// null = no hay modelo (falta el .glb): el mueble se dibuja como caja con la clave.

const loader = new GLTFLoader();
const files = new Map<string, Promise<Object3D | null>>(); // por archivo: table_dining_4/6/8 comparten "table"
const prepared = new Map<string, ModelPart[] | null>(); // por clave, ya resuelto
const loading = new Map<string, Promise<void>>();

function loadFile(file: string): Promise<Object3D | null> {
  let p = files.get(file);
  if (!p) {
    p = loader.loadAsync(`${import.meta.env.BASE_URL}models/kenney/${file}.glb`).then(
      (gltf) => gltf.scene,
      () => {
        console.info(`[muebles] falta models/kenney/${file}.glb: caja con la clave (correr viewer/scripts/fetch_assets.py)`);
        return null;
      },
    );
    files.set(file, p);
  }
  return p;
}

// Hornea las transformaciones del archivo, normaliza a las medidas nominales y agrupa por material de la paleta.
export function prepareModel(root: Object3D, key: string): ModelPart[] {
  const entry = CATALOG[key];
  if (entry.model.source !== 'kenney') throw new Error(`${key} no es un modelo de archivo`);
  const { yaw, materials } = entry.model;
  root.updateMatrixWorld(true);
  const pieces: [string, BufferGeometry][] = [];
  const bounds = new Box3();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const name = (Array.isArray(mesh.material) ? mesh.material[0] : (mesh.material as Material)).name;
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    g.computeBoundingBox();
    if (g.boundingBox) bounds.union(g.boundingBox);
    pieces.push([materials?.[name] ?? name, g]);
  });
  const m = normalizeMatrix(bounds, yaw, entry);
  for (const [, g] of pieces) g.applyMatrix4(m);
  return groupParts(pieces);
}

function loadKey(key: string): Promise<void> {
  let p = loading.get(key);
  if (!p) {
    const entry = CATALOG[key];
    const model = entry.model;
    const parts: Promise<ModelPart[] | null> =
      model.source === 'procedural'
        ? Promise.resolve(proceduralModel(model.name, entry))
        : loadFile(model.file).then((root) => (root ? prepareModel(root, key) : null));
    p = parts
      .catch((e: unknown) => {
        console.warn(`[muebles] no se pudo preparar ${key}:`, e);
        return null;
      })
      .then((m) => {
        prepared.set(key, m);
      });
    loading.set(key, p);
  }
  return p;
}

// Modelos de las claves pedidas. `ready` = todas resueltas (con modelo o sin él).
export function useFurnitureModels(keys: readonly string[]): { models: ReadonlyMap<string, ModelPart[] | null>; ready: boolean } {
  const [, setVersion] = useState(0);
  const list = keys.join(',');
  useEffect(() => {
    const missing = list.split(',').filter((k) => k && !prepared.has(k));
    if (missing.length === 0) return;
    let alive = true;
    Promise.all(missing.map(loadKey)).then(() => {
      if (alive) setVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, [list]);
  return { models: prepared, ready: keys.every((k) => prepared.has(k)) };
}
