create or replace function public.set_current_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop policy if exists portal_users_no_direct_access on public.portal_users;
create policy portal_users_no_direct_access
on public.portal_users
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists portal_sessions_no_direct_access on public.portal_sessions;
create policy portal_sessions_no_direct_access
on public.portal_sessions
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists course_enrollments_no_direct_access on public.course_enrollments;
create policy course_enrollments_no_direct_access
on public.course_enrollments
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
