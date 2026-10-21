const FONT = '22px ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace';
const LINE_HEIGHT = 30;
const PADDING = 28;

/** Draws the receipt's text lines on white, like a printed slip, for sharing as an image (spec 10). */
export async function renderReceiptPng(lines: string[]): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw the receipt image.");
  context.font = FONT;
  canvas.width = Math.ceil(Math.max(...lines.map((line) => context.measureText(line).width))) + PADDING * 2;
  canvas.height = lines.length * LINE_HEIGHT + PADDING * 2;
  // Resizing a canvas resets its drawing state.
  context.font = FONT;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111315";
  context.textBaseline = "top";
  lines.forEach((line, i) => context.fillText(line, PADDING, PADDING + i * LINE_HEIGHT));
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not draw the receipt image."))), "image/png"));
}

/** The phone's share sheet when it can share files, otherwise a download. There is no public receipt link. */
export async function shareReceipt(blob: Blob, fileName: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], fileName, { type: "image/png" });
  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Receipt" });
      return "shared";
    } catch (err) {
      // Closing the share sheet is a choice, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
