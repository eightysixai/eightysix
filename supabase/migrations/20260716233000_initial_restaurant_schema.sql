-- Eightysix / Restaurant P&L initial Supabase schema
-- Multi-tenant, multi-location, RLS-enabled, and designed to replace the legacy JSON files.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Shared trigger helpers
-- -----------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Identity, tenancy, locations, and permissions
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references auth.users(id),
  plan text not null default 'free',
  billing_status text not null default 'inactive',
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff'
    check (role in ('owner', 'admin', 'manager', 'accountant', 'staff', 'viewer')),
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended')),
  invited_by uuid references auth.users(id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx
  on public.organization_members(user_id, organization_id)
  where status = 'active';

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text not null default 'America/New_York',
  currency_code text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
  address jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, slug)
);

create index locations_organization_id_idx on public.locations(organization_id);

-- Authorization helpers are SECURITY DEFINER so policies can safely inspect the
-- membership table without recursive RLS evaluation.
create or replace function private.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function private.has_org_role(
  target_organization_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = any(allowed_roles)
  );
$$;

create or replace function private.can_access_location(target_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.locations location
    join public.organization_members membership
      on membership.organization_id = location.organization_id
    where location.id = target_location_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function private.can_manage_location(target_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.locations location
    join public.organization_members membership
      on membership.organization_id = location.organization_id
    where location.id = target_location_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner', 'admin', 'manager', 'accountant')
  );
$$;

grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;
grant execute on function private.can_access_location(uuid) to authenticated;
grant execute on function private.can_manage_location(uuid) to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Categories, suppliers, and inventory catalog
-- -----------------------------------------------------------------------------

create table public.cost_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  category_group text not null default 'operating'
    check (category_group in ('food', 'inventory', 'labor', 'overhead', 'other', 'operating')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index cost_categories_organization_id_idx on public.cost_categories(organization_id);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  contact_name text,
  email text,
  phone text,
  account_number text,
  payment_terms_days integer check (payment_terms_days is null or payment_terms_days >= 0),
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index vendors_org_lower_name_uidx
  on public.vendors(organization_id, lower(name))
  where archived_at is null;

create table public.items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sku text,
  barcode text,
  cost_category_id uuid references public.cost_categories(id) on delete set null,
  base_unit_label text not null default 'each',
  track_inventory boolean not null default true,
  reorder_point numeric(14,4),
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (reorder_point is null or reorder_point >= 0)
);

create unique index items_org_lower_name_uidx
  on public.items(organization_id, lower(name))
  where archived_at is null;
create index items_cost_category_id_idx on public.items(cost_category_id);

create table public.item_aliases (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  source text not null default 'manual',
  alias text not null,
  created_at timestamptz not null default now(),
  unique (item_id, source, alias)
);

create table public.item_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  unit_label text not null,
  base_unit_quantity numeric(18,6) not null check (base_unit_quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, unit_label)
);

create table public.vendor_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  vendor_sku text,
  purchase_unit_label text not null default 'case',
  base_units_per_purchase_unit numeric(18,6) not null default 1 check (base_units_per_purchase_unit > 0),
  last_unit_price numeric(14,4),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, item_id, purchase_unit_label),
  check (last_unit_price is null or last_unit_price >= 0)
);

-- -----------------------------------------------------------------------------
-- Invoices and uploaded source documents
-- -----------------------------------------------------------------------------

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  import_type text not null,
  source text not null default 'manual',
  file_name text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'completed_with_errors', 'failed')),
  total_rows integer not null default 0,
  successful_rows integer not null default 0,
  failed_rows integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index import_jobs_location_created_idx on public.import_jobs(location_id, created_at desc);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  invoice_number text,
  invoice_date date not null,
  due_date date,
  status text not null default 'posted'
    check (status in ('draft', 'posted', 'paid', 'void')),
  subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  shipping_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  currency_code text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
  source text not null default 'manual',
  external_id text,
  legacy_id bigint,
  import_job_id uuid references public.import_jobs(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (subtotal >= 0 and tax_amount >= 0 and shipping_amount >= 0 and discount_amount >= 0 and total_amount >= 0)
);

