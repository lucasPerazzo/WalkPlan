import { describe, expect, it } from 'vitest';
import { declination, sunPosition } from './sun.ts';

describe('sunPosition', () => {
  it('mediodía de equinoccio en el hemisferio sur: sol al norte, altura 90° - |latitud|', () => {
    const s = sunPosition(-35, 'equinox', 12, 0);
    expect(s.elevation).toBeCloseTo(55, 6);
    expect(s.plan[0]).toBeCloseTo(0, 6);
    expect(s.plan[1]).toBeCloseTo(1, 6); // norte = +y de la lámina
    const len = Math.hypot(...s.direction);
    expect(len).toBeCloseTo(1, 6);
  });

  it('en el hemisferio norte el sol del mediodía viene del sur', () => {
    expect(sunPosition(40, 'equinox', 12, 0).plan[1]).toBeCloseTo(-1, 6);
  });

  it('north_deg gira el recorrido del sol con el norte de la lámina', () => {
    const s = sunPosition(-34.9, 'equinox', 12, 28);
    // norte de la lámina: 28° antihorario desde +y
    expect(s.plan[0]).toBeCloseTo(-Math.sin((28 * Math.PI) / 180), 6);
    expect(s.plan[1]).toBeCloseTo(Math.cos((28 * Math.PI) / 180), 6);
  });

  it('a la mañana el sol está al este y a la tarde al oeste', () => {
    expect(sunPosition(-34.9, 'equinox', 9, 0).plan[0]).toBeGreaterThan(0.5);
    expect(sunPosition(-34.9, 'equinox', 17, 0).plan[0]).toBeLessThan(-0.5);
  });

  it('Punta Ballena: unos 32° de altura al mediodía en invierno y 78° en verano', () => {
    expect(sunPosition(-34.887853, 'winter', 12, 0).elevation).toBeCloseTo(31.7, 0);
    expect(sunPosition(-34.887853, 'summer', 12, 0).elevation).toBeCloseTo(78.6, 0);
  });

  it('declinación según hemisferio: el verano austral tiene declinación negativa', () => {
    expect(declination('summer', -34)).toBeLessThan(0);
    expect(declination('summer', 40)).toBeGreaterThan(0);
    expect(declination('equinox', -34)).toBe(0);
  });

  it('la dirección de Three invierte la y del plano', () => {
    const s = sunPosition(-35, 'equinox', 12, 0);
    expect(s.direction[2]).toBeLessThan(0); // norte (+y del plano) = -Z de Three
    expect(s.direction[1]).toBeGreaterThan(0);
  });
});
