# OEIS Security Audit Brain and Review Specification

## Purpose

This file is a security-only handoff for an independent reviewer or AI coding agent such as Claude. It explains what OEIS is, identifies its security boundaries, records initial observations from the repository, and defines the evidence required for a complete security review.

This is not proof that OEIS is secure. Every statement must be verified against the current repository and deployed environment. Do not treat documentation, passing tests, or absence of obvious errors as proof of security.

Repository observations in this file were collected on 2026-08-21 from the local working tree at `/home/dishan/Documents/main_indianinfo/SUBMISSION_2026-07-13`.

## Current Remediation State (2026-08-21)

The source has changed materially since the initial observations later in this document. Treat those observations as historical test leads, not descriptions of the current implementation. Start with `SECURITY_REMEDIATION_STATUS.md`, inspect migration `0006_security_foundation.py`, and independently reproduce every claimed control.

Current local evidence: migration `0006` is at head; mailbox provider tokens were migrated from the legacy plaintext column into AES-GCM ciphertext; 45 backend tests pass; the frontend production build passes; `pip-audit` and production `npm audit` report no known vulnerabilities; Gitleaks reports no source-tree secrets after excluding runtime/generated paths; Bandit reports no medium/high findings.

Release status remains **NO-GO** until the manual/deployed gates in `SECURITY_REMEDIATION_STATUS.md` are signed off. In particular, source changes cannot rotate Google/Microsoft/SMTP/database credentials, enforce tenant-side mailbox policy or MFA, prove TLS/network controls, test backup restoration, or validate a built container image.

## Instructions for the Reviewer

Act as a senior application-security engineer. Perform a read-only audit first. Do not modify code, rotate credentials, delete files or databases, trigger mailbox synchronization, send notification email, complete OAuth flows, contact real users, or run destructive tests without explicit authorization.

Security rules for the review:

1. Never print, quote, copy, or include any real password, JWT, OAuth code, client secret, refresh token, access token, SMTP credential, private key, email content, or connection string in output.
2. Redact secrets as `[REDACTED]`. When identity is required, report only variable name, path, approximate type, and a one-way fingerprint such as the first 12 characters of SHA-256.
3. Treat `backend/.env`, OAuth credential JSON, SQLite databases, logs, exported reports, and mailbox data as sensitive.
4. Do not assume a file is committed. This working directory currently has no Git metadata. Say “present in source tree” unless repository history proves it was committed.
5. Separate confirmed vulnerabilities from suspected risks, missing controls, and deployment-dependent findings.
6. For every finding, provide exact file and line evidence, attack prerequisites, realistic attack path, impact, remediation, and a verification test.
7. Prefer a small, direct remediation. Do not perform unrelated refactors.
8. If a tool needs network access, state why and obtain approval before contacting external services.
9. Verify fixes with negative tests, not only happy-path tests.
10. If evidence is incomplete, mark the item `Not verified`; never mark it secure by assumption.

## Project Brain

### Product

OEIS means Office Email Intelligence System. It is a single-tenant, multi-mailbox system that reads Microsoft 365 Outlook and Gmail metadata, identifies customer messages, detects replies, calculates business-hours SLA status, sends escalations and summaries, and presents management dashboards and reports.

The system handles business-sensitive email metadata. Current models store sender, receiver, subject, message and conversation identifiers, Internet Message IDs, reply headers, categories, folder, timestamps, assignment, classification, status, SLA hours, and SLA tier. Email bodies and attachments are not intentionally stored by the current sync implementation.

### Users and Roles

- `Admin`: manages users, mailboxes, OAuth connections, provider credentials, employees, assignments, settings, sync, exports, UI content, and reports.
- `Manager`: can view dashboards, pending email metadata, mailbox options, employee performance, reports, SLA/classification/calendar settings, audit logs, and escalations. Manager mutations should be denied.
- Unauthenticated users: should only reach health, login, OAuth callbacks, frontend assets, and currently public UI-content reads.

The application is single-tenant. Managers now use explicit `manager_mailbox_access` assignments; no assignment denies mailbox-sensitive data by default. `MANAGER_TENANT_WIDE_ACCESS` is an explicit compatibility override and must remain false for least privilege.

