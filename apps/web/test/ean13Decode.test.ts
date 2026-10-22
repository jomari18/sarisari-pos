// @vitest-environment node
import { demoBarcodes, ean13Modules } from "@sari/shared";
import { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from "@zxing/library";
import { describe, expect, it } from "vitest";

/** Draws the modules the way Ean13Svg does (quiet zones, black bars on white) and reads them with zxing. */
function decode(modules: string): string {
  const quiet = 12;
  const scale = 3;
  const height = 40;
  const row = [..."0".repeat(quiet) + modules + "0".repeat(quiet)].flatMap((module) => Array<number>(scale).fill(module === "1" ? 0 : 255));
  const pixels = new Uint8ClampedArray(row.length * height);
  for (let y = 0; y < height; y++) pixels.set(row, y * row.length);
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, row.length, height)));
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]]]);
  return new MultiFormatReader().decode(bitmap, hints).getText();
}

describe("sample barcodes", () => {
  it("every one reads back as its own digits with the same zxing reader the scanner falls back to", () => {
    for (const { barcode } of demoBarcodes()) expect(decode(ean13Modules(barcode))).toBe(barcode);
  });
});
