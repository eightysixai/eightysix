-- Add operational tables to the realtime publication so the web app can
-- subscribe to postgres_changes instead of polling. Reference/catalog tables
-- (organizations, vendors, items, employees, job_roles) change rarely and are
-- refetched on demand instead of held open as long-lived subscriptions.

alter publication supabase_realtime add table
  public.invoices,
  public.invoice_line_items,
  public.revenue_entries,
  public.budget_targets,
  public.menu_items,
  public.recipe_versions,
  public.recipe_ingredients,
  public.daily_menu_item_sales,
  public.inventory_counts,
  public.inventory_count_lines,
  public.labor_shifts;
