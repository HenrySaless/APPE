alter table public.portal_users
  add column if not exists password_hash text;

alter table public.portal_users
  alter column numero set default '';

alter table public.portal_users
  alter column metodo_login set default 'senha';

update public.portal_users
set numero = ''
where numero is null;
