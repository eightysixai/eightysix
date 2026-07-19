-- Support pending org invites (a user must be able to see + accept their own
-- invited-status membership row before they count as an "active" org member,
-- which private.is_org_member() requires) and track a Stripe subscription id
-- alongside the existing organizations.stripe_customer_id/plan/billing_status.

alter table public.organizations
  add column if not exists stripe_subscription_id text unique;

-- A user can always see their own membership row, even before it's active,
-- so the app can show "X invited you to Y" and let them accept.
create policy organization_members_select_self on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Accepting an invite: the invited user may flip their own row from
-- invited -> active (and stamp joined_at) but cannot otherwise change it
-- (role/organization changes still require organization_members_update_admin).
create policy organization_members_update_self on public.organization_members
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'invited')
  with check (user_id = (select auth.uid()) and status = 'active');

-- A user invited to an org (but not yet active) can still see the org's name
-- so the invite makes sense; existing organizations_select_member policy
-- already covers active members.
create policy organizations_select_invited on public.organizations
  for select to authenticated
  using (
    exists (
      select 1 from public.organization_members membership
      where membership.organization_id = organizations.id
        and membership.user_id = (select auth.uid())
        and membership.status = 'invited'
    )
  );
