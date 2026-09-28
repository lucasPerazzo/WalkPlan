// Estado mutable que se lee y escribe en useFrame (nunca setState por frame).
import type { Point } from '../model/schema.ts';

export const player = {
  x: 0, // plano
  y: 0,
  yaw: 90, // grados antihorario desde +x del plano
  placed: false, // ya hubo un recorrido: volver a primera persona retoma este punto
  simTime: 0, // segundos simulados (como rapier: cuadros de más de 0.5 s se recortan)
};

export const input = {
  forward: 0, // -1..1
  right: 0,
  run: false,
  lookDX: 0, // acumulado de arrastre táctil (px), se consume por frame
  lookDY: 0,
};

export const doorUi = {
  near: null as string | null, // id de la abertura cercana
  toggleNearest: () => {},
  promptEl: null as HTMLElement | null,
};

// Cargas en curso (texturas, HDRI, muebles): el modo test espera a que terminen para marcar ready.
export const assets = {
  pending: 0,
  environmentReady: false,
  modelsReady: false, // modelos de muebles resueltos y montados en la escena
  warm: false, // shaders compilados y texturas subidas a la GPU
};

// Editor en planta: centro de la vista (plano), donde aparece un mueble agregado.
// `focus`: punto a centrar en el próximo cuadro (el panel de dudas lleva la planta hasta un elemento).
export const planView = {
  center: [0, 0] as Point,
  focus: null as Point | null,
};

// Primera persona: la tecla M pide marcar el punto bajo la mira (lo resuelve MeasureFps en su useFrame).
export const measureUi = {
  request: false,
};

export function setPlayer(p: Point, yaw: number) {
  player.x = p[0];
  player.y = p[1];
  player.yaw = yaw;
}
