create table if not exists public.portal_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.portal_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists portal_password_reset_tokens_user_id_idx
  on public.portal_password_reset_tokens (user_id);

create index if not exists portal_password_reset_tokens_expires_at_idx
  on public.portal_password_reset_tokens (expires_at);

alter table public.portal_password_reset_tokens enable row level security;

revoke all on public.portal_password_reset_tokens from anon, authenticated;
