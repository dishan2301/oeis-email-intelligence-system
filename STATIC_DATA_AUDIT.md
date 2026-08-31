# STATIC DATA AUDIT

CEO review draft. No remediation is included in this report.

## Scope

Audited the current OEIS website/runtime surface in this workspace:

- `frontend/src/App.tsx`
- `frontend/src/main.tsx`
- `frontend/src/GuidedTour.tsx`
- `frontend/src/ProductionApp.tsx`
- `frontend/src/*.css` generated/rendered text
- Backend-rendered user surfaces in `backend/app/api/routes.py`, `backend/app/services/jobs.py`, and `backend/app/main.py`

This audit follows the supplied zero-tolerance definition. It treats hardcoded UI copy, labels, headings, empty states, help text, generated HTML, notification text, PDF text, and CSS `content` as violations unless they are delivered from a designated dynamic source.

## Route Coverage

All currently reachable frontend routes/sections are inside the production SPA:

| Route / view | Implementation | Status |
|---|---:|---|
| App boot | `frontend/src/main.tsx` | Audited |
| Dashboard | `frontend/src/ProductionApp.tsx` | Audited |
| Pending Emails | `frontend/src/ProductionApp.tsx` | Audited |
| Employee Performance | `frontend/src/ProductionApp.tsx` | Audited |
| Reports | `frontend/src/ProductionApp.tsx` | Audited |
| Mailboxes | `frontend/src/ProductionApp.tsx` | Audited |
| Escalations | `frontend/src/ProductionApp.tsx` | Audited |
| Audit Logs | `frontend/src/ProductionApp.tsx` | Audited |
| Users & Roles | `frontend/src/ProductionApp.tsx` | Audited |
| Settings | `frontend/src/ProductionApp.tsx` | Audited |
| Add/Edit Mailbox dialog | `frontend/src/ProductionApp.tsx` | Audited |
| Add/Edit Employee/User dialog | `frontend/src/ProductionApp.tsx` | Audited |
| Email details drawer | `frontend/src/ProductionApp.tsx` | Audited |
| Guided tour overlay | `frontend/src/GuidedTour.tsx`, `frontend/src/ProductionApp.tsx` | Audited |
| OAuth callback HTML | `backend/app/api/routes.py` | Audited |
| Report export PDF | `backend/app/api/routes.py` | Audited |
| Escalation/daily summary emails | `backend/app/services/jobs.py` | Audited |

## Findings

