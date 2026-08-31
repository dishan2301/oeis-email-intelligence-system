# OEIS Security Remediation Status

Date: 2026-08-21  
Scope: local source tree and local SQLite runtime  
Release decision: **NO-GO pending manual/deployed gates**

## What is implemented

| Area | Implemented control | Evidence |
|---|---|---|
| Sessions | Strict HS256 claims (`iss`, `aud`, `sid`, `jti`, type and time claims), database sessions, refresh rotation/replay-family revocation, logout and security-change revocation | `backend/app/core/security.py`, `auth_sessions`, abuse tests |
| Browser tokens | Refresh credential is HttpOnly/SameSite; access token is memory-only; origin checks protect cookie actions; authenticated APIs are `no-store` | auth routes, `frontend/src/ProductionApp.tsx`, security-header tests |
| Passwords/login | Argon2id with legacy migration, generic failures, dummy verification, shared database throttling, minimum password policy | security and throttle tests |
| Authorization | Manager mailbox assignment table; deny-by-default scope across dashboards, pending/detail, options, performance, reports/exports, calendars, logs and escalations; last active Admin protected | `authorization.py`, route tests |
| OAuth | Durable encrypted state, strong browser binding, user/session/provider/mailbox binding, ten-minute expiry, one-time consume, PKCE, account/mailbox match and immutable provider identity | `oauth_transactions.py`, Graph/Gmail routes, negative tests |
| Provider tokens | AES-GCM authenticated encryption with key IDs and previous-key rotation support; AAD binds mailbox/provider | `secrets.py`, migration `0006`, tamper test |
| Input/output | Regex timeouts and bounds, XLSX formula neutralization, HTML escaping, report/input limits, UI-content validation | hardening tests |
| Outbound network | Exact HTTPS Graph host/port validation on every next/delta URL; fixed Gmail endpoints; redirects disabled; TLS verification and bounded timeouts | Graph/Gmail services and SSRF tests |
| Audit | Security events for auth, denials and material Admin actions with request IDs and hashed source metadata; no secrets | `security_events.py`, Admin audit API |
| Scheduler | Redis lease, bounded heartbeat, duplicate skip, work cancellation on lease loss, production fail-closed; exactly one scheduler owner is configurable | `jobs.py`, `SCHEDULER_ENABLED`, lease-loss test |
| Platform | Production config fail-fast, exact hosts/origins, CSP and browser headers, docs off, non-root/read-only containers, private DB/Redis ports, proxy limits/rate limits | config, Dockerfiles, Nginx, Compose |
| Supply chain | Hashed Python runtime lock, deterministic `npm ci`, pinned GitHub Action commits, Python/npm audits, Bandit, Gitleaks, tests/build/migration gates and SBOM jobs | `requirements.lock`, `.github/workflows/security.yml` |

## Local verification result

- Alembic: `0006 (head)`.
- Provider tokens: 2 encrypted, 0 legacy plaintext, 2 successfully decryptable.
- Backend: 45 tests passed after framework upgrades.
- Frontend: TypeScript/Vite production build passed.
- Python dependencies: no known vulnerabilities from `pip-audit` against the hashed lock.
- Frontend runtime and build dependencies: zero npm audit findings.
- Static analysis: zero medium/high Bandit findings; remaining low findings are string-name false positives.
- Secret scan: Gitleaks passed for distributable source; runtime `.env`, databases and generated dependencies are excluded and must remain outside release artifacts.
- Live smoke: health 200; login 200; access-only response; HttpOnly/SameSite=Strict refresh cookie.

## Mandatory manual/deployed gates

These cannot be truthfully completed by source changes alone. Do not release until an accountable operator records evidence for each item.

1. Rotate the Google OAuth client secret that was present in the old JSON file; revoke the old secret in Google Cloud.
2. Rotate Microsoft client credentials and any SMTP/database/Redis credential that may have appeared in shared files or archives.
3. Change the existing local/deployed Admin password through a protected operational procedure. The development password has appeared in tests/conversation and must be treated as known.
4. Store production JWT, token-encryption, provider, SMTP, database and Redis secrets in a managed secret store. Back up encryption keys separately and test a staged key rotation using `TOKEN_ENCRYPTION_PREVIOUS_KEYS`.
5. Enforce MFA through the production identity/access layer for Admins and Managers; local password-only login is not a bank-grade production control.
6. In Exchange Online, prove the Application Access Policy grants every approved mailbox and denies at least one unrelated mailbox. In Google, verify consent mode, test users/domain policy and exact redirect URIs.
7. Deploy exact HTTPS origins/redirects, trusted certificates, HSTS and network egress allowlists. Use SQL Server certificate validation and authenticated TLS Redis across trust boundaries.
8. Provision a least-privilege `oeis_app` database principal. Do not run the API as `sa` or a schema owner.
9. Build immutable images, record platform-specific image digests, scan final images, generate image SBOMs and sign/attest the release.
10. Run CI from a real Git repository and require every security workflow job before merge. This workspace has no Git metadata, so history/exposure review is still unverified.
11. Test encrypted backup restore, disaster recovery, audit forwarding/alerting, retention/deletion policy and incident-response credential rotation.
12. Perform an authenticated staging penetration test, including OAuth concurrency, proxy/body-limit behavior, object access, CSRF/XSS, provider throttling and resource exhaustion.

## Production operating rules

- Keep `MANAGER_TENANT_WIDE_ACCESS=false` unless a documented risk owner approves tenant-wide Manager visibility.
- Enable `SCHEDULER_ENABLED=true` on exactly one scheduler deployment and false on API replicas. Redis failure must stop production jobs.
- Run `alembic upgrade head` as a release job before application traffic.
- Never restore an encrypted database without the matching token-encryption key set.
- Never place `.env`, database files, OAuth JSON, exports, logs, keys or backups in source, images, CI artifacts or support bundles.
- A passing automated scan is necessary evidence, not proof of complete security.