create index invoices_location_date_idx on public.invoices(location_id, invoice_date desc);
create index invoices_vendor_id_idx on public.invoices(vendor_id);
create unique index invoices_location_source_external_uidx
  on public.invoices(location_id, source, external_id)
  where external_id is not null;
create unique index invoices_location_source_legacy_uidx
  on public.invoices(location_id, source, legacy_id)
  where legacy_id is not null;

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  cost_category_id uuid references public.cost_categories(id) on delete set null,
  description text not null,
  quantity numeric(18,6) not null default 1 check (quantity >= 0),
  unit_label text not null default 'each',
  unit_price numeric(14,4) not null default 0 check (unit_price >= 0),
  line_total numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  vendor_sku text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoice_line_items_invoice_id_idx on public.invoice_line_items(invoice_id);
create index invoice_line_items_item_id_idx on public.invoice_line_items(item_id);
create index invoice_line_items_category_id_idx on public.invoice_line_items(cost_category_id);

create table public.invoice_documents (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  storage_bucket text not null default 'invoice-documents',
  storage_path text not null,
  mime_type text,
  file_size_bytes bigint,
  checksum text,
  extraction_status text not null default 'not_started'
    check (extraction_status in ('not_started', 'processing', 'completed', 'failed', 'needs_review')),
  extraction_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create or replace function private.recalculate_invoice_totals(target_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  line_subtotal numeric(14,2);
begin
  select coalesce(sum(line.line_total), 0)
    into line_subtotal
  from public.invoice_line_items line
  where line.invoice_id = target_invoice_id;

  update public.invoices invoice
  set subtotal = line_subtotal,
      total_amount = greatest(
        0,
        line_subtotal + invoice.tax_amount + invoice.shipping_amount - invoice.discount_amount
      ),
      updated_at = now()
  where invoice.id = target_invoice_id;
end;
$$;

create or replace function private.invoice_line_totals_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.recalculate_invoice_totals(old.invoice_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.recalculate_invoice_totals(new.invoice_id);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger invoice_line_items_recalculate_totals
  after insert or update or delete on public.invoice_line_items
  for each row execute function private.invoice_line_totals_trigger();

create or replace function private.calculate_invoice_total()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.total_amount := greatest(
    0,
    new.subtotal + new.tax_amount + new.shipping_amount - new.discount_amount
  );
  return new;
end;
$$;

create trigger invoices_calculate_total
  before insert or update of subtotal, tax_amount, shipping_amount, discount_amount
  on public.invoices
  for each row execute function private.calculate_invoice_total();

-- -----------------------------------------------------------------------------
-- Revenue, budgets, menu recipes, and sales
-- -----------------------------------------------------------------------------

create table public.revenue_entries (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  source text not null default 'manual',
  external_id text,
  gross_sales numeric(14,2) not null default 0,
  discounts numeric(14,2) not null default 0,
  comps numeric(14,2) not null default 0,
  refunds numeric(14,2) not null default 0,
  net_sales numeric(14,2) not null default 0,
  tax_collected numeric(14,2) not null default 0,
  tips numeric(14,2) not null default 0,
  transaction_count integer,
  import_job_id uuid references public.import_jobs(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    gross_sales >= 0 and discounts >= 0 and comps >= 0 and refunds >= 0
    and net_sales >= 0 and tax_collected >= 0 and tips >= 0
    and (transaction_count is null or transaction_count >= 0)
  ),
  unique (location_id, business_date, source)
);

create index revenue_entries_location_date_idx on public.revenue_entries(location_id, business_date desc);

create table public.budget_targets (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  cost_category_id uuid not null references public.cost_categories(id) on delete cascade,
  target_type text not null check (target_type in ('percentage_of_revenue', 'fixed_amount')),
  target_value numeric(14,4) not null check (target_value >= 0),
  effective_from date not null default current_date,
  effective_to date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (location_id, cost_category_id, effective_from)
);

create index budget_targets_location_dates_idx
  on public.budget_targets(location_id, effective_from desc, effective_to);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  menu_category text,
  current_price numeric(14,2) not null default 0 check (current_price >= 0),
  external_id text,
  legacy_id bigint,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index menu_items_location_lower_name_uidx
  on public.menu_items(location_id, lower(name))
  where archived_at is null;
create unique index menu_items_location_legacy_uidx
  on public.menu_items(location_id, legacy_id)
  where legacy_id is not null;

create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  version_number integer not null default 1 check (version_number > 0),
  yield_quantity numeric(14,4) not null default 1 check (yield_quantity > 0),
  effective_from date not null default current_date,
  effective_to date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (menu_item_id, version_number)
);

create index recipe_versions_menu_effective_idx
  on public.recipe_versions(menu_item_id, effective_from desc);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_version_id uuid not null references public.recipe_versions(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity numeric(18,6) not null check (quantity >= 0),
  unit_label text not null default 'each',
  waste_percentage numeric(7,4) not null default 0
    check (waste_percentage >= 0 and waste_percentage < 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_version_id, item_id, unit_label)
);

create index recipe_ingredients_item_id_idx on public.recipe_ingredients(item_id);

create table public.daily_menu_item_sales (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  menu_item_id uuid not null references public.menu_items(id) on delete restrict,
  recipe_version_id uuid references public.recipe_versions(id) on delete set null,
  quantity_sold numeric(14,4) not null default 0 check (quantity_sold >= 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  gross_sales numeric(14,2) generated always as (round(quantity_sold * unit_price, 2)) stored,
  discounts numeric(14,2) not null default 0 check (discounts >= 0),
  net_sales numeric(14,2) not null default 0 check (net_sales >= 0),
  source text not null default 'manual',
  external_id text,
  legacy_id bigint,
  import_job_id uuid references public.import_jobs(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index daily_menu_item_sales_location_date_idx
  on public.daily_menu_item_sales(location_id, business_date desc);
create index daily_menu_item_sales_menu_item_idx
  on public.daily_menu_item_sales(menu_item_id, business_date desc);
create unique index daily_menu_item_sales_location_source_external_uidx
  on public.daily_menu_item_sales(location_id, source, external_id)
  where external_id is not null;
create unique index daily_menu_item_sales_location_source_legacy_uidx
  on public.daily_menu_item_sales(location_id, source, legacy_id)
  where legacy_id is not null;

-- -----------------------------------------------------------------------------
-- Inventory counts, employees, and labor
-- -----------------------------------------------------------------------------

create table public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  counted_at timestamptz not null default now(),
  business_date date not null default current_date,
  status text not null default 'completed'
    check (status in ('draft', 'in_progress', 'completed', 'void')),
  source text not null default 'manual',
  external_id text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inventory_counts_location_date_idx
  on public.inventory_counts(location_id, business_date desc);
create unique index inventory_counts_location_source_external_uidx
  on public.inventory_counts(location_id, source, external_id)
  where external_id is not null;

create table public.inventory_count_lines (
  id uuid primary key default gen_random_uuid(),
  inventory_count_id uuid not null references public.inventory_counts(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  quantity_on_hand numeric(18,6) not null default 0 check (quantity_on_hand >= 0),
  unit_label text not null default 'each',
  unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  legacy_id bigint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_count_id, item_id, unit_label)
);

create index inventory_count_lines_item_id_idx on public.inventory_count_lines(item_id);

create table public.job_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  default_hourly_rate numeric(14,4),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_hourly_rate is null or default_hourly_rate >= 0)
);

create unique index job_roles_org_lower_name_uidx
  on public.job_roles(organization_id, lower(name));

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  first_name text,
  last_name text,
  display_name text not null,
  email text,
  phone text,
  external_id text,
  active boolean not null default true,
  hired_on date,
  terminated_on date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (terminated_on is null or hired_on is null or terminated_on >= hired_on)
);

create unique index employees_org_external_uidx
  on public.employees(organization_id, external_id)
  where external_id is not null;
create index employees_organization_id_idx on public.employees(organization_id);

create table public.labor_shifts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  job_role_id uuid references public.job_roles(id) on delete set null,
  business_date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  hours_worked numeric(10,4) not null check (hours_worked >= 0),
  hourly_rate numeric(14,4) not null check (hourly_rate >= 0),
  labor_cost numeric(14,2) generated always as (round(hours_worked * hourly_rate, 2)) stored,
  source text not null default 'manual',
  external_id text,
  legacy_id bigint,
  import_job_id uuid references public.import_jobs(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (clock_out is null or clock_in is null or clock_out >= clock_in)
);

create index labor_shifts_location_date_idx on public.labor_shifts(location_id, business_date desc);
create index labor_shifts_employee_date_idx on public.labor_shifts(employee_id, business_date desc);
create unique index labor_shifts_location_source_external_uidx
  on public.labor_shifts(location_id, source, external_id)
  where external_id is not null;
create unique index labor_shifts_location_source_legacy_uidx
  on public.labor_shifts(location_id, source, legacy_id)
  where legacy_id is not null;

-- Integration records intentionally store only non-secret configuration. Keep API
-- secrets in Supabase Vault or Edge Function secrets, not in this table.
create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  provider text not null,
  integration_type text not null,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connecting', 'active', 'error', 'paused')),
  external_account_id text,
  secret_reference text,
  config jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, location_id, provider, integration_type)
);

