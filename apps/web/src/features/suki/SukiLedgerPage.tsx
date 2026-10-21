import { CustomerPatch, formatPeso, type CustomerView, type LedgerEntryView, type PaymentMethod, type UtangKind } from "@sari/shared";
import { Pencil } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router";
import { ApiError, api } from "../../api/client";
import { useSession } from "../../auth/session";
import { BackLink } from "../../components/BackLink";
import { Field, inputClass } from "../../components/Field";
import { LoadProblem, Loading } from "../../components/LoadProblem";
import { Notice } from "../../components/Notice";
import { manilaStamp, signedPeso } from "../../lib/format";
import { AdjustmentForm } from "./AdjustmentForm";
import { LimitForm } from "./LimitForm";
import { PaymentForm } from "./PaymentForm";
import { ReminderButton } from "./ReminderButton";
import { agingText, agingTone, phoneDigits, useLedger, useSukiChanged } from "./queries";

const KINDS: Record<UtangKind, string> = { CHARGE: "Utang", PAYMENT: "Payment", ADJUSTMENT: "Adjustment", VOID: "Voided sale" };
const METHODS: Record<PaymentMethod, string> = { CASH: "Cash", GCASH: "GCash", UTANG: "Utang" };

type DetailErrors = { name?: string; phone?: string };

/** Name and phone: anyone may fix them (spec 8.5). */
function DetailsForm({ customer, onDone }: { customer: CustomerView; onDone: () => void }) {
  const sukiChanged = useSukiChanged();
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [errors, setErrors] = useState<DetailErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = CustomerPatch.safeParse({ name, phone: phone.trim() ? phoneDigits(phone) : null });
    if (!parsed.success) {
      const found: DetailErrors = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "name") found.name ??= "Type the suki's name (up to 60 characters).";
        if (issue.path[0] === "phone") found.phone ??= issue.message;
      }
      return setErrors(found);
    }
    setErrors({});
    setProblem(null);
    setBusy(true);
    try {
      void sukiChanged(await api<CustomerView>(`/customers/${customer.id}`, { method: "PATCH", json: parsed.data }));
      onDone();
    } catch (err) {
      if (err instanceof ApiError && (err.field === "name" || err.field === "phone")) setErrors({ [err.field]: err.message });
      else setProblem(err instanceof ApiError ? err.message : "Could not save the details. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="grid gap-4 md:grid-cols-2">
      <Field label="Name" error={errors.name}>
        {(control) => <input {...control} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" className={inputClass} />}
      </Field>
      <Field label="Phone (optional)" error={errors.phone}>
        {(control) => <input {...control} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" className={inputClass} />}
      </Field>
      {problem && (
        <p role="alert" className="text-danger md:col-span-2">
          {problem}
        </p>
      )}
      <div className="flex items-center justify-end gap-3 md:col-span-2">
        <button type="button" onClick={onDone} className="min-h-11 px-3 text-muted underline underline-offset-2 hover:text-text">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="min-h-12 rounded-control bg-accent px-6 font-medium text-accent-ink transition-opacity disabled:opacity-60">
          Save details
        </button>
      </div>
    </form>
  );
}

/** Who the suki is and where their utang stands: balance, limit and the oldest unpaid charge. */
function SukiSummary({ customer, isOwner }: { customer: CustomerView; isOwner: boolean }) {
  const [editing, setEditing] = useState(false);
  const aging = agingText(customer.oldestUnpaidDays);
  return (
    <section aria-label="Suki details" className="flex flex-col gap-5 rounded-card bg-surface p-5 sm:p-6">
      {editing ? (
        <DetailsForm customer={customer} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-medium break-words">{customer.name}</h2>
            <p className="text-muted">{customer.phone ?? "No phone"}</p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control bg-raised px-4 text-sm font-medium">
            <Pencil aria-hidden size={16} />
            Edit details
          </button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
        <div>
          <p className="text-sm text-muted">Utang balance</p>
          <p className="text-4xl font-semibold">{formatPeso(customer.balanceCentavos)}</p>
        </div>
        <div className="flex flex-col gap-1 sm:items-end sm:text-right">
          <p className="text-sm">{`Credit limit: ${formatPeso(customer.creditLimitCentavos)}${isOwner ? "" : " (the owner sets it)"}`}</p>
          {aging && <p className={`text-sm ${agingTone(customer.oldestUnpaidDays)}`}>{aging}</p>}
        </div>
      </div>
    </section>
  );
}

function EntryRow({ entry, linkSales }: { entry: LedgerEntryView; linkSales: boolean }) {
  const label = entry.kind === "PAYMENT" && entry.method ? `Payment · ${METHODS[entry.method]}` : KINDS[entry.kind];
  return (
    <li className="flex items-start justify-between gap-4 border-t border-raised py-3 first:border-t-0">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted">
          {manilaStamp(entry.createdAt)} · {entry.user.displayName}
        </p>
        {entry.sale &&
          (linkSales ? (
            <Link to={`/app/sales?sale=${entry.sale.id}`} className="text-sm text-accent underline underline-offset-2">
              Receipt No. {entry.sale.receiptNo}
            </Link>
          ) : (
            <p className="text-sm">Receipt No. {entry.sale.receiptNo}</p>
          ))}
        {entry.note && <p className="text-sm">{entry.note}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-semibold ${entry.amountCentavos < 0 ? "text-success" : ""}`}>{signedPeso(entry.amountCentavos)}</p>
        <p className="text-sm text-muted">Balance {formatPeso(entry.balanceAfter)}</p>
      </div>
    </li>
  );
}

/** The listahan, newest first. The API shows a bantay only their own sales, so only the owner gets receipt links. */
function LedgerList({ entries, linkSales }: { entries: LedgerEntryView[]; linkSales: boolean }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="rounded-card bg-surface p-5 sm:p-6">
      <h2 id={titleId} className="text-lg font-medium">
        Utang ledger
      </h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-muted">No utang yet.</p>
      ) : (
        <ul aria-labelledby={titleId} className="mt-3">
          {[...entries].reverse().map((entry) => (
            <EntryRow key={entry.id} entry={entry} linkSales={linkSales} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SukiLedger({ id }: { id: string }) {
  const session = useSession();
  const location = useLocation();
  const ledger = useLedger(id);
  const notice = (location.state as { notice?: string } | null)?.notice ?? null;
  const isOwner = session?.user.role === "OWNER";

  if (ledger.isPending) return <Loading what="the ledger" />;
  if (ledger.isError) return <LoadProblem error={ledger.error} retry={ledger.refetch} />;
  const { customer, entries } = ledger.data;
  return (
    <div className="flex flex-col gap-4">
      <BackLink to="/app/suki" label="Suki" />
      <Notice text={notice} />
      {/* Phones: summary, then the payment tools, then the ledger; wide screens put the tools in a right column. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <SukiSummary customer={customer} isOwner={isOwner} />
        <div className="flex flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <PaymentForm customer={customer} />
          {customer.balanceCentavos > 0 && <ReminderButton customerId={customer.id} />}
          {isOwner && <LimitForm customer={customer} />}
          {isOwner && <AdjustmentForm customer={customer} />}
        </div>
        <LedgerList entries={entries} linkSales={isOwner} />
      </div>
    </div>
  );
}

/** `/app/suki/:id`; keyed by the id so moving to another suki starts fresh. */
export function SukiLedgerPage() {
  const { id = "" } = useParams();
  return <SukiLedger key={id} id={id} />;
}
