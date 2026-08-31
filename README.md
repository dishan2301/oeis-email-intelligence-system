# OEIS — Office Email Intelligence System

Production-oriented single-tenant, multi-mailbox Microsoft 365 and Gmail SLA monitoring. The authoritative requirements are in `project.docx`.

## Stack

- FastAPI/Python 3.12, SQLAlchemy, Alembic, SQL Server
- Microsoft Graph delta queries using MSAL app-only authentication
- Redis and APScheduler (5-minute mailbox sync; 18:00 daily summary by default)
- React, TypeScript, Material UI, Chart.js
- Docker Compose for local and production-like deployment

## Local start

1. Copy `.env.example` to `.env`, set a strong `MSSQL_SA_PASSWORD`, database URL, JWT secret, and Azure values.
2. Register the Azure app and apply the mailbox restriction described below.
3. Run `docker compose up --build`.
4. Apply migrations: `docker compose exec backend alembic upgrade head`.
5. Open the production dashboard at `http://localhost:8080/` and Swagger at `http://localhost:8000/api/docs`.

The bootstrap Admin is created from `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`. Replace the example password before first start. Use the Admin API to create Manager users; never retain the development default in a deployed environment.

## Azure and Exchange setup

Create an Entra app registration, add Microsoft Graph **application** permission `Mail.Read`, and grant admin consent. Prefer a PEM certificate by setting `AZURE_CLIENT_CERTIFICATE_PATH` and `AZURE_CLIENT_CERTIFICATE_THUMBPRINT`; otherwise inject `AZURE_CLIENT_SECRET` from a secret manager. To rotate without downtime, deploy the new certificate/secret to one instance, verify token acquisition, roll it across remaining instances, and only then retire the previous credential.

Admins can use the in-app setup guidance from **Mailboxes → Add mailbox**. Provider credentials are deployment-only secrets: the API and UI do not accept or write client secrets. Configure them through the deployment secret store, restart the API, run the connection check, then start OAuth for the exact mailbox.

Tenant admin consent and the Exchange mailbox restriction are mandatory and cannot be bypassed by OEIS.

## Gmail setup

Admins can choose **Google Gmail** in **Mailboxes → Add mailbox**. Create a **Web application** OAuth client, add the exact `GOOGLE_REDIRECT_URI`, enable only Gmail read-only and user-email scopes, and inject the Client ID/secret through the deployment secret store. Add the mailbox, select **Connect Gmail**, sign in with that exact account, and then run **Sync now**.

While the Google OAuth app is in testing, add each monitored Gmail account as a test user. Production deployments should publish or internally approve the consent app as appropriate and keep `GOOGLE_CLIENT_SECRET` in the deployment secret store.

An app-only token is tenant-wide unless Exchange restricts it. In Exchange Online PowerShell:

```powershell
Connect-ExchangeOnline
New-DistributionGroup -Name "OEIS Allowed Mailboxes" -Type Security
Add-DistributionGroupMember -Identity "OEIS Allowed Mailboxes" -Member support@company.com
New-ApplicationAccessPolicy -AppId <AZURE_CLIENT_ID> -PolicyScopeGroupId "OEIS Allowed Mailboxes" -AccessRight RestrictAccess -Description "Restrict OEIS Graph access"
Test-ApplicationAccessPolicy -Identity support@company.com -AppId <AZURE_CLIENT_ID>
Test-ApplicationAccessPolicy -Identity unauthorized@company.com -AppId <AZURE_CLIENT_ID>
```

Verify the allowed mailbox returns `Granted` and an out-of-scope mailbox returns `Denied` before starting sync.

## Verification

```powershell
cd backend
python -m pip install --require-hashes -r requirements.lock
python -m pytest -q
pip-audit --disable-pip --no-deps -r requirements.lock
bandit -q -r app -x tests -lll
cd ../frontend
npm ci
npm audit --audit-level=high
npm run build
```

The highest-risk unit tests cover default-to-Customer classification, automatic-reply precedence, authoritative header reply matching, bounded fallback matching, business-calendar SLA calculation, and tier thresholds.

The production UI provides repository-backed KPIs, server-filtered pending email, employee performance, daily/weekly/monthly reporting by mailbox/customer/employee, Excel/PDF export, Microsoft 365 and Gmail mailbox administration, audit logs, configurable SLA/classification/business-calendar views, real manual synchronization, and daily-summary testing.

## Production and rollback

Use HTTPS at Nginx/IIS/load balancer, managed SQL Server and Redis, a secret store, encrypted backups, centralized logs, signed digest-pinned container images, and MFA at the production identity layer. Set `SCHEDULER_ENABLED=true` on exactly one deployment and false on API replicas. Run migrations as a release job before traffic shifts. See `SECURITY_REMEDIATION_STATUS.md`; its manual gates are mandatory before release.
