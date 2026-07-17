# Eightysix Supabase migration

This package replaces the legacy JSON persistence layer with a normalized, multi-tenant Supabase/Postgres database.

## What maps where

| Legacy file | New tables |
|---|---|
| `invoices.json` | `vendors`, `items`, `invoices`, `invoice_line_items` |
| `budget_thresholds.json` | `cost_categories`, `budget_targets` |
| `daily_revenue.json` | `revenue_entries` |
| `recipes.json` | `menu_items`, `recipe_versions`, `recipe_ingredients` |
| `pos_sales.json` | `daily_menu_item_sales` |
| `inventory_counts.json` | `inventory_counts`, `inventory_count_lines` |
| `labor_shifts.json` | `employees`, `job_roles`, `labor_shifts` |

The schema also includes organizations, memberships, restaurant locations, imports, integrations, invoice documents, RLS policies, historical recipe versions, unit conversions, and reporting views.

## 1. Add the files to the new Vite repository

From the root of the new `eightysix` project:

```bash
mkdir -p supabase/migrations scripts
cp /path/to/20260716233000_initial_restaurant_schema.sql supabase/migrations/
cp /path/to/migrate-json-to-supabase.mjs scripts/
```

## 2. Install and initialize the Supabase CLI

Use the CLI through npm rather than installing it globally:

```bash
npm install --save-dev supabase
npx supabase init
npx supabase login
npx supabase link --project-ref hgyvqylmdldesqiotneo
```

If `supabase init` created a new `supabase` folder, keep the migration file inside `supabase/migrations`.

## 3. Apply the schema

Preview pending migrations:

```bash
npx supabase migration list
npx supabase db push --dry-run
```

Apply them:

```bash
npx supabase db push
```

For local Supabase development with Docker:

```bash
npx supabase start
npx supabase db reset
```

## 4. Create your first authenticated user

Create/sign up the account that should own the imported restaurant. In the Supabase Dashboard, copy that user’s UUID from **Authentication → Users**. You will use it as `OWNER_USER_ID`.

## 5. Run the one-time JSON importer

The importer requires the Supabase JavaScript client:

```bash
npm install @supabase/supabase-js
```

Copy the example environment file:

```bash
cp .env.migration.example .env.migration
```

Fill in:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` — server-only secret; never prefix it with `VITE_`
- `OWNER_USER_ID`

Make sure the migration env file is ignored:

```bash
printf '\n.env.migration\n' >> .gitignore
```

Run from the new app and pass the old repository path:

```bash
set -a
source .env.migration
set +a
node scripts/migrate-json-to-supabase.mjs \
  ../PNL-but-for-real-this-time-
```

The importer is designed to be rerunnable. It updates legacy rows where possible and recreates nested invoice/recipe/count lines to match the JSON source.

## 6. Generate TypeScript database types

After the migration is applied:

```bash
mkdir -p src/types
npx supabase gen types typescript \
  --project-id hgyvqylmdldesqiotneo \
  --schema public \
  > src/types/database.ts
```

Use the generated type when creating the browser client:

```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
```

## 7. Replace JSON reads with Supabase queries

Example invoice query:

```ts
const { data, error } = await supabase
  .from('invoices')
  .select(`
    id,
    invoice_date,
    total_amount,
    vendor:vendors(id, name),
    line_items:invoice_line_items(
      id,
      description,
      quantity,
      unit_label,
      unit_price,
      line_total,
      item:items(id, name),
      category:cost_categories(id, code, name)
    )
  `)
  .eq('location_id', locationId)
  .is('archived_at', null)
  .order('invoice_date', { ascending: false });
```

Example daily P&L query:

```ts
const { data, error } = await supabase
  .from('daily_pnl')
  .select('*')
  .eq('location_id', locationId)
  .order('business_date', { ascending: false });
```

## 8. Recommended build order

1. Authentication and organization/location onboarding.
2. Read-only dashboard using `daily_pnl`.
3. Invoice CRUD with invoice line items.
4. Revenue entry CRUD.
5. Menu items and recipes.
6. POS sales imports.
7. Inventory count sessions.
8. Labor shifts.
9. Stripe billing and plan enforcement.

## Important design decisions

- **Every operational row belongs to a restaurant location.** This supports several restaurants under one company.
- **Organization memberships drive RLS.** Users only receive rows belonging to organizations they have joined.
- **Money uses Postgres `numeric`, not floating point.**
- **Invoices and recipes are normalized.** Nested JSON arrays become child rows with foreign keys.
- **Prices and wages are snapshots.** Historical P&L does not change when a current menu price or wage changes.
- **Recipes are versioned.** Ingredient changes can take effect on a date without rewriting historical sales.
- **Integration secrets are not stored in public tables.** Store them in Supabase Vault or Edge Function secrets.
- **JSON payloads are retained only as import metadata.** They are not the primary source of truth.

## Before production

- Test the entire migration against a new Supabase project first.
- Verify imported invoice totals and labor costs against the legacy app.
- Add storage policies for the `invoice-documents` bucket before enabling invoice uploads.
- Add automated database backups and error monitoring.
- Keep all future database changes in `supabase/migrations`; do not make untracked production edits in the Table Editor.
