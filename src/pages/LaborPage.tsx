import { useMemo, useState } from "react";
import { ViewHeader } from "../components/layout/ViewHeader";
import { useOrganization } from "../context/OrganizationContext";
import { useRealtimeList } from "../hooks/useRealtimeList";
import { formatMoney, todayISO } from "../lib/format";
import { findOrCreateEmployee, findOrCreateJobRole } from "../lib/resolve-entities";
import { supabase } from "../lib/supabase";

interface ShiftRow {
  id: string;
  business_date: string;
  employee_id: string;
  job_role_id: string | null;
  hours_worked: number;
  hourly_rate: number;
  labor_cost: number;
  employee: { display_name: string } | null;
  job_role: { name: string } | null;
}

export function LaborPage() {
  const { organizationId, locationId } = useOrganization();
  const [bannerError, setBannerError] = useState<string | null>(null);

  const { data: shifts, refetch } = useRealtimeList<ShiftRow>({
    tables: ["labor_shifts"],
    filter: `location_id=eq.${locationId}`,
    enabled: !!locationId,
    fetcher: async () => {
      const { data, error } = await supabase
        .from("labor_shifts")
        .select(
          "id, business_date, employee_id, job_role_id, hours_worked, hourly_rate, labor_cost, employee:employees(display_name), job_role:job_roles(name)",
        )
        .eq("location_id", locationId!)
        .order("business_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ShiftRow[];
    },
  });

  const byTitle = useMemo(() => {
    const map = new Map<string, { title: string; hours: number; cost: number }>();
    for (const shift of shifts) {
      const title = shift.job_role?.name ?? "(untitled)";
      const entry = map.get(title) ?? { title, hours: 0, cost: 0 };
      entry.hours += shift.hours_worked;
      entry.cost += shift.labor_cost;
      map.set(title, entry);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  }, [shifts]);

  const byEmployee = useMemo(() => {
    const map = new Map<
      string,
      { name: string; title: string; hours: number; cost: number }
    >();
    for (const shift of shifts) {
      const name = shift.employee?.display_name ?? "(unnamed)";
      const entry = map.get(name) ?? {
        name,
        title: shift.job_role?.name ?? "—",
        hours: 0,
        cost: 0,
      };
      entry.hours += shift.hours_worked;
      entry.cost += shift.labor_cost;
      map.set(name, entry);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  }, [shifts]);

  async function handleAddShift() {
    if (!organizationId || !locationId) return;
    try {
      const employeeId = await findOrCreateEmployee(
        organizationId,
        "Unknown Employee",
      );
      const { error } = await supabase.from("labor_shifts").insert({
        location_id: locationId,
        employee_id: employeeId,
        business_date: todayISO(),
        hours_worked: 0,
        hourly_rate: 0,
      });
      if (error) throw error;
      refetch();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "Failed to add shift");
    }
  }

  async function handleEmployeeNameChange(shift: ShiftRow, name: string) {
    if (!organizationId || !name.trim()) return;
    try {
      const employeeId = await findOrCreateEmployee(organizationId, name);
      const { error } = await supabase
        .from("labor_shifts")
        .update({ employee_id: employeeId })
        .eq("id", shift.id);
      if (error) throw error;
      refetch();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "Failed to update shift");
    }
  }

  async function handleJobTitleChange(shift: ShiftRow, title: string) {
    if (!organizationId) return;
    try {
      const jobRoleId = title.trim()
        ? await findOrCreateJobRole(organizationId, title)
        : null;
      const { error } = await supabase
        .from("labor_shifts")
        .update({ job_role_id: jobRoleId })
        .eq("id", shift.id);
      if (error) throw error;
      refetch();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "Failed to update shift");
    }
  }

  async function handleNumberChange(
    shift: ShiftRow,
    field: "hours_worked" | "hourly_rate",
    value: string,
  ) {
    const parsed = parseFloat(value) || 0;
    const payload =
      field === "hours_worked"
        ? { hours_worked: parsed }
        : { hourly_rate: parsed };
    const { error } = await supabase
      .from("labor_shifts")
      .update(payload)
      .eq("id", shift.id);
    if (error) setBannerError(error.message);
    else refetch();
  }

  async function handleDateChange(shift: ShiftRow, value: string) {
    const { error } = await supabase
      .from("labor_shifts")
      .update({ business_date: value })
      .eq("id", shift.id);
    if (error) setBannerError(error.message);
    else refetch();
  }

  async function handleDelete(shift: ShiftRow) {
    const { error } = await supabase
      .from("labor_shifts")
      .delete()
      .eq("id", shift.id);
    if (error) setBannerError(error.message);
    else refetch();
  }

  return (
    <>
      <ViewHeader
        title="Labor"
        subtitle="Shift log and labor cost breakdown by job title and employee"
      />

      {bannerError && (
        <p className="form-error" onClick={() => setBannerError(null)}>
          {bannerError}
        </p>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2>Shift Log</h2>
          <button className="btn btn-primary" onClick={handleAddShift}>
            Add Shift
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Employee</th>
              <th>Job Title</th>
              <th>Hours</th>
              <th>Rate</th>
              <th>Cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shifts.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  No shifts logged yet.
                </td>
              </tr>
            ) : (
              shifts.map((shift) => (
                <tr key={shift.id}>
                  <td>
                    <input
                      type="date"
                      defaultValue={shift.business_date}
                      onBlur={(e) => handleDateChange(shift, e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      defaultValue={shift.employee?.display_name ?? ""}
                      onBlur={(e) =>
                        handleEmployeeNameChange(shift, e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      defaultValue={shift.job_role?.name ?? ""}
                      onBlur={(e) => handleJobTitleChange(shift, e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={0.25}
                      defaultValue={shift.hours_worked}
                      onBlur={(e) =>
                        handleNumberChange(shift, "hours_worked", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      defaultValue={shift.hourly_rate}
                      onBlur={(e) =>
                        handleNumberChange(shift, "hourly_rate", e.target.value)
                      }
                    />
                  </td>
                  <td>{formatMoney(shift.labor_cost)}</td>
                  <td>
                    <button
                      className="icon-btn"
                      title="Delete"
                      onClick={() => handleDelete(shift)}
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
          <h2>Labor Cost by Job Title</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Job Title</th>
              <th>Hours</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {byTitle.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty-state">
                  No shifts logged yet.
                </td>
              </tr>
            ) : (
              byTitle.map((row) => (
                <tr key={row.title}>
                  <td>{row.title}</td>
                  <td>{row.hours}h</td>
                  <td>{formatMoney(row.cost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Labor Cost by Employee</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Job Title</th>
              <th>Hours</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {byEmployee.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  No shifts logged yet.
                </td>
              </tr>
            ) : (
              byEmployee.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.title}</td>
                  <td>{row.hours}h</td>
                  <td>{formatMoney(row.cost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
