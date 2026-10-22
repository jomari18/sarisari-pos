// The camera barcode scanner (spec 10): the camera turns on only when asked and off on stop.

export type ScannerEngine = "native" | "zxing";
export type Scanner = { stop(): void; engine: ScannerEngine };

/** Retail barcodes: what sari-sari goods and the demo's in-store codes use. */
const FORMATS = ["ean_13", "ean_8", "upc_a"];
const FRAME_MS = 150;

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorClass = new (options: { formats: string[] }) => Detector;

/** Scanning needs a camera, which browsers give only to secure (https or localhost) pages. */
export class NoCameraError extends Error {
  constructor() {
    super("No camera on this page.");
    this.name = "NoCameraError";
  }
}

/**
 * Shows the back camera in `video` and calls `onCode` with each barcode read. Uses the browser's own
 * BarcodeDetector where there is one (Chrome on Android); elsewhere the zxing reader, loaded only now.
 */
export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<Scanner> {
  if (!navigator.mediaDevices?.getUserMedia) throw new NoCameraError();
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
  const stopCamera = () => stream.getTracks().forEach((track) => track.stop());
  try {
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
  } catch {
    // The frames still arrive; the preview starts once the browser allows it.
  }

  const NativeDetector = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (NativeDetector) {
    const detector = new NativeDetector({ formats: FORMATS });
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = async () => {
      if (stopped) return;
      try {
        const [first] = await detector.detect(video);
        if (first && !stopped) onCode(first.rawValue);
      } catch {
        // No frame yet.
      }
      if (!stopped) timer = setTimeout(() => void look(), FRAME_MS);
    };
    void look();
    return {
      engine: "native",
      stop: () => {
        stopped = true;
        clearTimeout(timer);
        stopCamera();
      },
    };
  }

  try {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const controls = await new BrowserMultiFormatReader().decodeFromVideoElement(video, (result) => {
      if (result) onCode(result.getText());
    });
    return {
      engine: "zxing",
      stop: () => {
        controls.stop();
        stopCamera();
      },
    };
  } catch (err) {
    stopCamera();
    throw err;
  }
}

/** What to tell someone whose camera did not start. */
export function cameraProblem(err: unknown): string {
  // getUserMedia rejects with a DOMException, which is not an Error everywhere: read its name directly.
  const name = typeof err === "object" && err !== null && "name" in err ? String(err.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Allow the camera to scan, or type the barcode in the search box.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found. Type the barcode in the search box instead.";
  if (name === "NoCameraError") return "Scanning needs a camera and a secure (https) page. Type the barcode in the search box instead.";
  return "The camera could not start. Type the barcode in the search box instead.";
}
