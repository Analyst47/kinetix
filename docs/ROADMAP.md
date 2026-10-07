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
- TOTP two-step verification, recovery codes, session management
- Members and invitations with owner safeguards
- Printable and Markdown reports with audited exports
- Coordinated disclosure: security.txt lookup, notification draft, deadline tracking,
  vendor timeline driving the finding lifecycle

## Next

1. **Passkeys** (WebAuthn) alongside TOTP.
2. **Email delivery** for invitations, security notifications and disclosure deadline reminders.
3. **Advisory export**: CVE JSON 5 and OSV formats for a confirmed finding.
4. **Git targets**: clone a repository at a commit, in the worker, without running hooks.

## Later

- AI-assisted triage with prompt-injection defenses (repository content treated as data,
  structured output, no state changes from model output)
- Reproduction environments, only on per-job sandboxes (gVisor or Firecracker)
- Public researcher profiles (explicit per-finding publication)
- GitHub App and CI integration
- API keys, webhooks
- Analytics: time to confirm, vendor response time, CWE distribution
