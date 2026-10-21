import type { SaleView } from "@sari/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReceiptView } from "../src/features/receipt/ReceiptView";
import { shareReceipt } from "../src/features/receipt/receiptPng";

vi.mock("../src/features/receipt/receiptPng", async (original) => ({
  ...(await original<typeof import("../src/features/receipt/receiptPng")>()),
  // jsdom has no canvas; the drawing itself is checked in the browser.
  renderReceiptPng: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
}));

const sale: SaleView = {
  id: "a1b2c3d4-0000-4000-8000-000000000001",
  receiptNo: 1,
  soldAt: "2026-10-21T07:15:00.000Z",
  method: "CASH",
  totalCentavos: 2400,
  tenderedCentavos: 5000,
  changeCentavos: 2600,
  gcashRef: null,
  customer: null,
  cashier: { id: "u2", displayName: "Nena" },
  lines: [{ productId: "p-kape", name: "Kape 3-in-1", quantity: 2, unitPriceCentavos: 1200, lineTotalCentavos: 2400 }],
  flags: [],
  voidedAt: null,
  voidReason: null,
};

let clicked: HTMLAnchorElement[];
beforeEach(() => {
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:receipt"), configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
});
afterEach(() => vi.restoreAllMocks());

describe("ReceiptView (spec 10)", () => {
  it("shows the receipt number for an online sale", () => {
    render(<ReceiptView sale={sale} storeName="Tindahan ni Mang Ben" queued={false} onNewSale={() => {}} />);
    expect(screen.getByText(/No\. 0001/)).toBeInTheDocument();
    expect(screen.getByText(/Tindahan ni Mang Ben/)).toBeInTheDocument();
    expect(screen.queryByText("Pending sync")).not.toBeInTheDocument();
  });

  it("says Pending sync for a sale still in the offline queue", () => {
    render(<ReceiptView sale={{ ...sale, receiptNo: null, pending: true }} storeName="Tindahan ni Mang Ben" queued onNewSale={() => {}} />);
    expect(screen.getByText("Pending sync")).toBeInTheDocument();
    expect(screen.getByText(/PENDING SYNC A1B2C3/)).toBeInTheDocument();
  });

  it("prints with the browser's print dialog", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<ReceiptView sale={sale} storeName="Tindahan ni Mang Ben" queued={false} onNewSale={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("saves the receipt image when sharing is not available", async () => {
    render(<ReceiptView sale={sale} storeName="Tindahan ni Mang Ben" queued={false} onNewSale={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByText("Receipt image saved.")).toBeInTheDocument();
    expect(clicked[0]?.download).toBe("receipt-0001.png");
  });
});

describe("shareReceipt", () => {
  it("uses the share sheet when the device can share files", async () => {
    const share = vi.fn(async () => {});
    Object.assign(navigator, { share, canShare: () => true });
    await expect(shareReceipt(new Blob(["png"], { type: "image/png" }), "receipt-0001.png")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.any(File)] }));
    Object.assign(navigator, { share: undefined, canShare: undefined });
  });

  it("falls back to a download without navigator.share", async () => {
    await expect(shareReceipt(new Blob(["png"], { type: "image/png" }), "receipt-0001.png")).resolves.toBe("downloaded");
    expect(clicked[0]?.download).toBe("receipt-0001.png");
  });
});
