import { formatMoney } from "../../lib/format";

export interface BreakdownSegment {
  label: string;
  value: number;
  color: string;
}

export function CostBreakdownChart({
  segments,
}: {
  segments: BreakdownSegment[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return <div className="empty-state">No costs recorded yet.</div>;
  }

  const width = 640;
  const barHeight = 28;
  const gap = 18;
  const labelWidth = 100;
  const height = segments.length * (barHeight + gap);
  const maxValue = Math.max(...segments.map((s) => s.value), 1);
  const trackWidth = width - labelWidth - 90;

  return (
    <svg
      className="breakdown-chart-svg"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
    >
      {segments.map((segment, i) => {
        const y = i * (barHeight + gap);
        const barWidth = (segment.value / maxValue) * trackWidth;
        return (
          <g key={segment.label}>
            <text
              className="breakdown-bar-label"
              x={labelWidth - 10}
              y={y + barHeight / 2 + 4}
              textAnchor="end"
            >
              {segment.label}
            </text>
            <rect
              x={labelWidth}
              y={y}
              width={trackWidth}
              height={barHeight}
              rx={4}
              fill="var(--chart-gridline)"
            />
            <rect
              x={labelWidth}
              y={y}
              width={Math.max(barWidth, 2)}
              height={barHeight}
              rx={4}
              fill={segment.color}
            >
              <title>
                {segment.label}: {formatMoney(segment.value)}
              </title>
            </rect>
            <text
              className="breakdown-bar-value"
              x={labelWidth + Math.max(barWidth, 2) + 10}
              y={y + barHeight / 2 + 4}
            >
              {formatMoney(segment.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