-- -----------------------------------------------------------------------------
-- Reporting views (security_invoker makes underlying RLS apply)
-- -----------------------------------------------------------------------------

create or replace view public.latest_item_costs
with (security_invoker = true)
as
select distinct on (invoice.location_id, line.item_id)
  invoice.location_id,
  line.item_id,
  invoice.vendor_id,
  invoice.invoice_date,
  line.quantity,
  line.unit_label,
  line.unit_price,
  line.line_total,
  invoice.id as invoice_id,
  line.id as invoice_line_item_id
from public.invoice_line_items line
join public.invoices invoice on invoice.id = line.invoice_id
where line.item_id is not null
  and invoice.status <> 'void'
  and invoice.archived_at is null
order by invoice.location_id, line.item_id, invoice.invoice_date desc, line.created_at desc;

create or replace view public.daily_pnl
with (security_invoker = true)
as
with revenue as (
  select
    entry.location_id,
    entry.business_date,
    sum(entry.gross_sales) as gross_sales,
    sum(entry.net_sales) as net_sales
  from public.revenue_entries entry
  group by entry.location_id, entry.business_date
), invoice_costs as (
  select
    invoice.location_id,
    invoice.invoice_date as business_date,
    coalesce(sum(line.line_total) filter (where category.category_group = 'food'), 0) as food_cost,
    coalesce(sum(line.line_total) filter (where category.category_group = 'inventory'), 0) as inventory_cost,
    coalesce(sum(line.line_total) filter (where category.category_group is null or category.category_group not in ('food', 'inventory', 'labor')), 0) as other_cost
  from public.invoices invoice
  join public.invoice_line_items line on line.invoice_id = invoice.id
  left join public.cost_categories category on category.id = line.cost_category_id
  where invoice.status <> 'void'
    and invoice.archived_at is null
  group by invoice.location_id, invoice.invoice_date
), labor as (
  select
    shift.location_id,
    shift.business_date,
    sum(shift.labor_cost) as labor_cost
  from public.labor_shifts shift
  group by shift.location_id, shift.business_date
), dates as (
  select location_id, business_date from revenue
  union
  select location_id, business_date from invoice_costs
  union
  select location_id, business_date from labor
)
select
  dates.location_id,
  dates.business_date,
  coalesce(revenue.gross_sales, 0)::numeric(14,2) as gross_sales,
  coalesce(revenue.net_sales, 0)::numeric(14,2) as net_sales,
  coalesce(invoice_costs.food_cost, 0)::numeric(14,2) as food_cost,
  coalesce(invoice_costs.inventory_cost, 0)::numeric(14,2) as inventory_cost,
  coalesce(labor.labor_cost, 0)::numeric(14,2) as labor_cost,
  coalesce(invoice_costs.other_cost, 0)::numeric(14,2) as other_cost,
  (
    coalesce(invoice_costs.food_cost, 0)
    + coalesce(invoice_costs.inventory_cost, 0)
    + coalesce(labor.labor_cost, 0)
    + coalesce(invoice_costs.other_cost, 0)
  )::numeric(14,2) as total_cost,
  (
    coalesce(revenue.net_sales, 0)
    - coalesce(invoice_costs.food_cost, 0)
    - coalesce(invoice_costs.inventory_cost, 0)
    - coalesce(labor.labor_cost, 0)
    - coalesce(invoice_costs.other_cost, 0)
  )::numeric(14,2) as operating_profit,
  case
    when coalesce(revenue.net_sales, 0) = 0 then 0
    else round(
      100 * (
        coalesce(revenue.net_sales, 0)
        - coalesce(invoice_costs.food_cost, 0)
        - coalesce(invoice_costs.inventory_cost, 0)
        - coalesce(labor.labor_cost, 0)
        - coalesce(invoice_costs.other_cost, 0)
      ) / revenue.net_sales,
      2
    )
  end as operating_margin_percentage
