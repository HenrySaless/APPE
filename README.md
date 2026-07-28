# APPE Portal de Cursos

Um portal simples da APPE para apresentar cursos, receber acessos e organizar inscrições.

## Destaques

- interface clara e responsiva;
- acesso de usuários com login e cadastro;
- área do usuário e administração;
- foco em uma experiência direta e fácil de usar.

## Sobre

- criado por Henry Saless;
- link oficial: [appe.app.br](https://appe.app.br/).

## Executar localmente

O frontend é estático (HTML/CSS/JS). Não há build obrigatório.

1. Clone o repositório e entre na pasta do projeto.
2. Copie `.env.example` para `.env` apenas se for rodar Edge Functions localmente com Supabase CLI.
3. Sirva os arquivos com um servidor HTTP local, por exemplo:

```bash
npx serve .
```

4. Abra `http://localhost:3000` (ou a porta indicada pelo servidor).

### Configuração do frontend

As variáveis públicas do Supabase ficam em `appe.config.js`:

| Variável | Descrição |
|---|---|
| `supabaseUrl` | URL do projeto Supabase |
| `functionsBaseUrl` | Base URL das Edge Functions (`/functions/v1`) |
| `supabaseAnonKey` | Chave **anon** (pública, segura no browser) |
| `passwordRecoveryRedirectUrl` | URL de retorno após recuperação de senha |

> A chave `service_role` **nunca** deve aparecer no frontend. Ela fica apenas nos segredos das Edge Functions no painel Supabase.

### Variáveis das Edge Functions

Configure no painel Supabase (Project Settings → Edge Functions) ou via `.env` local com Supabase CLI. Veja `.env.example` para a lista completa.

Principais variáveis:

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — acesso server-side ao banco
- `PORTAL_ADMIN_EMAILS` — e-mails autorizados no painel admin
- `BREVO_API_KEY` — envio de e-mails de recuperação de senha
- `PASSWORD_RECOVERY_REDIRECT_URL` / `SITE_URL` — links de recuperação

## Deploy

O projeto está configurado para Vercel (`vercel.json`). O frontend estático é servido diretamente; as Edge Functions são deployadas separadamente via Supabase CLI.
