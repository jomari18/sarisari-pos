import { demoBarcodes, ean13Modules } from "@sari/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../src/app/router";
import { clearSession, setSession } from "../src/auth/session";
import { startScanner } from "../src/features/scanner/scanner";
import { catalog } from "./support/catalog";
import { bantay, json, owner, store } from "./support/fetch";
import { serveRoutes } from "./support/serve";

/** Kape 3-in-1 in the test catalog. */
const KAPE = "2000000000015";
const UNKNOWN = "4800000000017";

// A stand-in for @zxing/browser that records when it is imported and lets a test hand it a reading.
const zxing = vi.hoisted(() => ({ imported: false, read: null as ((text: string) => void) | null, stop: (() => {}) as () => void }));
vi.mock("@zxing/browser", () => {
  zxing.imported = true;
  return {
    BrowserMultiFormatReader: class {
      async decodeFromVideoElement(_video: HTMLVideoElement, callback: (result: { getText(): string } | undefined) => void) {
        zxing.read = (text) => callback({ getText: () => text });
        return { stop: () => zxing.stop() };
      }
    },
  };
});

/** A camera with two tracks whose stop() can be checked. */
function fakeCamera() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  const getUserMedia = vi.fn(async () => ({ getTracks: () => tracks }) as unknown as MediaStream);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  return { tracks, getUserMedia };
}

/** The browser's own barcode reader, reading `code` from the first frame (or nothing, when null). */
function fakeDetector(code: string | null) {
  const created: { formats: string[] }[] = [];
  vi.stubGlobal(
    "BarcodeDetector",
    class {
      constructor(options: { formats: string[] }) {
        created.push(options);
      }
      async detect() {
        return code ? [{ rawValue: code }] : [];
      }
    },
  );
  return created;
}

const signIn = (user: typeof owner | typeof bantay) => setSession({ accessToken: "t1", user, store });

function openAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  zxing.imported = false;
  zxing.read = null;
});
afterEach(() => {
  clearSession();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("startScanner", () => {
  it("uses the browser's BarcodeDetector for EAN-13, EAN-8 and UPC-A when there is one", async () => {
    const camera = fakeCamera();
    const created = fakeDetector(KAPE);
    const onCode = vi.fn();
    const scanner = await startScanner(document.createElement("video"), onCode);
    expect(scanner.engine).toBe("native");
    expect(created[0]!.formats).toEqual(["ean_13", "ean_8", "upc_a"]);
    await vi.waitFor(() => expect(onCode).toHaveBeenCalledWith(KAPE));
    scanner.stop();
    expect(camera.tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(true);
    expect(zxing.imported).toBe(false);
  });

  it("falls back to the zxing reader, loaded only then", async () => {
    fakeCamera();
    const onCode = vi.fn();
    expect(zxing.imported).toBe(false);
    const scanner = await startScanner(document.createElement("video"), onCode);
    expect(scanner.engine).toBe("zxing");
    expect(zxing.imported).toBe(true);
    zxing.read!(KAPE);
    expect(onCode).toHaveBeenCalledWith(KAPE);
    scanner.stop();
  });
});

describe("scanning at the POS (spec 10)", () => {
  it("adds a scanned product to the sale and closes the camera", async () => {
    signIn(bantay);
    serveRoutes({ "GET /api/catalog": () => json(200, catalog) });
    const camera = fakeCamera();
    fakeDetector(KAPE);
    openAt("/app/pos");
    await userEvent.click(await screen.findByRole("button", { name: "Scan a barcode" }));
    await vi.waitFor(() => expect(within(screen.getByRole("region", { name: "Current sale" })).getByText("Kape 3-in-1")).toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: "Scan a barcode" })).not.toBeInTheDocument();
    await vi.waitFor(() => expect(camera.tracks.every((track) => track.stop.mock.calls.length > 0)).toBe(true));
  });

  it("loads the zxing reader only when the scanner opens, on a browser without BarcodeDetector", async () => {
    signIn(bantay);
    serveRoutes({ "GET /api/catalog": () => json(200, catalog) });
    fakeCamera();
    openAt("/app/pos");
    const scan = await screen.findByRole("button", { name: "Scan a barcode" });
    expect(zxing.imported).toBe(false);
    await userEvent.click(scan);
    await vi.waitFor(() => expect(zxing.read).not.toBeNull());
    zxing.read!(KAPE);
    await vi.waitFor(() => expect(within(screen.getByRole("region", { name: "Current sale" })).getByText("Kape 3-in-1")).toBeInTheDocument());
  });

  it("stops every camera track when the scanner is closed", async () => {
    signIn(bantay);
    serveRoutes({ "GET /api/catalog": () => json(200, catalog) });
    const camera = fakeCamera();
    fakeDetector(null);
    openAt("/app/pos");
    await userEvent.click(await screen.findByRole("button", { name: "Scan a barcode" }));
    const dialog = await screen.findByRole("dialog", { name: "Scan a barcode" });
    await vi.waitFor(() => expect(camera.getUserMedia).toHaveBeenCalled());
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await vi.waitFor(() => expect(camera.tracks.every((track) => track.stop.mock.calls.length > 0)).toBe(true));
  });

  it("explains a refused camera and points to typing the code", async () => {
    signIn(bantay);
    serveRoutes({ "GET /api/catalog": () => json(200, catalog) });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => Promise.reject(new DOMException("denied", "NotAllowedError"))) },
    });
    openAt("/app/pos");
    await userEvent.click(await screen.findByRole("button", { name: "Scan a barcode" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Allow the camera to scan, or type the barcode in the search box.");
  });

  it("offers the owner to add an unknown barcode as a product, with the barcode filled in", async () => {
    signIn(owner);
    serveRoutes({ "GET /api/catalog": () => json(200, catalog), "GET /api/categories": () => json(200, catalog.categories) });
    fakeCamera();
    fakeDetector(UNKNOWN);
    const router = openAt("/app/pos");
    await userEvent.click(await screen.findByRole("button", { name: "Scan a barcode" }));
    const sheet = await screen.findByRole("dialog", { name: "Not in your products" });
    expect(within(sheet).queryByRole("button", { name: "Sell as custom item" })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("link", { name: "Add product" }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/app/products/new"));
    expect(await screen.findByLabelText("Barcode")).toHaveValue(UNKNOWN);
  });

  it("offers the bantay to sell an unknown barcode as a custom item", async () => {
    signIn(bantay);
    serveRoutes({ "GET /api/catalog": () => json(200, catalog) });
    fakeCamera();
    fakeDetector(UNKNOWN);
    openAt("/app/pos");
    await userEvent.click(await screen.findByRole("button", { name: "Scan a barcode" }));
    const sheet = await screen.findByRole("dialog", { name: "Not in your products" });
    expect(within(sheet).queryByRole("link", { name: "Add product" })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Sell as custom item" }));
    expect(await screen.findByRole("dialog", { name: "Custom item" })).toBeInTheDocument();
  });
});

describe("Sample barcodes page (spec 10)", () => {
  it("shows every demo barcode as a 95-module EAN-13 with its digits", async () => {
    openAt("/barcodes");
    const codes = demoBarcodes();
    const images = await screen.findAllByRole("img", { name: /^Barcode \d{13}$/ });
    expect(images).toHaveLength(codes.length);

    const [first] = images;
    const modules = ean13Modules(codes[0]!.barcode);
    expect(modules).toHaveLength(95);
    const bars = [...first!.querySelectorAll("rect[data-module]")].map((bar) => Number(bar.getAttribute("data-module")));
    expect(bars).toEqual([...modules].flatMap((module, i) => (module === "1" ? [i] : [])));
    expect(first!.textContent).toBe(codes[0]!.barcode);
    expect(screen.getByText(codes[0]!.name)).toBeInTheDocument();
  });
});