from dates
left join revenue using (location_id, business_date)
left join invoice_costs using (location_id, business_date)
left join labor using (location_id, business_date);

create or replace view public.menu_item_performance
with (security_invoker = true)
as
select
  sale.location_id,
  sale.menu_item_id,
  menu.name,
  sum(sale.quantity_sold) as units_sold,
  sum(sale.gross_sales) as gross_sales,
  sum(sale.net_sales) as net_sales,
  min(sale.business_date) as first_sale_date,
  max(sale.business_date) as latest_sale_date
from public.daily_menu_item_sales sale
join public.menu_items menu on menu.id = sale.menu_item_id
group by sale.location_id, sale.menu_item_id, menu.name;

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'organizations', 'organization_members', 'locations',
    'cost_categories', 'vendors', 'items', 'item_unit_conversions', 'vendor_items',
    'import_jobs', 'invoices', 'invoice_line_items', 'revenue_entries',
    'budget_targets', 'menu_items', 'recipe_versions', 'recipe_ingredients',
    'daily_menu_item_sales', 'inventory_counts', 'inventory_count_lines',
    'job_roles', 'employees', 'labor_shifts', 'integration_connections'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.locations enable row level security;
alter table public.cost_categories enable row level security;
alter table public.vendors enable row level security;
alter table public.items enable row level security;
alter table public.item_aliases enable row level security;
alter table public.item_unit_conversions enable row level security;
alter table public.vendor_items enable row level security;
alter table public.import_jobs enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.invoice_documents enable row level security;
alter table public.revenue_entries enable row level security;
alter table public.budget_targets enable row level security;
alter table public.menu_items enable row level security;
alter table public.recipe_versions enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.daily_menu_item_sales enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_lines enable row level security;
alter table public.job_roles enable row level security;
alter table public.employees enable row level security;
alter table public.labor_shifts enable row level security;
alter table public.integration_connections enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy organizations_select_member on public.organizations
  for select to authenticated
  using (private.is_org_member(id));
