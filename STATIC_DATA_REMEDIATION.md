# Static Data Remediation

Date: 2026-08-20

## Result

The audit identified 37 static-data violation groups. The application now serves visible UI copy and backend-rendered copy from the `ui_content` database table at runtime, with admin APIs to manage content rows without code changes.

## Implemented

- Added `UIContent` storage for dynamic copy.
- Added `/api/ui-content` so the website hydrates labels, descriptions, placeholders, titles, alt text, and aria labels from API data.
- Added admin `/api/ui-content/manage` endpoints for content row create/update/delete.
- Added startup/self-healing seed logic so `ui_content` is populated for the active database instead of relying on a one-time script.
- Pointed the default SQLite database to `backend/oeis.db` so real synced mailbox data is used consistently.
- Moved OAuth callback pages, Graph setup text, PDF report titles, API error copy, escalation notifications, and daily summary notifications behind `ui_content` keys.
- Moved login, branding, navigation, page headers, empty states, table labels, dashboard KPI definitions, Graph setup UI labels, shell/header controls, filters, report controls, settings editor labels, settings tabs, table hints, guided-tour controls and step content, dashboard posture/reference labels, dialog labels, notices, and email-detail drawer labels to keyed `ui_content` lookups.
- Moved FastAPI title/version to environment-backed settings.

## Verified

- `backend/oeis.db` now has 1,571 `ui_content` rows, including 397 keyed frontend rows.
- Backend tests: `21 passed`.
- Frontend production build: passed.
- Strict audit-term scan: no audited static strings remain outside `backend/app/services/content.py`.

## Note

Runtime website copy is dynamic through `/api/ui-content`, and admin users can manage content rows through `/api/ui-content/manage`.
