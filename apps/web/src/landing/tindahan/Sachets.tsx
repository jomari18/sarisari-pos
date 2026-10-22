import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { Instances, type Placement } from "./Instances";

// Strips of sachets (coffee, shampoo, seasoning…) in generic colours, no real brands, along the top of the window.
const STRIPS = [
  { x: -1.14, colors: ["#b3362c", "#cf4a3c"] },
  { x: -0.86, colors: ["#f2b705", "#f7cb45"] },
  { x: 0.86, colors: ["#2f8f5b", "#41a96f"] },
  { x: 1.14, colors: ["#7a3fa3", "#9558bb"] },
];
const PER_STRIP = 7;
const WIRE = { y: 2.16, z: 0.07 };

function sachetsOf(colors: string[]): Placement[] {
  return Array.from({ length: PER_STRIP }, (_, i) => ({
    position: [0, -0.1 - i * 0.125, 0],
    rotation: [0, i % 2 ? 0.18 : -0.12, i % 2 ? 0.06 : -0.05],
    color: colors[i % 2]!,
  }));
}
const STRIP_SACHETS = STRIPS.map((strip) => sachetsOf(strip.colors));

/** One strip, swaying a little in the evening breeze. */
function Strip({ x, sachets, phase }: { x: number; sachets: Placement[]; phase: number }) {
  const swing = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (swing.current) swing.current.rotation.z = Math.sin(clock.elapsedTime * 1.1 + phase) * 0.035;
  });
  return (
    <group ref={swing} position={[x, WIRE.y, WIRE.z]}>
      <mesh position={[0, -0.47, -0.008]}>
        <boxGeometry args={[0.008, 0.94, 0.004]} />
        <meshStandardMaterial color="#e8e2d0" />
      </mesh>
      <Instances items={sachets}>
        <boxGeometry args={[0.15, 0.115, 0.012]} />
        <meshStandardMaterial roughness={0.45} metalness={0.25} />
      </Instances>
    </group>
  );
}

export function Sachets() {
  return (
    <>
      <mesh position={[0, WIRE.y, WIRE.z]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.006, 0.006, 2.7, 6]} />
        <meshStandardMaterial color="#3d3d3d" />
      </mesh>
      {STRIPS.map((strip, i) => (
        <Strip key={strip.x} x={strip.x} sachets={STRIP_SACHETS[i]!} phase={i * 1.7} />
      ))}
    </>
  );
}