create policy organizations_insert_creator on public.organizations
  for insert to authenticated
  with check ((select auth.uid()) is not null and created_by = (select auth.uid()));
create policy organizations_update_admin on public.organizations
  for update to authenticated
  using (private.has_org_role(id, array['owner', 'admin']))
  with check (private.has_org_role(id, array['owner', 'admin']));

create policy organization_members_select_member on public.organization_members
  for select to authenticated
  using (private.is_org_member(organization_id));
create policy organization_members_insert_admin on public.organization_members
  for insert to authenticated
  with check (
    private.has_org_role(organization_id, array['owner', 'admin'])
    or exists (
      select 1 from public.organizations organization
      where organization.id = organization_id
        and organization.created_by = (select auth.uid())
        and user_id = (select auth.uid())
        and role = 'owner'
    )
  );
create policy organization_members_update_admin on public.organization_members
  for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']))
  with check (private.has_org_role(organization_id, array['owner', 'admin']));
create policy organization_members_delete_admin on public.organization_members
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']));

create policy locations_select_member on public.locations
  for select to authenticated
  using (private.is_org_member(organization_id));
create policy locations_insert_admin on public.locations
  for insert to authenticated
  with check (private.has_org_role(organization_id, array['owner', 'admin']));
create policy locations_update_admin on public.locations
  for update to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']))
  with check (private.has_org_role(organization_id, array['owner', 'admin']));
