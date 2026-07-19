import { supabase } from "./supabase";

/**
 * The legacy app matched everything by free-text name (item_name, vendor_name,
 * employee_name). The new schema normalizes these into real tables, so the UI
 * still lets people type a name — these helpers find-or-create the underlying
 * row by case-insensitive name match within the organization, mirroring what
 * scripts/migrate-json-to-supabase.mjs does during import.
 */

export async function findOrCreateVendor(
  organizationId: string,
  name: string,
): Promise<string> {
  const normalized = name.trim();
  const { data: existing, error: findError } = await supabase
    .from("vendors")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", normalized)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("vendors")
    .insert({ organization_id: organizationId, name: normalized })
    .select("id")
    .single();
  if (createError) throw createError;
  return created.id;
}

export async function findOrCreateItem(
  organizationId: string,
  name: string,
  costCategoryId: string | null,
  unitLabel: string,
): Promise<string> {
  const normalized = name.trim();
  const { data: existing, error: findError } = await supabase
    .from("items")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", normalized)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("items")
    .insert({
      organization_id: organizationId,
      name: normalized,
      cost_category_id: costCategoryId,
      base_unit_label: unitLabel || "each",
    })
    .select("id")
    .single();
  if (createError) throw createError;
  return created.id;
}

export async function findOrCreateEmployee(
  organizationId: string,
  displayName: string,
): Promise<string> {
  const normalized = displayName.trim();
  const { data: existing, error: findError } = await supabase
    .from("employees")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("display_name", normalized)
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("employees")
    .insert({ organization_id: organizationId, display_name: normalized })
    .select("id")
    .single();
  if (createError) throw createError;
  return created.id;
}

export async function findOrCreateJobRole(
  organizationId: string,
  name: string,
): Promise<string> {
  const normalized = name.trim();
  const { data: existing, error: findError } = await supabase
    .from("job_roles")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", normalized)
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("job_roles")
    .insert({ organization_id: organizationId, name: normalized })
    .select("id")
    .single();
  if (createError) throw createError;
  return created.id;
}
