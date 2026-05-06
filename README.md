# APPE Portal de Cursos

Site para aplicação prática de inscrição em cursos na academia de polícia de Pernambuco.

Portal estático (HTML/CSS/JS) com backend mínimo em Supabase Edge Functions para:
- login persistente com sessão;
- autenticação Google OAuth (ID Token);
- inscrições em cursos com persistência;
- dashboard do usuário autenticado.

## Estrutura

- `index.html`: listagem de cursos e inscrição.
- `login.html`: login institucional + Google OAuth.
- `dashboard.html`: área pós-login com perfil e inscrições.
- `supabase/migrations/`: schema SQL.
- `supabase/functions/portal-auth`: autenticação/sessão.
- `supabase/functions/portal-enroll`: inscrição e confirmação.

## Pré-requisitos

- Supabase CLI
- Projeto Supabase criado
- Conta Google Cloud para OAuth Web Client

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
  GOOGLE_OAUTH_CLIENT_ID=<CLIENT_ID_GOOGLE> \
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
- Copie `appe.config.example.js` para `appe.config.js`.
- Defina `window.APPE_GOOGLE_CLIENT_ID` com o Client ID OAuth do Google.

## Executar localmente

Como o frontend é estático:
```bash
python3 -m http.server 5173
```

Abra:
- `http://localhost:5173/index.html`
- `http://localhost:5173/login.html`
- `http://localhost:5173/dashboard.html`

## Observações OAuth Google

- No Google Cloud, adicione `http://localhost:5173` em **Authorized JavaScript origins**.
- Em produção, inclua o domínio real da aplicação.
- O backend valida `id_token` no Google e confere `aud` com `GOOGLE_OAUTH_CLIENT_ID`.
