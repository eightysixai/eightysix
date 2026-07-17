#!/usr/bin/env node

/**
 * One-time importer for the legacy PNL JSON files.
 *
 * Run this from a trusted terminal only. It uses a Supabase server secret and
 * must never be imported by, bundled into, or executed from the Vite frontend.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(process.argv[2] ?? '.');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecret =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerUserId = process.env.OWNER_USER_ID;
const organizationName = process.env.ORGANIZATION_NAME ?? 'Eightysix Demo Restaurant';
const organizationSlug = process.env.ORGANIZATION_SLUG ?? 'eightysix-demo';
const locationName = process.env.LOCATION_NAME ?? 'Main Location';
const locationSlug = process.env.LOCATION_SLUG ?? 'main';
const timezone = process.env.LOCATION_TIMEZONE ?? 'America/New_York';
const currency = (process.env.LOCATION_CURRENCY ?? 'USD').toUpperCase();
const legacySource = 'legacy_json_v1';

if (!supabaseUrl || !supabaseSecret || !ownerUserId) {
  console.error(`Missing required environment variables.

Required:
  SUPABASE_URL
  SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
  OWNER_USER_ID

Optional:
  ORGANIZATION_NAME, ORGANIZATION_SLUG, LOCATION_NAME, LOCATION_SLUG,
  LOCATION_TIMEZONE, LOCATION_CURRENCY
`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function slugify(value, fallback = 'custom') {
  const slug = normalizeName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function inferUnitLabel(itemName, explicitUnit) {
  const provided = normalizeName(explicitUnit);
  if (provided) return provided;
  const name = normalizeName(itemName).toLowerCase();
  if (/\bcase\b/.test(name)) return 'case';
  if (/\bbox\b/.test(name)) return 'box';
  if (/\bbag\b/.test(name)) return 'bag';
  if (/\blb\b|pound/.test(name)) return 'lb';
  if (/\boz\b|ounce/.test(name)) return 'oz';
  return 'each';
}

async function readJson(fileName, fallback) {
  try {
    const raw = await fs.readFile(path.join(root, fileName), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.warn(`Skipping missing ${fileName}`);
      return fallback;
    }
    throw new Error(`Unable to read ${fileName}: ${error.message}`);
  }
}

async function one(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function getOrCreateOrganization() {
  const existing = await one(
    supabase.from('organizations').select('id').eq('slug', organizationSlug).maybeSingle(),
    'Find organization',
  );
  if (existing) return existing.id;

  const created = await one(
    supabase
      .from('organizations')
      .insert({ name: organizationName, slug: organizationSlug, created_by: ownerUserId })
      .select('id')
      .single(),
    'Create organization',
  );

  await one(
    supabase.from('organization_members').insert({
      organization_id: created.id,
      user_id: ownerUserId,
      role: 'owner',
      status: 'active',
      joined_at: new Date().toISOString(),
    }),
    'Create owner membership',
  );

  return created.id;
}

async function getOrCreateLocation(organizationId) {
  const existing = await one(
    supabase
      .from('locations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('slug', locationSlug)
      .maybeSingle(),
    'Find location',
  );
  if (existing) return existing.id;

  const created = await one(
    supabase
      .from('locations')
      .insert({
        organization_id: organizationId,
        name: locationName,
        slug: locationSlug,
        timezone,
        currency_code: currency,
      })
      .select('id')
      .single(),
    'Create location',
  );
  return created.id;
}

async function ensureCategories(organizationId) {
  const definitions = [
    ['food', 'Food', 'food'],
    ['inventory', 'Inventory / Supplies', 'inventory'],
    ['labor', 'Labor', 'labor'],
    ['overhead', 'Overhead', 'overhead'],
    ['other', 'Other', 'other'],
  ];

  await one(
    supabase.from('cost_categories').upsert(
      definitions.map(([code, name, category_group]) => ({
        organization_id: organizationId,
        code,
        name,
        category_group,
      })),
      { onConflict: 'organization_id,code' },
    ),
    'Upsert cost categories',
  );

  const rows = await one(
    supabase
      .from('cost_categories')
      .select('id, code')
      .eq('organization_id', organizationId),
    'Load cost categories',
  );
  return new Map(rows.map((row) => [row.code, row.id]));
}

const vendorCache = new Map();
async function ensureVendor(organizationId, name) {
  const normalized = normalizeName(name) || 'Unknown Vendor';
  const key = normalized.toLowerCase();
  if (vendorCache.has(key)) return vendorCache.get(key);

  const existing = await one(
    supabase
      .from('vendors')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('name', normalized)
      .is('archived_at', null)
      .limit(1)
      .maybeSingle(),
    `Find vendor ${normalized}`,
  );
  if (existing) {
    vendorCache.set(key, existing.id);
    return existing.id;
  }

  const created = await one(
    supabase
      .from('vendors')
      .insert({ organization_id: organizationId, name: normalized })
      .select('id')
      .single(),
    `Create vendor ${normalized}`,
  );
  vendorCache.set(key, created.id);
  return created.id;
}

const itemCache = new Map();
async function ensureItem(organizationId, categoryIds, name, categoryCode = 'other', unit = 'each') {
  const normalized = normalizeName(name) || 'Unnamed Item';
  const key = normalized.toLowerCase();
  if (itemCache.has(key)) return itemCache.get(key);

  const existing = await one(
    supabase
      .from('items')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('name', normalized)
      .is('archived_at', null)
      .limit(1)
      .maybeSingle(),
    `Find item ${normalized}`,
  );
  if (existing) {
    itemCache.set(key, existing.id);
    return existing.id;
  }

  const safeCategoryCode = categoryIds.has(categoryCode) ? categoryCode : 'other';
  const created = await one(
    supabase
      .from('items')
      .insert({
        organization_id: organizationId,
        name: normalized,
        cost_category_id: categoryIds.get(safeCategoryCode),
        base_unit_label: normalizeName(unit) || 'each',
      })
      .select('id')
      .single(),
    `Create item ${normalized}`,
  );
  itemCache.set(key, created.id);
  return created.id;
}

const employeeCache = new Map();
async function ensureEmployee(organizationId, displayName) {
  const normalized = normalizeName(displayName) || 'Unknown Employee';
  const key = normalized.toLowerCase();
  if (employeeCache.has(key)) return employeeCache.get(key);

  const existing = await one(
    supabase
      .from('employees')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('display_name', normalized)
      .limit(1)
      .maybeSingle(),
    `Find employee ${normalized}`,
  );
  if (existing) {
    employeeCache.set(key, existing.id);
    return existing.id;
  }

  const created = await one(
    supabase
      .from('employees')
      .insert({ organization_id: organizationId, display_name: normalized })
      .select('id')
      .single(),
    `Create employee ${normalized}`,
  );
  employeeCache.set(key, created.id);
  return created.id;
}

const roleCache = new Map();
async function ensureJobRole(organizationId, roleName) {
  const normalized = normalizeName(roleName) || 'Unassigned';
  const key = normalized.toLowerCase();
  if (roleCache.has(key)) return roleCache.get(key);

  const existing = await one(
    supabase
      .from('job_roles')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('name', normalized)
      .limit(1)
      .maybeSingle(),
    `Find job role ${normalized}`,
  );
  if (existing) {
    roleCache.set(key, existing.id);
    return existing.id;
  }

  const created = await one(
    supabase
      .from('job_roles')
      .insert({ organization_id: organizationId, name: normalized })
      .select('id')
      .single(),
    `Create job role ${normalized}`,
  );
  roleCache.set(key, created.id);
  return created.id;
}

async function importInvoices({ invoices, organizationId, locationId, categoryIds }) {
  for (const sourceInvoice of invoices) {
    const legacyId = toNumber(sourceInvoice.invoice_id, null);
    const vendorId = await ensureVendor(organizationId, sourceInvoice.vendor_name);

    let invoice = await one(
      supabase
        .from('invoices')
        .select('id')
        .eq('location_id', locationId)
        .eq('source', legacySource)
        .eq('legacy_id', legacyId)
        .maybeSingle(),
      `Find invoice ${legacyId}`,
    );

    const invoicePayload = {
      location_id: locationId,
      vendor_id: vendorId,
      invoice_date: sourceInvoice.invoice_date,
      status: 'posted',
      source: legacySource,
      legacy_id: legacyId,
      raw_payload: sourceInvoice,
    };

    if (invoice) {
      await one(supabase.from('invoices').update(invoicePayload).eq('id', invoice.id), `Update invoice ${legacyId}`);
      await one(supabase.from('invoice_line_items').delete().eq('invoice_id', invoice.id), `Clear invoice ${legacyId} lines`);
    } else {
      invoice = await one(
        supabase.from('invoices').insert(invoicePayload).select('id').single(),
        `Create invoice ${legacyId}`,
      );
    }

    const lineItems = [];
    for (const sourceLine of sourceInvoice.line_items ?? []) {
      const categoryCode = categoryIds.has(sourceLine.cost_category)
        ? sourceLine.cost_category
        : 'other';
      const itemId = await ensureItem(
        organizationId,
        categoryIds,
        sourceLine.item_name,
        categoryCode,
        inferUnitLabel(sourceLine.item_name, sourceLine.unit_label),
      );
      lineItems.push({
        invoice_id: invoice.id,
        item_id: itemId,
        cost_category_id: categoryIds.get(categoryCode),
        description: normalizeName(sourceLine.item_name) || 'Unnamed item',
        quantity: toNumber(sourceLine.quantity, 0),
        unit_label: inferUnitLabel(sourceLine.item_name, sourceLine.unit_label),
        unit_price: toNumber(sourceLine.price, 0),
        metadata: { legacy: sourceLine },
      });
    }
    if (lineItems.length > 0) {
      await one(supabase.from('invoice_line_items').insert(lineItems), `Insert invoice ${legacyId} lines`);
    }
  }
}

async function importRevenue({ dailyRevenue, locationId }) {
  if (!Array.isArray(dailyRevenue) || dailyRevenue.length === 0) return;
  await one(
    supabase.from('revenue_entries').upsert(
      dailyRevenue.map((entry) => ({
        location_id: locationId,
        business_date: entry.date,
        source: legacySource,
        gross_sales: toNumber(entry.revenue, 0),
        net_sales: toNumber(entry.revenue, 0),
        raw_payload: entry,
      })),
      { onConflict: 'location_id,business_date,source' },
    ),
    'Import daily revenue',
  );
}

async function importThresholds({ thresholds, locationId, categoryIds }) {
  const rows = [];
  for (const [code, value] of Object.entries(thresholds ?? {})) {
    if (!categoryIds.has(code)) continue;
    const fixed = value?.type === 'fixed';
    rows.push({
      location_id: locationId,
      cost_category_id: categoryIds.get(code),
      target_type: fixed ? 'fixed_amount' : 'percentage_of_revenue',
      target_value: fixed
        ? toNumber(value?.fixed_value, 0)
        : toNumber(value?.percentage_value, 0),
      effective_from: '1970-01-01',
      notes: 'Imported from budget_thresholds.json',
    });
  }
  if (rows.length > 0) {
    await one(
      supabase.from('budget_targets').upsert(rows, {
        onConflict: 'location_id,cost_category_id,effective_from',
      }),
      'Import budget targets',
    );
  }
}

async function importRecipes({ recipes, organizationId, locationId, categoryIds }) {
  const menuItemIds = new Map();
  const recipeVersionIds = new Map();

  for (const sourceRecipe of recipes) {
    const legacyId = toNumber(sourceRecipe.recipe_id, null);
    let menuItem = await one(
      supabase
        .from('menu_items')
        .select('id')
        .eq('location_id', locationId)
        .eq('legacy_id', legacyId)
        .maybeSingle(),
      `Find recipe ${legacyId}`,
    );

    const menuPayload = {
      location_id: locationId,
      name: normalizeName(sourceRecipe.name) || `Recipe ${legacyId}`,
      current_price: toNumber(sourceRecipe.menu_price, 0),
      legacy_id: legacyId,
      metadata: { legacy: sourceRecipe },
    };

    if (menuItem) {
      await one(supabase.from('menu_items').update(menuPayload).eq('id', menuItem.id), `Update recipe ${legacyId}`);
    } else {
      menuItem = await one(
        supabase.from('menu_items').insert(menuPayload).select('id').single(),
        `Create recipe ${legacyId}`,
      );
    }
    menuItemIds.set(legacyId, menuItem.id);

    let version = await one(
      supabase
        .from('recipe_versions')
        .select('id')
        .eq('menu_item_id', menuItem.id)
        .eq('version_number', 1)
        .maybeSingle(),
      `Find recipe ${legacyId} version`,
    );
    if (!version) {
      version = await one(
        supabase
          .from('recipe_versions')
          .insert({ menu_item_id: menuItem.id, version_number: 1, effective_from: '1970-01-01' })
          .select('id')
          .single(),
        `Create recipe ${legacyId} version`,
      );
    }
    recipeVersionIds.set(legacyId, version.id);
    await one(supabase.from('recipe_ingredients').delete().eq('recipe_version_id', version.id), `Clear recipe ${legacyId} ingredients`);

    const ingredients = [];
    for (const sourceIngredient of sourceRecipe.ingredients ?? []) {
      const itemId = await ensureItem(
        organizationId,
        categoryIds,
        sourceIngredient.item_name,
        'food',
        sourceIngredient.unit_label ?? 'each',
      );
      ingredients.push({
        recipe_version_id: version.id,
        item_id: itemId,
        quantity: toNumber(sourceIngredient.quantity, 0),
        unit_label: normalizeName(sourceIngredient.unit_label) || 'each',
        notes: 'Imported from recipes.json',
      });
    }
    if (ingredients.length > 0) {
      await one(supabase.from('recipe_ingredients').insert(ingredients), `Insert recipe ${legacyId} ingredients`);
    }
  }

  return { menuItemIds, recipeVersionIds };
}

async function importSales({ posSales, locationId, menuItemIds, recipeVersionIds, recipes }) {
  const recipePrices = new Map(
    recipes.map((recipe) => [toNumber(recipe.recipe_id, null), toNumber(recipe.menu_price, 0)]),
  );

  for (const sale of posSales) {
    const legacyId = toNumber(sale.sale_id, null);
    const recipeLegacyId = toNumber(sale.recipe_id, null);
    const menuItemId = menuItemIds.get(recipeLegacyId);
    if (!menuItemId) {
      console.warn(`Skipping sale ${legacyId}: recipe ${recipeLegacyId} was not found`);
      continue;
    }
    const quantity = toNumber(sale.quantity_sold, 0);
    const unitPrice = recipePrices.get(recipeLegacyId) ?? 0;
    const payload = {
      location_id: locationId,
      business_date: sale.date,
      menu_item_id: menuItemId,
      recipe_version_id: recipeVersionIds.get(recipeLegacyId) ?? null,
      quantity_sold: quantity,
      unit_price: unitPrice,
      net_sales: quantity * unitPrice,
      source: legacySource,
      legacy_id: legacyId,
      raw_payload: sale,
    };

    const existing = await one(
      supabase
        .from('daily_menu_item_sales')
        .select('id')
        .eq('location_id', locationId)
        .eq('source', legacySource)
        .eq('legacy_id', legacyId)
        .maybeSingle(),
      `Find sale ${legacyId}`,
    );
    if (existing) {
      await one(supabase.from('daily_menu_item_sales').update(payload).eq('id', existing.id), `Update sale ${legacyId}`);
    } else {
      await one(supabase.from('daily_menu_item_sales').insert(payload), `Create sale ${legacyId}`);
    }
  }
}

async function importInventoryCounts({ inventoryCounts, organizationId, locationId, categoryIds }) {
  const grouped = new Map();
  for (const count of inventoryCounts) {
    const date = count.date;
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push(count);
  }

  for (const [date, counts] of grouped) {
    const externalId = `${legacySource}:${date}`;
    let session = await one(
      supabase
        .from('inventory_counts')
        .select('id')
        .eq('location_id', locationId)
        .eq('source', legacySource)
        .eq('external_id', externalId)
        .maybeSingle(),
      `Find inventory count ${date}`,
    );
    if (!session) {
      session = await one(
        supabase
          .from('inventory_counts')
          .insert({
            location_id: locationId,
            business_date: date,
            counted_at: `${date}T12:00:00.000Z`,
            status: 'completed',
            source: legacySource,
            external_id: externalId,
          })
          .select('id')
          .single(),
        `Create inventory count ${date}`,
      );
    }

    await one(supabase.from('inventory_count_lines').delete().eq('inventory_count_id', session.id), `Clear inventory count ${date}`);
    const lines = [];
    for (const count of counts) {
      const itemId = await ensureItem(
        organizationId,
        categoryIds,
        count.item_name,
        'inventory',
        count.unit_label ?? 'each',
      );
      lines.push({
        inventory_count_id: session.id,
        item_id: itemId,
        quantity_on_hand: toNumber(count.quantity_on_hand, 0),
        unit_label: normalizeName(count.unit_label) || 'each',
        legacy_id: toNumber(count.count_id, null),
      });
    }
    if (lines.length > 0) {
      await one(supabase.from('inventory_count_lines').insert(lines), `Insert inventory count ${date} lines`);
    }
  }
}

async function importLabor({ laborShifts, organizationId, locationId }) {
  for (let index = 0; index < laborShifts.length; index += 1) {
    const shift = laborShifts[index];
    const legacyId = toNumber(shift.shift_id ?? shift.id, index + 1);
    const employeeName =
      shift.employee_name ?? shift.employee ?? shift.name ?? shift.staff_name ?? 'Unknown Employee';
    const roleName = shift.job_title ?? shift.title ?? shift.role ?? shift.position ?? 'Unassigned';
    const businessDate = shift.date ?? shift.business_date ?? shift.shift_date;
    if (!businessDate) {
      console.warn(`Skipping labor shift ${legacyId}: no date was found`, shift);
      continue;
    }

    const employeeId = await ensureEmployee(organizationId, employeeName);
    const jobRoleId = await ensureJobRole(organizationId, roleName);
    const payload = {
      location_id: locationId,
      employee_id: employeeId,
      job_role_id: jobRoleId,
      business_date: businessDate,
      hours_worked: toNumber(shift.hours_worked ?? shift.hours, 0),
      hourly_rate: toNumber(shift.hourly_rate ?? shift.rate ?? shift.wage, 0),
      source: legacySource,
      legacy_id: legacyId,
      notes: 'Imported from labor_shifts.json',
    };

    const existing = await one(
      supabase
        .from('labor_shifts')
        .select('id')
        .eq('location_id', locationId)
        .eq('source', legacySource)
        .eq('legacy_id', legacyId)
        .maybeSingle(),
      `Find labor shift ${legacyId}`,
    );
    if (existing) {
      await one(supabase.from('labor_shifts').update(payload).eq('id', existing.id), `Update labor shift ${legacyId}`);
    } else {
      await one(supabase.from('labor_shifts').insert(payload), `Create labor shift ${legacyId}`);
    }
  }
}

async function main() {
  console.log(`Reading legacy JSON from ${root}`);

  const [
    invoices,
    thresholds,
    dailyRevenue,
    recipes,
    posSales,
    inventoryCounts,
    laborShifts,
  ] = await Promise.all([
    readJson('invoices.json', []),
    readJson('budget_thresholds.json', {}),
    readJson('daily_revenue.json', []),
    readJson('recipes.json', []),
    readJson('pos_sales.json', []),
    readJson('inventory_counts.json', []),
    readJson('labor_shifts.json', []),
  ]);

  const organizationId = await getOrCreateOrganization();
  const locationId = await getOrCreateLocation(organizationId);
  const categoryIds = await ensureCategories(organizationId);

  await importInvoices({ invoices, organizationId, locationId, categoryIds });
  await importRevenue({ dailyRevenue, locationId });
  await importThresholds({ thresholds, locationId, categoryIds });
  const { menuItemIds, recipeVersionIds } = await importRecipes({
    recipes,
    organizationId,
    locationId,
    categoryIds,
  });
  await importSales({ posSales, locationId, menuItemIds, recipeVersionIds, recipes });
  await importInventoryCounts({
    inventoryCounts,
    organizationId,
    locationId,
    categoryIds,
  });
  await importLabor({ laborShifts, organizationId, locationId });

  console.log('\nMigration complete.');
  console.log(`Organization ID: ${organizationId}`);
  console.log(`Location ID:     ${locationId}`);
}

main().catch((error) => {
  console.error('\nMigration failed:');
  console.error(error);
  process.exit(1);
});
