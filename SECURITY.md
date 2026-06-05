# Security Policy

## Supported Versions

This repository tracks the live APPE portal. Security fixes should be applied to the current `main` branch.

## Reporting a Vulnerability

If you find a security issue, please report it privately to the repository owner instead of opening a public issue.

- Do not share secrets, API keys, or service-role credentials in issues or pull requests.
- Include a clear description, reproduction steps, and any affected URLs or files.
- For urgent issues, contact the project maintainer directly through the preferred private channel.

## Public Repository Guidelines

- Only public configuration belongs in version control.
- Never commit Supabase service-role keys, SMTP credentials, or webhook secrets.
- Keep local environment overrides in ignored files such as `.env.local`.