### Current Route Access Model

- Public: health, active UI-content reads, login, refresh-token exchange, Microsoft OAuth callback, and Gmail OAuth callback.
- Admin or Manager: dashboards, readiness, pending-email metadata and detail, mailbox options, employees/performance, reports and exports, settings reads, audit logs, and escalations.
- Admin only: user management, mailbox management, provider setup/config/check, OAuth start, email assignment, employee mutations, report sending, settings mutations, UI-content management, and manual sync.

This grouping is orientation only. Reviewer must derive and test the exact matrix from every route decorator and any internal function call that bypasses normal dependency injection.

### Technology

- Backend: FastAPI, Python, SQLAlchemy, Alembic, PyJWT, Passlib, MSAL, HTTPX, APScheduler, Redis.
- Frontend: React, TypeScript, Material UI, Vite, Nginx.
- Databases: SQL Server is documented for production; SQLite files are present for local use.
- Integrations: Microsoft Graph, Microsoft identity platform, Gmail API, Google OAuth, SMTP.
- Deployment: Docker Compose or a reverse proxy in front of Uvicorn.

### Important Paths

- `backend/app/main.py`: application startup, bootstrap Admin, CORS, scheduler, static frontend serving.
- `backend/app/api/routes.py`: authentication, authorization declarations, OAuth callbacks, configuration writes, reports, exports, sync trigger, and administration endpoints.
- `backend/app/core/security.py`: password hashing, JWT creation/decoding, and role guards.
- `backend/app/core/config.py`: settings, defaults, environment-file loading, credential locations.
- `backend/app/models/entities.py`: persisted data, including provider refresh tokens.
- `backend/app/services/graph.py`: Graph authentication and delta-link requests.
- `backend/app/services/gmail.py`: Google refresh-token exchange and Gmail requests.
- `backend/app/services/sync.py`: external mailbox ingestion and persistence.
- `backend/app/services/jobs.py`: Redis locks, escalation processing, and HTML summaries.
- `backend/app/services/notifications.py`: SMTP with STARTTLS.
- `backend/app/services/classification.py`: administrator-defined regular expressions applied to untrusted email metadata.
- `frontend/src/ProductionApp.tsx`: login, token storage, authenticated requests, OAuth launch, administration, and exports.
- `frontend/nginx.conf`: default HTTP reverse proxy.
- `frontend/nginx-https.conf`: example TLS and security-header configuration.
- `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`: runtime and supply-chain boundaries.
- `backend/tests/test_api_security.py`: current security-focused tests. These tests cover only part of the required security surface.

### Sensitive Assets

1. Admin and Manager credentials.
2. JWT signing secret and bearer tokens.
3. Microsoft tenant/client credentials and certificate private key.
4. Google OAuth client secret.
5. Microsoft and Google mailbox refresh tokens.
6. SMTP credentials.
7. Email metadata, customer identities, message subjects, assignments, SLA state, and reports.
8. SQL Server/SQLite data and backups.
9. Redis locks and scheduler integrity.
10. OAuth authorization codes, state values, callback URLs, and delta/history cursors.

### Trust Boundaries and Data Flows

1. Browser sends credentials to `/api/auth/login`; API returns a short-lived access JWT and sets a rotating refresh credential in an HttpOnly, SameSite cookie. The frontend retains the access token only in memory.
2. Browser sends bearer access tokens in the `Authorization` header; refresh/logout cookie actions enforce origin/fetch-site checks.
3. API validates strict JWT claims, reloads the active user and stateful session from the database, and applies Admin/Manager role and mailbox-scope guards.
4. Provider credentials are deployment-only settings. HTTP endpoints no longer write credentials or `.env` files.
5. Admin starts OAuth. Durable encrypted transactions bind state to provider, user, auth session, browser and mailbox, expire after ten minutes, use PKCE, and are consumed once. Provider refresh tokens are stored with AES-GCM authenticated encryption.
6. Scheduler or Admin sync obtains provider access tokens, follows Graph delta links or Gmail history, and stores email metadata.
7. Admin-defined regex rules process untrusted sender and subject strings.
8. Reports export database values to XLSX or PDF.
9. Scheduler inserts untrusted email metadata into HTML notification emails and sends it through SMTP.
10. Nginx or another reverse proxy should terminate TLS before proxying `/api` to Uvicorn.

