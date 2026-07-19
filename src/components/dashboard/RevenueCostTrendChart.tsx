import { formatMoney } from "../../lib/format";

export interface TrendPoint {
  date: string;
  revenue: number;
  totalCost: number;
}

export function RevenueCostTrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return <div className="empty-state">No revenue entries yet.</div>;
  }

  const width = 640;
  const height = 260;
  const padding = { top: 16, right: 20, bottom: 30, left: 56 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const maxValue =
    Math.max(...points.map((p) => Math.max(p.revenue, p.totalCost)), 1) * 1.1;

  const xStep = points.length > 1 ? innerWidth / (points.length - 1) : 0;
  const xFor = (i: number) => padding.left + xStep * i;
  const yFor = (value: number) =>
    padding.top + innerHeight - (value / maxValue) * innerHeight;

  const revenuePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)},${yFor(p.revenue).toFixed(1)}`)
    .join(" ");
  const costPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)},${yFor(p.totalCost).toFixed(1)}`)
    .join(" ");

  // Thin the x-axis date labels so they don't collide on longer ranges.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <>
      <div className="chart-legend-row">
        <span className="chart-legend-item">
          <span
            className="chart-legend-swatch"
            style={{ background: "var(--series-revenue)" }}
          />
          Revenue
        </span>
        <span className="chart-legend-item">
          <span
            className="chart-legend-swatch"
            style={{ background: "var(--series-total-cost)" }}
          />
          Total Cost
        </span>
      </div>
      <svg
        className="trend-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = padding.top + innerHeight * (1 - fraction);
          return (
            <g key={fraction}>
              <line
                className="grid-line"
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
              />
              <text x={padding.left - 8} y={y + 4} textAnchor="end">
                {formatMoney(maxValue * fraction)}
              </text>
            </g>
          );
        })}
        <line
          className="axis-line"
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
        />

        <path
          className="trend-line"
          d={costPath}
          style={{ stroke: "var(--series-total-cost)" }}
        />
        <path
          className="trend-line"
          d={revenuePath}
          style={{ stroke: "var(--series-revenue)" }}
        />

        {points.map((p, i) => (
          <g key={p.date}>
            <circle
              className="trend-point"
              cx={xFor(i)}
              cy={yFor(p.revenue)}
              r={4}
              fill="var(--series-revenue)"
            >
              <title>
                {p.date}: {formatMoney(p.revenue)} revenue
              </title>
            </circle>
            <circle
              className="trend-point"
              cx={xFor(i)}
              cy={yFor(p.totalCost)}
              r={4}
              fill="var(--series-total-cost)"
            >
              <title>
                {p.date}: {formatMoney(p.totalCost)} total cost
              </title>
            </circle>
            {i % labelEvery === 0 && (
              <text
                x={xFor(i)}
                y={height - padding.bottom + 18}
                textAnchor="middle"
              >
                {p.date.slice(5)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </>
  );
}
