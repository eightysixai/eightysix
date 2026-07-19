import { useState } from "react";
import { ViewHeader } from "../components/layout/ViewHeader";
import { useOrganization } from "../context/OrganizationContext";
import { formatMoney, todayISO } from "../lib/format";
import type { ReportColumn } from "../lib/report-export";
import { supabase } from "../lib/supabase";

type ReportType = "pnl" | "invoices" | "labor";

const REPORT_LABELS: Record<ReportType, string> = {
  pnl: "P&L Summary",
  invoices: "Invoices",
  labor: "Labor",
};

function firstOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export function ReportsPage() {
  const { locationId } = useOrganization();
  const [reportType, setReportType] = useState<ReportType>("pnl");
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(todayISO());
  const [rows, setRows] = useState<Record<string, string | number>[]>([]);
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  async function runReport() {
    if (!locationId) return;
    setLoading(true);
    setError(null);
    setHasRun(true);

    try {
      if (reportType === "pnl") {
        const { data, error: fetchError } = await supabase
          .from("daily_pnl")
          .select("*")
          .eq("location_id", locationId)
          .gte("business_date", fromDate)
          .lte("business_date", toDate)
          .order("business_date", { ascending: true });
        if (fetchError) throw fetchError;
        setColumns([
          { header: "Date", key: "date" },
          { header: "Revenue", key: "revenue" },
          { header: "Food Cost", key: "food" },
          { header: "Inventory Cost", key: "inventory" },
          { header: "Labor Cost", key: "labor" },
          { header: "Profit", key: "profit" },
          { header: "Margin %", key: "margin" },
        ]);
        setRows(
          (data ?? []).map((row) => ({
            date: row.business_date ?? "",
            revenue: formatMoney(row.net_sales ?? 0),
            food: formatMoney(row.food_cost ?? 0),
            inventory: formatMoney(row.inventory_cost ?? 0),
            labor: formatMoney(row.labor_cost ?? 0),
            profit: formatMoney(row.operating_profit ?? 0),
            margin: `${(row.operating_margin_percentage ?? 0).toFixed(1)}%`,
          })),
        );
      } else if (reportType === "invoices") {
        const { data, error: fetchError } = await supabase
          .from("invoices")
          .select("invoice_date, total_amount, vendor:vendors(name)")
          .eq("location_id", locationId)
          .is("archived_at", null)
          .gte("invoice_date", fromDate)
          .lte("invoice_date", toDate)
          .order("invoice_date", { ascending: true });
        if (fetchError) throw fetchError;
        setColumns([
          { header: "Date", key: "date" },
          { header: "Vendor", key: "vendor" },
          { header: "Total", key: "total" },
        ]);
        setRows(
          ((data ?? []) as unknown as {
            invoice_date: string;
            total_amount: number;
            vendor: { name: string } | null;
          }[]).map((row) => ({
            date: row.invoice_date,
            vendor: row.vendor?.name ?? "Unknown Vendor",
            total: formatMoney(row.total_amount),
          })),
        );
      } else {
        const { data, error: fetchError } = await supabase
          .from("labor_shifts")
          .select(
            "business_date, hours_worked, hourly_rate, labor_cost, employee:employees(display_name), job_role:job_roles(name)",
          )
          .eq("location_id", locationId)
          .gte("business_date", fromDate)
          .lte("business_date", toDate)
          .order("business_date", { ascending: true });
        if (fetchError) throw fetchError;
        setColumns([
          { header: "Date", key: "date" },
          { header: "Employee", key: "employee" },
          { header: "Role", key: "role" },
          { header: "Hours", key: "hours" },
          { header: "Rate", key: "rate" },
          { header: "Cost", key: "cost" },
        ]);
        setRows(
          ((data ?? []) as unknown as {
            business_date: string;
            hours_worked: number;
            hourly_rate: number;
            labor_cost: number;
            employee: { display_name: string } | null;
            job_role: { name: string } | null;
          }[]).map((row) => ({
            date: row.business_date,
            employee: row.employee?.display_name ?? "—",
            role: row.job_role?.name ?? "—",
            hours: row.hours_worked,
            rate: formatMoney(row.hourly_rate),
            cost: formatMoney(row.labor_cost),
          })),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run report");
    } finally {
      setLoading(false);
    }
  }

  const reportTitle = `${REPORT_LABELS[reportType]} (${fromDate} to ${toDate})`;

  return (
    <>
      <ViewHeader
        title="Reports"
        subtitle="Generate and export P&L, invoice, and labor reports"
      />

      {error && <p className="form-error">{error}</p>}

      <section className="panel">
        <div className="panel-header">
          <h2>Generate Report</h2>
        </div>
        <div className="form-row">
          <label>
            Report Type
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
            >
              <option value="pnl">P&amp;L Summary</option>
              <option value="invoices">Invoices</option>
              <option value="labor">Labor</option>
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
        </div>
        <button className="btn btn-primary" onClick={runReport} disabled={loading}>
          {loading ? "Running…" : "Run Report"}
        </button>
      </section>

      {hasRun && (
        <section className="panel">
          <div className="panel-header">
            <h2>{REPORT_LABELS[reportType]}</h2>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                disabled={rows.length === 0}
                onClick={() =>
                  import("../lib/report-export").then((m) =>
                    m.exportToExcel(reportTitle, columns, rows),
                  )
                }
              >
                Export Excel
              </button>
              <button
                className="btn btn-secondary"
                disabled={rows.length === 0}
                onClick={() =>
                  import("../lib/report-export").then((m) =>
                    m.exportToPdf(reportTitle, columns, rows),
                  )
                }
              >
                Export PDF
              </button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="empty-state">
                    No data for this range.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key}>{row[c.key]}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