| ID | File / line(s) | Page / surface | Static data found | Required dynamic source |
|---|---|---|---|---|
| SD-001 | `frontend/src/main.tsx:20` | App boot | `Loading OEIS…` boot copy hardcoded in suspense fallback. | `ui_copy`/CMS key for boot and loading states. |
| SD-002 | `frontend/src/GuidedTour.tsx:35,38-39` | Guided tour overlay | `Skip product guide`, `Guide progress: step`, `Skip guide`. | `tour_copy`/CMS plus localized accessibility strings. |
| SD-003 | `frontend/src/ProductionApp.tsx:77-110` | Sidebar navigation | Static section names/descriptions: `Dashboard`, `Pending Emails`, `Executive overview`, `Team response metrics`, `Microsoft 365 scope`, etc. | Navigation config from API or `ui_navigation` table. |
| SD-004 | `frontend/src/ProductionApp.tsx:112-155` | Page headers | Static page eyebrow/description copy such as `EXECUTIVE COMMAND CENTER`, `CUSTOMER ACTION QUEUE`, `DECISION POLICY`. | `page_copy` CMS/API keyed by section. |
| SD-005 | `frontend/src/ProductionApp.tsx:158-192` | Empty states | Static empty-state titles/descriptions for Pending Emails, Performance, Reports, Mailboxes, Escalations, Audit Logs, Users & Roles. | `empty_state_copy` API/CMS keyed by view and role. |
| SD-006 | `frontend/src/ProductionApp.tsx:205-302` | Guided tour content | Entire guided tour script is hardcoded: `WELCOME TO OEIS`, `Your communication control room`, `Seven numbers answer the morning questions`, etc. | `tour_steps` table/API with ordered target, eyebrow, title, description. |
| SD-007 | `frontend/src/ProductionApp.tsx:391-427` | Logo/brand block | Static brand/accessibility copy: `OEIS`, `OFFICE EMAIL INTELLIGENCE`, `OEIS brand`. | Tenant branding config/API. |
| SD-008 | `frontend/src/ProductionApp.tsx:432-639` | Login page | Static marketing/security copy: `COMMUNICATION CONTROL, WITHOUT THE CHASE`, `Every customer email.`, `Visible. Timed. Accountable.`, `Live mailbox signal`, `Critical escalation`, `SECURE MANAGEMENT ACCESS`, `Welcome back`, `Enter OEIS`, `Office Email Intelligence System · Production control`, password toggle labels. | Tenant login copy/branding CMS, auth form schema, accessibility copy API. |
| SD-009 | `frontend/src/ProductionApp.tsx:646-762` | Shared data table | Static table/accessibility/action copy: `Operational records`, `OEIS operational data`, generated column labels, `Actions`, `Connect Outlook`, `Remove`, empty table defaults. | Table schema metadata from API per endpoint. |
| SD-010 | `frontend/src/ProductionApp.tsx:771-789` | Dashboard KPI schema | Static KPI labels/notes: `Today's emails`, `Received since midnight UTC`, `Pending replies`, `Critical`, `Ignored emails`, etc. | `/api/dashboard/kpis` should return label/note metadata or separate `metric_definitions` API. |
| SD-011 | `frontend/src/ProductionApp.tsx:827-1121` | Mailbox Graph setup pipeline | Static setup copy, button text, script labels, filenames, field labels: `Microsoft Graph setup pipeline`, `Start Microsoft setup`, `Tenant ID`, `Client secret`, `Azure CLI automation`, `Copy PowerShell`, `oeis-graph-setup.sh`, etc. | Graph setup content/templates from backend API or `setup_templates` table. |
| SD-012 | `frontend/src/ProductionApp.tsx:1149-1228` | Dashboard integration state | Static operational status strings: `Checking Microsoft 365 integration`, `No active Microsoft 365 mailbox is configured`, `Verified synchronization`, `Email notifications`, etc. | Backend readiness API should return message IDs/text from policy/config source. |
| SD-013 | `frontend/src/ProductionApp.tsx:1234-1467` | Dashboard main cards | Static headings/chart labels/automation descriptions: `OPERATIONAL POSTURE`, `Workload by response state`, `Pending, overdue, critical and resolved today`, `Make the intelligence live`, `Customer mail is separated from noise`, etc. | Dashboard layout/copy schema from CMS/API. |
| SD-014 | `frontend/src/ProductionApp.tsx:1476-1573` | Alternate/reference dashboard | Duplicate static dashboard copy: `LIVE POSTURE`, `COMMUNICATION ANALYTICS`, `NEXT MANAGEMENT MOVE`, `ATTENTION QUEUE`, `MAILBOX PULSE`, `Sync now`, `View evidence`, etc. | Same dashboard copy/schema API; remove duplicate static fallback. |
| SD-015 | `frontend/src/ProductionApp.tsx:1594-1909` | Settings editor | Static settings copy and defaults: `Service-level policy`, `Business calendars`, `New rule`, `Business hours only`, `09:00`, `18:00`, `Save settings`, validation helper text. | Settings schema metadata and seeded defaults from DB/API only. |
| SD-016 | `frontend/src/ProductionApp.tsx:1916-2460` | Main shell/topbar/sidebar footer | Static shell copy/status: `OPERATIONS`, `Integration operational`, `Scheduler configured`, `Five-minute delta interval`, `Skip to main content`. | Shell/navigation/system copy API and scheduler metadata endpoint. |
| SD-017 | `frontend/src/ProductionApp.tsx:2464-2510` | Header controls | Static topbar copy/actions: `Open navigation`, `PRODUCTION OEIS`, `Microsoft 365 · Multi-mailbox`, `Guide`, `Sign out`, `Sync now`, `Syncing...`. | Tenant branding + action metadata from API. |
| SD-018 | `frontend/src/ProductionApp.tsx:2523-2584` | View action buttons | Static actions: `Add mailbox`, `Add employee`, `Add user`. | Role-aware action metadata from API. |
| SD-019 | `frontend/src/ProductionApp.tsx:2598-2678` | Pending Emails filters | Static filter labels/options: `Search`, `Status`, `All status`, `Critical`, `Overdue`, `Pending`, `Replied`, `Ignored`, `Date`, `Any date`, `Today`, `Yesterday`, `This week`, `All mailboxes`, `All employees`. | Filter schema/options from `/api/emails/pending` metadata endpoint. |
| SD-020 | `frontend/src/ProductionApp.tsx:2687-2720` | Reports page | Static report controls: `Daily`, `Weekly`, `Monthly`, `Mailbox`, `Customer`, `Employee`, `Export Excel`, `Export PDF`, `Send daily summary now`. | Report schema/API capabilities endpoint. |
| SD-021 | `frontend/src/ProductionApp.tsx:2726-2750` | Employee Performance controls | Static sort labels/options: `Sort by`, `Employee`, `Total replies`, `Average reply time`, `Pending`, `Critical`, `Resolved`, `Ascending`, `Descending`. | Performance API metadata. |
| SD-022 | `frontend/src/ProductionApp.tsx:2758-2780` | Settings tabs | Static settings view options: `SLA rules`, `Classification rules`, `Business calendars`. | Settings API schema/index endpoint. |
| SD-023 | `frontend/src/ProductionApp.tsx:2792-2841` | Table hint copy by page | Static hint copy: `Click a mailbox row...`, `Click an employee row...`, `Click a user row...`, `Click an email row...`, plus `matching emails`. | Per-page help copy from CMS/API. |
| SD-024 | `frontend/src/ProductionApp.tsx:2854-2920` | Add/Edit mailbox dialog | Static dialog title/fields/actions: `Add Microsoft 365 mailbox`, `Edit Microsoft 365 mailbox`, `Mailbox address`, `Display name`, `Timezone`, `Asia/Kolkata`, `Synchronization status`, `Cancel`, `Save changes`, `Add mailbox`. | Dialog/form schema from mailbox API; timezone defaults from DB config. |
| SD-025 | `frontend/src/ProductionApp.tsx:2926-2992` | Add/Edit employee/user dialog | Static dialog titles/fields/actions: `support employee`, `manager or administrator`, `Name`, `Email`, `Temporary password`, `New password (optional)`, `Minimum 12 characters`, `Role`, `Active`, `Save changes`. | User/employee form schema from API; password policy API. |
| SD-026 | `frontend/src/ProductionApp.tsx:3007-3045` | Email detail drawer | Static labels: `Close email details`, `CLASSIFICATION / STATUS`, `PENDING BUSINESS HOURS`, `INTERNET MESSAGE ID`, `CONVERSATION ID`, `Assigned employee`. | Email detail schema/field-label metadata from API. |
| SD-027 | `frontend/src/reference.css:156-157` | Topbar visual | CSS-generated `⌕` search glyph hardcoded. | Icon should come from component/icon config, not CSS `content`. |
| SD-028 | `frontend/src/premium.css:3` | Login background watermark | CSS-generated `OEIS` watermark hardcoded in `.prod-login>.MuiCard-root:before`. | Tenant branding/theme API. |
| SD-029 | `frontend/src/executive.css:9`, `frontend/src/human.css:72,326`, `frontend/src/reference.css:600-601`, `frontend/src/login.css:1`, `frontend/src/tour.css:1` | CSS generated/decorative content | Empty CSS `content:""` and generated pseudo-elements are hardcoded rendering instructions. | Theme/layout config, or replace with real components controlled by API/theme tokens. |
| SD-030 | `backend/app/main.py:34` | API docs/OpenAPI | Static FastAPI title/version: `OEIS API`, `1.0.0`. | Application metadata from deployment config/API metadata source. |
| SD-031 | `backend/app/api/routes.py:68-97` | Graph setup API content | Static Microsoft setup group name, CLI script lines, permission text, portal links, environment template text, Exchange commands. | `graph_setup_templates` table/config service; tenant-specific setup generator. |
| SD-032 | `backend/app/api/routes.py:116,126,132,284` | API error copy | Static Graph error messages: `Microsoft Graph credentials are not configured`, `Microsoft Graph application credentials are not configured`, `Graph check failed...`. | Error catalog/i18n table keyed by error code. |
| SD-033 | `backend/app/api/routes.py:186,191,193,196` | OAuth callback HTML | Static HTML pages: `OEIS Outlook connect failed`, `Login expired. Start Connect Outlook again.`, `Mailbox was removed.`, `OEIS Outlook connected`, `You can close this tab and click Sync.` | OAuth callback template stored in CMS/template table. |
| SD-034 | `backend/app/api/routes.py:235-237` | PDF report export | Static PDF title/text: `OEIS Report`, `OEIS {period} Report — {dimension}` and pipe-delimited row format. | Report template engine using DB/CMS templates. |
| SD-035 | `backend/app/services/jobs.py:53-54` | Escalation notification email | Static email body/subject structure: `{role} escalation`, `has been pending`, `Open dashboard`, `OEIS escalation:`. | Notification template table with subject/body variables. |
| SD-036 | `backend/app/services/jobs.py:60-79` | Daily summary email | Static email greeting/body/subject: `Good Evening`, `Pending Emails`, `Critical`, `Overdue`, `Average Reply Time`, `Top Pending`, `Click here for Dashboard`, `OEIS daily summary`. | Notification template table with schedule-specific subject/body. |
| SD-037 | `backend/app/core/config.py:26,29-30` | Runtime default config | Static defaults: `summary_hour=18`, bootstrap password, bootstrap admin name. | Environment/secret manager only; no production fallback defaults. |

