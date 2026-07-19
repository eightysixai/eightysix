import { useEffect, useMemo, useState } from "react";
import { ViewHeader } from "../components/layout/ViewHeader";
import { useOrganization } from "../context/OrganizationContext";
import { useCostCategories } from "../hooks/useCostCategories";
import { useRealtimeList } from "../hooks/useRealtimeList";
import { computeVariance } from "../lib/pnl-calculations";
import { findOrCreateItem } from "../lib/resolve-entities";
import { supabase } from "../lib/supabase";
import { todayISO } from "../lib/format";

interface CountLineRow {
  id: string;
  quantity_on_hand: number;
  unit_label: string;
  item: { id: string; name: string } | null;
  inventory_count: { id: string; business_date: string } | null;
}

interface MenuItemForVariance {
  id: string;
  recipe_versions: {
    effective_from: string;
    effective_to: string | null;
    recipe_ingredients: { item_id: string; quantity: number }[];
  }[];
}

async function findOrCreateCountSession(locationId: string, date: string) {
  const { data: existing, error: findError } = await supabase
    .from("inventory_counts")
    .select("id")
    .eq("location_id", locationId)
    .eq("business_date", date)
    .eq("source", "manual")
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("inventory_counts")
    .insert({
      location_id: locationId,
      business_date: date,
      counted_at: new Date().toISOString(),
      status: "completed",
      source: "manual",
    })
    .select("id")
    .single();
  if (createError) throw createError;
  return created.id;
}

