import { CustomerInput, formatPeso, type CustomerLedger, type CustomerView } from "@sari/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError, api } from "../../api/client";
import { useSession } from "../../auth/session";
import { Field, inputClass } from "../../components/Field";
import { LoadProblem, Loading } from "../../components/LoadProblem";
import { agingText, agingTone, phoneDigits, useCustomers, useSukiChanged } from "./queries";

type Errors = { name?: string; phone?: string };

/** Spec 8.5: anyone can add a suki; every new suki starts with a credit limit of 0, which means no utang. */
function AddSukiForm({ isOwner, onCancel }: { isOwner: boolean; onCancel: () => void }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const sukiChanged = useSukiChanged();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = CustomerInput.safeParse({ name, ...(phone.trim() ? { phone: phoneDigits(phone) } : {}) });
    if (!parsed.success) {
      const found: Errors = {};
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
      const created = await api<CustomerView>("/customers", { method: "POST", json: parsed.data });
      // A new suki has no ledger lines yet, so the page can open without waiting.
      client.setQueryData<CustomerLedger>(["ledger", created.id], { customer: created, entries: [] });
      void sukiChanged(created);
      navigate(`/app/suki/${created.id}`, { state: { notice: `Added ${created.name}.` } });
    } catch (err) {
      if (err instanceof ApiError && (err.field === "name" || err.field === "phone")) setErrors({ [err.field]: err.message });
      else setProblem(err instanceof ApiError ? err.message : "Could not add the suki. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate aria-label="Add a suki" className="grid gap-5 rounded-card bg-surface p-5 sm:p-6 md:grid-cols-2">
      <Field label="Name" error={errors.name}>
        {(control) => <input {...control} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" placeholder="e.g. Aling Rosa" className={inputClass} />}
      </Field>
      <Field label="Phone (optional)" error={errors.phone} hint="For the reminder text, like 09171234567.">
        {(control) => <input {...control} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" className={inputClass} />}
      </Field>
      <p className="text-sm text-muted md:col-span-2">
        {isOwner ? "Credit limit: ₱0.00 until you set it on the suki's page." : "Credit limit: ₱0.00 (the owner sets it)"}
      </p>
      {problem && (
        <p role="alert" className="text-danger md:col-span-2">
          {problem}
        </p>
      )}
      <div className="flex items-center justify-end gap-3 md:col-span-2">
        <button type="button" onClick={onCancel} className="min-h-11 px-3 text-muted underline underline-offset-2 hover:text-text">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="min-h-12 rounded-control bg-accent px-6 font-medium text-accent-ink transition-opacity disabled:opacity-60">
          Save suki
        </button>
      </div>
    </form>
  );
}

function SukiRow({ customer }: { customer: CustomerView }) {
  const aging = agingText(customer.oldestUnpaidDays);
  return (
    <li className="even:bg-raised/60">
      <Link to={`/app/suki/${customer.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-4 hover:bg-raised">
        <span className="min-w-0">
          <span className="block truncate font-medium">{customer.name}</span>
          <span className="block text-sm text-muted">{customer.phone ?? "No phone"}</span>
        </span>
        <span className="text-right">
          <span className={`block font-semibold ${customer.balanceCentavos > 0 ? "" : "text-muted"}`}>
            {customer.balanceCentavos > 0 ? formatPeso(customer.balanceCentavos) : "No utang"}
          </span>
          <span className="block text-xs text-muted">Limit {formatPeso(customer.creditLimitCentavos)}</span>
        </span>
        {aging && <span className={`col-span-2 text-sm ${agingTone(customer.oldestUnpaidDays)}`}>{aging}</span>}
      </Link>
    </li>
  );
}

/** Suki (spec 8.5): who owes what, how long the oldest unpaid utang has waited, and a way to add a suki. */
export function SukiListPage() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [adding, setAdding] = useState(false);
  const customers = useCustomers(applied);

  // Search waits until typing stops, so "rosa" is one request instead of four.
  useEffect(() => {
    const timer = setTimeout(() => setApplied(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const count = customers.data?.length;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-xl font-medium">{count !== undefined && `${count} suki`}</p>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-11 items-center gap-2 rounded-control bg-accent px-5 font-medium text-accent-ink">
            <Plus aria-hidden size={18} />
            Add suki
          </button>
        )}
      </div>
      {adding && <AddSukiForm isOwner={session?.user.role === "OWNER"} onCancel={() => setAdding(false)} />}
      <div className="max-w-md">
        <Field label="Search">
          {(control) => <input {...control} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suki name" className={inputClass} />}
        </Field>
      </div>
      {customers.isPending ? (
        <Loading what="the suki" />
      ) : customers.isError ? (
        <LoadProblem error={customers.error} retry={customers.refetch} />
      ) : customers.data.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-muted">{applied ? "No suki match this name." : "No suki yet."}</p>
      ) : (
        <ul aria-label="Suki" className="overflow-hidden rounded-card bg-surface">
          {customers.data.map((customer) => (
            <SukiRow key={customer.id} customer={customer} />
          ))}
        </ul>
      )}
    </div>
  );
}
