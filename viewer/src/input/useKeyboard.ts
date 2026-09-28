import { useEffect } from 'react';
import { doorUi, input } from '../scene/runtime.ts';

const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];

// WASD / flechas + Shift para correr + E para puertas. Escribe en `input` (se lee en useFrame).
export function useKeyboard(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const down = new Set<string>();
    const sync = () => {
      const has = (keys: string[]) => keys.some((k) => down.has(k));
      input.forward = (has(FORWARD) ? 1 : 0) - (has(BACK) ? 1 : 0);
      input.right = (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0);
      input.run = down.has('ShiftLeft') || down.has('ShiftRight');
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyE' && !e.repeat) doorUi.toggleNearest();
      down.add(e.code);
      sync();
    };
    const onUp = (e: KeyboardEvent) => {
      down.delete(e.code);
      sync();
    };
    const onBlur = () => {
      down.clear();
      sync();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      onBlur();
    };
  }, [enabled]);
}
