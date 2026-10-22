import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Vector3 } from "three";
import { Lighting } from "./Lighting";
import { Props } from "./Props";
import { Sachets } from "./Sachets";
import { StoreBuilding } from "./StoreBuilding";
import { useScenePaused } from "./useScenePaused";
import { useScrollProgress } from "./useScrollProgress";

type Pointer = { x: number; y: number };

// The camera at rest, a few steps back, to the right and above eye level so the roof shows, and at the window,
// where scrolling takes it.
const REST_POSITION: [number, number, number] = [3.6, 3.7, 9.0];
const REST = { position: new Vector3(...REST_POSITION), target: new Vector3(0, 1.45, -0.9) };
const AT_WINDOW = { position: new Vector3(0.4, 1.75, 3.1), target: new Vector3(0, 1.55, -1.4) };
const UP = new Vector3(0, 1, 0);

// Working vectors for the camera rig (there is one scene at a time).
const goalPosition = new Vector3();
const goalTarget = new Vector3();
const offset = new Vector3();
const looking = REST.target.clone();

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Spec 11.4: a slow orbit, slight pointer parallax, and the scroll-driven move toward the window. */
function CameraRig({ progress, pointer }: { progress: RefObject<number>; pointer: RefObject<Pointer> }) {
  useFrame(({ camera, clock }, delta) => {
    const moved = smooth(progress.current);
    goalPosition.lerpVectors(REST.position, AT_WINDOW.position, moved);
    goalTarget.lerpVectors(REST.target, AT_WINDOW.target, moved);
    // The orbit swings the camera about the store, about 25 seconds each way, and settles near the window.
    offset.subVectors(goalPosition, goalTarget).applyAxisAngle(UP, Math.sin(clock.elapsedTime * 0.25) * 0.2 * (1 - moved));
    goalPosition.addVectors(goalTarget, offset);
    goalPosition.x += pointer.current.x * 0.4;
    goalPosition.y += pointer.current.y * 0.25;
    const ease = 1 - Math.exp(-3 * delta);
    camera.position.lerp(goalPosition, ease);
    looking.lerp(goalTarget, ease);
    camera.lookAt(looking);
  });
  return null;
}

/** Spec 11.4: the low-poly tindahan at dusk. TindahanStage loads this chunk only where it will play. */
export function Tindahan3D() {
  const stage = useRef<HTMLDivElement>(null);
  const paused = useScenePaused(stage);
  const progress = useScrollProgress(stage);
  const pointer = useRef<Pointer>({ x: 0, y: 0 });

  useEffect(() => {
    const follow = (event: PointerEvent) => {
      // A finger moving is the page scrolling; only a mouse tilts the view.
      if (event.pointerType !== "mouse") return;
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = 1 - (event.clientY / window.innerHeight) * 2;
    };
    window.addEventListener("pointermove", follow, { passive: true });
    return () => window.removeEventListener("pointermove", follow);
  }, []);

  return (
    <div ref={stage} role="img" aria-label="Illustration of a sari-sari store at dusk" className="size-full">
      <Canvas
        dpr={[1, 1.5]}
        frameloop={paused ? "never" : "always"}
        camera={{ position: REST_POSITION, fov: 35, near: 0.1, far: 80 }}
        gl={{ antialias: true, powerPreference: "low-power" }}
        onCreated={({ camera }) => camera.lookAt(REST.target)}
      >
        <Lighting />
        <StoreBuilding />
        <Sachets />
        <Props />
        <CameraRig progress={progress} pointer={pointer} />
      </Canvas>
    </div>
  );
}
