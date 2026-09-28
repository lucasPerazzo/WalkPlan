import type { House } from './schema.ts';

// Chequeo estructural mínimo. Las invariantes finas las garantiza el validador;
// acá solo se evita romper la escena con un JSON que no es una casa v2 o v3.
// v2 -> v3 solo agrega site.latitude (opcional), así que un v2 se lee tal cual.
export function parseHouse(data: unknown): House {
  if (typeof data !== 'object' || data === null) {
    throw new Error('El archivo no contiene un objeto JSON.');
  }
  const h = data as Record<string, unknown>;
  if (h.version !== 2 && h.version !== 3) {
    throw new Error(`Versión de schema no soportada: ${String(h.version)} (se espera 3).`);
  }
  for (const key of ['walls', 'openings', 'rooms'] as const) {
    if (!Array.isArray(h[key])) throw new Error(`Falta el array "${key}".`);
  }
  if (h.furniture !== undefined && !Array.isArray(h.furniture)) {
    throw new Error('"furniture" debe ser un array.');
  }
  return { ...(h as unknown as House), version: 3, furniture: (h.furniture as House['furniture']) ?? [] };
}

export async function fetchHouse(url: string): Promise<House> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (HTTP ${res.status}).`);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`${url} no es un JSON válido.`);
  }
  return parseHouse(data);
}

export async function readHouseFile(file: File): Promise<House> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} no es un JSON válido.`);
  }
  return parseHouse(data);
}
