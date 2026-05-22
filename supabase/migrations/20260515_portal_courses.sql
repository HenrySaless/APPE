create table if not exists public.portal_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  instructor_name text not null,
  starts_at timestamptz not null,
  modality text not null check (modality in ('online', 'presencial', 'ambos')),
  location text,
  status text not null default 'aberto' check (status in ('aberto', 'encerrado')),
  created_by uuid references public.portal_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists portal_courses_starts_at_idx on public.portal_courses (starts_at);
create index if not exists portal_courses_status_idx on public.portal_courses (status);
create index if not exists portal_courses_modality_idx on public.portal_courses (modality);

alter table public.portal_courses enable row level security;
revoke all on public.portal_courses from anon, authenticated;
grant select, insert, update, delete on public.portal_courses to service_role;

drop trigger if exists set_portal_courses_timestamp on public.portal_courses;
create trigger set_portal_courses_timestamp
before update on public.portal_courses
for each row
execute function public.set_current_timestamp();

insert into public.portal_courses (
  title,
  description,
  instructor_name,
  starts_at,
  modality,
  location,
  status
)
select *
from (
  values
    ('Conselho Disciplinar', 'Curso APPE: Conselho Disciplinar. Instrutor: Rita de Cássia.', 'Rita de Cássia', '2026-02-26T08:00:00-03:00'::timestamptz, 'online', null, 'encerrado'),
    ('Finanças na Carreira Penal - Módulo 1', 'Curso APPE: Finanças na Carreira Penal - Módulo 1. Instrutor: Heber Judson.', 'Heber Judson', '2026-03-03T08:00:00-03:00'::timestamptz, 'online', null, 'encerrado'),
    ('Racismo Institucional', 'Curso APPE: Racismo Institucional. Instrutor: Euclides Ferreira.', 'Euclides Ferreira', '2026-03-12T08:00:00-03:00'::timestamptz, 'online', null, 'encerrado'),
    ('Rotinas de ADM de Pessoas', 'Curso APPE: Rotinas de ADM de Pessoas. Instrutor: Daniel Pereira.', 'Daniel Pereira', '2026-03-26T08:00:00-03:00'::timestamptz, 'online', null, 'encerrado'),
    ('Finanças Penal - Módulo 2', 'Curso APPE: Finanças Penal - Módulo 2. Instrutor: Heber Judson.', 'Heber Judson', '2026-04-16T08:00:00-03:00'::timestamptz, 'online', null, 'encerrado'),
    ('Orçamento Público Penal', 'Curso APPE: Orçamento Público Penal. Instrutor: Alexandre Pontual.', 'Alexandre Pontual', '2026-04-23T08:00:00-03:00'::timestamptz, 'online', null, 'encerrado'),
    ('Execução de Despesas', 'Curso APPE: Execução de Despesas. Instrutor: Edson.', 'Edson', '2026-04-29T08:00:00-03:00'::timestamptz, 'online', null, 'encerrado'),
    ('Direitos Humanos', 'Curso APPE: Direitos Humanos. Instrutor: Euclides Ferreira.', 'Euclides Ferreira', '2026-05-07T08:00:00-03:00'::timestamptz, 'online', null, 'encerrado'),
    ('Rotinas de ADM de Pessoas - Turma 2', 'Curso APPE: Rotinas de ADM de Pessoas - Turma 2. Instrutor: Daniel Pereira.', 'Daniel Pereira', '2026-05-14T08:00:00-03:00'::timestamptz, 'online', null, 'encerrado'),
    ('Fluxo de Presos TM', 'Curso APPE: Fluxo de Presos TM. Instrutor: Rivelino.', 'Rivelino', '2026-05-14T08:00:00-03:00'::timestamptz, 'online', null, 'encerrado'),
    ('Projetos e Convênios Penal', 'Curso APPE: Projetos e Convênios Penal. Instrutor: Renato Pinto.', 'Renato Pinto', '2026-05-27T08:00:00-03:00'::timestamptz, 'online', null, 'encerrado'),
    ('Em breve - Junho e além', 'Curso APPE: Em breve - Junho e além. Instrutor: A definir.', 'A definir', '2026-06-01T08:00:00-03:00'::timestamptz, 'online', null, 'aberto'),
    ('Alinhamento Técnico Profissional', 'Curso APPE: Alinhamento Técnico Profissional. Instrutor: APPE.', 'APPE', '2026-01-26T08:00:00-03:00'::timestamptz, 'presencial', 'APPE/SEAP', 'encerrado'),
    ('Alinhamento Técnico Profissional', 'Curso APPE: Alinhamento Técnico Profissional. Instrutor: APPE.', 'APPE', '2026-02-02T08:00:00-03:00'::timestamptz, 'presencial', 'APPE/SEAP', 'encerrado'),
    ('Monitoramento Eletrônico de Pessoas - T1', 'Curso APPE: Monitoramento Eletrônico de Pessoas - T1. Instrutor: Alony.', 'Alony', '2026-02-24T08:00:00-03:00'::timestamptz, 'presencial', 'APPE/SEAP', 'encerrado'),
    ('Combate em Ambiente Confinado (CQB) - T1', 'Curso APPE: Combate em Ambiente Confinado (CQB) - T1. Instrutor: Saulo José.', 'Saulo José', '2026-02-24T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Combate em Ambiente Confinado (CQB) - T2', 'Curso APPE: Combate em Ambiente Confinado (CQB) - T2. Instrutor: Saulo José.', 'Saulo José', '2026-02-26T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Pistola G22 e CAL12 - T1', 'Curso APPE: Pistola G22 e CAL12 - T1. Instrutor: Saulo José, Flávio Barros, David Pedrosa.', 'Saulo José, Flávio Barros, David Pedrosa', '2026-03-02T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Pistola G22 e CAL12 - T2', 'Curso APPE: Pistola G22 e CAL12 - T2. Instrutor: Saulo José, Flávio Barros, David Pedrosa.', 'Saulo José, Flávio Barros, David Pedrosa', '2026-03-04T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Combate em Ambiente Confinado (CQB) - T3', 'Curso APPE: Combate em Ambiente Confinado (CQB) - T3. Instrutor: Saulo José.', 'Saulo José', '2026-03-10T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('APH Tático - T1', 'Curso APPE: APH Tático - T1. Instrutor: Wallyson, Manoel.', 'Wallyson, Manoel', '2026-03-12T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Pistola G22 e CAL12 - T3', 'Curso APPE: Pistola G22 e CAL12 - T3. Instrutor: Saulo José, Flávio Barros, David Pedrosa.', 'Saulo José, Flávio Barros, David Pedrosa', '2026-03-17T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Combate Tático Policial - T1', 'Curso APPE: Combate Tático Policial - T1. Instrutor: Luiz Fernando, Gustavo Bione, Marcílio Renson.', 'Luiz Fernando, Gustavo Bione, Marcílio Renson', '2026-03-19T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Combate em Ambiente Confinado (CQB) - T4', 'Curso APPE: Combate em Ambiente Confinado (CQB) - T4. Instrutor: Saulo José.', 'Saulo José', '2026-03-24T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Monitoramento Eletrônico de Pessoas - T2', 'Curso APPE: Monitoramento Eletrônico de Pessoas - T2. Instrutor: Alony.', 'Alony', '2026-03-24T08:00:00-03:00'::timestamptz, 'presencial', 'APPE/SEAP', 'encerrado'),
    ('Pistola G22 e CAL12 - T4', 'Curso APPE: Pistola G22 e CAL12 - T4. Instrutor: Saulo José, Flávio Barros, David Pedrosa.', 'Saulo José, Flávio Barros, David Pedrosa', '2026-03-26T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Inteligência Prisional - T1', 'Curso APPE: Inteligência Prisional - T1. Instrutor: Donizete.', 'Donizete', '2026-04-23T08:00:00-03:00'::timestamptz, 'presencial', 'APPE/SEAP', 'encerrado'),
    ('SEI Básico - T1', 'Curso APPE: SEI Básico - T1. Instrutor: Elieide.', 'Elieide', '2026-04-28T08:00:00-03:00'::timestamptz, 'presencial', 'APPE/SEAP', 'encerrado'),
    ('APH Tático - T2', 'Curso APPE: APH Tático - T2. Instrutor: Wallyson, Manoel.', 'Wallyson, Manoel', '2026-04-23T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Combate Tático Policial - T2', 'Curso APPE: Combate Tático Policial - T2. Instrutor: Luiz Fernando, Gustavo Bione, Marcílio Renson.', 'Luiz Fernando, Gustavo Bione, Marcílio Renson', '2026-04-23T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Pistola G22 e CAL12 - T5', 'Curso APPE: Pistola G22 e CAL12 - T5. Instrutor: Saulo José, Flávio Barros, David Pedrosa.', 'Saulo José, Flávio Barros, David Pedrosa', '2026-04-27T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('APH Tático - T3', 'Curso APPE: APH Tático - T3. Instrutor: Wallyson, Manoel.', 'Wallyson, Manoel', '2026-04-29T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Combate Tático Policial - T3', 'Curso APPE: Combate Tático Policial - T3. Instrutor: Luiz Fernando, Gustavo Bione, Marcílio Renson.', 'Luiz Fernando, Gustavo Bione, Marcílio Renson', '2026-04-29T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Monitoramento Eletrônico de Pessoas - T3', 'Curso APPE: Monitoramento Eletrônico de Pessoas - T3. Instrutor: Alony.', 'Alony', '2026-05-12T08:00:00-03:00'::timestamptz, 'presencial', 'APPE/SEAP', 'encerrado'),
    ('SEI Básico - T2', 'Curso APPE: SEI Básico - T2. Instrutor: Elieide.', 'Elieide', '2026-05-19T08:00:00-03:00'::timestamptz, 'presencial', 'APPE/SEAP', 'encerrado'),
    ('Inteligência Prisional - T2', 'Curso APPE: Inteligência Prisional - T2. Instrutor: Donizete.', 'Donizete', '2026-05-26T08:00:00-03:00'::timestamptz, 'presencial', 'APPE/SEAP', 'encerrado'),
    ('Direito Policial e Segurança Jurídica-Administrativa - T1', 'Curso APPE: Direito Policial e Segurança Jurídica-Administrativa - T1. Instrutor: Danilo Souza.', 'Danilo Souza', '2026-05-26T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Direito Policial e Segurança Jurídica-Administrativa - T2', 'Curso APPE: Direito Policial e Segurança Jurídica-Administrativa - T2. Instrutor: Danilo Souza.', 'Danilo Souza', '2026-05-28T08:00:00-03:00'::timestamptz, 'presencial', 'Itaquitinga', 'encerrado'),
    ('Pistola G22 e CAL12 - T6', 'Curso APPE: Pistola G22 e CAL12 - T6. Instrutor: Saulo José, Flávio Barros, David Pedrosa.', 'Saulo José, Flávio Barros, David Pedrosa', '2026-05-05T08:00:00-03:00'::timestamptz, 'presencial', 'Petrolina - PDEG', 'encerrado'),
    ('Pistola G22 e CAL12 - T7', 'Curso APPE: Pistola G22 e CAL12 - T7. Instrutor: Saulo José, Flávio Barros, David Pedrosa.', 'Saulo José, Flávio Barros, David Pedrosa', '2026-05-07T08:00:00-03:00'::timestamptz, 'presencial', 'Petrolina - PDEG', 'encerrado'),
    ('APH Tático - T4', 'Curso APPE: APH Tático - T4. Instrutor: Wallyson, Manoel.', 'Wallyson, Manoel', '2026-05-05T08:00:00-03:00'::timestamptz, 'presencial', 'Salgueiro - PSAL', 'encerrado'),
    ('APH Tático - T5', 'Curso APPE: APH Tático - T5. Instrutor: Wallyson, Manoel.', 'Wallyson, Manoel', '2026-05-07T08:00:00-03:00'::timestamptz, 'presencial', 'Salgueiro - PSAL', 'encerrado'),
    ('Em breve - Junho e além', 'Curso APPE: Em breve - Junho e além. Instrutor: A definir.', 'A definir', '2026-06-01T08:00:00-03:00'::timestamptz, 'presencial', 'A definir', 'aberto')
) as seed (
  title,
  description,
  instructor_name,
  starts_at,
  modality,
  location,
  status
)
where not exists (
  select 1
  from public.portal_courses existing
  where existing.title = seed.title
    and existing.modality = seed.modality
    and existing.starts_at = seed.starts_at
);
