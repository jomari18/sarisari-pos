import { act, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TindahanStage } from "../src/landing/TindahanStage";
import { useScenePaused } from "../src/landing/tindahan/useScenePaused";
import { scrollProgress } from "../src/landing/tindahan/useScrollProgress";

const STILL = "Illustration of a sari-sari store at dusk";
const REDUCE = "(prefers-reduced-motion: reduce)";

// The scene is a lazily loaded chunk (three.js); the stand-in records whether the page asked for it.
const chunk = vi.hoisted(() => ({ imported: false, fail: false, renders: 0 }));
vi.mock("../src/landing/tindahan/Tindahan3D", () => {
  chunk.imported = true;
  return {
    Tindahan3D: () => {
      chunk.renders++;
      if (chunk.fail) throw new Error("Error creating WebGL context.");
      return <canvas data-testid="scene" />;
    },
  };
});

/** The visitor's motion setting, which they can change while the page is open. */
function motionSetting(reduce: boolean) {
  const listeners = new Set<() => void>();
  const setting = { reduce };
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === REDUCE && setting.reduce;
    },
    media: query,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  return (next: boolean) => {
    setting.reduce = next;
    act(() => listeners.forEach((listener) => listener()));
  };
}

/** The visitor's first sign of life on the page: the scene waits for one, so it never slows the page's start. */
const visitorMoves = (event = "pointermove") => act(() => void window.dispatchEvent(new Event(event)));

function webgl(available: boolean) {
  const context = { getExtension: () => ({ loseContext: () => {} }) };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((kind: string) => (available && kind.startsWith("webgl") ? context : null)) as never);
}

afterEach(() => {
  chunk.imported = false;
  chunk.fail = false;
  chunk.renders = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the tindahan on the landing page (spec 11.4)", () => {
  it("shows the still picture, and never loads the 3D scene, when the visitor prefers reduced motion", async () => {
    motionSetting(true);
    webgl(true);
    render(<TindahanStage />);
    expect(await screen.findByRole("img", { name: STILL })).toHaveAttribute("src", "/tindahan-still.webp");
    expect(screen.queryByTestId("tindahan-canvas")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(chunk.imported).toBe(false);
  });

  it("shows the still picture, and never loads the 3D scene, without WebGL", async () => {
    motionSetting(false);
    webgl(false);
    render(<TindahanStage />);
    expect(await screen.findByRole("img", { name: STILL })).toHaveAttribute("src", "/tindahan-still.webp");
    expect(screen.queryByTestId("tindahan-canvas")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(chunk.imported).toBe(false);
  });

  it("waits for the visitor to move before loading the 3D scene, showing the still until then", async () => {
    motionSetting(false);
    webgl(true);
    render(<TindahanStage />);
    expect(screen.getByRole("img", { name: STILL })).toHaveAttribute("src", "/tindahan-still.webp");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(chunk.imported).toBe(false);

    visitorMoves();
    const stage = screen.getByTestId("tindahan-canvas");
    expect(within(stage).getByRole("img", { name: STILL })).toBeInTheDocument();
    expect(await within(stage).findByTestId("scene")).toBeInTheDocument();
    expect(chunk.imported).toBe(true);
    expect(within(stage).queryByRole("img", { name: STILL })).not.toBeInTheDocument();
  });

  it.each(["scroll", "touchstart", "keydown", "pointerdown", "wheel"])("starts the scene on a %s too", async (event) => {
    motionSetting(false);
    webgl(true);
    render(<TindahanStage />);
    visitorMoves(event);
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
  });

  it("swaps the scene for the still as soon as the visitor turns on reduced motion", async () => {
    const setReduce = motionSetting(false);
    webgl(true);
    render(<TindahanStage />);
    visitorMoves();
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    setReduce(true);
    expect(screen.queryByTestId("scene")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: STILL })).toBeInTheDocument();
  });

  it("falls back to the still when the scene cannot start, and the page carries on", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    chunk.fail = true;
    motionSetting(false);
    webgl(true);
    render(<TindahanStage />);
    visitorMoves();
    const stage = screen.getByTestId("tindahan-canvas");
    await vi.waitFor(() => expect(chunk.renders).toBeGreaterThan(0));
    expect(await within(stage).findByRole("img", { name: STILL })).toBeInTheDocument();
    expect(screen.queryByTestId("scene")).not.toBeInTheDocument();
  });
});

describe("the scroll-driven move toward the window", () => {
  // A 300 px stage in an 800 px window, measured after scrolling the page down by `scrolled` px.
  it("holds still until the stage's middle passes the middle of the screen, and arrives as the stage leaves the top", () => {
    // On a phone the stage starts below the hero, its middle 650 px down.
    const phone = (scrolled: number) => scrollProgress({ top: 500 - scrolled, height: 300 }, 800, scrolled);
    expect(phone(0)).toBe(0);
    expect(phone(250)).toBe(0);
    expect(phone(525)).toBeCloseTo(0.5);
    expect(phone(800)).toBe(1);
    expect(phone(1400)).toBe(1);
  });

  it("starts from rest at the top of the page when the stage already sits above the middle", () => {
    // On a wide screen the stage is in the hero, its middle 250 px down: the first scroll starts the move.
    const wide = (scrolled: number) => scrollProgress({ top: 100 - scrolled, height: 300 }, 800, scrolled);
    expect(wide(0)).toBe(0);
    expect(wide(200)).toBeCloseTo(0.5);
    expect(wide(400)).toBe(1);
  });
});

describe("pausing the scene", () => {
  function setHidden(hidden: boolean) {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
  }
  afterEach(() => {
    delete (document as { hidden?: boolean }).hidden;
  });

  it("pauses while the tab is hidden and resumes when it is shown", () => {
    const stage = { current: document.createElement("div") };
    const { result } = renderHook(() => useScenePaused(stage));
    expect(result.current).toBe(false);
    setHidden(true);
    expect(result.current).toBe(true);
    setHidden(false);
    expect(result.current).toBe(false);
  });

  it("pauses while the stage is scrolled out of view", () => {
    let report: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof report) {
          report = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const stage = { current: document.createElement("div") };
    const { result } = renderHook(() => useScenePaused(stage));
    act(() => report([{ isIntersecting: false }]));
    expect(result.current).toBe(true);
    act(() => report([{ isIntersecting: true }]));
    expect(result.current).toBe(false);
  });
});
