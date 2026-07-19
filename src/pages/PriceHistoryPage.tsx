import { useMemo } from "react";
import { ViewHeader } from "../components/layout/ViewHeader";
import { useOrganization } from "../context/OrganizationContext";
import { useRealtimeList } from "../hooks/useRealtimeList";
import { formatMoney } from "../lib/format";
import { computePriceHistoryStats, type PriceHistoryStats } from "../lib/pnl-calculations";
import { supabase } from "../lib/supabase";

interface PriceLineRow {
  item_id: string | null;
  unit_price: number;
  item: { name: string } | null;
  invoice: { invoice_date: string } | null;
}

export function PriceHistoryPage() {
  const { locationId } = useOrganization();

  const { data: lines } = useRealtimeList<PriceLineRow>({
    tables: ["invoice_line_items", "invoices"],
    filter: `location_id=eq.${locationId}`,
    enabled: !!locationId,
    fetcher: async () => {
      const { data, error } = await supabase
        .from("invoice_line_items")
        .select(
          "item_id, unit_price, item:items(name), invoice:invoices!inner(invoice_date, location_id, archived_at)",
        )
        .eq("invoice.location_id", locationId!)
        .is("invoice.archived_at", null);
      if (error) throw error;
      return (data ?? []) as unknown as PriceLineRow[];
    },
  });

  const cards = useMemo(() => {
    const byItem = new Map<
      string,
      { itemName: string; entries: { date: string; price: number }[] }
    >();
    for (const line of lines) {
      if (!line.item_id || !line.invoice) continue;
      const entry = byItem.get(line.item_id) ?? {
        itemName: line.item?.name ?? "Unknown item",
        entries: [],
      };
      entry.entries.push({ date: line.invoice.invoice_date, price: line.unit_price });
      byItem.set(line.item_id, entry);
    }
    return [...byItem.entries()]
      .map(([itemId, { itemName, entries }]) => ({
        itemId,
        itemName,
        stats: computePriceHistoryStats(entries),
      }))
      .filter((c): c is typeof c & { stats: PriceHistoryStats } => !!c.stats)
      .sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [lines]);

  return (
    <>
      <ViewHeader
        title="Price History"
        subtitle="Vendor pricing trends across invoices, so creeping prices don't go unnoticed"
      />

      <section className="panel">
        <div className="panel-header">
          <h2>Price Movers</h2>
        </div>
        {cards.length === 0 ? (
          <div className="empty-state">No purchases recorded yet.</div>
        ) : (
          <div className="price-history-grid">
            {cards.map((card) => (
              <PriceCard
                key={card.itemId}
                itemName={card.itemName}
                stats={card.stats}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function PriceCard({
  itemName,
  stats,
}: {
  itemName: string;
  stats: PriceHistoryStats;
}) {
  const { entries, first, latest, pctChange, isCreeping } = stats;

  if (entries.length < 2) {
    return (
      <div className="price-card">
        <h3>{itemName}</h3>
        <div className="price-stats">
          <span>Only one purchase on record</span>
          <strong>{formatMoney(first.price)}</strong>
        </div>
      </div>
    );
  }

  const width = 260;
  const height = 90;
  const padding = 14;
  const minPrice = Math.min(...entries.map((e) => e.price));
  const maxPrice = Math.max(...entries.map((e) => e.price));
  const priceRange = maxPrice - minPrice || 1;
  const xStep = (width - padding * 2) / (entries.length - 1);
  const yFor = (price: number) =>
    height - padding - ((price - minPrice) / priceRange) * (height - padding * 2);

  const points = entries.map((e, i) => ({
    x: padding + xStep * i,
    y: yFor(e.price),
    entry: e,
  }));
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="price-card">
      <h3>{itemName}</h3>
      <svg
        className="sparkline-svg"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
      >
        <line
          className="spark-baseline"
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
        />
        <path className="spark-line" d={linePath} />
        {points.map((p, i) => (
          <circle key={i} className="spark-point" cx={p.x} cy={p.y} r={3}>
            <title>
              {p.entry.date}: {formatMoney(p.entry.price)}
            </title>
          </circle>
        ))}
      </svg>
      <div className="price-stats">
        <span>
          First: <strong>{formatMoney(first.price)}</strong>
        </span>
        <span>
          Latest: <strong>{formatMoney(latest.price)}</strong>
        </span>
        <span>
          Change:{" "}
          <strong>
            {pctChange >= 0 ? "+" : ""}
            {pctChange.toFixed(1)}%
          </strong>
        </span>
      </div>
      {isCreeping && <div className="warning-flag">Creeping ↑</div>}
    </div>
  );
}