### External Authorization Requirements

- Microsoft app-only access uses Graph application permission `Mail.Read`. Exchange Application Access Policy must restrict access to approved mailboxes and must be tested with allowed and denied addresses.
- Microsoft delegated access requests `Mail.Read`, `offline_access`, and `User.Read` through configuration.
- Gmail access should remain limited to `gmail.readonly` and `userinfo.email`.
- OAuth redirect URIs must be exact HTTPS production URLs outside local development.

## Initial Repository Observations

These are audit leads, not a completed vulnerability report. Reproduce each item before assigning final severity.

### Historical credential-containment leads

- The Google OAuth JSON was removed from the project tree and moved to a user configuration directory with mode `600`. Because exposure history is unknown, external credential rotation remains mandatory.
- `backend/.env` and local SQLite files are now mode `600` and excluded by Git/Docker ignore rules. They remain sensitive runtime artifacts and must not be distributed.
- Local JWT and token-encryption keys were randomly generated without printing them. Production must inject independent managed secrets; the local values are not production credentials.
- Known bootstrap credentials appear in tests and have also been used during development. Verify that no deployed Admin account uses a known development password.

### Historical high-value review leads

The source-level leads below drove the remediation. Independently test that each is actually closed; do not infer closure from this label.

- `Settings.jwt_secret` has a known development fallback and production startup does not visibly reject it.
- Access and seven-day refresh JWTs have no `jti`, issuer, audience, server-side session record, revocation list, or refresh-token family. Refreshing issues a new token but does not invalidate the old refresh token.
- Frontend stores access and refresh tokens in `localStorage`; any successful same-origin XSS could steal both.
- Login has no visible rate limiting, progressive delay, account lockout, MFA, or authentication-event audit trail.
- Provider refresh tokens are stored as plaintext in `Mailbox.graph_refresh_token`.
- Microsoft OAuth callback stores the returned refresh token without visibly verifying that the authenticated Microsoft account matches the configured mailbox. Gmail performs an explicit account match.
- Gmail OAuth state is signed and expiring but is not visibly bound to an authenticated browser session or stored as one-time server state. Microsoft state is stored only in process memory, which creates multi-worker/restart correctness concerns.
- Admin provider-credential endpoints write plaintext credentials into `backend/.env` from an HTTP request. Review production suitability, filesystem permissions, symlink/concurrency risk, secret lifetime, and returned path disclosure.
- Administrator-defined regular expressions are executed against untrusted email metadata with no visible regex timeout or complexity control. Review catastrophic backtracking denial of service.
- XLSX exports may interpret attacker-controlled sender/customer values beginning with `=`, `+`, `-`, or `@` as spreadsheet formulas. Test formula injection safely.
- HTML email summaries and escalation bodies interpolate email sender and subject values without visible HTML escaping. Test HTML injection into outbound notification content without sending real email.
- Graph delta URLs are persisted and later requested directly. Validate scheme and host before following a stored or provider-supplied URL to limit SSRF risk after database compromise or malicious state insertion.
- Audit Logs currently appear to contain sync and escalation events, not login attempts, refreshes, user changes, credential changes, mailbox changes/deletions, settings changes, report exports, or manual sync attribution.
- Default HTTP Nginx configuration lacks the headers present in the HTTPS example, including HSTS, frame denial, MIME sniffing protection, and referrer policy. Neither example visibly sets a Content Security Policy or Permissions Policy.
- FastAPI documentation and OpenAPI schema are enabled at predictable URLs. Decide whether production exposure is acceptable and authenticated.
- Docker images use mutable tags and containers do not visibly drop root, use a read-only filesystem, declare health checks for every service, or constrain Linux capabilities/resources.
- Backend dependencies are version-pinned, but container base images use mutable tags. Frontend dependency ranges permit changes, and Docker uses `npm install` instead of deterministic `npm ci`.
- Sync and export endpoints have no visible application-level request throttling. Confirm concurrency, resource exhaustion, maximum report size, and proxy timeouts.
- Error strings from providers and sync are persisted and returned to users. Verify that tokens, tenant details, internal paths, message content, or provider diagnostics cannot leak.
- Public `/api/ui-content` is intentional for login-screen content, but verify it never exposes secrets or unsafe markup and cannot become stored XSS.

