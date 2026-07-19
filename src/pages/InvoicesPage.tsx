import { useEffect, useMemo, useState } from "react";
import { InvoiceFormModal, type EditingInvoice } from "../components/invoices/InvoiceFormModal";
import { ViewHeader } from "../components/layout/ViewHeader";
import { useOrganization } from "../context/OrganizationContext";
import { useCostCategories } from "../hooks/useCostCategories";
import { useRealtimeList } from "../hooks/useRealtimeList";
import { formatMoney } from "../lib/format";
import { supabase } from "../lib/supabase";

interface InvoiceListRow {
  id: string;
  invoice_date: string;
  total_amount: number;
  vendor: { id: string; name: string } | null;
  line_items: {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    cost_category: { code: string } | null;
  }[];
}

export function InvoicesPage() {
  const { organizationId, locationId } = useOrganization();
  const { categories } = useCostCategories(organizationId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<EditingInvoice | null>(
    null,
  );
  const [vendorNames, setVendorNames] = useState<string[]>([]);
  const [itemNames, setItemNames] = useState<string[]>([]);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const { data: invoices, refetch } = useRealtimeList<InvoiceListRow>({
    tables: ["invoices", "invoice_line_items"],
    filter: `location_id=eq.${locationId}`,
    enabled: !!locationId,
    fetcher: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          `id, invoice_date, total_amount,
           vendor:vendors(id, name),
           line_items:invoice_line_items(id, description, quantity, unit_price, cost_category:cost_categories(code))`,
        )
        .eq("location_id", locationId!)
        .is("archived_at", null)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceListRow[];
    },
  });

  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("vendors")
      .select("name")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .then(({ data }) => setVendorNames((data ?? []).map((v) => v.name)));
    supabase
      .from("items")
      .select("name")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .then(({ data }) => setItemNames((data ?? []).map((i) => i.name)));
  }, [organizationId, modalOpen]);

  const sortedCategories = useMemo(() => categories, [categories]);

  function openAddModal() {
    setEditingInvoice(null);
    setModalOpen(true);
  }

  function openEditModal(invoice: InvoiceListRow) {
    setEditingInvoice({
      id: invoice.id,
      vendorName: invoice.vendor?.name ?? "",
      invoiceDate: invoice.invoice_date,
      lineItems: invoice.line_items.map((item) => ({
        itemName: item.description,
        costCategoryCode:
          (item.cost_category?.code as "food" | "inventory" | "labor") ??
          "food",
        quantity: item.quantity,
        unitPrice: item.unit_price,
      })),
    });
    setModalOpen(true);
  }

  async function handleDelete(invoice: InvoiceListRow) {
    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", invoice.id);
    if (error) setBannerError(error.message);
    else refetch();
  }

  return (
    <>
      <ViewHeader
        title="Invoices"
        subtitle="Vendor purchases and cost breakdown"
      />

      {bannerError && (
        <p className="form-error" onClick={() => setBannerError(null)}>
          {bannerError}
        </p>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2>Invoices</h2>
          <button className="btn btn-primary" onClick={openAddModal}>
            Add Invoice
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Date</th>
              <th>Total Cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  No invoices yet.
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.vendor?.name ?? "Unknown Vendor"}</td>
                  <td>{invoice.invoice_date}</td>
                  <td>{formatMoney(invoice.total_amount)}</td>
                  <td>
                    <button
                      className="icon-btn"
                      title="Edit"
                      onClick={() => openEditModal(invoice)}
                    >
                      &#9998;
                    </button>
                    <button
                      className="icon-btn"
                      title="Delete"
                      onClick={() => handleDelete(invoice)}
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

      {organizationId && locationId && (
        <InvoiceFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          organizationId={organizationId}
          locationId={locationId}
          categories={sortedCategories}
          vendorNames={vendorNames}
          itemNames={itemNames}
          editingInvoice={editingInvoice}
          onSaved={refetch}
        />
      )}
    </>
  );
}
