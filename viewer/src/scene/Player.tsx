import { PerspectiveCamera, PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, CoefficientCombineRule, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useRef } from 'react';
import { Euler, Vector3 } from 'three';
import type { Point } from '../model/schema.ts';
import { input, player, setPlayer } from './runtime.ts';

const HALF_HEIGHT = 0.55;
const RADIUS = 0.3;
const CENTER = HALF_HEIGHT + RADIUS; // 0.85: centro de la cápsula sobre el piso
const EYE = 1.6 - CENTER; // ojos a 1.60 m
const WALK = 1.4;
const RUN = 3;
const TOUCH_LOOK = 0.004; // rad por px arrastrado

interface Props {
  start: Point; // plano
  yaw: number; // grados antihorario desde +x del plano
  pointerLock: boolean; // escritorio: mouse con pointer lock; táctil o test: no
  onLockChange?: (locked: boolean) => void;
  onFrame?: () => void;
}

// yaw del plano -> rotation.y de la cámara (que mira hacia -Z): 90° (hacia +y del plano) = 0.
const yawToCamera = (yaw: number) => ((yaw - 90) * Math.PI) / 180;

export function Player({ start, yaw, pointerLock, onLockChange, onFrame }: Props) {
  const body = useRef<RapierRigidBody>(null);
  const camera = useThree((s) => s.camera);
  const tmp = useRef({ fwd: new Vector3(), right: new Vector3(), euler: new Euler(0, 0, 0, 'YXZ') });

  // Orientación inicial (al montar o al cambiar de cámara); después manda el mouse o el táctil.
  useEffect(() => {
    camera.rotation.set(0, yawToCamera(yaw), 0, 'YXZ');
  }, [camera, yaw]);

  useFrame((_, delta) => {
    const b = body.current;
    if (!b) return;
    player.simTime += Math.min(delta, 0.5);
    const { fwd, right, euler } = tmp.current;

    if (input.lookDX || input.lookDY) {
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= input.lookDX * TOUCH_LOOK;
      euler.x = Math.max(-1.4, Math.min(1.4, euler.x - input.lookDY * TOUCH_LOOK));
      camera.quaternion.setFromEuler(euler);
      input.lookDX = 0;
      input.lookDY = 0;
    }

    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    right.set(-fwd.z, 0, fwd.x);
    const speed = input.run ? RUN : WALK;
    let vx = fwd.x * input.forward + right.x * input.right;
    let vz = fwd.z * input.forward + right.z * input.right;
    const len = Math.hypot(vx, vz);
    if (len > 1) {
      vx /= len;
      vz /= len;
    }
    const v = b.linvel();
    b.setLinvel({ x: vx * speed, y: v.y, z: vz * speed }, true);

    const t = b.translation();
    camera.position.set(t.x, t.y + EYE, t.z);
    setPlayer([t.x, -t.z], (Math.atan2(-fwd.z, fwd.x) * 180) / Math.PI);
    player.placed = true;
    onFrame?.();
  });

  return (
    <>
      <PerspectiveCamera makeDefault fov={70} near={0.1} far={600} />
      {pointerLock && (
        <PointerLockControls selector="#enter-fps" onLock={() => onLockChange?.(true)} onUnlock={() => onLockChange?.(false)} />
      )}
      <RigidBody
        ref={body}
        type="dynamic"
        colliders={false}
        position={[start[0], CENTER + 0.02, -start[1]]}
        enabledRotations={[false, false, false]}
        canSleep={false}
        ccd
      >
        {/* Fricción 0 contra todo (Min): con el promedio por defecto el piso frena entre cuadros. */}
        <CapsuleCollider args={[HALF_HEIGHT, RADIUS]} friction={0} frictionCombineRule={CoefficientCombineRule.Min} />
      </RigidBody>
    </>
  );
}
