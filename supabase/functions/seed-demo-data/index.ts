// One-off seeding function: creates (or refreshes) a demo account with a
// full, realistic dataset across every table, so the whole app can be
// clicked through without manual data entry. Not linked from the UI —
// invoke it directly with the SEED_SECRET. Safe to re-run: it wipes and
// regenerates the demo org's operational data each time.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const DEMO_EMAIL = "demo@eightysix.app";
const DEMO_PASSWORD = "EightysixDemo!2026";
const DAYS_OF_HISTORY = 60;

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const seedSecret = Deno.env.get("SEED_SECRET");
    if (!seedSecret) {
      return json({ error: "SEED_SECRET is not configured on this project" }, 503);
    }
    const { secret } = await req.json().catch(() => ({}));
    if (secret !== seedSecret) {
      return json({ error: "Invalid seed secret" }, 403);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Demo user (find-or-create).
    let demoUserId: string;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Demo Owner" },
    });
    if (created?.user) {
      demoUserId = created.user.id;
    } else if (createErr) {
      let found: { id: string } | null = null;
      let page = 1;
      while (!found) {
        const { data: pageData, error: listErr } = await admin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (listErr) return json({ error: listErr.message }, 500);
        found = pageData.users.find((u) => u.email === DEMO_EMAIL) ?? null;
        if (pageData.users.length < 200) break;
        page += 1;
      }
      if (!found) return json({ error: createErr.message }, 500);
      demoUserId = found.id;
    } else {
      return json({ error: "Could not create or find demo user" }, 500);
    }

    // 2. Demo organization (find-or-create), owned by the demo user.
    const orgSlug = "demo-restaurant";
    let organizationId: string;
    const { data: existingOrg } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .maybeSingle();
    if (existingOrg) {
      organizationId = existingOrg.id;
    } else {
      const { data: newOrg, error: orgErr } = await admin
        .from("organizations")
        .insert({ name: "Demo Restaurant", slug: orgSlug, created_by: demoUserId, plan: "pro", billing_status: "active" })
        .select("id")
        .single();
      if (orgErr) return json({ error: orgErr.message }, 500);
      organizationId = newOrg.id;
    }

    await admin.from("organization_members").upsert(
      {
        organization_id: organizationId,
        user_id: demoUserId,
        role: "owner",
        status: "active",
        joined_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,user_id" },
    );

    // 3. Cost categories.
    const categoryDefs: [string, string, string][] = [
      ["food", "Food", "food"],
      ["inventory", "Inventory / Supplies", "inventory"],
      ["labor", "Labor", "labor"],
      ["overhead", "Overhead", "overhead"],
      ["other", "Other", "other"],
    ];
    await admin.from("cost_categories").upsert(
      categoryDefs.map(([code, name, category_group]) => ({
        organization_id: organizationId,
        code,
        name,
        category_group,
      })),
      { onConflict: "organization_id,code" },
    );
    const { data: categoryRows } = await admin
      .from("cost_categories")
      .select("id, code")
      .eq("organization_id", organizationId);
    const categoryId = new Map((categoryRows ?? []).map((c) => [c.code, c.id]));

    // 4. Location (find-or-create).
    let locationId: string;
    const { data: existingLocation } = await admin
      .from("locations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("slug", "main")
      .maybeSingle();
    if (existingLocation) {
      locationId = existingLocation.id;
    } else {
      const { data: newLocation, error: locErr } = await admin
        .from("locations")
        .insert({
          organization_id: organizationId,
          name: "Main Location",
          slug: "main",
          timezone: "America/New_York",
          currency_code: "USD",
        })
        .select("id")
        .single();
      if (locErr) return json({ error: locErr.message }, 500);
      locationId = newLocation.id;
    }

    // 5. Wipe existing operational data for a clean reseed (FK-safe order).
    await admin.from("labor_shifts").delete().eq("location_id", locationId);
    await admin.from("inventory_counts").delete().eq("location_id", locationId);
    await admin.from("daily_menu_item_sales").delete().eq("location_id", locationId);
    await admin.from("menu_items").delete().eq("location_id", locationId);
    await admin.from("invoices").delete().eq("location_id", locationId);
    await admin.from("budget_targets").delete().eq("location_id", locationId);
    await admin.from("revenue_entries").delete().eq("location_id", locationId);
    await admin.from("employees").delete().eq("organization_id", organizationId);
    await admin.from("job_roles").delete().eq("organization_id", organizationId);
    await admin.from("items").delete().eq("organization_id", organizationId);
    await admin.from("vendors").delete().eq("organization_id", organizationId);

    // 6. Vendors.
    const vendorDefs = ["Sysco Foods", "US Foods", "Restaurant Depot"];
    const { data: vendorRows } = await admin
      .from("vendors")
      .insert(vendorDefs.map((name) => ({ organization_id: organizationId, name })))
      .select("id, name");
    const vendorId = new Map((vendorRows ?? []).map((v) => [v.name, v.id]));

    // 7. Items (name, category, base price, unit).
    const itemDefs: [string, string, number, string][] = [
      ["Chicken Breast (case)", "food", 65, "case"],
      ["Ground Beef (case)", "food", 72, "case"],
      ["Romaine Lettuce (case)", "food", 18, "case"],
      ["Tomatoes (case)", "food", 22, "case"],
      ["Olive Oil (case)", "food", 48, "case"],
      ["Garlic (case)", "food", 14, "case"],
      ["Cheese (case)", "food", 55, "case"],
      ["Bread Buns (case)", "food", 20, "case"],
      ["Bacon (case)", "food", 60, "case"],
      ["Paper Towels (case)", "inventory", 45, "case"],
      ["To-Go Containers (case)", "inventory", 47.5, "case"],
      ["Napkins (case)", "inventory", 25, "case"],
      ["Dish Soap (case)", "inventory", 30, "case"],
      ["Trash Bags (case)", "inventory", 35, "case"],
    ];
    // A couple of items intentionally creep in price over the period.
    const creepingItems = new Set(["Olive Oil (case)", "Paper Towels (case)"]);

    const { data: itemRows } = await admin
      .from("items")
      .insert(
        itemDefs.map(([name, categoryCode, , unit]) => ({
          organization_id: organizationId,
          name,
          cost_category_id: categoryId.get(categoryCode) ?? null,
          base_unit_label: unit,
        })),
      )
      .select("id, name");
    const itemId = new Map((itemRows ?? []).map((i) => [i.name, i.id]));

    // 8. Invoices — roughly one every 4 days over the history window, 3-5 line items each.
    const invoiceRows: {
      location_id: string;
      vendor_id: string;
      invoice_date: string;
      status: string;
      source: string;
    }[] = [];
    const invoiceDates: string[] = [];
    for (let d = DAYS_OF_HISTORY; d >= 0; d -= 4) invoiceDates.push(daysAgo(d));

    for (const date of invoiceDates) {
      invoiceRows.push({
        location_id: locationId,
        vendor_id: vendorId.get(pick(vendorDefs))!,
        invoice_date: date,
        status: "posted",
        source: "manual",
      });
    }
    const { data: createdInvoices } = await admin
      .from("invoices")
      .insert(invoiceRows)
      .select("id, invoice_date");

    const lineItemRows: {
      invoice_id: string;
      item_id: string;
      cost_category_id: string | null;
      description: string;
      quantity: number;
      unit_label: string;
      unit_price: number;
    }[] = [];
    for (const invoice of createdInvoices ?? []) {
      const daysIntoWindow = DAYS_OF_HISTORY - daysBetween(invoice.invoice_date);
      const progress = daysIntoWindow / DAYS_OF_HISTORY; // 0 (oldest) -> 1 (newest)
      const itemsForInvoice = shuffle([...itemDefs]).slice(0, 3 + Math.floor(Math.random() * 3));
      for (const [name, categoryCode, basePrice, unit] of itemsForInvoice) {
        const drift = creepingItems.has(name)
          ? 1 + 0.12 * progress // up to +12% by the end
          : 1 + (Math.random() - 0.5) * 0.06; // +/-3% noise
        lineItemRows.push({
          invoice_id: invoice.id,
          item_id: itemId.get(name)!,
          cost_category_id: categoryId.get(categoryCode) ?? null,
          description: name,
          quantity: 2 + Math.floor(Math.random() * 5),
          unit_label: unit,
          unit_price: round2(basePrice * drift),
        });
      }
    }
    if (lineItemRows.length > 0) {
      await admin.from("invoice_line_items").insert(lineItemRows);
    }

    // 9. Menu items + recipes.
    const recipeDefs: [string, number, [string, number][]][] = [
      [
        "Grilled Chicken Caesar Salad",
        16,
        [
          ["Chicken Breast (case)", 0.05],
          ["Romaine Lettuce (case)", 0.08],
          ["Olive Oil (case)", 0.01],
        ],
      ],
      [
        "Chicken Caesar Wrap",
        13.5,
        [
          ["Chicken Breast (case)", 0.04],
          ["Romaine Lettuce (case)", 0.03],
        ],
      ],
      [
        "Garden Salad",
        9,
        [
          ["Romaine Lettuce (case)", 0.1],
          ["Tomatoes (case)", 0.05],
          ["Garlic (case)", 0.01],
        ],
      ],
      [
        "Classic Cheeseburger",
        14,
        [
          ["Ground Beef (case)", 0.08],
          ["Cheese (case)", 0.02],
          ["Bread Buns (case)", 0.1],
        ],
      ],
      [
        "Bacon Cheeseburger",
        16,
        [
          ["Ground Beef (case)", 0.08],
          ["Cheese (case)", 0.02],
          ["Bread Buns (case)", 0.1],
          ["Bacon (case)", 0.05],
        ],
      ],
      ["Roasted Chicken Plate", 18.5, [["Chicken Breast (case)", 0.08]]],
      ["House Side Salad", 6, [["Romaine Lettuce (case)", 0.04]]],
    ];
    // Popularity weight per recipe — creates a real star/plowhorse/puzzle/dog spread.
    const popularityWeight: Record<string, number> = {
      "Grilled Chicken Caesar Salad": 22,
      "Chicken Caesar Wrap": 14,
      "Garden Salad": 6,
      "Classic Cheeseburger": 26,
      "Bacon Cheeseburger": 5,
      "Roasted Chicken Plate": 10,
      "House Side Salad": 4,
    };

    const menuItemId = new Map<string, string>();
    for (const [name, menuPrice] of recipeDefs) {
      const { data: menuItem, error: menuErr } = await admin
        .from("menu_items")
        .insert({ location_id: locationId, name, current_price: menuPrice })
        .select("id")
        .single();
      if (menuErr) return json({ error: menuErr.message }, 500);
      menuItemId.set(name, menuItem.id);

      const { data: version, error: versionErr } = await admin
        .from("recipe_versions")
        .insert({ menu_item_id: menuItem.id, version_number: 1, effective_from: "1970-01-01" })
        .select("id")
        .single();
      if (versionErr) return json({ error: versionErr.message }, 500);

      const ingredients = recipeDefs.find(([n]) => n === name)![2];
      await admin.from("recipe_ingredients").insert(
        ingredients.map(([itemName, quantity]) => ({
          recipe_version_id: version.id,
          item_id: itemId.get(itemName)!,
          quantity,
          unit_label: "case",
        })),
      );
    }

    // 10. Daily sales, revenue, and budget targets for every day in the window.
    const salesRows: {
      location_id: string;
      business_date: string;
      menu_item_id: string;
      quantity_sold: number;
      unit_price: number;
      net_sales: number;
    }[] = [];
    const revenueRows: {
      location_id: string;
      business_date: string;
      source: string;
      gross_sales: number;
      net_sales: number;
    }[] = [];

    for (let d = DAYS_OF_HISTORY; d >= 0; d -= 1) {
      const date = daysAgo(d);
      let dayMenuRevenue = 0;
      for (const [name, menuPrice] of recipeDefs) {
        const weight = popularityWeight[name] ?? 5;
        const quantity = Math.max(0, Math.round(weight * (0.7 + Math.random() * 0.6)));
        if (quantity === 0) continue;
        const net = round2(quantity * menuPrice);
        dayMenuRevenue += net;
        salesRows.push({
          location_id: locationId,
          business_date: date,
          menu_item_id: menuItemId.get(name)!,
          quantity_sold: quantity,
          unit_price: menuPrice,
          net_sales: net,
        });
      }
      // Total revenue runs a bit ahead of tracked menu-item sales (drinks, sides, etc. not modeled as recipes).
      const totalRevenue = round2(dayMenuRevenue * (1.15 + Math.random() * 0.15));
      revenueRows.push({
        location_id: locationId,
        business_date: date,
        source: "manual",
        gross_sales: totalRevenue,
        net_sales: totalRevenue,
      });
    }
    // Insert in chunks to stay well under request size limits.
    for (const chunk of chunks(salesRows, 200)) {
      await admin.from("daily_menu_item_sales").insert(chunk);
    }
    for (const chunk of chunks(revenueRows, 200)) {
      await admin.from("revenue_entries").insert(chunk);
    }

    await admin.from("budget_targets").insert([
      {
        location_id: locationId,
        cost_category_id: categoryId.get("food")!,
        target_type: "percentage_of_revenue",
        target_value: 30,
        effective_from: "1970-01-01",
      },
      {
        location_id: locationId,
        cost_category_id: categoryId.get("inventory")!,
        target_type: "fixed_amount",
        target_value: 600,
        effective_from: "1970-01-01",
      },
      {
        location_id: locationId,
        cost_category_id: categoryId.get("labor")!,
        target_type: "percentage_of_revenue",
        target_value: 28,
        effective_from: "1970-01-01",
      },
    ]);

    // 11. Employees, job roles, and labor shifts.
    const roleDefs: [string, number][] = [
      ["Manager", 22],
      ["Cook", 18],
      ["Server", 12],
      ["Dishwasher", 14],
    ];
    const { data: roleRows } = await admin
      .from("job_roles")
      .insert(
        roleDefs.map(([name, rate]) => ({
          organization_id: organizationId,
          name,
          default_hourly_rate: rate,
        })),
      )
      .select("id, name");
    const roleId = new Map((roleRows ?? []).map((r) => [r.name, r.id]));
    const rateByRole = new Map(roleDefs);

    const employeeDefs: [string, string][] = [
      ["Alex Rivera", "Manager"],
      ["Jamie Chen", "Cook"],
      ["Morgan Lee", "Cook"],
      ["Taylor Smith", "Server"],
      ["Jordan Patel", "Server"],
      ["Casey Kim", "Dishwasher"],
    ];
    const { data: employeeRows } = await admin
      .from("employees")
      .insert(
        employeeDefs.map(([display_name]) => ({
          organization_id: organizationId,
          display_name,
        })),
      )
      .select("id, display_name");
    const employeeId = new Map((employeeRows ?? []).map((e) => [e.display_name, e.id]));

    const shiftRows: {
      location_id: string;
      employee_id: string;
      job_role_id: string;
      business_date: string;
      hours_worked: number;
      hourly_rate: number;
    }[] = [];
    for (let d = DAYS_OF_HISTORY; d >= 0; d -= 1) {
      const date = daysAgo(d);
      for (const [name, roleName] of employeeDefs) {
        if (Math.random() > 0.65) continue; // ~4-5 shifts/week per employee
        const rate = rateByRole.get(roleName)!;
        shiftRows.push({
          location_id: locationId,
          employee_id: employeeId.get(name)!,
          job_role_id: roleId.get(roleName)!,
          business_date: date,
          hours_worked: round2(4 + Math.random() * 4),
          hourly_rate: rate,
        });
      }
    }
    for (const chunk of chunks(shiftRows, 200)) {
      await admin.from("labor_shifts").insert(chunk);
    }

    // 12. Inventory counts — one session every 7 days for a handful of tracked items.
    const countedItems = ["Chicken Breast (case)", "Romaine Lettuce (case)", "Paper Towels (case)", "To-Go Containers (case)"];
    for (let d = DAYS_OF_HISTORY; d >= 0; d -= 7) {
      const date = daysAgo(d);
      const { data: session, error: sessionErr } = await admin
        .from("inventory_counts")
        .insert({
          location_id: locationId,
          business_date: date,
          counted_at: `${date}T20:00:00.000Z`,
          status: "completed",
          source: "manual",
        })
        .select("id")
        .single();
      if (sessionErr) continue;
      await admin.from("inventory_count_lines").insert(
        countedItems.map((name) => ({
          inventory_count_id: session.id,
          item_id: itemId.get(name)!,
          quantity_on_hand: round2(5 + Math.random() * 20),
          unit_label: "case",
        })),
      );
    }

    return json({
      success: true,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      organizationId,
      locationId,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});

function daysBetween(dateStr: string) {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.round((now - then) / (1000 * 60 * 60 * 24));
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