create policy locations_delete_owner on public.locations
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner']));

-- Organization-scoped tables with a direct organization_id column.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cost_categories', 'vendors', 'items', 'job_roles', 'employees', 'integration_connections'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_org_member(organization_id))',
      table_name || '_select_member', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_org_role(organization_id, array[''owner'', ''admin'', ''manager'', ''accountant'']))',
      table_name || '_insert_manager', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_org_role(organization_id, array[''owner'', ''admin'', ''manager'', ''accountant''])) with check (private.has_org_role(organization_id, array[''owner'', ''admin'', ''manager'', ''accountant'']))',
      table_name || '_update_manager', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_org_role(organization_id, array[''owner'', ''admin'']))',
      table_name || '_delete_admin', table_name
    );
  end loop;
end;
$$;

-- Location-scoped tables with a direct location_id column.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'import_jobs', 'invoices', 'revenue_entries', 'budget_targets', 'menu_items',
    'daily_menu_item_sales', 'inventory_counts', 'labor_shifts'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.can_access_location(location_id))',
      table_name || '_select_member', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.can_manage_location(location_id))',
      table_name || '_insert_manager', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.can_manage_location(location_id)) with check (private.can_manage_location(location_id))',
      table_name || '_update_manager', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.can_manage_location(location_id))',
      table_name || '_delete_manager', table_name
    );
  end loop;
end;
$$;

-- Child-table RLS follows the tenant/location of the parent row.
create policy item_aliases_select_member on public.item_aliases
  for select to authenticated using (
    exists (select 1 from public.items item where item.id = item_id and private.is_org_member(item.organization_id))
  );
create policy item_aliases_write_manager on public.item_aliases
  for all to authenticated using (
    exists (select 1 from public.items item where item.id = item_id and private.has_org_role(item.organization_id, array['owner','admin','manager','accountant']))
  ) with check (
    exists (select 1 from public.items item where item.id = item_id and private.has_org_role(item.organization_id, array['owner','admin','manager','accountant']))
  );

create policy item_unit_conversions_select_member on public.item_unit_conversions
  for select to authenticated using (
    exists (select 1 from public.items item where item.id = item_id and private.is_org_member(item.organization_id))
  );
create policy item_unit_conversions_write_manager on public.item_unit_conversions
  for all to authenticated using (
    exists (select 1 from public.items item where item.id = item_id and private.has_org_role(item.organization_id, array['owner','admin','manager','accountant']))
  ) with check (
    exists (select 1 from public.items item where item.id = item_id and private.has_org_role(item.organization_id, array['owner','admin','manager','accountant']))
  );

create policy vendor_items_select_member on public.vendor_items
  for select to authenticated using (
    exists (select 1 from public.vendors vendor where vendor.id = vendor_id and private.is_org_member(vendor.organization_id))
  );
create policy vendor_items_write_manager on public.vendor_items
  for all to authenticated using (
    exists (select 1 from public.vendors vendor where vendor.id = vendor_id and private.has_org_role(vendor.organization_id, array['owner','admin','manager','accountant']))
  ) with check (
    exists (select 1 from public.vendors vendor where vendor.id = vendor_id and private.has_org_role(vendor.organization_id, array['owner','admin','manager','accountant']))
  );

create policy invoice_line_items_select_member on public.invoice_line_items
  for select to authenticated using (
    exists (select 1 from public.invoices invoice where invoice.id = invoice_id and private.can_access_location(invoice.location_id))
  );
create policy invoice_line_items_write_manager on public.invoice_line_items
  for all to authenticated using (
    exists (select 1 from public.invoices invoice where invoice.id = invoice_id and private.can_manage_location(invoice.location_id))
  ) with check (
    exists (select 1 from public.invoices invoice where invoice.id = invoice_id and private.can_manage_location(invoice.location_id))
  );

create policy invoice_documents_select_member on public.invoice_documents
  for select to authenticated using (
    exists (select 1 from public.invoices invoice where invoice.id = invoice_id and private.can_access_location(invoice.location_id))
  );
