# APPE Portal de Cursos

Site para aplicação prática de inscrição em cursos na academia de polícia de Pernambuco.

Portal estático (HTML/CSS/JS) com backend mínimo em Supabase Edge Functions para:
- login persistente com sessão;
- autenticação própria com login e cadastro separados;
- inscrições em cursos com persistência;
- dashboard do usuário autenticado.

## Estrutura

- `index.html`: listagem de cursos e inscrição.
- `login.html`: tela única com alternância entre login e cadastro.
- `dashboard.html`: área pós-login com perfil e inscrições.
- `profile.html`: atualização dos dados da própria conta.
- `admin.html`: painel administrativo com inscritos por curso.
- `supabase/migrations/`: schema SQL.
- `supabase/functions/portal-auth`: autenticação/sessão.
- `supabase/functions/portal-enroll`: inscrição e confirmação.

## Pré-requisitos

- Supabase CLI
- Projeto Supabase criado

## Configuração

1. Conectar o projeto:
```bash
supabase link --project-ref <SEU_PROJECT_REF>
```

2. Aplicar migration:
```bash
supabase db push
```

3. Configurar segredos das funções:
```bash
supabase secrets set \
  SUPABASE_URL=https://<SEU_PROJECT_REF>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> \
  PORTAL_ADMIN_EMAILS=<EMAIL_ADMIN_1,EMAIL_ADMIN_2> \
  RESEND_API_KEY=<OPCIONAL_PARA_EMAIL> \
  PORTAL_SENDER_EMAIL=<OPCIONAL> \
  PORTAL_SENDER_NAME=APPE
```

4. Deploy das funções:
```bash
supabase functions deploy portal-auth
supabase functions deploy portal-enroll
```

5. Configurar frontend:
- Edite `appe.config.js`.
- Defina `functionsBaseUrl` com a URL das Edge Functions do projeto.
- Defina `supabaseAnonKey` com a chave pública `anon` do projeto para o gateway das Edge Functions.
- Defina `PORTAL_ADMIN_EMAILS` nos segredos do Supabase para liberar acesso ao `admin.html`.
- A função `portal-auth` agora usa matrícula + senha no login e valida cadastro com e-mail e matrícula únicos.

## Executar localmente

Como o frontend é estático:
```bash
python3 -m http.server 5173
```

Abra:
- `http://localhost:5173/index.html`
- `http://localhost:5173/login.html`
- `http://localhost:5173/dashboard.html`
- `http://localhost:5173/profile.html`
- `http://localhost:5173/admin.html`

## Observações de autenticação

- O cadastro exige nome completo, e-mail, matrícula, senha e confirmação de senha.
- A senha é armazenada apenas como hash no backend.
- Em produção, mantenha `PORTAL_ADMIN_EMAILS`, `SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` apenas nos segredos do Supabase.
