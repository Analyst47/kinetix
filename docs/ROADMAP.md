# Roadmap

The order favors a narrow product that works end to end over broad features that don't.

## Shipped (MVP foundation)

- Accounts, organizations, roles, server-side sessions, CSRF, rate limiting
- Row-level security tenancy
- Projects with recorded authorization and expiry
- Archive targets with hostile-input extraction
- Scan pipeline: lockfiles → OSV, secrets, Semgrep rule pack
- Finding lifecycle with the confirmation gate
- Evidence vault with SHA-256 verification
- Hash-chained audit log and chain-of-custody views
- CVSS 4.0 / 3.1 scoring
- Web app: findings, finding detail, dependencies, scans, scope, audit log, command palette

## Next

1. **MFA**: TOTP and passkeys (WebAuthn); session list in settings.
2. **Members**: invitations and role management.
3. **Reports**: Markdown and PDF export of a confirmed finding, with the custody ledger.
4. **Disclosure workflow**: vendor contact lookup via `security.txt`, timeline, 90-day
   deadline tracking.
5. **Advisory export**: CVE JSON 5 and OSV formats for a confirmed finding.
6. **Git targets**: clone a repository at a commit, in the worker, without running hooks.

## Later

- AI-assisted triage with prompt-injection defenses (repository content treated as data,
  structured output, no state changes from model output)
- Reproduction environments, only on per-job sandboxes (gVisor or Firecracker)
- Public researcher profiles (explicit per-finding publication)
- GitHub App and CI integration
- API keys, webhooks
- Analytics: time to confirm, vendor response time, CWE distribution