## Required Security Audit

### 1. Secrets and Credential Exposure

- Scan source, hidden files, archives, generated assets, databases, logs, tests, documentation, Docker layers, and available repository history.
- Check Microsoft, Google, SMTP, database, Redis, JWT, bootstrap, TLS, private-key, and recovery credentials.
- Confirm `.gitignore`, Docker build context, deployment archives, backups, and CI artifacts exclude secrets and databases.
- Establish rotation status for every exposed or possibly exposed credential.
- Verify secret files have least-privilege ownership and mode.
- Verify production uses a secret manager and no secret-management endpoint returns secret values.
- Confirm logs and exception messages redact authorization headers, codes, tokens, passwords, and connection strings.

Pass condition: no live credential exists in source or artifacts; all possibly exposed credentials are rotated; runtime secrets are least-privilege, access-controlled, and auditable.

### 2. Authentication and Session Security

- Test valid login, invalid username, invalid password, inactive user, deleted user, malformed JWT, expired JWT, wrong token type, wrong signature, modified role claim, and algorithm-confusion attempts.
- Verify production rejects default/short JWT secrets and unsupported algorithms at startup.
- Review password hashing cost and migrate toward Argon2id if appropriate.
- Test password policy against common, breached, context-specific, and reused passwords.
- Review rate limits by IP and account, progressive delay, lockout safety, credential stuffing resistance, MFA, and secure recovery.
- Review refresh rotation, replay detection, revocation, logout, password-change invalidation, user-disable invalidation, and maximum session lifetime.
- Compare `localStorage` bearer tokens with an `HttpOnly`, `Secure`, `SameSite` cookie design and document CSRF/XSS tradeoffs.
- Verify browser and proxy caching cannot store authenticated API responses.

Pass condition: account attacks are throttled and visible; tokens are short-lived, scoped, revocable, replay-resistant, and protected from common browser theft paths.

### 3. Authorization and Object Access

- Build a route-by-route matrix for unauthenticated, Manager, Admin, inactive, and tampered-token callers.
- Verify every route has the intended guard, including exports, sync, setup, credentials, OAuth start, settings, UI content, callbacks, and static files.
- Test horizontal access to every object ID: email, mailbox, user, employee, calendar, content, report, escalation, and audit event.
- Confirm whether Managers should see all customer addresses, subjects, mailbox names, employee emails, reports, and audit errors.
- Verify Admin cannot delete or disable the last active Admin without an explicit safe policy.
- Verify a user cannot escalate their own role through request-body overposting or a stale JWT claim.

Pass condition: deny-by-default authorization is enforced server-side, with explicit tests for every role and sensitive object/action.

### 4. OAuth and Provider Security

- Check authorization-code flow against OAuth 2.0 Security Best Current Practice.
- Verify state has strong entropy, short expiry, one-time use, exact provider/type, initiating-user binding, initiating-session binding, and mailbox binding.
- Verify PKCE where applicable.
- Verify exact redirect URI, HTTPS in production, trusted issuer/tenant, expected client ID/audience, and account/email match.
- Verify authorization code and provider errors never leak to logs or HTML.
- Verify Gmail and Graph scopes are allowlisted in code, not freely widened through environment or admin input.
- Verify refresh-token encryption, rotation, revocation, disconnect flow, deletion, backup handling, and access audit.
- Test wrong mailbox, wrong provider, replayed callback, expired state, changed state, missing code, denied consent, duplicate callback, worker restart, and concurrent callbacks.
- Confirm Exchange Application Access Policy grants only approved mailboxes and denies an unrelated mailbox.
- Confirm delegated Microsoft access cannot connect an account different from the configured mailbox.

