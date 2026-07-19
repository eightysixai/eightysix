import { useMemo, useState } from "react";
import { CostBreakdownChart } from "../components/dashboard/CostBreakdownChart";
import { RevenueCostTrendChart } from "../components/dashboard/RevenueCostTrendChart";
import { ViewHeader } from "../components/layout/ViewHeader";
import { useOrganization } from "../context/OrganizationContext";
import { useCostCategories } from "../hooks/useCostCategories";
import { useRealtimeList } from "../hooks/useRealtimeList";
import { formatMoney, todayISO } from "../lib/format";
import { selectCurrentBudgetTarget } from "../lib/pnl-calculations";
import { supabase } from "../lib/supabase";
import type { Database } from "../types/database";

type DailyPnlRow = Database["public"]["Views"]["daily_pnl"]["Row"];
type BudgetTargetRow = Database["public"]["Tables"]["budget_targets"]["Row"];
type CostCategoryRow = Database["public"]["Tables"]["cost_categories"]["Row"];
type RevenueEntryRow = Database["public"]["Tables"]["revenue_entries"]["Row"];

const CATEGORY_LABELS: Record<string, string> = {
  food: "Food",
  inventory: "Inventory",
  labor: "Labor",
};

export function DashboardPage() {
  const { organizationId, locationId } = useOrganization();
  const { categories: orderedCategories } = useCostCategories(organizationId);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const { data: dailyPnl } = useRealtimeList<DailyPnlRow>({
    tables: ["revenue_entries", "invoices", "invoice_line_items", "labor_shifts"],
    filter: `location_id=eq.${locationId}`,
    enabled: !!locationId,
    fetcher: async () => {
      const { data, error } = await supabase
        .from("daily_pnl")
        .select("*")
        .eq("location_id", locationId!)
        .order("business_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: budgetTargets,
    refetch: refetchTargets,
  } = useRealtimeList<BudgetTargetRow>({
    tables: ["budget_targets"],
    filter: `location_id=eq.${locationId}`,
    enabled: !!locationId,
    fetcher: async () => {
      const { data, error } = await supabase
        .from("budget_targets")
        .select("*")
        .eq("location_id", locationId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: revenueEntries,
    refetch: refetchRevenue,
  } = useRealtimeList<RevenueEntryRow>({
    tables: ["revenue_entries"],
    filter: `location_id=eq.${locationId}`,
    enabled: !!locationId,
    fetcher: async () => {
      const { data, error } = await supabase
        .from("revenue_entries")
        .select("*")
        .eq("location_id", locationId!)
        .order("business_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const costByCategory: Record<string, number> = {
      food: 0,
      inventory: 0,
      labor: 0,
    };
    let totalRevenue = 0;
    for (const row of dailyPnl) {
      costByCategory.food += row.food_cost ?? 0;
      costByCategory.inventory += row.inventory_cost ?? 0;
      costByCategory.labor += row.labor_cost ?? 0;
      totalRevenue += row.net_sales ?? 0;
    }
    return { costByCategory, totalRevenue };
  }, [dailyPnl]);

  const trendPoints = useMemo(
    () =>
      dailyPnl.map((row) => ({
        date: row.business_date ?? "",
        revenue: row.net_sales ?? 0,
        totalCost: row.total_cost ?? 0,
      })),
    [dailyPnl],
  );

  const breakdownSegments = useMemo(
    () => [
      {
        label: "Food",
        value: totals.costByCategory.food,
        color: "var(--series-food)",
      },
      {
        label: "Inventory",
        value: totals.costByCategory.inventory,
        color: "var(--series-inventory)",
      },
      {
        label: "Labor",
        value: totals.costByCategory.labor,
        color: "var(--series-labor)",
      },
    ],
    [totals],
  );

  async function handleThresholdTypeChange(category: CostCategoryRow, targetType: string) {
    const existing = selectCurrentBudgetTarget(budgetTargets, category.id);
    const value = existing?.target_value ?? 0;
    await upsertTarget(category, targetType, value, existing);
  }

  async function handleThresholdValueChange(category: CostCategoryRow, value: number) {
    const existing = selectCurrentBudgetTarget(budgetTargets, category.id);
    const targetType = existing?.target_type ?? "percentage_of_revenue";
    await upsertTarget(category, targetType, value, existing);
  }

  async function upsertTarget(
    category: CostCategoryRow,
    targetType: string,
    targetValue: number,
    existing: BudgetTargetRow | null,
  ) {
    if (!locationId) return;
    const { error } = existing
      ? await supabase
          .from("budget_targets")
          .update({ target_type: targetType, target_value: targetValue })
          .eq("id", existing.id)
      : await supabase.from("budget_targets").insert({
          location_id: locationId,
          cost_category_id: category.id,
          target_type: targetType,
          target_value: targetValue,
          effective_from: "1970-01-01",
        });
    if (error) setBannerError(error.message);
    else refetchTargets();
  }

  async function handleAddRevenueDay() {
    if (!locationId) return;
    const { error } = await supabase.from("revenue_entries").insert({
      location_id: locationId,
      business_date: todayISO(),
      source: "manual",
      gross_sales: 0,
      net_sales: 0,
    });
    if (error) setBannerError(error.message);
    else refetchRevenue();
  }

  async function handleRevenueFieldChange(
    entry: RevenueEntryRow,
    field: "business_date" | "revenue",
    value: string,
  ) {
    const payload =
      field === "business_date"
        ? { business_date: value }
        : { gross_sales: parseFloat(value) || 0, net_sales: parseFloat(value) || 0 };
    const { error } = await supabase
      .from("revenue_entries")
      .update(payload)
      .eq("id", entry.id);
    if (error) setBannerError(error.message);
    else refetchRevenue();
  }

  async function handleDeleteRevenue(entry: RevenueEntryRow) {
    const { error } = await supabase
      .from("revenue_entries")
      .delete()
      .eq("id", entry.id);
    if (error) setBannerError(error.message);
    else refetchRevenue();
  }

  return (
    <>
      <ViewHeader
        title="Dashboard"
        subtitle="Costs, revenue, and budget performance at a glance"
      />

      {bannerError && (
        <p className="form-error" onClick={() => setBannerError(null)}>
          {bannerError}
        </p>
      )}

      <section className="cards-row">
        <div className="stat-card hero">
          <div className="stat-label">Total Revenue</div>
          <div className="stat-value">{formatMoney(totals.totalRevenue)}</div>
        </div>
        {orderedCategories.map((category) => {
          const target = selectCurrentBudgetTarget(budgetTargets, category.id);
          const actualCost = totals.costByCategory[category.code] ?? 0;
          const actualPct =
            totals.totalRevenue > 0
              ? (actualCost / totals.totalRevenue) * 100
              : 0;
          const isFixed = target?.target_type === "fixed_amount";
          const targetValue = target?.target_value ?? 0;
          const isOver = isFixed
            ? actualCost > targetValue
            : actualPct > targetValue;

          return (
            <div key={category.id} className="stat-card">
              <div className="stat-label">
                {CATEGORY_LABELS[category.code] ?? category.name} Cost
              </div>
              <div className="stat-value">
                {isFixed ? formatMoney(actualCost) : `${actualPct.toFixed(1)}%`}
              </div>
              <div className={`stat-sub ${isOver ? "over" : "under"}`}>
                {isFixed
                  ? `${isOver ? "Over" : "Under"} target ${formatMoney(targetValue)}`
                  : `${formatMoney(actualCost)} · ${isOver ? "Over" : "Under"} ${targetValue.toFixed(1)}%`}
              </div>
            </div>
          );
        })}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Revenue &amp; Cost Trend</h2>
        </div>
        <RevenueCostTrendChart points={trendPoints} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Cost Breakdown</h2>
        </div>
        <CostBreakdownChart segments={breakdownSegments} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Daily Controllable P&amp;L</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Revenue</th>
              <th>Food Cost</th>
              <th>Inventory Cost</th>
              <th>Labor Cost</th>
              <th>Controllable Profit</th>
              <th>Margin</th>
            </tr>
          </thead>
          <tbody>
            {dailyPnl.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  No revenue entries yet.
                </td>
              </tr>
            ) : (
              dailyPnl.map((row) => {
                const profit = row.operating_profit ?? 0;
                const profitClass = profit >= 0 ? "positive" : "negative";
                return (
                  <tr key={row.business_date}>
                    <td>{row.business_date}</td>
                    <td>{formatMoney(row.net_sales ?? 0)}</td>
                    <td>{formatMoney(row.food_cost ?? 0)}</td>
                    <td>{formatMoney(row.inventory_cost ?? 0)}</td>
                    <td>{formatMoney(row.labor_cost ?? 0)}</td>
                    <td className={`profit-value ${profitClass}`}>
                      {formatMoney(profit)}
                    </td>
                    <td className={`profit-value ${profitClass}`}>
                      {(row.operating_margin_percentage ?? 0).toFixed(1)}%
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Budget Thresholds</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Type</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {orderedCategories.map((category) => {
              const target = selectCurrentBudgetTarget(budgetTargets, category.id);
              const isFixed = target?.target_type === "fixed_amount";
              return (
                <tr key={category.id}>
                  <td>{CATEGORY_LABELS[category.code] ?? category.name}</td>
                  <td>
                    <select
                      value={target?.target_type ?? "percentage_of_revenue"}
                      onChange={(e) =>
                        handleThresholdTypeChange(category, e.target.value)
                      }
                    >
                      <option value="percentage_of_revenue">% of revenue</option>
                      <option value="fixed_amount">Fixed $</option>
                    </select>
                  </td>
                  <td>
                    <div className="threshold-target">
                      <input
                        type="number"
                        step={isFixed ? 1 : 0.1}
                        min={0}
                        value={target?.target_value ?? 0}
                        onChange={(e) =>
                          handleThresholdValueChange(
                            category,
                            parseFloat(e.target.value) || 0,
                          )
                        }
                      />
                      <span>{isFixed ? "$" : "%"}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Daily Revenue</h2>
          <button className="btn btn-primary" onClick={handleAddRevenueDay}>
            Add Day
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Revenue</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {revenueEntries.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty-state">
                  No revenue entries yet.
                </td>
              </tr>
            ) : (
              revenueEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <input
                      type="date"
                      defaultValue={entry.business_date}
                      onBlur={(e) =>
                        handleRevenueFieldChange(
                          entry,
                          "business_date",
                          e.target.value,
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step={0.01}
                      min={0}
                      defaultValue={entry.net_sales}
                      onBlur={(e) =>
                        handleRevenueFieldChange(entry, "revenue", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      title="Delete"
                      onClick={() => handleDeleteRevenue(entry)}
                    >
                      &times;
                    </button>
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