export function TheoreticalsPage() {
  const { organizationId, locationId } = useOrganization();
  const { categories } = useCostCategories(organizationId);
  const inventoryCategoryId =
    categories.find((c) => c.code === "inventory")?.id ?? null;
  const [bannerError, setBannerError] = useState<string | null>(null);

  const [purchasedByItem, setPurchasedByItem] = useState<Map<string, number>>(
    new Map(),
  );
  const [theoreticalByItem, setTheoreticalByItem] = useState<
    Map<string, number>
  >(new Map());
  const [itemNamesById, setItemNamesById] = useState<Map<string, string>>(
    new Map(),
  );

  const {
    data: countLines,
    refetch: refetchCounts,
  } = useRealtimeList<CountLineRow>({
    tables: ["inventory_counts", "inventory_count_lines"],
    filter: `location_id=eq.${locationId}`,
    enabled: !!locationId,
    fetcher: async () => {
      const { data, error } = await supabase
        .from("inventory_count_lines")
        .select(
          "id, quantity_on_hand, unit_label, item:items(id, name), inventory_count:inventory_counts!inner(id, business_date, location_id)",
        )
        .eq("inventory_count.location_id", locationId!);
      if (error) throw error;
      return (data ?? []) as unknown as CountLineRow[];
    },
  });

  useEffect(() => {
    if (!organizationId || !locationId) return;

    (async () => {
      const [{ data: items }, { data: lineItems }, { data: menuItems }, { data: performance }] =
        await Promise.all([
          supabase
            .from("items")
            .select("id, name")
            .eq("organization_id", organizationId)
            .is("archived_at", null),
          supabase
            .from("invoice_line_items")
            .select("item_id, quantity, invoice:invoices!inner(location_id, archived_at)")
            .eq("invoice.location_id", locationId)
            .is("invoice.archived_at", null),
          supabase
            .from("menu_items")
            .select(
              "id, recipe_versions(effective_from, effective_to, recipe_ingredients(item_id, quantity))",
            )
            .eq("location_id", locationId)
            .is("archived_at", null),
          supabase
            .from("menu_item_performance")
            .select("menu_item_id, units_sold")
            .eq("location_id", locationId),
        ]);

      const names = new Map((items ?? []).map((i) => [i.id, i.name]));
      setItemNamesById(names);

      const purchased = new Map<string, number>();
      for (const row of (lineItems ?? []) as unknown as {
        item_id: string | null;
        quantity: number;
      }[]) {
        if (!row.item_id) continue;
        purchased.set(row.item_id, (purchased.get(row.item_id) ?? 0) + row.quantity);
      }
      setPurchasedByItem(purchased);

      const unitsSoldByMenuItem = new Map(
        (performance ?? []).map((p) => [p.menu_item_id, p.units_sold ?? 0]),
      );

      const theoretical = new Map<string, number>();
      for (const menuItem of (menuItems ?? []) as unknown as MenuItemForVariance[]) {
        const versions = menuItem.recipe_versions;
        const current = versions.length > 0
          ? versions.reduce((latest, v) =>
              v.effective_from > latest.effective_from ? v : latest,
            )
          : null;
        const unitsSold = unitsSoldByMenuItem.get(menuItem.id) ?? 0;
        for (const ingredient of current?.recipe_ingredients ?? []) {
          theoretical.set(
            ingredient.item_id,
            (theoretical.get(ingredient.item_id) ?? 0) +
              ingredient.quantity * unitsSold,
          );
        }
      }
      setTheoreticalByItem(theoretical);
    })();
  }, [organizationId, locationId, countLines]);

  const latestCountByItem = useMemo(() => {
    const latest = new Map<string, { quantity: number; date: string }>();
    for (const line of countLines) {
      if (!line.item || !line.inventory_count) continue;
      const itemId = line.item.id;
      const existing = latest.get(itemId);
      if (!existing || line.inventory_count.business_date > existing.date) {
        latest.set(itemId, {
          quantity: line.quantity_on_hand,
          date: line.inventory_count.business_date,
        });
      }
    }
    return latest;
  }, [countLines]);

  const varianceRows = useMemo(() => {
    const itemIds = new Set<string>([
      ...purchasedByItem.keys(),
      ...countLines.map((l) => l.item?.id).filter((id): id is string => !!id),
    ]);
    return [...itemIds]
      .map((itemId) => {
        const purchased = purchasedByItem.get(itemId) ?? 0;
        const theoreticalUsage = theoreticalByItem.get(itemId) ?? 0;
        const latestCount = latestCountByItem.get(itemId) ?? null;
        const variance = computeVariance(
          purchased,
          theoreticalUsage,
          latestCount ? latestCount.quantity : null,
        );
        return {
          itemId,
          itemName: itemNamesById.get(itemId) ?? "Unknown item",
          purchased,
          theoreticalUsage,
          actualOnHand: latestCount?.quantity ?? null,
          ...variance,
        };
      })
      .sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [purchasedByItem, theoreticalByItem, latestCountByItem, countLines, itemNamesById]);

  async function handleAddCount() {
    if (!locationId || !organizationId) return;
    try {
      const sessionId = await findOrCreateCountSession(locationId, todayISO());
      const itemId = await findOrCreateItem(
        organizationId,
        "New Item",
        inventoryCategoryId,
        "each",
      );
      const { error } = await supabase.from("inventory_count_lines").insert({
        inventory_count_id: sessionId,
        item_id: itemId,
        quantity_on_hand: 0,
        unit_label: "case",
      });
      if (error) throw error;
      refetchCounts();
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Failed to add inventory count",
      );
    }
  }

  async function handleItemNameChange(line: CountLineRow, name: string) {
    if (!organizationId || !name.trim()) return;
    try {
      const itemId = await findOrCreateItem(
        organizationId,
        name,
        inventoryCategoryId,
        line.unit_label,
      );
      const { error } = await supabase
        .from("inventory_count_lines")
        .update({ item_id: itemId })
        .eq("id", line.id);
      if (error) throw error;
      refetchCounts();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "Failed to update item");
    }
  }

  async function handleDateChange(line: CountLineRow, date: string) {
    if (!locationId) return;
    try {
      const sessionId = await findOrCreateCountSession(locationId, date);
      const { error } = await supabase
        .from("inventory_count_lines")
        .update({ inventory_count_id: sessionId })
        .eq("id", line.id);
      if (error) throw error;
      refetchCounts();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "Failed to update date");
    }
  }

  async function handleQuantityChange(line: CountLineRow, value: string) {
    const { error } = await supabase
      .from("inventory_count_lines")
      .update({ quantity_on_hand: parseFloat(value) || 0 })
      .eq("id", line.id);
    if (error) setBannerError(error.message);
    else refetchCounts();
  }

  async function handleUnitChange(line: CountLineRow, value: string) {
    const { error } = await supabase
      .from("inventory_count_lines")
      .update({ unit_label: value })
      .eq("id", line.id);
    if (error) setBannerError(error.message);
    else refetchCounts();
  }

  async function handleDelete(line: CountLineRow) {
    const { error } = await supabase
      .from("inventory_count_lines")
      .delete()
      .eq("id", line.id);
    if (error) setBannerError(error.message);
    else refetchCounts();
  }

  const sortedCountLines = [...countLines].sort((a, b) =>
    (a.inventory_count?.business_date ?? "").localeCompare(
      b.inventory_count?.business_date ?? "",
    ),
  );

  return (
    <>
      <ViewHeader
        title="Theoreticals vs. Actuals"
        subtitle="Compare purchased, theoretically used, and counted on-hand quantities"
      />

      {bannerError && (
        <p className="form-error" onClick={() => setBannerError(null)}>
          {bannerError}
        </p>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2>Inventory Counts</h2>
          <button className="btn btn-primary" onClick={handleAddCount}>
            Add Count
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Item</th>
              <th>Qty On Hand</th>
              <th>Unit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedCountLines.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  No inventory counts yet.
                </td>
              </tr>
            ) : (
              sortedCountLines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <input
                      type="date"
                      defaultValue={line.inventory_count?.business_date}
                      onBlur={(e) => handleDateChange(line, e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      defaultValue={line.item?.name ?? ""}
                      placeholder="Matches an invoice item name"
                      onBlur={(e) => handleItemNameChange(line, e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      defaultValue={line.quantity_on_hand}
                      onBlur={(e) => handleQuantityChange(line, e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      defaultValue={line.unit_label}
                      onBlur={(e) => handleUnitChange(line, e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      title="Delete"
                      onClick={() => handleDelete(line)}
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

      <section className="panel">
        <div className="panel-header">
          <h2>Purchased vs. Theoretical Usage</h2>
        </div>
        <p className="panel-caption">
          Theoretical Remaining assumes zero starting inventory for the
          period (Purchased − Theoretical Usage). Variance is Theoretical
          Remaining minus the latest counted on-hand quantity.
        </p>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Purchased</th>
              <th>Theoretical Usage</th>
              <th>Theoretical Remaining</th>
              <th>Actual On-Hand</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            {varianceRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  No purchased or counted items yet.
                </td>
              </tr>
            ) : (
              varianceRows.map((row) => (
                <tr key={row.itemId}>
                  <td>{row.itemName}</td>
                  <td>{row.purchased.toFixed(2)}</td>
                  <td>{row.theoreticalUsage.toFixed(2)}</td>
                  <td>{row.theoreticalRemaining.toFixed(2)}</td>
                  <td>
                    {row.actualOnHand === null
                      ? "—"
                      : row.actualOnHand.toFixed(2)}
                  </td>
                  <td className={`variance-value ${row.varianceClass}`}>
                    {row.variance === null ? "—" : row.variance.toFixed(2)}
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
