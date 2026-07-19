import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { Modal } from "../ui/Modal";
import { findOrCreateItem, findOrCreateVendor } from "../../lib/resolve-entities";
import { formatMoney, todayISO } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { Database } from "../../types/database";

type CostCategoryRow = Database["public"]["Tables"]["cost_categories"]["Row"];

const lineItemSchema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  costCategoryCode: z.enum(["food", "inventory", "labor"]),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
});

const invoiceSchema = z.object({
  vendorName: z.string().min(1, "Vendor name is required"),
  invoiceDate: z.string().min(1, "Date is required"),
  lineItems: z.array(lineItemSchema).min(1, "Add at least one line item"),
});

export type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export interface EditingInvoice {
  id: string;
  vendorName: string;
  invoiceDate: string;
  lineItems: InvoiceFormValues["lineItems"];
}

const emptyLineItem: InvoiceFormValues["lineItems"][number] = {
  itemName: "",
  costCategoryCode: "food",
  quantity: 1,
  unitPrice: 0,
};

export function InvoiceFormModal({
  open,
  onClose,
  organizationId,
  locationId,
  categories,
  vendorNames,
  itemNames,
  editingInvoice,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  locationId: string;
  categories: CostCategoryRow[];
  vendorNames: string[];
  itemNames: string[];
  editingInvoice: EditingInvoice | null;
  onSaved: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: editingInvoice
      ? {
          vendorName: editingInvoice.vendorName,
          invoiceDate: editingInvoice.invoiceDate,
          lineItems: editingInvoice.lineItems,
        }
      : {
          vendorName: "",
          invoiceDate: todayISO(),
          lineItems: [emptyLineItem],
        },
  });

  useEffect(() => {
    if (!open) return;
    reset(
      editingInvoice
        ? {
            vendorName: editingInvoice.vendorName,
            invoiceDate: editingInvoice.invoiceDate,
            lineItems: editingInvoice.lineItems,
          }
        : {
            vendorName: "",
            invoiceDate: todayISO(),
            lineItems: [emptyLineItem],
          },
    );
    setFormError(null);
  }, [open, editingInvoice, reset]);

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lineItems",
  });

  const lineItems = watch("lineItems");
  const total = lineItems.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0),
    0,
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const vendorId = await findOrCreateVendor(
        organizationId,
        values.vendorName,
      );

      let invoiceId: string;
      if (editingInvoice) {
        invoiceId = editingInvoice.id;
        const { error } = await supabase
          .from("invoices")
          .update({ vendor_id: vendorId, invoice_date: values.invoiceDate })
          .eq("id", invoiceId);
        if (error) throw error;
        const { error: deleteError } = await supabase
          .from("invoice_line_items")
          .delete()
          .eq("invoice_id", invoiceId);
        if (deleteError) throw deleteError;
      } else {
        const { data, error } = await supabase
          .from("invoices")
          .insert({
            location_id: locationId,
            vendor_id: vendorId,
            invoice_date: values.invoiceDate,
            status: "posted",
            source: "manual",
          })
          .select("id")
          .single();
        if (error) throw error;
        invoiceId = data.id;
      }

      const rows = [];
      for (const item of values.lineItems) {
        const category = categories.find(
          (c) => c.code === item.costCategoryCode,
        );
        const itemId = await findOrCreateItem(
          organizationId,
          item.itemName,
          category?.id ?? null,
          "each",
        );
        rows.push({
          invoice_id: invoiceId,
          item_id: itemId,
          cost_category_id: category?.id ?? null,
          description: item.itemName.trim(),
          quantity: item.quantity,
          unit_price: item.unitPrice,
        });
      }
      const { error: insertError } = await supabase
        .from("invoice_line_items")
        .insert(rows);
      if (insertError) throw insertError;

      onSaved();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save invoice");
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingInvoice ? "Edit Invoice" : "Add Invoice"}
    >
      <datalist id="vendor-names">
        {vendorNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="item-names">
        {itemNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {formError && <p className="form-error">{formError}</p>}

      <form onSubmit={onSubmit} noValidate>
        <div className="form-row">
          <label>
            Vendor Name
            <input
              type="text"
              list="vendor-names"
              {...register("vendorName")}
            />
            {errors.vendorName && (
              <span className="form-error">{errors.vendorName.message}</span>
            )}
          </label>
          <label>
            Date
            <input type="date" {...register("invoiceDate")} />
          </label>
        </div>

        <h3>Line Items</h3>
        <div>
          {fields.map((field, index) => (
            <div className="line-item-row" key={field.id}>
              <label>
                Item
                <input
                  type="text"
                  list="item-names"
                  placeholder="Item name"
                  {...register(`lineItems.${index}.itemName` as const)}
                />
              </label>
              <label>
                Category
                <select
                  {...register(
                    `lineItems.${index}.costCategoryCode` as const,
                  )}
                >
                  <option value="food">Food</option>
                  <option value="inventory">Inventory</option>
                  <option value="labor">Labor</option>
                </select>
              </label>
              <label>
                Qty
                <input
                  type="number"
                  min={0}
                  step="any"
                  {...register(`lineItems.${index}.quantity` as const, {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label>
                Price
                <input
                  type="number"
                  min={0}
                  step="any"
                  {...register(`lineItems.${index}.unitPrice` as const, {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <button
                type="button"
                className="icon-btn"
                title="Remove"
                onClick={() => remove(index)}
                disabled={fields.length <= 1}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
        {errors.lineItems?.root?.message && (
          <p className="form-error">{errors.lineItems.root.message}</p>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => append(emptyLineItem)}
        >
          Add Line Item
        </button>

        <div className="modal-footer">
          <div className="modal-total">Total: {formatMoney(total)}</div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save Invoice"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
