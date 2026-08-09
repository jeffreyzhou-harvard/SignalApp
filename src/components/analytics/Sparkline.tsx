export function Sparkline({
  data,
  width = 120,
  height = 32,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}): React.JSX.Element | null {
  if (data.length < 2) return null;

  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min;

  const x = (i: number) => (i / (data.length - 1)) * width;
  const y = (v: number) => {
    if (span === 0) return height / 2;
    const t = (v - min) / span;
    return pad + (1 - t) * (height - pad * 2);
  };

  const points = data.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${width.toFixed(2)},${height} L0,${height} Z`;

  const lastX = x(data.length - 1);
  const lastY = y(data[data.length - 1]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      <path d={areaPath} fill="var(--color-accent)" opacity={0.12} />
      <path
        d={linePath}
        stroke="var(--color-accent)"
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2} fill="var(--color-accent)" />
    </svg>
  );
}
