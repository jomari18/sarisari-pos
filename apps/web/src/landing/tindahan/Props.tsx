import { useMemo } from "react";
import { ExtrudeGeometry, Shape } from "three";
import { Instances, type Placement, type Vec3 } from "./Instances";

const BLUE = "#2f6fe4";

function Box({ size, position, color, rotation }: { size: Vec3; position: Vec3; color: string; rotation?: Vec3 }) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

/** A soft dark patch on the ground, standing in for a shadow (the scene casts none, to stay light on phones). */
function Shade({ size, position }: { size: [number, number]; position: [number, number] }) {
  return (
    <mesh position={[position[0], 0.045, position[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
    </mesh>
  );
}

/** The long bench (bangko) where the neighbours sit, painted blue. */
function Bench() {
  const legs: Vec3[] = [
    [-0.62, 0.215, -0.12],
    [0.62, 0.215, -0.12],
    [-0.62, 0.215, 0.12],
    [0.62, 0.215, 0.12],
  ];
  return (
    <group position={[-1.3, 0.04, 1.05]}>
      <Box size={[1.5, 0.06, 0.34]} position={[0, 0.43, 0]} color={BLUE} />
      {legs.map((leg) => (
        <Box key={leg.join()} size={[0.06, 0.43, 0.06]} position={leg} color="#2457b8" />
      ))}
      <Box size={[1.3, 0.04, 0.04]} position={[0, 0.14, 0]} color="#2457b8" />
    </group>
  );
}

// Twelve bottles poking out of the top crate, amber and green glass.
const BOTTLES: Placement[] = Array.from({ length: 12 }, (_, i) => ({
  position: [-0.18 + (i % 4) * 0.12, 0.385, -0.12 + Math.floor(i / 4) * 0.12],
  color: i % 3 === 1 ? "#2d5a3d" : "#6b3d14",
}));

/** Two plastic bottle crates, stacked. */
function Crates() {
  return (
    <group position={[1.6, 0.04, 1.0]}>
      <Box size={[0.52, 0.22, 0.38]} position={[0, 0.11, 0]} color="#d6a019" />
      <Box size={[0.52, 0.22, 0.38]} position={[0, 0.33, 0]} color="#e0ad22" rotation={[0, 0.06, 0]} />
      <Instances items={BOTTLES}>
        <cylinderGeometry args={[0.016, 0.034, 0.3, 8]} />
        <meshStandardMaterial roughness={0.15} metalness={0.15} />
      </Instances>
    </group>
  );
}

function Plant() {
  return (
    <group position={[2.6, 0.04, 0.55]}>
      <mesh position={[0, 0.17, 0]}>
        <cylinderGeometry args={[0.17, 0.13, 0.34, 8]} />
        <meshStandardMaterial color="#b4643b" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <icosahedronGeometry args={[0.36, 0]} />
        <meshStandardMaterial color="#3f7f4c" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0.18, 0.86, 0.06]}>
        <icosahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color="#4c9159" roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}

/** A coconut palm: a leaning trunk and drooping fronds. */
function Palm({ position, lean }: { position: Vec3; lean: number }) {
  const fronds = Array.from({ length: 7 }, (_, i) => (i / 7) * Math.PI * 2);
  return (
    <group position={position} rotation={[0, 0, lean]}>
      <mesh position={[0, 2.3, 0]}>
        <cylinderGeometry args={[0.07, 0.12, 4.6, 6]} />
        <meshStandardMaterial color="#5b4636" roughness={0.9} flatShading />
      </mesh>
      {fronds.map((angle) => (
        <group key={angle} position={[0, 4.55, 0]} rotation={[0, angle, 0]}>
          <mesh position={[0, -0.28, 0.8]} rotation={[0.42, 0, 0]}>
            <boxGeometry args={[0.24, 0.02, 1.7]} />
            <meshStandardMaterial color="#2f5e3a" roughness={0.9} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** A neighbour's house far behind, with lit windows. */
function House({ position, size, color }: { position: Vec3; size: Vec3; color: string }) {
  const [width, height, depth] = size;
  const roof = useMemo(() => {
    const outline = new Shape();
    outline.moveTo(-width / 2 - 0.2, 0);
    outline.lineTo(width / 2 + 0.2, 0);
    outline.lineTo(0, 1.1);
    outline.closePath();
    return new ExtrudeGeometry(outline, { depth: depth + 0.3, bevelEnabled: false });
  }, [width, depth]);
  return (
    <group position={position}>
      <Box size={size} position={[0, height / 2, 0]} color={color} />
      <mesh geometry={roof} position={[0, height, -depth / 2 - 0.15]}>
        <meshStandardMaterial color="#3b3550" roughness={0.9} flatShading />
      </mesh>
      {[-width / 4, width / 4].map((x) => (
        <mesh key={x} position={[x, height * 0.55, depth / 2 + 0.01]}>
          <planeGeometry args={[0.6, 0.5]} />
          <meshStandardMaterial color="#ffcf8a" emissive="#ffb85c" emissiveIntensity={1.1} />
        </mesh>
      ))}
    </group>
  );
}

/** The street in front, the bench and crates outside, and the neighbourhood behind. */
export function Props() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[40, 48]} />
        <meshStandardMaterial color="#3d3530" roughness={1} />
      </mesh>
      <Box size={[6.6, 0.04, 2.6]} position={[0, 0.02, 1.25]} color="#6d6863" />
      <Shade size={[1.7, 0.55]} position={[-1.3, 1.05]} />
      <Shade size={[0.7, 0.55]} position={[1.6, 1.0]} />
      <Shade size={[0.55, 0.55]} position={[2.6, 0.55]} />
      <Bench />
      <Crates />
      <Plant />
      <Palm position={[-4.4, 0, -2.6]} lean={0.1} />
      <Palm position={[4.3, 0, -4.4]} lean={-0.07} />
      <House position={[-7.4, 0, -6.8]} size={[4.2, 2.6, 3.6]} color="#4f4a6b" />
      <House position={[6.0, 0, -9.0]} size={[3.6, 2.4, 3.2]} color="#5a4f63" />
    </>
  );
}
