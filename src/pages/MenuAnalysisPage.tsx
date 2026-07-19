import { useEffect, useMemo, useState } from "react";
import { ViewHeader } from "../components/layout/ViewHeader";
import { useOrganization } from "../context/OrganizationContext";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { useRecipeCosts } from "../hooks/useRecipeCosts";
import { formatMoney } from "../lib/format";
import { classifyRecipes, QUADRANTS } from "../lib/pnl-calculations";
import { supabase } from "../lib/supabase";

export function MenuAnalysisPage() {
  const { organizationId, locationId } = useOrganization();
  const [refreshKey, setRefreshKey] = useState(0);
  const [unitsSoldByMenuItem, setUnitsSoldByMenuItem] = useState<
    Map<string, number>
  >(new Map());

  const { recipes } = useRecipeCosts(organizationId, locationId, refreshKey);

  useRealtimeRefresh(
    ["menu_items", "recipe_versions", "recipe_ingredients", "daily_menu_item_sales"],
    `location_id=eq.${locationId}`,
    () => setRefreshKey((k) => k + 1),
    !!locationId,
  );

  useEffect(() => {
    if (!locationId) return;
    supabase
      .from("menu_item_performance")
      .select("menu_item_id, units_sold")
      .eq("location_id", locationId)
      .then(({ data }) => {
        setUnitsSoldByMenuItem(
          new Map(
            (data ?? []).map((row) => [row.menu_item_id ?? "", row.units_sold ?? 0]),
          ),
        );
      });
  }, [locationId, refreshKey]);

  const { stats, avgPopularity, avgMargin } = useMemo(
    () =>
      classifyRecipes(
        recipes.map((recipe) => ({
          id: recipe.menuItemId,
          name: recipe.name,
          unitsSold: unitsSoldByMenuItem.get(recipe.menuItemId) ?? 0,
          margin: recipe.margin,
        })),
      ),
    [recipes, unitsSoldByMenuItem],
  );

  return (
    <>
      <ViewHeader
        title="Menu Analysis"
        subtitle="Popularity vs. profitability, plotted on a menu engineering 2×2"
      />

      <section className="panel">
        <div className="panel-header">
          <h2>Menu Engineering Matrix</h2>
        </div>
        {stats.length === 0 ? (
          <div className="empty-state">No recipes yet.</div>
        ) : (
          <MenuMatrixChart
            stats={stats}
            avgPopularity={avgPopularity}
            avgMargin={avgMargin}
          />
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Classification</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Recipe</th>
              <th>Units Sold</th>
              <th>Margin</th>
              <th>Quadrant</th>
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  No recipes yet.
                </td>
              </tr>
            ) : (
              stats.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.unitsSold}</td>
                  <td>{formatMoney(s.margin)}</td>
                  <td>
                    <span
                      className="quadrant-tag"
                      style={{ background: QUADRANTS[s.quadrant].color }}
                    >
                      {QUADRANTS[s.quadrant].label}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

function MenuMatrixChart({
  stats,
  avgPopularity,
  avgMargin,
}: {
  stats: ReturnType<typeof classifyRecipes>["stats"];
  avgPopularity: number;
  avgMargin: number;
}) {
  const width = 600;
  const height = 380;
  const padding = { top: 20, right: 30, bottom: 50, left: 60 };
  const maxUnits = Math.max(...stats.map((s) => s.unitsSold), 1) * 1.15;
  const maxMargin = Math.max(...stats.map((s) => s.margin), 0.01) * 1.15;
  const minMargin = Math.min(...stats.map((s) => s.margin), 0) * 1.15;

  const xScale = (units: number) =>
    padding.left + (units / maxUnits) * (width - padding.left - padding.right);
  const yScale = (margin: number) =>
    height -
    padding.bottom -
    ((margin - minMargin) / (maxMargin - minMargin)) *
      (height - padding.top - padding.bottom);

  const avgX = xScale(avgPopularity);
  const avgY = yScale(avgMargin);

  return (
    <>
      <svg
        className="menu-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
      >
        <line
          className="grid-line"
          x1={avgX}
          y1={padding.top}
          x2={avgX}
          y2={height - padding.bottom}
        />
        <line
          className="grid-line"
          x1={padding.left}
          y1={avgY}
          x2={width - padding.right}
          y2={avgY}
        />
        <line
          className="axis-line"
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
        />
        <line
          className="axis-line"
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
        />
        <text
          className="axis-label"
          x={width / 2}
          y={height - 12}
          textAnchor="middle"
        >
          Units Sold (Popularity)
        </text>
        <text
          className="axis-label"
          x={-(height / 2)}
          y={16}
          textAnchor="middle"
          transform="rotate(-90)"
        >
          Margin $ (Profitability)
        </text>
        {stats.map((s) => {
          const x = xScale(s.unitsSold);
          const y = yScale(s.margin);
          const color = QUADRANTS[s.quadrant].color;
          return (
            <g key={s.id}>
              <circle className="chart-point" cx={x} cy={y} r={7} fill={color}>
                <title>
                  {s.name}: {s.unitsSold} sold, {formatMoney(s.margin)} margin (
                  {QUADRANTS[s.quadrant].label})
                </title>
              </circle>
              <text className="point-label" x={x + 10} y={y + 4}>
                {s.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        {Object.values(QUADRANTS).map((q) => (
          <span className="chart-legend-item" key={q.label}>
            <span
              className="chart-legend-swatch"
              style={{ background: q.color }}
            />
            {q.label}
          </span>
        ))}
      </div>
    </>
  );
}