Pass condition: callbacks are one-time and session-bound; identities match mailboxes; scopes are minimal; tokens are encrypted and revocable.

### 5. Input Validation and Injection

- Test SQL injection across all query, path, form, JSON, search, sort, date, report, and settings inputs.
- Test stored/reflected DOM XSS in sender, receiver, subject, mailbox name, employee name, UI content, provider errors, audit errors, and report content.
- Test HTML injection in SMTP notifications using a fake SMTP server only.
- Test CSV/XLSX formula injection and verify dangerous prefixes are escaped as text.
- Test PDF control characters and oversized strings.
- Test regex denial of service with safe time limits and isolated fixtures.
- Test path traversal and arbitrary file reads through static frontend fallback, certificate paths, export filenames, and setup/config endpoints.
- Test command injection in generated scripts and PowerShell commands using malicious mailbox/display values.
- Test HTTP response splitting and unsafe `Content-Disposition` values.
- Test integer bounds, huge pages, huge payloads, duplicate JSON keys, invalid Unicode, null bytes, and content-type confusion.

Pass condition: all untrusted data is validated by context and safely encoded at every output sink.

### 6. SSRF, External Requests, and Network Controls

- Inventory every outbound hostname and enforce HTTPS plus an allowlist.
- Validate Graph next/delta links remain on approved Microsoft Graph hosts.
- Confirm Gmail endpoints are fixed and redirects cannot escape approved hosts.
- Review HTTPX redirect behavior, DNS rebinding exposure, proxy environment variables, timeouts, retry caps, response size, and TLS verification.
- Verify SMTP requires authenticated STARTTLS with certificate validation; consider implicit TLS where required.
- Verify production network egress permits only Microsoft, Google, SMTP, database, Redis, DNS, and required monitoring destinations.
- Ensure error handling does not return remote response bodies containing sensitive data.

Pass condition: attacker-controlled data cannot select arbitrary internal/external destinations, and all external calls are bounded and TLS-verified.

### 7. Data Protection and Privacy

- Classify each database field and define collection purpose, legal basis, retention, deletion, export, and access rules.
- Confirm only required email metadata is requested and stored; verify bodies and attachments are not accidentally fetched or logged.
- Encrypt SQL Server, backups, provider refresh tokens, and sensitive fields at rest with managed keys and rotation.
- Use TLS for browser, API, SQL Server, Redis, SMTP, Microsoft, and Google connections.
- Verify database users have least privilege and are not `sa` in production.
- Verify Redis authentication/TLS or private-network isolation.
- Test mailbox deletion for complete token, cursor, email, escalation, log, backup, and cache handling; document intentional audit retention.
- Define retention and secure deletion for emails, logs, exports, backups, and OAuth records.
- Verify report downloads use `Cache-Control: no-store` and cannot be accessed after logout.
- Review privacy obligations for customer email metadata and cross-border provider processing.

Pass condition: data is minimized, encrypted, retained only as required, and deleted or anonymized through a documented lifecycle.

### 8. API and Browser Security

- Review CORS for exact production origins, credentials behavior, `null` origin, subdomain attacks, and preflight handling.
- Review CSRF based on final token transport. If cookies are adopted, require CSRF tokens and appropriate SameSite behavior.
- Add and test CSP, HSTS, `X-Content-Type-Options`, frame protections, `Referrer-Policy`, `Permissions-Policy`, and safe caching headers.
- Test clickjacking, MIME confusion, mixed content, open redirects, tabnabbing, and service-worker risks.
- Restrict production API docs or document why public schema exposure is accepted.
- Set request-body, header, URL, upload, response, and connection limits at proxy and application layers.
- Confirm frontend never renders dynamic content as raw HTML and does not log tokens.

Pass condition: production browser and API responses enforce a documented security-header baseline and strict origin policy.

### 9. Business Logic, Concurrency, and Availability

