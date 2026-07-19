-- A user can remove their own membership row — declining a pending invite,
-- or leaving an organization they're already active in.
create policy organization_members_delete_self on public.organization_members
  for delete to authenticated
  using (user_id = (select auth.uid()));
