-- The Team settings page needs to show teammates' names/roles, but profiles
-- currently only has a "select your own row" policy. Let any active member
-- see the profiles of people who share an organization with them.
create policy profiles_select_org_members on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.organization_members mine
      join public.organization_members theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid())
        and mine.status = 'active'
        and theirs.user_id = profiles.id
    )
  );

-- Store the email an invite was sent to, so a pending invite (before the
-- invitee has set a display name, or even signed in) is still identifiable
-- in the Team member list.
alter table public.organization_members
  add column if not exists invited_email text;