- Test concurrent manual and scheduled sync, Redis outage, lock expiry during a long sync, multiple API workers, and partial provider failure.
- Confirm duplicate sync cannot corrupt state, overwrite fresh refresh tokens, duplicate notifications, or bypass unique constraints.
- Review deletion during sync and OAuth callback races.
- Bound mailbox count, message count, pagination, report rows, regex runtime, sync duration, retries, and memory use.
- Test Graph/Gmail throttling, malformed remote payloads, enormous headers/categories, expired history IDs, and poison messages.
- Verify scheduler runs exactly once per intended deployment and fails closed outside development when Redis is unavailable.
- Review database transaction boundaries so one mailbox failure cannot corrupt another mailbox's data.
- Verify clock, timezone, DST, and stale-state manipulation cannot suppress or duplicate escalations.

Pass condition: attacker-controlled or abnormal load cannot create unbounded work, corrupt synchronization state, or duplicate sensitive actions.

### 10. Logging, Audit, Detection, and Incident Response

- Define security audit events: login success/failure, refresh replay, logout, user/role/password changes, credential changes, OAuth connect/disconnect, mailbox create/update/delete, assignment, settings changes, report export/send, manual sync, and access denials.
- Record actor user ID, action, object, UTC time, request/correlation ID, outcome, and safe source metadata. Do not record secrets or unnecessary personal data.
- Make audit logs append-only for application users and protect integrity in storage.
- Configure alerts for credential attacks, privilege changes, unusual exports, OAuth failures, sync spikes, and repeated provider errors.
- Define incident procedures for Google, Microsoft, JWT, SMTP, database, and Admin credential compromise.
- Test backup restoration and credential rotation without data loss.

Pass condition: critical actions are attributable, tamper-resistant, monitored, retained, and usable during an incident.

### 11. Dependency, Build, Container, and CI/CD Security

- Audit Python and npm direct/transitive dependencies for known vulnerabilities and licenses.
- Generate an SBOM for backend, frontend, and container images.
- Pin base images by digest; use deterministic installs and lockfiles.
- Scan source, dependencies, images, IaC, and secrets in CI. Fail builds on an agreed severity threshold.
- Run containers as non-root, drop capabilities, use read-only filesystems where possible, mount writable paths explicitly, and set CPU/memory/PID limits.
- Keep secrets out of image layers and build logs.
- Separate migration, API, and scheduler responsibilities for multi-instance production.
- Sign build artifacts/images and document provenance and rollback.
- Verify production disables debug behavior and rejects development defaults.

Pass condition: builds are reproducible, scanned, least-privilege, traceable, and free of embedded secrets.

### 12. Deployment and Infrastructure

- Verify actual deployed TLS configuration, certificate chain, renewal, protocols, ciphers, redirects, HSTS, and trusted proxy headers.
- Do not expose Uvicorn, SQL Server, or Redis publicly.
- Review firewall rules, security groups, DNS, WAF/rate limits, host patching, container runtime, and service accounts.
- Verify `X-Forwarded-For`, host, and scheme headers are trusted only from known proxies.
- Verify environment separation and ensure development credentials/data never reach production.
- Verify encrypted backups, restore tests, recovery objectives, monitoring, and alert ownership.
- Confirm provider portals have minimal administrators, MFA, credential expiry, and activity logging.

Pass condition: only intended HTTPS endpoints are public; infrastructure and provider accounts use least privilege, monitoring, and recoverable operations.

## Required Automated and Manual Evidence

Use available tools; do not install or contact network services without approval.

```bash
# Baseline tests
cd backend
PYTHONPATH=. .venv/bin/pytest -q
cd ../frontend
npm run build

# Suggested local security scans
gitleaks detect --no-git --source .. --redact
bandit -r ../backend/app -x ../backend/tests
pip-audit -r ../backend/requirements.txt
npm audit --omit=dev
semgrep scan --config auto ../backend/app ../frontend/src
trivy fs --scanners vuln,secret,misconfig ..

# Build-context and artifact review
find .. -type f -perm -004 -print
find .. -type f \( -name '*.env*' -o -name '*.db' -o -name '*.json' -o -name '*.pem' -o -name '*.key' -o -name '*.pfx' -o -name '*.log' \) -print
docker compose config
docker history oeis-backend-image
docker history oeis-frontend-image
```

Do not paste raw scan output containing secrets into the report. Redact first.

