import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MeshStandardMaterial, type Group, type Material } from 'three';
import { LEAF_THICKNESS, leafCenter, leafPose, pushSide, type Door } from '../geometry/doors.ts';
import { doorUi, player } from './runtime.ts';

const REACH = 1.8; // m: distancia máxima para accionar una puerta
const DURATION = 0.45; // s de animación
const SLIDING_OFFSET = 0.03; // las hojas corredizas van en planos paralelos

interface DoorState {
  open: boolean;
  side: 1 | -1;
}

// Interiores abiertas y exteriores cerradas al empezar (decisión de la fase 2).
const initialState = (doors: Door[]): Record<string, DoorState> =>
  Object.fromEntries(doors.map((d) => [d.opening.id, { open: !d.exterior, side: 1 as const }]));

interface Props {
  doors: Door[];
  wood: Material; // style.doors, del cache de materiales
  animate: boolean;
  interactive: boolean; // solo en primera persona
}

export function Doors({ doors, wood, animate, interactive }: Props) {
  const [state, setState] = useState(() => initialState(doors));
  const openness = useRef(new Map<string, number>());
  const groups = useRef(new Map<string, Group>());

  const glass = useMemo(
    () => new MeshStandardMaterial({ color: '#cfe3ea', transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false }),
    [],
  );
  useEffect(() => () => glass.dispose(), [glass]);

  const toggle = useCallback(
    (id: string) => {
      const door = doors.find((d) => d.opening.id === id);
      if (!door) return;
      setState((s) => {
        const cur = s[id];
        if (cur.open) {
          // No cerrar sobre la persona.
          if (Math.hypot(player.x - door.center[0], player.y - door.center[1]) < 0.55) return s;
          return { ...s, [id]: { ...cur, open: false } };
        }
        return { ...s, [id]: { open: true, side: pushSide(door, [player.x, player.y]) } };
      });
    },
    [doors],
  );

  useEffect(() => {
    doorUi.toggleNearest = () => {
      if (doorUi.near) toggle(doorUi.near);
    };
    return () => {
      doorUi.toggleNearest = () => {};
      doorUi.near = null;
    };
  }, [toggle]);

  useFrame((_, dt) => {
    for (const d of doors) {
      const id = d.opening.id;
      const target = state[id]?.open ? 1 : 0;
      const cur = openness.current.get(id) ?? target;
      const next = animate ? cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt / DURATION) : target;
      openness.current.set(id, next);
      for (const leaf of d.leaves) {
        const g = groups.current.get(leaf.id);
        if (!g) continue;
        const pose = leafPose(leaf, next, state[id]?.side ?? 1);
        g.position.set(pose.hinge[0], 0, -pose.hinge[1]);
        g.rotation.y = pose.angle;
      }
    }

    if (!interactive) return;
    let near: string | null = null;
    let best = REACH;
    for (const d of doors) {
      const dist = Math.hypot(player.x - d.center[0], player.y - d.center[1]);
      if (dist < best) {
        best = dist;
        near = d.opening.id;
      }
    }
    doorUi.near = near;
    const el = doorUi.promptEl;
    if (el) {
      const label = near ? (state[near]?.open ? 'cerrar' : 'abrir') : '';
      el.dataset.visible = near ? 'true' : 'false';
      if (el.dataset.label !== label) {
        el.dataset.label = label;
        el.textContent = `E · ${label} puerta`;
      }
    }
  });

  return (
    <group name="doors">
      {doors.flatMap((d) =>
        d.leaves.map((leaf, i) => {
          const isGlass = leaf.kind === 'sliding' && d.exterior;
          const z = leaf.kind === 'sliding' && d.leaves.length === 2 ? (i === 0 ? SLIDING_OFFSET : -SLIDING_OFFSET) : 0;
          return (
            <group
              key={leaf.id}
              ref={(g) => {
                if (g) groups.current.set(leaf.id, g);
                else groups.current.delete(leaf.id);
              }}
            >
              <mesh position={[leaf.width / 2, leaf.height / 2, z]} material={isGlass ? glass : wood} castShadow receiveShadow>
                <boxGeometry args={[leaf.width, leaf.height, LEAF_THICKNESS]} />
              </mesh>
            </group>
          );
        }),
      )}
      <RigidBody type="fixed" colliders={false}>
        {doors
          .filter((d) => !state[d.opening.id]?.open)
          .flatMap((d) =>
            d.leaves.map((leaf) => {
              const c = leafCenter(leaf, leafPose(leaf, 0, 1));
              return (
                <CuboidCollider
                  key={leaf.id}
                  args={[leaf.width / 2, leaf.height / 2, 0.06]}
                  position={[c[0], leaf.height / 2, -c[1]]}
                  rotation={[0, leaf.dirAngle, 0]}
                />
              );
            }),
          )}
      </RigidBody>
    </group>
  );
}
