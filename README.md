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
  BREVO_API_KEY=<OPCIONAL_PARA_EMAIL> \
  PORTAL_SENDER_EMAIL=<EMAIL_VERIFICADO_NO_BREVO> \
  PASSWORD_RECOVERY_REDIRECT_URL=https://appe.app.br/update-password/ \
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
python3 -m http.server 3000
```

Abra:
- `http://localhost:3000/index.html`
- `http://localhost:3000/login.html`
- `http://localhost:3000/forgot-password`
- `http://localhost:3000/update-password`
- `http://localhost:3000/dashboard.html`
- `http://localhost:3000/profile.html`
- `http://localhost:3000/admin.html`

## Observações de autenticação

- O cadastro exige nome completo, e-mail, matrícula, senha e confirmação de senha.
- A senha é armazenada apenas como hash no backend.
- O fluxo de recuperação gera um token temporário próprio do portal, envia o e-mail diretamente pela Edge Function e salva a nova senha como hash no `portal_users`.
- Em `Authentication > URL Configuration` do Supabase, adicione pelo menos `http://localhost:3000/update-password/` e `https://appe.app.br/update-password/` em `Redirect URLs`.
- Em `Authentication > SMTP Settings`, o SMTP do Supabase pode continuar configurado, mas a recuperação do portal passa a depender do envio direto pela Edge Function com Brevo.
- Em produção, mantenha `PORTAL_ADMIN_EMAILS`, `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY` e `PORTAL_SENDER_EMAIL` apenas nos segredos do Supabase.

## Segurança do repositório

- O repositório é público e contém apenas configuração pública do frontend.
- Nunca commite segredos em `appe.config.js`, `.env*` ou arquivos de ambiente locais.
- Use `SECURITY.md` para orientar qualquer reporte privado de vulnerabilidades.
