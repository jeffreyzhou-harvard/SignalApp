const fmtDelta = (value: number) => `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(1)}%`;

export function DeltaChip({
  value,
  className,
}: {
  value: number | null;
  className?: string;
}): React.JSX.Element | null {
  if (value === null) return null;

  const isNeutral = Math.abs(value) < 0.05;
  const isPositive = value > 0;

  const tone = isNeutral
    ? "border-line text-faint"
    : isPositive
      ? "border-accent/30 bg-accent/10 text-accent"
      : "border-danger/30 bg-danger/10 text-danger";

  const caret = isNeutral ? null : isPositive ? "▲" : "▼";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${tone}${
        className ? ` ${className}` : ""
      }`}
    >
      {caret && (
        <span aria-hidden className="text-[0.6rem] leading-none">
          {caret}
        </span>
      )}
      {fmtDelta(value)}
    </span>
  );
}
