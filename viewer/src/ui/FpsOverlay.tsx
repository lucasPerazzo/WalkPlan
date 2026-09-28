import { useEffect, useRef, useState } from 'react';
import { doorUi, input } from '../scene/runtime.ts';

// Capa de primera persona: pantalla de entrada, mira, aviso de puerta y controles táctiles.
interface Props {
  touch: boolean;
  locked: boolean; // escritorio: pointer lock activo
  test: boolean;
}

export function FpsOverlay({ touch, locked, test }: Props) {
  const [started, setStarted] = useState(false); // táctil: ya tocó "Empezar"
  const active = test || (touch ? started : locked);
  return (
    <>
      {active && <div className="crosshair" aria-hidden />}
      <DoorPrompt touch={touch} />
      {touch && active && <TouchControls />}
      {/* Siempre montado: PointerLockControls se engancha a este botón al montar (selector #enter-fps). */}
      {!test && (
        <div className="enter" hidden={active}>
          <div className="panel enter-card">
            <span className="eyebrow">Primera persona</span>
            <h1>Recorré la casa</h1>
            <ul className="keys">
              {touch ? (
                <>
                  <li>Joystick izquierdo: caminar (a fondo, correr)</li>
                  <li>Arrastrar a la derecha: mirar</li>
                  <li>Botón de puerta: abrir y cerrar</li>
                </>
              ) : (
                <>
                  <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> caminar · <kbd>Shift</kbd> correr</li>
                  <li>Mouse: mirar · <kbd>E</kbd> abrir y cerrar puertas · <kbd>M</kbd> medir (dos marcas)</li>
                  <li><kbd>Esc</kbd> soltar el mouse · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> vistas</li>
                </>
              )}
            </ul>
            <button id="enter-fps" type="button" className="btn btn-primary" onClick={() => touch && setStarted(true)}>
              {touch ? 'Empezar' : 'Entrar'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function DoorPrompt({ touch }: { touch: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    doorUi.promptEl = ref.current;
    return () => {
      doorUi.promptEl = null;
    };
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      className="door-prompt"
      data-visible="false"
      data-touch={touch}
      tabIndex={-1}
      onClick={() => doorUi.toggleNearest()}
    />
  );
}

const STICK_RADIUS = 48; // px

function TouchControls() {
  const knob = useRef<HTMLDivElement>(null);
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(
    () => () => {
      input.forward = 0;
      input.right = 0;
      input.run = false;
    },
    [],
  );

  const moveStick = (e: React.PointerEvent) => {
    const s = stick.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.x;
    let dy = e.clientY - s.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    input.right = dx / STICK_RADIUS;
    input.forward = -dy / STICK_RADIUS;
    input.run = len > STICK_RADIUS * 0.95;
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const endStick = (e: React.PointerEvent) => {
    if (stick.current?.id !== e.pointerId) return;
    stick.current = null;
    input.forward = 0;
    input.right = 0;
    input.run = false;
    if (knob.current) knob.current.style.transform = '';
  };

  return (
    <>
      <div
        className="touch-look"
        onPointerDown={(e) => {
          look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const l = look.current;
          if (!l || l.id !== e.pointerId) return;
          input.lookDX += e.clientX - l.x;
          input.lookDY += e.clientY - l.y;
          l.x = e.clientX;
          l.y = e.clientY;
        }}
        onPointerUp={() => (look.current = null)}
        onPointerCancel={() => (look.current = null)}
      />
      <div
        className="stick"
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          stick.current = { id: e.pointerId, x: r.left + r.width / 2, y: r.top + r.height / 2 };
          e.currentTarget.setPointerCapture(e.pointerId);
          moveStick(e);
        }}
        onPointerMove={moveStick}
        onPointerUp={endStick}
        onPointerCancel={endStick}
      >
        <div ref={knob} className="stick-knob" />
      </div>
    </>
  );
}
