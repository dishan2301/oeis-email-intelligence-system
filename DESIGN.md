# OEIS Design System

## Product Direction

Office Email Intelligence System (OEIS) is an enterprise operations dashboard for monitoring unanswered Microsoft 365 customer emails, SLA breaches, escalations, and employee response performance.

The interface must feel trustworthy, operational, precise, and easy to scan. It should prioritize pending and critical communication over decorative analytics. OEIS is an automated monitoring product, not a ticketing system.

## Platform

- Responsive web application
- Desktop-first for daily manager workflows
- Fully usable on tablets and mobile devices
- Light theme by default
- Information-dense without appearing crowded

## Design Principles

1. **Status first:** Critical and overdue work must be visible immediately.
2. **Fast scanning:** Use concise labels, strong hierarchy, and tabular numerals.
3. **Operational context:** Always show mailbox scope, active filters, and synchronization freshness.
4. **Progressive detail:** Keep summaries visible while opening details in drawers or dialogs.
5. **Accessible meaning:** Never communicate state through color alone.
6. **Calm enterprise tone:** Use restrained decoration, shadows, and animation.

## Color Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `background` | `#F4F7F9` | Application background |
| `surface` | `#FFFFFF` | Cards, tables, drawers, dialogs |
| `primary` | `#17324D` | Navigation, headings, primary brand elements |
| `interactive` | `#2563EB` | Links, selected controls, focus and primary actions |
| `text-primary` | `#17212B` | Headings and body copy |
| `text-secondary` | `#667085` | Supporting text and metadata |
| `border` | `#DDE3E8` | Dividers, inputs, cards, and table borders |
| `sla-healthy` | `#16865C` | Pending 0-4 hours and resolved states |
| `sla-warning` | `#E58A17` | Pending 4-8 hours |
| `sla-overdue` | `#D14343` | Pending 8-24 hours |
| `sla-critical` | `#991B1B` | Pending more than 24 hours |

Use subtle tinted backgrounds derived from status colors for badges and alerts. Maintain WCAG AA contrast for text and controls.

## Typography

- Use a modern, highly legible sans-serif family suitable for enterprise data interfaces.
- Use tabular numerals for metrics, timestamps, durations, and table columns.
- Page title: 28-32px, semibold
- Section title: 18-20px, semibold
- Card label: 12-14px, medium
- KPI value: 28-36px, semibold
- Body and table text: 14-16px, regular
- Metadata: 12-13px, regular
- Use sentence case for headings, labels, and buttons.
- Avoid all-caps text except short status badges where necessary.

## Spacing And Shape

- Base spacing unit: 4px
- Standard page gap: 24px
- Compact component gap: 8px
- Card padding: 20-24px
- Card radius: 12px
- Button and input radius: 8px
- Badge radius: 999px
- Use thin borders and restrained shadows to separate surfaces.
- Keep dense tables readable with 48-56px row heights.

## Application Shell

### Desktop

- Fixed left navigation sidebar
- Top application bar
- Main content area with a consistent maximum readable width
- Navigation: Dashboard, Pending Emails, Employee Performance, Reports, Mailboxes, Escalations, Audit Logs, Settings
- Highlight the current section with the interactive blue and a clear left-edge indicator.

### Top Bar

Always provide:

- Current mailbox scope
- Last synchronization time
- Manual refresh action
- Notification access
- User profile and role

### Mobile

- Replace the sidebar with a navigation drawer.
- Keep critical status, search, filters, and refresh readily accessible.
- Prevent horizontal page overflow.

## Core Components

### KPI Cards

- Use a short label, prominent value, icon, and optional comparison.
- Keep all cards structurally consistent.
- Give Overdue and Critical cards stronger visual emphasis.
- Default metrics: Today's Emails, Pending Replies, Overdue, Critical, Average Reply Time, Resolved Today, Ignored Emails.

### Status Badges

- Combine color, text, and an icon or shape.
- Use the labels Healthy, Warning, Overdue, Critical, Replied, Pending, Ignored, Connected, Syncing, and Failed consistently.
- Do not rely on red/green color alone.

### Data Tables