## Page-by-Page Summary

### Dashboard

Violations: SD-010, SD-012, SD-013, SD-014, SD-016, SD-017.

Current numeric values are dynamic from API/DB, but labels, notes, chart copy, readiness copy, dashboard card headings, CTA text, and explanatory operational text are hardcoded in React.

### Pending Emails

Violations: SD-003, SD-004, SD-005, SD-009, SD-019, SD-023, SD-026.

Rows are dynamic API data, but filters, labels, empty states, hint text, drawer field labels, and table copy are hardcoded.

### Employee Performance

Violations: SD-003, SD-004, SD-005, SD-009, SD-021, SD-023.

Performance rows are dynamic, but sorting labels/options and help copy are hardcoded.

### Reports

Violations: SD-003, SD-004, SD-005, SD-020, SD-034.

Report rows/export data are dynamic, but report controls and PDF template strings are hardcoded.

### Mailboxes / Add Mailbox

Violations: SD-003, SD-004, SD-005, SD-011, SD-018, SD-023, SD-024, SD-031, SD-033.

Mailbox rows and connect flow are dynamic, but setup guidance, templates, form labels, OAuth callback pages, and action copy are hardcoded.

### Escalations

Violations: SD-003, SD-004, SD-005, SD-009, SD-035.

Escalation rows are dynamic, but empty state/table copy and notification templates are hardcoded.

