import { DeltaChip } from "./DeltaChip";
import { Sparkline } from "./Sparkline";

export function StatCard({
  label,
  value,
  delta,
  spark,
  className,
}: {
  label: string;
  value: string;
  delta?: number | null;
  spark?: number[];
  className?: string;
}): React.JSX.Element {
  const hasSpark = spark !== undefined && spark.length >= 2;

  return (
    <div
      className={`rounded-xl border border-line bg-surface px-4 py-3${
        className ? ` ${className}` : ""
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-fg">{value}</span>
        {delta !== undefined && <DeltaChip value={delta} />}
      </div>
      {hasSpark && <Sparkline data={spark} className="mt-2 w-full" />}
    </div>
  );
}
