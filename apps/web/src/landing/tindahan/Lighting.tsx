import { CanvasTexture, SRGBColorSpace } from "three";

/** Dusk: deep blue overhead fading to a warm glow at the horizon, drawn once as the scene's background. */
function duskSky(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const sky = context.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#161b3d");
  sky.addColorStop(0.45, "#3a3468");
  sky.addColorStop(0.75, "#9a5a72");
  sky.addColorStop(1, "#e59a76");
  context.fillStyle = sky;
  context.fillRect(0, 0, 4, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const sky = duskSky();

/** The last light of the day from the west, a cool sky, and the warm bulbs of the store. */
export function Lighting() {
  return (
    <>
      <primitive attach="background" object={sky} />
      <fog attach="fog" args={["#4a3d66", 16, 36]} />
      <hemisphereLight args={["#a3a6e8", "#3a2b26", 1.7]} />
      <directionalLight position={[-7, 4.5, 6]} intensity={2.3} color="#ffb184" />
      {/* the bulb inside, its light spilling out through the window */}
      <mesh position={[0, 2.9, -1.1]}>
        <cylinderGeometry args={[0.006, 0.006, 0.4, 4]} />
        <meshBasicMaterial color="#1c1c1c" />
      </mesh>
      <mesh position={[0, 2.66, -1.1]}>
        <sphereGeometry args={[0.075, 12, 8]} />
        <meshBasicMaterial color="#fff2cc" />
      </mesh>
      <pointLight position={[0, 2.6, -1.1]} intensity={10} distance={8} decay={2} color="#ffbe6e" />
      {/* a street lamp across the road, out of the picture, on the front of the store */}
      <pointLight position={[0.8, 3.6, 3.2]} intensity={7} distance={9} decay={2} color="#ffd59a" />
    </>
  );
}
