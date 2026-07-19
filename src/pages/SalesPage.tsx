import { useEffect, useMemo, useState } from "react";
import { ViewHeader } from "../components/layout/ViewHeader";
import { useOrganization } from "../context/OrganizationContext";
import { useRealtimeList } from "../hooks/useRealtimeList";
import { formatMoney, todayISO } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { Database } from "../types/database";

type SaleUpdate = Database["public"]["Tables"]["daily_menu_item_sales"]["Update"];

interface SaleRow {
  id: string;
  business_date: string;
  menu_item_id: string;
  quantity_sold: number;
  unit_price: number;
  net_sales: number;
  menu_item: { id: string; name: string } | null;
}

interface MenuItemOption {
  id: string;
  name: string;
  current_price: number;
}

interface PerformanceRow {
  menu_item_id: string | null;
  name: string | null;
  units_sold: number | null;
  net_sales: number | null;
}

export function SalesPage() {
  const { locationId } = useOrganization();
  const [menuItems, setMenuItems] = useState<MenuItemOption[]>([]);
  const [performance, setPerformance] = useState<PerformanceRow[]>([]);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const { data: sales, refetch } = useRealtimeList<SaleRow>({
    tables: ["daily_menu_item_sales"],
    filter: `location_id=eq.${locationId}`,
    enabled: !!locationId,
    fetcher: async () => {
      const { data, error } = await supabase
        .from("daily_menu_item_sales")
        .select(
          "id, business_date, menu_item_id, quantity_sold, unit_price, net_sales, menu_item:menu_items(id, name)",
        )
        .eq("location_id", locationId!)
        .order("business_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SaleRow[];
    },
  });

  useEffect(() => {
    if (!locationId) return;
    supabase
      .from("menu_items")
      .select("id, name, current_price")
      .eq("location_id", locationId)
      .is("archived_at", null)
      .order("name")
      .then(({ data }) => setMenuItems(data ?? []));
  }, [locationId, sales.length]);

  useEffect(() => {
    if (!locationId) return;
    supabase
      .from("menu_item_performance")
      .select("*")
      .eq("location_id", locationId)
      .then(({ data }) => setPerformance(data ?? []));
  }, [locationId, sales]);

  const dailyTrend = useMemo(() => {
    const byDate = new Map<string, { date: string; units: number; revenue: number }>();
    for (const sale of sales) {
      const entry = byDate.get(sale.business_date) ?? {
        date: sale.business_date,
        units: 0,
        revenue: 0,
      };
      entry.units += sale.quantity_sold;
      entry.revenue += sale.net_sales;
      byDate.set(sale.business_date, entry);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [sales]);

  async function handleAddSale() {
    if (!locationId || menuItems.length === 0) return;
    const firstItem = menuItems[0];
    const { error } = await supabase.from("daily_menu_item_sales").insert({
      location_id: locationId,
      business_date: todayISO(),
      menu_item_id: firstItem.id,
      quantity_sold: 1,
      unit_price: firstItem.current_price,
      net_sales: firstItem.current_price,
    });
    if (error) setBannerError(error.message);
    else refetch();
  }

  async function handleFieldChange(
    sale: SaleRow,
    field: "business_date" | "menu_item_id" | "quantity_sold",
    value: string,
  ) {
    let payload: SaleUpdate;
    if (field === "business_date") {
      payload = { business_date: value };
    } else if (field === "menu_item_id") {
      const menuItem = menuItems.find((m) => m.id === value);
      const unitPrice = menuItem?.current_price ?? sale.unit_price;
      payload = {
        menu_item_id: value,
        unit_price: unitPrice,
        net_sales: unitPrice * sale.quantity_sold,
      };
    } else {
      const quantity = parseInt(value, 10) || 0;
      payload = { quantity_sold: quantity, net_sales: quantity * sale.unit_price };
    }
    const { error } = await supabase
      .from("daily_menu_item_sales")
      .update(payload)
      .eq("id", sale.id);
    if (error) setBannerError(error.message);
    else refetch();
  }

  async function handleDelete(sale: SaleRow) {
    const { error } = await supabase
      .from("daily_menu_item_sales")
      .delete()
      .eq("id", sale.id);
    if (error) setBannerError(error.message);
    else refetch();
  }

  return (
    <>
      <ViewHeader
        title="Sales"
        subtitle="POS sales by item, with daily and item-level trends"
      />

      {bannerError && (
        <p className="form-error" onClick={() => setBannerError(null)}>
          {bannerError}
        </p>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2>Recorded Sales</h2>
          <button
            className="btn btn-primary"
            onClick={handleAddSale}
            disabled={menuItems.length === 0}
          >
            Add Sale
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Item</th>
              <th>Units Sold</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  No sales recorded yet.
                </td>
              </tr>
            ) : (
              sales.map((sale) => (
                <tr key={sale.id}>
                  <td>
                    <input
                      type="date"
                      defaultValue={sale.business_date}
                      onBlur={(e) =>
                        handleFieldChange(sale, "business_date", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <select
                      defaultValue={sale.menu_item_id}
                      onChange={(e) =>
                        handleFieldChange(sale, "menu_item_id", e.target.value)
                      }
                    >
                      {menuItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={sale.quantity_sold}
                      onBlur={(e) =>
                        handleFieldChange(sale, "quantity_sold", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      title="Delete"
                      onClick={() => handleDelete(sale)}
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
          <h2>Sales by Item</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Units Sold</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {performance.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty-state">
                  No sales recorded yet.
                </td>
              </tr>
            ) : (
              [...performance]
                .sort((a, b) => (b.units_sold ?? 0) - (a.units_sold ?? 0))
                .map((row) => (
                  <tr key={row.menu_item_id}>
                    <td>{row.name}</td>
                    <td>{row.units_sold}</td>
                    <td>{formatMoney(row.net_sales ?? 0)}</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Daily Sales Trend</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Units Sold</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {dailyTrend.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty-state">
                  No sales recorded yet.
                </td>
              </tr>
            ) : (
              dailyTrend.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{row.units}</td>
                  <td>{formatMoney(row.revenue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