- Use sticky headers for long datasets.
- Support sorting, pagination, column visibility, and row actions.
- Keep search and filters visually associated with the table.
- Show active filters as removable chips.
- Use subtle row emphasis for critical entries rather than full saturated backgrounds.
- On mobile, convert wide rows into expandable summary cards.

### Charts

- Use charts only when they improve comparison or trend recognition.
- Match SLA chart colors to the defined status tokens.
- Provide titles, legends, tooltips, accessible labels, and empty states.
- Avoid 3D charts, excessive grid lines, and decorative effects.

### Forms

- Place persistent labels above fields.
- Include helper and validation text where needed.
- Use visible focus rings.
- Provide explicit save, cancel, success, loading, error, and disabled states.
- Never display OAuth tokens or secrets in the interface.

### Drawers And Dialogs

- Use a right-side drawer for email details so dashboard context remains visible.
- Use dialogs for confirmation or short focused tasks.
- Place the primary action consistently at the lower right.
- Preserve filters and scroll position after closing overlays.

### Buttons

- Primary: solid interactive blue for the page's main action
- Secondary: white surface with border
- Tertiary: text or icon action for low-emphasis controls
- Destructive: critical red, used only for irreversible actions
- Provide hover, focus, active, loading, and disabled states.

## Page Patterns

### Dashboard

Use this hierarchy:

1. Page title, date range, mailbox selector, last-sync status, and Sync Now action
2. Mailbox health strip
3. KPI cards
4. SLA distribution and response trend charts
5. Pending email table
6. Escalations, employee performance, and daily summary panels
7. System health footer

### Pending Email Detail

Show sender, mailbox, subject, received time, pending duration, SLA state, employee, priority, conversation timeline, reply detection state, and audit history. Provide assignment, escalation, ignore, and Outlook actions.

### Reports

Use tabs for Daily, Weekly, Monthly, Employee-wise, Customer-wise, and Mailbox-wise views. Keep date, mailbox, employee, customer, and SLA filters consistent. Provide PDF and CSV export actions.

### Employee Performance

Show total replies, average reply time, pending, critical, and resolved metrics. Use neutral, supportive language and avoid punitive or gamified presentation.

### Admin Settings

Group settings into Mailboxes, SLA Rules, Authentication, Notifications, Roles, Classification, and Audit Logs. Show connection state without revealing secrets. Confirm consequential changes.

## Content Guidelines

- Use concise enterprise language.
- Display all dates and times consistently in Indian Standard Time.
- Format durations as `2h 18m` or `1d 4h`.
- Prefer clear labels over internal identifiers.
- Do not expose message IDs, tokens, API responses, or implementation details in manager views.
- Use realistic mailbox and customer examples rather than lorem ipsum.
- Write actionable errors that explain what happened and what the user can do next.

## Required UI States

Every applicable screen or component must define:

- Loading skeleton
- Empty state
- No search results
- Success confirmation
- Validation failure
- General error
- Microsoft Graph connection failure
- Authentication expired
- Partial mailbox synchronization
- Scheduled report failure
- Offline or stale-data indication

## Responsive Rules

- Desktop: multi-column dashboard with full data tables
- Tablet: two-column metrics and vertically stacked charts
- Mobile: single-column layout and expandable data cards
- Preserve the visual priority of Critical and Overdue metrics at every breakpoint.
- Keep touch targets at least 44px.
- Do not hide essential actions behind hover-only behavior.

## Accessibility

- Meet WCAG 2.1 AA contrast requirements.
- Support keyboard navigation throughout.
- Use semantic landmarks, headings, tables, and form controls.
- Provide visible focus indicators.
- Add accessible names to icon-only actions.
- Announce asynchronous synchronization and filter-result changes appropriately.
- Respect reduced-motion preferences.

## Motion

- Use a subtle staggered reveal when a dashboard first loads.
- Use lightweight transitions for filtering, refreshing, drawers, and dialogs.
- Keep motion between 150-250ms for routine interactions.
- Avoid decorative looping animation.

## Stitch Usage

Include this file's relevant sections under `DESIGN SYSTEM (REQUIRED)` in every Stitch prompt. Generate one primary screen or one targeted change at a time. Preserve these tokens and patterns across all generated screens unless a prompt explicitly changes the design system.
