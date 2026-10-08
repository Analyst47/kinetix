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
- AI assistance: grounded triage, questions and drafting with injection defenses and
  citation verification (Claude API, Gemini API, OpenAI-compatible/Ollama)
- Restricted database role for the app, with a startup guard against RLS bypass
- Password reset and change, security notification emails, emailed invitations (Resend)
- Public Git repository targets, fetched by the worker as pinned single-commit snapshots
- Hardening: Caddy edge, nonce CSP, Redis-shared rate limits, trusted-proxy client IPs,
  production-forced Secure cookies, independent penetration test
- Per-finding export to CVE Record Format 5.1, OSV and PDF; project findings export to a
  JSONL training dataset
- Confidence ranking (taint-verified vs pattern) and an expanded taint rule pack (SSRF, SSTI,
  reflected XSS, NoSQL injection, prototype pollution, ReDoS, and more); AI caller context

## Next

1. **Disclosure deadline reminders** by email (the delivery path is in place).
2. **Passkeys** (WebAuthn) alongside TOTP.
3. **Private repositories** through a GitHub App installation (read-only, per repository).

## Later

- AI: multi-file context (callers and middleware), batch triage across a scan
- Reproduction environments, only on per-job sandboxes (gVisor or Firecracker)
- Public researcher profiles (explicit per-finding publication)
- GitHub App and CI integration
- API keys, webhooks
- Analytics: time to confirm, vendor response time, CWE distribution
