import { formatPeso } from "@sari/shared";
import { Banknote, NotebookPen, Smartphone } from "lucide-react";
import { LoadProblem, Loading } from "../../components/LoadProblem";
import { StatCard } from "../../components/StatCard";
import { useMyShift } from "../reports/queries";

/** My shift (spec 3.2): the signed-in cashier's own sales of today, to count the drawer at the end. */
export function MyShiftPage() {
  const shift = useMyShift();
  if (shift.isPending) return <Loading what="your shift" />;
  if (shift.isError) return <LoadProblem error={shift.error} retry={shift.refetch} />;
  const { count, byMethod } = shift.data;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xl font-medium">{`${count} ${count === 1 ? "sale" : "sales"} today`}</p>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Cash sales" value={formatPeso(byMethod.CASH)} note="Count this in the drawer, plus any cash utang payments you took." icon={Banknote} />
        <StatCard title="GCash" value={formatPeso(byMethod.GCASH)} note="Check these in the store's GCash app." icon={Smartphone} />
        <StatCard title="Utang" value={formatPeso(byMethod.UTANG)} note="Charged to suki; no cash came in." icon={NotebookPen} />
      </div>
    </div>
  );
}
