import { useMemo } from "react";
import { CanvasTexture, DoubleSide, ExtrudeGeometry, PlaneGeometry, RepeatWrapping, SRGBColorSpace, Shape } from "three";
import { Instances, type Placement, type Vec3 } from "./Instances";

// The store: 4.4 m wide and 3.2 m deep, its front at z = 0, on a slab whose top is the floor.
const FLOOR = 0.2;
const DEPTH = 3.2;
const WALL = 0.12;
const FRONT_TOP = 3.12;
const BACK_TOP = 3.52;
// The wide front window, barred, with a small serving opening over the middle of the counter.
const WINDOW = { half: 1.35, bottom: 1.0, top: 2.2 };
const OPENING = { half: 0.27, top: 1.38 };
// A single-slope corrugated roof, low at the front, overhanging on every side.
const ROOF = { width: 4.9, front: { y: 3.05, z: 0.75 }, back: { y: 3.56, z: -3.45 } };

const BLUE = "#2f6fe4";
const IRON = "#2b3338";
const PLANK_COLORS = ["#8a5a36", "#7a4d2d", "#946640", "#6e4428"];

/** Vertical planks, four to a texture; walls repeat it once a metre so every plank is about 25 cm wide. */
function plankTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  PLANK_COLORS.forEach((color, plank) => {
    const left = plank * 64;
    context.fillStyle = color;
    context.fillRect(left, 0, 64, 256);
    context.strokeStyle = "rgba(48, 26, 12, 0.28)";
    context.lineWidth = 1.5;
    for (let line = 0; line < 4; line++) {
      const x = left + 9 + line * 14 + ((plank * 5) % 6);
      context.beginPath();
      context.moveTo(x, 0);
      context.bezierCurveTo(x + 5, 85, x - 5, 170, x, 256);
      context.stroke();
    }
    context.fillStyle = "#3a2312";
    context.fillRect(left, 0, 3, 256);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** The painted sign, in the style of the classic "Sari-Sari Store" board, with our name on it. */
function drawSign(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const board = context.createLinearGradient(0, 0, 0, height);
  board.addColorStop(0, BLUE);
  board.addColorStop(1, "#1d4ed8");
  context.fillStyle = board;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#f8fafc";
  context.lineWidth = 5;
  context.strokeRect(12, 12, width - 24, height - 24);
  context.textAlign = "center";
  context.fillStyle = "#ffffff";
  context.font = "600 76px Poppins, sans-serif";
  context.fillText("ZariZari", width / 2, 88);
  context.fillStyle = "#fde68a";
  context.font = "600 22px Poppins, sans-serif";
  context.letterSpacing = "10px";
  context.fillText("SARI-SARI STORE", width / 2, 126);
  context.letterSpacing = "0px";
}

function signTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 152;
  drawSign(canvas);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  // Poppins may still be on its way; paint the sign again once it is here.
  document.fonts?.load("600 76px Poppins").then(
    () => {
      drawSign(canvas);
      texture.needsUpdate = true;
    },
    () => {},
  );
  return texture;
}

/** Corrugated iron: a sheet rippled every 15 cm, faceted for the low-poly look. */
function corrugatedRoof(): PlaneGeometry {
  const length = Math.hypot(ROOF.front.z - ROOF.back.z, ROOF.back.y - ROOF.front.y);
  const sheet = new PlaneGeometry(ROOF.width, length, 196, 1);
  const position = sheet.attributes.position!;
  for (let i = 0; i < position.count; i++) position.setZ(i, Math.sin((position.getX(i) / 0.15) * Math.PI * 2) * 0.03);
  sheet.computeVertexNormals();
  return sheet;
}

function sideWall(): ExtrudeGeometry {
  const outline = new Shape();
  outline.moveTo(0, FLOOR);
  outline.lineTo(DEPTH, FLOOR);
  outline.lineTo(DEPTH, BACK_TOP);
  outline.lineTo(0, FRONT_TOP);
  outline.closePath();
  return new ExtrudeGeometry(outline, { depth: WALL, bevelEnabled: false });
}

const planks = plankTexture();
const sign = signTexture();
const roof = corrugatedRoof();
const side = sideWall();
const roofSlope = Math.atan2(ROOF.back.y - ROOF.front.y, ROOF.front.z - ROOF.back.z);

// Goods on the three shelves along the back wall: cans, boxes and bottles in no particular brand's colours.
const SHELVES = [1.2, 1.7, 2.2];
const GOODS_COLORS = ["#e63946", "#f4a261", "#2a9d8f", "#e9c46a", "#457b9d", "#f1faee", "#ef476f", "#06d6a0", "#ffd166", "#118ab2"];
const KINDS = ["can", "can", "box", "bottle", "box"] as const;
const HEIGHT = { can: 0.15, box: 0.21, bottle: 0.26 };
const goods = { can: [] as Placement[], box: [] as Placement[], bottle: [] as Placement[] };
SHELVES.forEach((shelf, row) => {
  for (let i = 0; i < 20; i++) {
    const kind = KINDS[(i + row * 2) % KINDS.length]!;
    goods[kind].push({
      position: [-1.76 + i * 0.185, shelf + 0.025 + HEIGHT[kind] / 2, -2.86 + ((i * 7 + row) % 5) * 0.02],
      rotation: [0, ((i * 13) % 7) * 0.15, 0],
      color: GOODS_COLORS[(i * 7 + row * 3) % GOODS_COLORS.length]!,
    });
  }
});

// The candy jars (garapon) on the inside counter, clear of the serving opening.
const JARS = [
  { x: -1.0, candy: "#ef476f", lid: "#d62828" },
  { x: -0.62, candy: "#ffd166", lid: BLUE },
  { x: 0.62, candy: "#06d6a0", lid: "#d62828" },
  { x: 1.0, candy: "#f78c6b", lid: BLUE },
];

const BAR_XS = Array.from({ length: 15 }, (_, i) => -1.26 + i * 0.18);

/** Wood planks sized to the surface they cover. */
function Wood({ u, v }: { u: number; v: number }) {
  const map = useMemo(() => {
    const texture = planks.clone();
    texture.repeat.set(u, v);
    texture.needsUpdate = true;
    return texture;
  }, [u, v]);
  return <meshStandardMaterial map={map} roughness={0.9} />;
}

function Boards({ size, position }: { size: Vec3; position: Vec3 }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <Wood u={Math.max(size[0], size[2])} v={size[1]} />
    </mesh>
  );
}

