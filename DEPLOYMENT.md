# OEIS production deployment

## Required infrastructure

- Microsoft Entra tenant and one OEIS app registration with Microsoft Graph application `Mail.Read`
- Exchange Application Access Policy restricting the app to approved mailboxes
- SQL Server, Redis, TLS certificate, SMTP account or relay, and a secret manager
- Docker host, or Windows Server with IIS/Nginx reverse proxy and Python 3.12 service hosting

## Release procedure

1. Build immutable backend/frontend images and scan them.
2. Inject `.env.example` values through the deployment secret store. Never bake credentials into an image.
3. Verify `Test-ApplicationAccessPolicy` grants each configured mailbox and denies an unrelated mailbox.
4. Back up SQL Server, then run `alembic upgrade head` as a release job.
5. Start SQL Server/Redis dependencies, backend workers, then frontend proxy.
6. Verify `/api/health`, Admin login, Manager 403 on Admin mutation, one mailbox delta sync, audit log creation, and dashboard KPIs.

For Gmail mailboxes, also create a Google Cloud Web OAuth client, enable Gmail API, configure the consent screen and read-only Gmail scope, and register the deployed `GOOGLE_REDIRECT_URI`. Inject `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then connect each Gmail mailbox through the admin UI.
7. Enable `SCHEDULER_ENABLED=true` on exactly one scheduler deployment only after the smoke checks pass; keep it false on API replicas.

## Graph setup pipeline

The production dashboard includes Admin setup guidance under **Mailboxes → Add mailbox** and a Graph connection check.

Provider credentials are deployment-only. Inject them through the secret store; no HTTP endpoint writes `.env` or returns client-secret values. Microsoft tenant admin consent remains mandatory.

## HTTPS

Use `frontend/nginx-https.conf` with mounted certificate/key files, or bind an IIS HTTPS site and reverse-proxy `/api` to Uvicorn. Redirect HTTP to HTTPS. Keep HSTS enabled after certificate validation.

## Windows Server

Install Python 3.12 and Microsoft ODBC Driver 18, create a virtual environment, install `backend/requirements.txt`, and run Uvicorn as a Windows service under a restricted service account. Run Nginx or IIS in front; do not expose Uvicorn directly. Run Redis and SQL Server as managed services. Grant the service account read access only to required certificate/secret locations.

## Credential rotation

Create a second Entra secret/certificate. For certificate authentication, mount the PEM private key read-only and set `AZURE_CLIENT_CERTIFICATE_PATH` plus `AZURE_CLIENT_CERTIFICATE_THUMBPRINT`; leave `AZURE_CLIENT_SECRET` empty. Deploy the new credential to one instance, verify token acquisition and Graph scope, roll it across remaining instances, then retire the previous credential. Delegated Microsoft and Gmail mailbox refresh tokens are AES-GCM encrypted in the database. Preserve current/previous token-encryption keys during staged rotation and backup restore.

Rotate the formerly source-tree Google OAuth credential before production. Also change any existing Admin password derived from development values, require MFA at the production identity layer, and complete every gate in `SECURITY_REMEDIATION_STATUS.md`.

## Rollback

Stop scheduling, restore the pre-release SQL backup if the migration is incompatible, deploy the previous pinned images, run health/RBAC/Graph-scope smoke tests, then resume jobs. Preserve failed-release logs for investigation.
