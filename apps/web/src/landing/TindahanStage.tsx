import { Component, Suspense, lazy, useState, useSyncExternalStore, type ReactNode } from "react";

const STILL_SRC = "/tindahan-still.webp";
const STILL_ALT = "Illustration of a sari-sari store at dusk";
const REDUCE_MOTION = "(prefers-reduced-motion: reduce)";

// three.js is most of the landing's weight, so the scene is its own chunk, fetched only when it will play.
const Tindahan3D = lazy(() => import("./tindahan/Tindahan3D").then((module) => ({ default: module.Tindahan3D })));

function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCE_MOTION);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}
const prefersReducedMotion = () => window.matchMedia?.(REDUCE_MOTION).matches ?? false;

/** WebGL that can start on this device; the probe's context is let go at once. */
function webglWorks(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl != null;
  } catch {
    return false;
  }
}

/** A scene that cannot start (its chunk failed to load, the GPU refused) leaves the still in its place. */
class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Spec 11.4: the 3D tindahan, or its still picture under reduced motion or without WebGL. The landing never
 * waits for the scene: the still shows until its chunk arrives, and stays behind the canvas until it draws.
 */
export function TindahanStage() {
  const reduceMotion = useSyncExternalStore(subscribeToMotion, prefersReducedMotion, () => true);
  const [webgl] = useState(webglWorks);
  const still = <img src={STILL_SRC} alt={STILL_ALT} width={1200} height={900} className="size-full object-cover" />;
  return (
    <div className="aspect-[4/3] overflow-hidden rounded-[32px] bg-[#2a2648] bg-cover bg-center" style={{ backgroundImage: `url(${STILL_SRC})` }}>
      {reduceMotion || !webgl ? (
        still
      ) : (
        <div data-testid="tindahan-canvas" className="size-full">
          <SceneBoundary fallback={still}>
            <Suspense fallback={still}>
              <Tindahan3D />
            </Suspense>
          </SceneBoundary>
        </div>
      )}
    </div>
  );
}