function Block({ size, position, color, metal = false }: { size: Vec3; position: Vec3; color: string; metal?: boolean }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={metal ? 0.45 : 0.75} metalness={metal ? 0.6 : 0} />
    </mesh>
  );
}

function Bars() {
  return (
    <>
      {BAR_XS.map((x) => {
        const bottom = Math.abs(x) < OPENING.half ? OPENING.top : WINDOW.bottom;
        return (
          <mesh key={x} position={[x, (bottom + WINDOW.top) / 2, -0.03]}>
            <cylinderGeometry args={[0.016, 0.016, WINDOW.top - bottom, 6]} />
            <meshStandardMaterial color={IRON} roughness={0.45} metalness={0.6} />
          </mesh>
        );
      })}
      <Block size={[0.72, 0.03, 0.03]} position={[0, OPENING.top, -0.03]} color={IRON} metal />
      <Block size={[2.7, 0.03, 0.025]} position={[0, 1.82, -0.03]} color={IRON} metal />
    </>
  );
}

function Jars() {
  return (
    <>
      {JARS.map(({ x, candy, lid }) => (
        <group key={x} position={[x, WINDOW.bottom, -0.38]}>
          <mesh position={[0, 0.065, 0]}>
            <cylinderGeometry args={[0.085, 0.085, 0.13, 10]} />
            <meshStandardMaterial color={candy} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.24, 12]} />
            <meshStandardMaterial color="#dbeeff" transparent opacity={0.28} roughness={0.1} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0.2625, 0]}>
            <cylinderGeometry args={[0.078, 0.078, 0.045, 12]} />
            <meshStandardMaterial color={lid} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Shelves() {
  return (
    <>
      {SHELVES.map((y) => (
        <Block key={y} size={[3.9, 0.05, 0.4]} position={[0, y, -2.88]} color="#5e3b22" />
      ))}
      <Instances items={goods.can}>
        <cylinderGeometry args={[0.062, 0.062, HEIGHT.can, 10]} />
        <meshStandardMaterial roughness={0.35} metalness={0.4} />
      </Instances>
      <Instances items={goods.box}>
        <boxGeometry args={[0.13, HEIGHT.box, 0.1]} />
        <meshStandardMaterial roughness={0.7} />
      </Instances>
      <Instances items={goods.bottle}>
        <cylinderGeometry args={[0.022, 0.042, HEIGHT.bottle, 8]} />
        <meshStandardMaterial roughness={0.2} metalness={0.1} />
      </Instances>
    </>
  );
}

/** Walls, roof, the barred window with its counter and candy jars, the shelves inside, the door and the sign. */
export function StoreBuilding() {
  return (
    <group>
      <Block size={[4.8, FLOOR, 3.7]} position={[0, FLOOR / 2, -1.55]} color="#8a8580" />

      {/* front wall around the window */}
      <Boards size={[0.85, FRONT_TOP - FLOOR, WALL]} position={[-1.775, (FLOOR + FRONT_TOP) / 2, -WALL / 2]} />
      <Boards size={[0.85, FRONT_TOP - FLOOR, WALL]} position={[1.775, (FLOOR + FRONT_TOP) / 2, -WALL / 2]} />
      <Boards size={[2.7, WINDOW.bottom - FLOOR, WALL]} position={[0, (FLOOR + WINDOW.bottom) / 2, -WALL / 2]} />
      <Boards size={[2.7, FRONT_TOP - WINDOW.top, WALL]} position={[0, (WINDOW.top + FRONT_TOP) / 2, -WALL / 2]} />
      {/* back and side walls */}
      <Boards size={[4.4, BACK_TOP - FLOOR, WALL]} position={[0, (FLOOR + BACK_TOP) / 2, -DEPTH + WALL / 2]} />
      <mesh geometry={side} position={[-2.2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <Wood u={1} v={1} />
      </mesh>
      <mesh geometry={side} position={[2.2 - WALL, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <Wood u={1} v={1} />
      </mesh>

      <mesh
        geometry={roof}
        position={[0, (ROOF.front.y + ROOF.back.y) / 2, (ROOF.front.z + ROOF.back.z) / 2]}
        rotation={[-Math.PI / 2 + roofSlope, 0, 0]}
      >
        <meshStandardMaterial color="#9aa5ae" metalness={0.55} roughness={0.45} flatShading side={DoubleSide} />
      </mesh>
      <Block size={[ROOF.width, 0.1, 0.05]} position={[0, ROOF.front.y - 0.03, ROOF.front.z + 0.02]} color="#4b301c" />

      {/* the window: blue trim, iron bars, the counter outside and inside */}
      <Block size={[2.86, 0.09, 0.05]} position={[0, WINDOW.top + 0.045, 0.02]} color={BLUE} />
      <Block size={[0.09, 1.29, 0.05]} position={[-WINDOW.half - 0.045, 1.6, 0.02]} color={BLUE} />
      <Block size={[0.09, 1.29, 0.05]} position={[WINDOW.half + 0.045, 1.6, 0.02]} color={BLUE} />
      <Bars />
      <Block size={[3.0, 0.07, 0.44]} position={[0, WINDOW.bottom - 0.015, 0.17]} color="#5b3920" />
      <Block size={[2.7, 0.06, 0.55]} position={[0, WINDOW.bottom - 0.03, -0.42]} color="#6b4428" />
      <Jars />
      <Shelves />

      {/* the side door, in a blue frame */}
      <Block size={[0.03, 2.13, 1.07]} position={[2.215, FLOOR + 1.04, -2.05]} color={BLUE} />
      <Block size={[0.04, 2.05, 0.95]} position={[2.225, FLOOR + 1.025, -2.05]} color="#4a2c18" />
      <mesh position={[2.255, 1.2, -1.67]}>
        <sphereGeometry args={[0.03, 8, 6]} />
        <meshStandardMaterial color="#d4a72c" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* the sign over the window */}
      <Block size={[3.76, 0.66, 0.07]} position={[0, 2.66, 0.04]} color="#1e3a8a" />
      <mesh position={[0, 2.66, 0.0755]}>
        <planeGeometry args={[3.64, 0.54]} />
        <meshStandardMaterial map={sign} emissiveMap={sign} emissive="#ffffff" emissiveIntensity={0.5} roughness={0.6} />
      </mesh>
    </group>
  );
}
