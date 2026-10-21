import type { SaleInput, SaleView } from "@sari/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import type { CartLine } from "../src/features/pos/cart";
import { PaymentDialog } from "../src/features/pos/PaymentDialog";
import { buildSaleInput, type SaleSubmitter } from "../src/features/pos/submitSale";
import { catalog } from "./support/catalog";

const LIMIT_MESSAGE = "This suki has reached their utang limit. Ask for cash or ask the owner to raise the limit.";
const kape = (quantity: number): CartLine => ({ key: "p-kape", productId: "p-kape", name: "Kape 3-in-1", unitPriceCentavos: 1200, quantity, stock: 40 });
const yelo: CartLine = { key: "k1", productId: null, name: "Yelo", unitPriceCentavos: 500, quantity: 1, stock: null };

const recorded = (sale: SaleInput): SaleView => ({
  id: sale.id,
  receiptNo: 1,
  soldAt: sale.soldAt,
  method: sale.payment.method,
  totalCentavos: sale.totalCentavos,
  tenderedCentavos: null,
  changeCentavos: null,
  gcashRef: null,
  customer: null,
  cashier: { id: "u2", displayName: "Nena" },
  lines: [],
  flags: [],
  voidedAt: null,
  voidReason: null,
});

function open(lines: CartLine[], submit: SaleSubmitter = vi.fn(async (sale: SaleInput) => ({ sale: recorded(sale), queued: false }))) {
  const onDone = vi.fn();
  render(<PaymentDialog saleId="5b2f8c1e-0000-4000-8000-000000000001" lines={lines} customers={catalog.customers} submit={submit} onDone={onDone} onClose={() => {}} />);
  return { submit, onDone, dialog: screen.getByRole("dialog", { name: "Payment" }) };
}
const complete = () => screen.getByRole("button", { name: "Complete sale" });

afterEach(() => vi.restoreAllMocks());

describe("buildSaleInput", () => {
  it("turns the cart into the API's sale body, custom items included", () => {
    const sale = buildSaleInput("id-1", [kape(2), yelo], { method: "CASH", tenderedCentavos: 5000 }, new Date("2026-10-21T07:15:00.000Z"));
    expect(sale).toEqual({
      id: "id-1",
      soldAt: "2026-10-21T07:15:00.000Z",
      items: [
        { productId: "p-kape", quantity: 2, unitPriceCentavos: 1200 },
        { custom: { name: "Yelo", unitPriceCentavos: 500 }, quantity: 1 },
      ],
      totalCentavos: 2900,
      payment: { method: "CASH", tenderedCentavos: 5000 },
    });
  });
});

describe("cash (spec 10)", () => {
  it("sets the cash received from the quick amounts and shows the sukli", async () => {
    open([kape(2)]);
    await userEvent.click(screen.getByRole("button", { name: "₱50" }));
    expect(screen.getByLabelText("Cash received")).toHaveValue("50.00");
    expect(screen.getByTestId("sukli")).toHaveTextContent("₱26.00");
    await userEvent.click(screen.getByRole("button", { name: "Exact" }));
    expect(screen.getByTestId("sukli")).toHaveTextContent("₱0.00");
    for (const amount of ["₱20", "₱100", "₱500", "₱1,000"]) expect(screen.getByRole("button", { name: amount })).toBeInTheDocument();
  });

  it("keeps Complete sale disabled while the cash is less than the total", async () => {
    open([kape(2)]);
    expect(complete()).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "₱20" }));
    expect(complete()).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Cash received"));
    await userEvent.type(screen.getByLabelText("Cash received"), "24");
    expect(complete()).toBeEnabled();
  });
});

describe("GCash and utang", () => {
  it("sends GCash with an optional reference", async () => {
    const { submit } = open([kape(1)]);
    await userEvent.click(screen.getByRole("radio", { name: "GCash" }));
    await userEvent.type(screen.getByLabelText("GCash reference (optional)"), "1000000000001");
    await userEvent.click(complete());
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ payment: { method: "GCASH", gcashRef: "1000000000001" } }));
  });

  it("shows the suki's balance and limit, and refuses utang past the limit (spec 6.4)", async () => {
    open([kape(2)]);
    await userEvent.click(screen.getByRole("radio", { name: "Utang" }));
    await userEvent.selectOptions(screen.getByLabelText("Suki"), "k-rosa");
    expect(screen.getByText("Balance ₱120.00 · Limit ₱500.00")).toBeInTheDocument();
    expect(complete()).toBeEnabled();
    expect(screen.queryByText(LIMIT_MESSAGE)).not.toBeInTheDocument();
  });

  it("disables completing when balance plus total is over the limit", async () => {
    open([kape(40)]);
    await userEvent.click(screen.getByRole("radio", { name: "Utang" }));
    await userEvent.selectOptions(screen.getByLabelText("Suki"), "k-rosa");
    expect(screen.getByText(LIMIT_MESSAGE)).toBeInTheDocument();
    expect(complete()).toBeDisabled();
  });
});

describe("submitting (Review Focus 4)", () => {
  it("sends one request for a double click: the button waits for the answer", async () => {
    let finish: (value: { sale: SaleView; queued: boolean }) => void = () => {};
    const submit = vi.fn((sale: SaleInput) => new Promise<{ sale: SaleView; queued: boolean }>((resolve) => (finish = () => resolve({ sale: recorded(sale), queued: false }))));
    const { onDone } = open([kape(1)], submit);
    await userEvent.click(screen.getByRole("button", { name: "Exact" }));
    await userEvent.dblClick(complete());
    expect(submit).toHaveBeenCalledTimes(1);
    finish({ sale: recorded(submit.mock.calls[0]![0]), queued: false });
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("retries a failed send with the same sale id, so the store never records it twice", async () => {
    const submit = vi
      .fn<SaleSubmitter>()
      .mockRejectedValueOnce(new ApiError(0, "service_unavailable", "Can't reach the store server."))
      .mockImplementationOnce(async (sale) => ({ sale: recorded(sale), queued: false }));
    const { onDone } = open([kape(1)], submit);
    await userEvent.click(screen.getByRole("button", { name: "Exact" }));
    await userEvent.click(complete());
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the store server.");
    await userEvent.click(complete());
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls.map(([sale]) => sale.id)).toEqual(["5b2f8c1e-0000-4000-8000-000000000001", "5b2f8c1e-0000-4000-8000-000000000001"]);
  });

  it("shows the utang-limit message when the API refuses the sale", async () => {
    const submit = vi.fn<SaleSubmitter>().mockRejectedValue(new ApiError(409, "credit_limit_exceeded", LIMIT_MESSAGE));
    const { dialog } = open([kape(1)], submit);
    await userEvent.click(screen.getByRole("radio", { name: "Utang" }));
    await userEvent.selectOptions(screen.getByLabelText("Suki"), "k-rosa");
    await userEvent.click(complete());
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(LIMIT_MESSAGE);
  });
});