create policy invoice_documents_write_manager on public.invoice_documents
  for all to authenticated using (
    exists (select 1 from public.invoices invoice where invoice.id = invoice_id and private.can_manage_location(invoice.location_id))
  ) with check (
    exists (select 1 from public.invoices invoice where invoice.id = invoice_id and private.can_manage_location(invoice.location_id))
  );

create policy recipe_versions_select_member on public.recipe_versions
  for select to authenticated using (
    exists (select 1 from public.menu_items menu where menu.id = menu_item_id and private.can_access_location(menu.location_id))
  );
create policy recipe_versions_write_manager on public.recipe_versions
  for all to authenticated using (
    exists (select 1 from public.menu_items menu where menu.id = menu_item_id and private.can_manage_location(menu.location_id))
  ) with check (
    exists (select 1 from public.menu_items menu where menu.id = menu_item_id and private.can_manage_location(menu.location_id))
  );

create policy recipe_ingredients_select_member on public.recipe_ingredients
  for select to authenticated using (
    exists (
      select 1 from public.recipe_versions version
      join public.menu_items menu on menu.id = version.menu_item_id
      where version.id = recipe_version_id and private.can_access_location(menu.location_id)
    )
  );
create policy recipe_ingredients_write_manager on public.recipe_ingredients
  for all to authenticated using (
    exists (
      select 1 from public.recipe_versions version
      join public.menu_items menu on menu.id = version.menu_item_id
      where version.id = recipe_version_id and private.can_manage_location(menu.location_id)
    )
  ) with check (
    exists (
      select 1 from public.recipe_versions version
      join public.menu_items menu on menu.id = version.menu_item_id
      where version.id = recipe_version_id and private.can_manage_location(menu.location_id)
    )
  );

create policy inventory_count_lines_select_member on public.inventory_count_lines
  for select to authenticated using (
    exists (select 1 from public.inventory_counts count where count.id = inventory_count_id and private.can_access_location(count.location_id))
  );
create policy inventory_count_lines_write_manager on public.inventory_count_lines
  for all to authenticated using (
    exists (select 1 from public.inventory_counts count where count.id = inventory_count_id and private.can_manage_location(count.location_id))
  ) with check (
    exists (select 1 from public.inventory_counts count where count.id = inventory_count_id and private.can_manage_location(count.location_id))
  );

-- -----------------------------------------------------------------------------
-- Atomic organization onboarding RPC
-- -----------------------------------------------------------------------------

create or replace function public.create_organization_with_location(
  organization_name text,
  location_name text default 'Main Location',
  location_timezone text default 'America/New_York',
  location_currency text default 'USD'
)
returns table (organization_id uuid, location_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_organization_id uuid;
  new_location_id uuid;
  generated_slug text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  generated_slug := trim(both '-' from regexp_replace(lower(organization_name), '[^a-z0-9]+', '-', 'g'));
  if generated_slug = '' then
    generated_slug := 'organization';
  end if;
  generated_slug := generated_slug || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.organizations (name, slug, created_by)
  values (organization_name, generated_slug, current_user_id)
  returning id into new_organization_id;

  insert into public.organization_members (
    organization_id, user_id, role, status, joined_at
  ) values (
    new_organization_id, current_user_id, 'owner', 'active', now()
  );

  insert into public.cost_categories (organization_id, code, name, category_group)
  values
    (new_organization_id, 'food', 'Food', 'food'),
    (new_organization_id, 'inventory', 'Inventory / Supplies', 'inventory'),
    (new_organization_id, 'labor', 'Labor', 'labor'),
    (new_organization_id, 'overhead', 'Overhead', 'overhead'),
    (new_organization_id, 'other', 'Other', 'other');

  insert into public.locations (
    organization_id, name, slug, timezone, currency_code
  ) values (
    new_organization_id,
    location_name,
    'main-' || substr(gen_random_uuid()::text, 1, 8),
    location_timezone,
    upper(location_currency)
  ) returning id into new_location_id;

  return query select new_organization_id, new_location_id;
end;
$$;

grant execute on function public.create_organization_with_location(text, text, text, text) to authenticated;

-- Explicit table grants; RLS still controls which rows are visible/changeable.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.latest_item_costs, public.daily_pnl, public.menu_item_performance to authenticated;
