import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Color, Object3D, type InstancedMesh } from "three";

export type Vec3 = [number, number, number];
export type Placement = { position: Vec3; rotation?: Vec3; color: string };

/** Many copies of one shape in one draw call (sachets, goods on the shelves, bottles), each with its own colour. */
export function Instances({ items, children }: { items: readonly Placement[]; children: ReactNode }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const place = new Object3D();
    items.forEach((item, index) => {
      place.position.set(...item.position);
      place.rotation.set(...(item.rotation ?? [0, 0, 0]));
      place.updateMatrix();
      target.setMatrixAt(index, place.matrix);
      target.setColorAt(index, new Color(item.color));
    });
    target.instanceMatrix.needsUpdate = true;
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, items.length]} frustumCulled={false}>
      {children}
    </instancedMesh>
  );
}
