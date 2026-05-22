create extension if not exists pgcrypto;

create table if not exists public.portal_users (
  id uuid primary key default gen_random_uuid(),
  nome_completo text not null,
  email text not null,
  numero text not null,
  matricula text not null,
  metodo_login text not null default 'dados',
  ultimo_login_em timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists portal_users_email_exact_unique on public.portal_users (email);
create unique index if not exists portal_users_email_unique on public.portal_users (lower(email));
create unique index if not exists portal_users_matricula_unique on public.portal_users (matricula);

create table if not exists public.portal_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.portal_users(id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists portal_sessions_user_id_idx on public.portal_sessions (user_id);
create index if not exists portal_sessions_expires_at_idx on public.portal_sessions (expires_at);

create table if not exists public.course_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.portal_users(id) on delete cascade,
  course_id text not null,
  course_title text not null,
  course_mode text not null,
  course_date text not null,
  course_label text,
  course_status text,
  course_location text,
  course_instructor text,
  google_calendar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, course_id)
);

create index if not exists course_enrollments_user_id_idx on public.course_enrollments (user_id);
create index if not exists course_enrollments_course_id_idx on public.course_enrollments (course_id);

create or replace function public.set_current_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_portal_users_timestamp on public.portal_users;
create trigger set_portal_users_timestamp
before update on public.portal_users
for each row
execute function public.set_current_timestamp();

drop trigger if exists set_portal_sessions_timestamp on public.portal_sessions;
create trigger set_portal_sessions_timestamp
before update on public.portal_sessions
for each row
execute function public.set_current_timestamp();

drop trigger if exists set_course_enrollments_timestamp on public.course_enrollments;
create trigger set_course_enrollments_timestamp
before update on public.course_enrollments
for each row
execute function public.set_current_timestamp();

alter table public.portal_users enable row level security;
alter table public.portal_sessions enable row level security;
alter table public.course_enrollments enable row level security;

revoke all on public.portal_users from anon, authenticated;
revoke all on public.portal_sessions from anon, authenticated;
revoke all on public.course_enrollments from anon, authenticated;

grant select, insert, update, delete on public.portal_users to service_role;
grant select, insert, update, delete on public.portal_sessions to service_role;
grant select, insert, update, delete on public.course_enrollments to service_role;