### Audit Logs

Violations: SD-003, SD-004, SD-005, SD-009.

Audit log rows are dynamic, but surrounding labels/copy are hardcoded.

### Users & Roles

Violations: SD-003, SD-004, SD-005, SD-018, SD-023, SD-025.

User rows are dynamic, but user-management dialog copy, labels, hints, and password-policy text are hardcoded.

### Settings

Violations: SD-003, SD-004, SD-015, SD-022.

Settings data comes from DB/API, but editor labels, helper text, option labels, and default form values are hardcoded in React.

### Login / Shell / Tour

Violations: SD-001, SD-002, SD-006, SD-007, SD-008, SD-016, SD-017, SD-027, SD-028, SD-029, SD-030.

Login, branding, navigation, guide, accessibility labels, generated CSS text, and app metadata all contain static hardcoded strings.

## Required Remediation Plan

No fixes should be applied until this report is reviewed and approved.

Recommended dynamic sources:

1. `ui_copy` table/API for route titles, descriptions, empty states, buttons, labels, helper text, alerts, and accessibility text.
2. `ui_navigation` table/API for sidebar routes, descriptions, ordering, and role visibility.
3. `tour_steps` table/API for the guided tour.
4. `tenant_branding` table/API for product name, tagline, login hero copy, logo text, and generated CSS branding.
5. Endpoint metadata APIs for tables, filters, forms, sorting options, field labels, and action availability.
6. `notification_templates` table/API for escalation and daily summary emails.
7. `report_templates` table/API for PDF/Excel titles and formatting.
8. Deployment metadata/secret manager for app title/version/bootstrap values.

## Audit Result

Status: **FAILED ZERO-TOLERANCE STATIC DATA POLICY AT AUDIT TIME**

Remediation: see `STATIC_DATA_REMEDIATION.md`.

Reason: Multiple hardcoded user-rendered text/content blocks remain across every major frontend page plus backend-rendered HTML/PDF/email surfaces.

Remediation approval required before code changes.
