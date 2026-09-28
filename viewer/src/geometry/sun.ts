// Posición del sol para una latitud, estación y hora solar, orientada con el norte de la lámina.

export type Season = 'summer' | 'equinox' | 'winter';
export const DEFAULT_LATITUDE = -35; // sin site.latitude: se avisa en el panel
const TILT = 23.44;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export interface SunPosition {
  direction: [number, number, number]; // Three, unitario, desde la casa hacia el sol
  elevation: number; // grados sobre el horizonte
  plan: [number, number]; // dirección horizontal hacia el sol en el plano (unitaria si el sol no está en el cenit)
}

// Declinación del día típico de cada estación. El verano austral es en diciembre (declinación negativa).
export function declination(season: Season, latitude: number): number {
  const sign = latitude < 0 ? -1 : 1;
  return { summer: sign * TILT, equinox: 0, winter: -sign * TILT }[season];
}

/**
 * @param hour hora solar (12 = mediodía solar)
 * @param northDeg norte medido antihorario desde +y del plano (site.north_deg)
 */
export function sunPosition(latitude: number, season: Season, hour: number, northDeg: number): SunPosition {
  const lat = rad(latitude);
  const dec = rad(declination(season, latitude));
  const h = rad(15 * (hour - 12)); // ángulo horario
  // Vector al sol en el marco local (este, norte, arriba).
  const east = -Math.cos(dec) * Math.sin(h);
  const north = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(h);
  const up = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
  // Norte y este del terreno en el plano: north_deg gira el norte antihorario desde +y.
  const n = rad(northDeg);
  const N: [number, number] = [-Math.sin(n), Math.cos(n)];
  const E: [number, number] = [Math.cos(n), Math.sin(n)];
  const px = E[0] * east + N[0] * north;
  const py = E[1] * east + N[1] * north;
  const flat = Math.hypot(px, py) || 1;
  return {
    direction: [px, up, -py], // plano (x, y) -> Three (x, h, -y)
    elevation: deg(Math.asin(Math.max(-1, Math.min(1, up)))),
    plan: [px / flat, py / flat],
  };
}