Manual evidence must include:

- Route authorization matrix with actual status codes.
- OAuth negative-test results using test provider accounts.
- Secret rotation confirmation IDs or dates, never secret values.
- TLS/header results from the deployed URL.
- Database encryption, account privilege, backup, and retention evidence.
- Exchange policy allowed/denied results.
- Gmail OAuth scope verification from Google Cloud.
- Threat model showing browser, proxy, API, scheduler, database, Redis, SMTP, Microsoft, and Google boundaries.
- Proof that fixed vulnerabilities have regression tests.

## Finding Format

Use this exact structure for every finding:

```markdown
### OEIS-SEC-001: Short title

- Severity: Critical | High | Medium | Low | Informational
- Confidence: Confirmed | High | Medium | Low
- Status: Open | Fixed | Accepted | Not reproducible
- CWE / OWASP mapping:
- Affected component:
- Evidence: exact file and line, sanitized command output, or deployed observation
- Preconditions:
- Attack path:
- Impact:
- Existing controls:
- Remediation:
- Regression test:
- Residual risk:
```

Severity should reflect realistic prerequisites and business impact, not scanner labels alone.

## Final Audit Deliverables

1. Executive summary understandable by management.
2. Scope, date, reviewer, commit/artifact identifier, environment, and limitations.
3. Architecture and data-flow threat model.
4. Asset and trust-boundary inventory.
5. Route-level authentication/authorization matrix.
6. Findings ordered by severity, each using the required format.
7. Credential exposure and rotation register with redacted identifiers.
8. Dependency and container scan summary.
9. Data-protection and retention assessment.
10. Deployment/TLS/infrastructure assessment.
11. Prioritized remediation plan: immediate containment, 7 days, 30 days, and later hardening.
12. Regression-test plan and verification results.
13. Accepted risks with owner and expiry date.
14. Final go/no-go decision with explicit blocking findings.

## Release Gate

Do not call OEIS production-ready until all conditions below have direct evidence:

- No known live credential remains in source, shared artifacts, logs, images, or databases without approved protection.
- Any possibly exposed Microsoft, Google, SMTP, JWT, database, and Admin credential is rotated.
- Production rejects development secrets and passwords at startup.
- Critical and High findings are fixed or explicitly risk-accepted by an accountable owner with an expiry date.
- Login throttling, secure session handling, refresh-token replay controls, and security audit events are implemented and tested.
- Microsoft and Gmail OAuth callbacks are session-bound, one-time, identity-matched, least-scope, and regression-tested.
- Provider refresh tokens and sensitive data are encrypted at rest.
- XLSX formula injection, HTML email injection, regex denial of service, SSRF, and error leakage are tested and resolved.
- Route RBAC matrix passes for unauthenticated, Manager, Admin, inactive, and tampered-token callers.
- TLS, security headers, CORS, caching, proxy trust, and request limits pass against the deployed environment.
- Dependency, source, secret, IaC, and image scans have no unreviewed release-blocking result.
- Backups restore successfully, logs support incident investigation, and credential-rotation procedures are tested.
- Full backend test suite and frontend production build pass after remediation.

## Copyable Prompt for Claude

```text
Read SECURITY_AUDIT_BRAIN.md completely, then audit the entire OEIS repository as a senior application-security engineer. Treat the repository and deployed evidence as authoritative; treat this brain file only as orientation and required scope.

Start read-only. Do not expose secret values, modify files, rotate credentials, call real OAuth providers, trigger mailbox sync, send email, or run destructive/network tests without my explicit approval. Redact all secrets.

First produce:
1. verified architecture and trust boundaries,
2. route-level authentication/authorization matrix,
3. confirmed findings with exact file:line evidence and realistic attack paths,
4. items that require deployed-environment evidence,
5. prioritized remediation plan,
6. exact tests needed to prove each fix.

Use the finding format and release gate defined in SECURITY_AUDIT_BRAIN.md. Check every audit category; do not stop after finding a few vulnerabilities. Distinguish Confirmed, Suspected, Missing Control, and Not Verified. Never claim the system is secure because tests pass or because no issue was found by one scanner.
```
