import { PinSchema, StaffInput, type StaffView } from "@sari/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError, api } from "../../api/client";
import { initials } from "../../app/TopBar";
import { Field, inputClass } from "../../components/Field";
import { LoadProblem, Loading } from "../../components/LoadProblem";
import { Notice } from "../../components/Notice";
import { useStaff } from "../reports/queries";

/** Spec 7.1 and 11: at most 5 bantay per store, counting inactive ones. */
const MAX_BANTAY = 5;
const PIN_RULE = "6 digits, not one digit repeated or a run like 123456.";
const pinError = (pin: string) => PinSchema.safeParse(pin).error?.issues[0]?.message ?? null;
const accent = "min-h-12 rounded-control bg-accent px-6 font-medium text-accent-ink transition-opacity disabled:opacity-60";
const quiet = "min-h-11 px-3 text-muted underline underline-offset-2 hover:text-text";
const small = "min-h-11 rounded-control bg-raised px-4 text-sm font-medium";

function useStaffChanged() {
  const client = useQueryClient();
  return (person: StaffView) =>
    client.setQueryData<StaffView[]>(["staff"], (list = []) => (list.some((p) => p.id === person.id) ? list.map((p) => (p.id === person.id ? person : p)) : [...list, person]));
}

function AddBantayForm({ onDone, onCancel }: { onDone: (message: string) => void; onCancel: () => void }) {
  const staffChanged = useStaffChanged();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [errors, setErrors] = useState<{ name?: string; pin?: string }>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = StaffInput.safeParse({ displayName: name, pin });
    if (!parsed.success) {
      return setErrors({
        name: parsed.error.issues.some((issue) => issue.path[0] === "displayName") ? "Type a name of up to 30 characters." : undefined,
        pin: pinError(pin) ?? undefined,
      });
    }
    setErrors({});
    setProblem(null);
    setBusy(true);
    try {
      const created = await api<StaffView>("/staff", { method: "POST", json: parsed.data });
      staffChanged(created);
      onDone(`Added ${created.displayName}. Their username is ${created.username}; give them the PIN you chose.`);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Could not add the bantay. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate aria-label="Add a bantay" className="grid gap-5 rounded-card bg-surface p-5 sm:p-6 md:grid-cols-2">
      <Field label="Display name" error={errors.name}>
        {(control) => <input {...control} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoComplete="off" placeholder="e.g. Liza" className={inputClass} />}
      </Field>
      <Field label="PIN" error={errors.pin} hint={PIN_RULE}>
        {(control) => <input {...control} value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="new-password" className={inputClass} />}
      </Field>
      {problem && (
        <p role="alert" className="text-danger md:col-span-2">
          {problem}
        </p>
      )}
      <div className="flex items-center justify-end gap-3 md:col-span-2">
        <button type="button" onClick={onCancel} className={quiet}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={accent}>
          Save bantay
        </button>
      </div>
    </form>
  );
}

function BantayRow({ person, onMessage }: { person: StaffView; onMessage: (message: string) => void }) {
  const staffChanged = useStaffChanged();
  const [resetting, setResetting] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function patch(body: { pin: string } | { active: boolean }, message: string) {
    setBusy(true);
    try {
      staffChanged(await api<StaffView>(`/staff/${person.id}`, { method: "PATCH", json: body }));
      setResetting(false);
      setPin("");
      onMessage(message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function savePin(event: FormEvent) {
    event.preventDefault();
    const problem = pinError(pin);
    if (problem) return setError(problem);
    setError(null);
    // Spec 7.2: a new PIN signs the bantay out everywhere.
    void patch({ pin }, `${person.displayName}'s PIN changed. ${person.displayName} is signed out on every device.`);
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4 even:bg-raised/60">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="grid size-10 place-items-center rounded-full bg-raised text-sm font-semibold">
          {initials(person.displayName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{person.displayName}</span>
          <span className="block font-mono text-sm text-muted">{person.username}</span>
        </span>
        <span className={`rounded-full px-3 py-1 text-sm ${person.active ? "bg-success/15 text-success" : "bg-raised text-muted"}`}>{person.active ? "Active" : "Inactive"}</span>
        <div className="flex gap-2">
          {person.active && !resetting && (
            <button type="button" aria-label={`Reset PIN for ${person.displayName}`} onClick={() => setResetting(true)} className={small}>
              Reset PIN
            </button>
          )}
          <button
            type="button"
            aria-label={`${person.active ? "Deactivate" : "Reactivate"} ${person.displayName}`}
            disabled={busy}
            onClick={() =>
              void patch(
                { active: !person.active },
                person.active ? `${person.displayName} can no longer sign in.` : `${person.displayName} can sign in again.`,
              )
            }
            className={small}
          >
            {person.active ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      </div>
      {resetting && (
        <form onSubmit={savePin} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <Field label={`New PIN for ${person.displayName}`} error={error} hint={PIN_RULE}>
              {(control) => <input {...control} value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="new-password" className={inputClass} />}
            </Field>
          </div>
          <div className="flex justify-end gap-2 sm:mt-7">
            <button
              type="button"
              onClick={() => {
                setResetting(false);
                setError(null);
              }}
              className={quiet}
            >
              Cancel
            </button>
            <button type="submit" disabled={busy} className={accent}>
              Save PIN
            </button>
          </div>
        </form>
      )}
      {error && !resetting && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

/** Staff (spec 7.1; reference "Staff Management"): the store's bantay, their usernames, PIN resets and access. */
export function StaffPage() {
  const staff = useStaff();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (staff.isPending) return <Loading what="the staff" />;
  if (staff.isError) return <LoadProblem error={staff.error} retry={staff.refetch} />;
  const full = staff.data.length >= MAX_BANTAY;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-xl font-medium">{`Bantay (${staff.data.length} of ${MAX_BANTAY})`}</p>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} disabled={full} className={`inline-flex items-center gap-2 ${accent}`}>
            <Plus aria-hidden size={18} />
            Add bantay
          </button>
        )}
      </div>
      {full && <p className="text-sm text-muted">A store can have at most 5 bantay, inactive ones included.</p>}
      {adding && (
        <AddBantayForm
          onCancel={() => setAdding(false)}
          onDone={(message) => {
            setAdding(false);
            setNotice(message);
          }}
        />
      )}
      <Notice text={notice} />
      {staff.data.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-muted">No bantay yet.</p>
      ) : (
        <ul aria-label="Bantay" className="overflow-hidden rounded-card bg-surface">
          {staff.data.map((person) => (
            <BantayRow key={person.id} person={person} onMessage={setNotice} />
          ))}
        </ul>
      )}
    </div>
  );
}
