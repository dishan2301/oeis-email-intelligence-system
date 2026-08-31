import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { motion, useReducedMotion } from "motion/react";
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Pagination,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  Assessment,
  Add,
  ArrowForward,
  Bolt,
  CheckCircleOutline,
  Close,
  ContentCopy,
  Dashboard,
  Delete,
  Email,
  ErrorOutline,
  Groups,
  History,
  HelpOutline,
  FlightRounded,
  LockOutlined,
  Logout,
  Mail,
  Menu as MenuIcon,
  OpenInNew,
  Search,
  Schedule,
  ShieldOutlined,
  Settings,
  Sync,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import GuidedTour from "./GuidedTour";
import type { TourStep } from "./GuidedTour";
import { useContent } from "./dynamicContent";
ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
);
const sections: { name: string; description: string; icon: ReactNode }[] = [
  { name: "Dashboard", description: "", icon: <Dashboard /> },
  { name: "Pending Emails", description: "", icon: <Email /> },
  { name: "Employee Performance", description: "", icon: <Groups /> },
  { name: "Reports", description: "", icon: <Assessment /> },
  { name: "Mailboxes", description: "", icon: <Mail /> },
  { name: "Escalations", description: "", icon: <Assessment /> },
  { name: "Audit Logs", description: "", icon: <History /> },
  { name: "Users & Roles", description: "", icon: <Groups /> },
  { name: "Settings", description: "", icon: <Settings /> },
];
const sectionMeta: Record<string, { eyebrow: string; description: string }> = {};
const emptyStateMeta: Record<string, { title: string; description: string }> = {};
const tourTargets: Record<string, string> = {
  "Pending Emails": "pending-nav",
  "Employee Performance": "performance-nav",
  Reports: "reports-nav",
  Mailboxes: "mailboxes-nav",
  Escalations: "escalations-nav",
  "Audit Logs": "audit-nav",
  "Users & Roles": "users-nav",
  Settings: "settings-nav",
};
const sectionContentKeys: Record<string, string> = {
  Dashboard: "dashboard",
  "Pending Emails": "pending",
  "Employee Performance": "performance",
  Reports: "reports",
  Mailboxes: "mailboxes",
  Escalations: "escalations",
  "Audit Logs": "audit",
  "Users & Roles": "users",
  Settings: "settings",
};
const tourStepKeys = [
  ["workspace", "workspace"],
  ["navigation", "navigation"],
  ["readiness", "readiness"],
  ["kpis", "kpis"],
  ["sync", "sync"],
  ["pending-nav", "pending"],
  ["performance-nav", "performance"],
  ["reports-nav", "reports"],
  ["mailboxes-nav", "mailboxes"],
  ["escalations-nav", "escalations"],
  ["audit-nav", "audit"],
  ["users-nav", "users"],
  ["settings-nav", "settings"],
  ["help", "help"],
] as const;
const initialQuery = new URLSearchParams(location.search);
function tokenRole(token: string) {
  try {
    const value = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(value)).role as "admin" | "manager";
  } catch {
    return "manager";
  }
}
function apiErrorMessage(detail: unknown, fallback: string) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          const field = Array.isArray((item as any).loc)
            ? (item as any).loc.slice(1).join(".")
            : "";
          return field
            ? `${field}: ${(item as any).msg}`
            : String((item as any).msg);
        }
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join("; ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return fallback;
}
function replyStatusLabel(value: unknown) {
  const status = String(value || "").toLowerCase();
  if (status === "pending") return "Not Replied";
  if (status === "replied") return "Replied";
  if (status === "ignored") return "Ignored";
  return String(value ?? "");
}
function formatMailboxDateTime(value: unknown, timeZone?: string) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone || "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
let refreshInFlight: Promise<string | null> | null = null;
function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", { method: "POST" })
      .then(async (response) => response.ok ? (await response.json()).access_token : null)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}
async function api(path: string, token: string, options: RequestInit = {}) {
  const request = (accessToken: string) =>
    fetch(`/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });
  let r = await request(token);
  if (r.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      window.dispatchEvent(
        new CustomEvent("oeis-token", { detail: refreshed }),
      );
      r = await request(refreshed);
    } else {
      window.dispatchEvent(new CustomEvent("oeis-token", { detail: "" }));
      throw new Error("Session expired. Sign in again.");
    }
  }
  if (!r.ok) {
    const contentType = r.headers.get("content-type") || "";
    const e = contentType.includes("application/json")
      ? await r.json().catch(() => ({}))
      : {};
    throw new Error(
      apiErrorMessage(e.detail,
        (contentType.includes("text/html")
          ? "Wrong OEIS server opened. Use the production dashboard URL."
          : `Request failed (${r.status})`),
      ),
    );
  }
  if (r.status === 204) return null;
  if (!(r.headers.get("content-type") || "").includes("application/json")) {
    throw new Error(
      "Wrong OEIS server opened. Redirecting to the production dashboard fixes this response.",
    );
  }
  return r.json();
}
function OeisLogo({ compact = false }: { compact?: boolean }) {
  const { text } = useContent();
  return (
    <Box
      className={`oeis-logo ${compact ? "compact" : ""}`}
      aria-label={text("brand.aria")}
    >
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <rect x="2" y="2" width="52" height="52" rx="17" fill="currentColor" />
        <circle
          cx="28"
          cy="28"
          r="16"
          fill="none"
          stroke="white"
          strokeWidth="4"
          opacity=".98"
        />
        <path
          d="M18 23.5 28 31l10-7.5M19 22h18v13H19z"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="43"
          cy="13"
          r="5"
          fill="#F2A93B"
          stroke="#fff"
          strokeWidth="2"
        />
      </svg>
      <Box>
        <b>{text("brand.name")}</b>
        <small>{text("brand.full_name")}</small>
      </Box>
    </Box>
  );
}
function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const { text } = useContent();
  const [email, setEmail] = useState("admin@oeis.local"),
    [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const reduced = useReducedMotion();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: email, password }),
      });
      if (!r.ok) {
        let message = "Login failed";
        try {
          const body = await r.json();
          if (body && typeof body.detail === "string" && body.detail.trim()) {
            message = body.detail;
          }
        } catch {}
        throw new Error(message);
      }
      const d = await r.json();
      onLogin(d.access_token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box className="prod-login login-shell">
      <motion.section
        className="login-story"
        aria-label={text("login.intro_aria")}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.45 }}
      >
        <OeisLogo />
        <Box className="login-story-copy">
          <Typography className="login-kicker">
            {text("login.kicker")}
          </Typography>
          <Typography component="h1">
            {text("login.headline.line1")}
            <br />
            <span>{text("login.headline.line2")}</span>
          </Typography>
          <Typography>{text("login.summary")}</Typography>
        </Box>
        <Box className="login-orbit" aria-hidden="true">
          <span className="orbit-ring ring-one" />
          <span className="orbit-ring ring-two" />
          <span className="orbit-ring ring-three" />
          <motion.div
            className="plane-orbit"
            animate={reduced ? {} : { rotate: 360 }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "linear" }}
          >
            <span className="plane">
              <FlightRounded />
            </span>
          </motion.div>
          <motion.div
            className="orbit-core"
            initial={{ scale: reduced ? 1 : 0.82, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              delay: reduced ? 0 : 0.65,
              duration: reduced ? 0 : 0.5,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <svg viewBox="0 0 56 56" aria-hidden="true">
              <circle
                cx="28"
                cy="28"
                r="19"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                d="M17 23 28 31l11-8M18 21h20v16H18z"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <b>{text("login.signal.title")}</b>
            <small>{text("login.signal.detail")}</small>
          </motion.div>
          <motion.div
            className="orbit-note note-one"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduced ? 0 : 1.2 }}
          >
            <b>{text("login.critical.value")}</b>
            <span>{text("login.critical.label")}</span>
          </motion.div>
          <motion.div
            className="orbit-note note-two"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduced ? 0 : 1.45 }}
          >
            <b>{text("login.time.value")}</b>
            <span>{text("login.time.label")}</span>
          </motion.div>
        </Box>
        <Box className="login-trust">
          <LockOutlined />
          <span>{text("login.trust.graph")}</span>
          <i />
          <span>{text("login.trust.password")}</span>
        </Box>
      </motion.section>
      <motion.section
        className="login-panel"
        aria-label={text("login.panel_aria")}
        initial={{ opacity: 0, x: reduced ? 0 : 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{
          delay: reduced ? 0 : 1.05,
          duration: reduced ? 0 : 0.55,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <Card className="login-card">
          <Box className="login-mobile-logo">
            <OeisLogo compact />
          </Box>
          <Box className="login-heading">
            <Typography className="date">{text("login.eyebrow")}</Typography>
            <Typography variant="h4" component="h2">
              {text("login.title")}
            </Typography>
            <Typography color="text.secondary">{text("login.description")}</Typography>
          </Box>
          <form onSubmit={submit}>
            <TextField
              label={text("login.email")}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              fullWidth
            />
            <TextField
              label={text("login.password")}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      edge="end"
                      aria-label={
                        showPassword ? text("login.hide_password") : text("login.show_password")
                      }
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              fullWidth
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button
              type="submit"
              variant="contained"
              color="info"
              disabled={busy}
              fullWidth
            >
              {busy ? (
                <>
                  <CircularProgress size={17} color="inherit" />
                  {text("login.signing_in")}
                </>
              ) : (
                text("login.submit")
              )}
            </Button>
          </form>
          <Box className="login-security">
            <LockOutlined />
            <Box>
              <b>{text("login.security.title")}</b>
              <span>{text("login.security.detail")}</span>
            </Box>
          </Box>
        </Card>
        <Typography className="login-footer">
          {text("login.footer")}
        </Typography>
      </motion.section>
    </Box>
  );
}
function DataTable({
  rows,
  onSelect,
  onDelete,
  onConnect,
  emptyTitle,
  emptyDescription,
}: {
  rows: any[];
  onSelect?: (row: any) => void;
  onDelete?: (row: any) => void;
  onConnect?: (row: any) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const { format, text } = useContent();
  if (!rows.length)
    return (
      <Box className="feature-empty compact">
        <Search />
        <b>{emptyTitle || text("empty.default.title")}</b>
        <span>{emptyDescription || text("empty.default.description")}</span>
      </Box>
    );
  const columns = Object.keys(rows[0]).filter(
    (column) => (column !== "id" || !("serial_number" in rows[0])) && column !== "mailbox_timezone",
  );
  return (
    <Box
      className="table-scroll"
      role="region"
      aria-label={text("table.region_aria")}
      tabIndex={0}
    >
      <table aria-label={text("table.aria")}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th scope="col" key={c}>
                {c
                  .replaceAll("_", " ")
                  .replace(/\b\w/g, (letter) => letter.toUpperCase())}
              </th>
            ))}
            {(onConnect || onDelete) && <th scope="col">{text("table.actions")}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id ?? i}
              onClick={() => onSelect?.(r)}
              onKeyDown={(event) => {
                if (onSelect && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelect(r);
                }
              }}
              tabIndex={onSelect ? 0 : undefined}
              className={onSelect ? "clickable-row" : ""}
            >
              {columns.map((c) => (
                <td key={c}>
                  {r[c] === null ? (
                    "—"
                  ) : typeof r[c] === "boolean" ? (
                    <Chip
                      size="small"
                      variant="outlined"
                      color={r[c] ? "success" : "default"}
                      label={r[c] ? text("status.active") : text("status.inactive")}
                    />
                  ) : typeof r[c] === "object" ? (
                    JSON.stringify(r[c])
                  ) : /(date|time|received|created)/i.test(c) &&
                    !Number.isNaN(Date.parse(String(r[c]))) ? (
                    formatMailboxDateTime(r[c], r.mailbox_timezone)
                  ) : /(status|priority|role|classification)/i.test(c) ? (
                    <Chip
                      className={`data-chip chip-${String(r[c]).toLowerCase().replaceAll(" ", "-")}`}
                      size="small"
                      variant="outlined"
                      label={/status/i.test(c) ? replyStatusLabel(r[c]) : String(r[c])}
                    />
                  ) : (
                    String(r[c])
                  )}
                </td>
              ))}
              {(onConnect || onDelete) && (
                <td>
                  <Stack direction="row" spacing={1}>
                    {onConnect && (
                      <Button
                        size="small"
                        startIcon={<OpenInNew />}
                        onClick={(event) => {
                          event.stopPropagation();
                          onConnect(r);
                        }}
                      >
                        {text(r.provider === "gmail" ? "table.connect_gmail" : "table.connect_outlook")}
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        color="error"
                        size="small"
                        startIcon={<Delete />}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(r);
                        }}
                      >
                        {text("table.remove")}
                      </Button>
                    )}
                  </Stack>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}
const kpiMeta: Record<string, { label: string; note: string }> = {};
type Readiness = {
  operational: boolean;
  integration_configured: boolean;
  graph_configured: boolean;
  gmail_configured: boolean;
  smtp_configured: boolean;
  configured_mailboxes: number;
  healthy_mailboxes: number;
  error_mailboxes: number;
  warning_mailboxes: number;
  paused_mailboxes: number;
  last_successful_sync: string | null;
};
type GraphSetup = {
  graph_configured: boolean;
  missing: string[];
  credential_status?: {
    tenant_id_saved: boolean;
    client_id_saved: boolean;
    client_secret_saved: boolean;
    runtime_loaded: boolean;
  };
  required_permission: string;
  portal_links: {
    app_registration: string;
    app_registrations: string;
    api_permissions: string;
    exchange_admin: string;
    admin_consent: string | null;
  };
  delegated_setup?: {
    redirect_uri: string;
    scopes: string;
    supported_accounts: string;
    oauth_configured?: boolean;
  };
  env_template: string;
  azure_cli_commands: string;
  exchange_policy_commands: string;
};
type GraphConfig = {
  azure_tenant_id: string;
  azure_client_id: string;
  azure_client_secret: string;
  graph_scope: string;
};
const GRAPH_APP_ONLY_SCOPE = "https://graph.microsoft.com/.default";
function parseGraphConfig(setup: GraphSetup | null): GraphConfig {
  const config: GraphConfig = {
    azure_tenant_id: "",
    azure_client_id: "",
    azure_client_secret: "",
    graph_scope: GRAPH_APP_ONLY_SCOPE,
  };
  for (const line of (setup?.env_template || "").split("\n")) {
    const [key, ...rest] = line.split("=");
    const value = rest.join("=");
    if (key === "AZURE_TENANT_ID") config.azure_tenant_id = value;
    if (key === "AZURE_CLIENT_ID") config.azure_client_id = value;
    if (key === "GRAPH_SCOPE") config.graph_scope = value || config.graph_scope;
  }
  return config;
}
type GmailSetup = {
  gmail_configured: boolean;
  missing: string[];
  required_permission: string;
  redirect_uri: string;
  scopes: string;
  portal_links: {
    project: string;
    api_library: string;
    consent_screen: string;
    credentials: string;
  };
  env_template: string;
};
function GraphSetupPipeline({
  setup,
  mailboxAddress,
  onCopy,
  onDownload,
  onTestGraph,
  testingGraph,
  onSaveCredentials,
  savingCredentials,
}: {
  setup: GraphSetup | null;
  mailboxAddress: string;
  onCopy: (value: string, label: string) => void;
  onDownload: (value: string, filename: string) => void;
  onTestGraph: () => void;
  testingGraph: boolean;
  onSaveCredentials: (value: GraphConfig) => Promise<void>;
  savingCredentials: boolean;
}) {
  const { format, text } = useContent();
  const [config, setConfig] = useState<GraphConfig>(() => parseGraphConfig(setup));
  useEffect(() => setConfig(parseGraphConfig(setup)), [setup]);
  if (!setup) {
    return (
      <Alert severity="info">
        {text("graph_ui.empty")}
      </Alert>
    );
  }
  const personalMailbox = /@(outlook\.com|hotmail\.com|live\.com|msn\.com)$/i.test(mailboxAddress.trim());
  const steps = [
    {
      title: text("graph_ui.step.register.title"),
      detail: text("graph_ui.step.register.detail"),
      href: setup.portal_links.app_registration,
      label: text("graph_ui.step.register.action"),
      done: !!setup.graph_configured,
    },
    {
      title: personalMailbox
        ? text("graph_ui.step.permission.personal.title")
        : text("graph_ui.step.permission.title"),
      detail: personalMailbox
        ? text("graph_ui.step.permission.personal.detail")
        : setup.required_permission,
      href: setup.portal_links.api_permissions,
      label: text("graph_ui.step.permission.action"),
      done: !!setup.graph_configured,
    },
    {
      title: personalMailbox
        ? text("graph_ui.step.redirect.title")
        : text("graph_ui.step.scope.title"),
      detail: personalMailbox
        ? text("graph_ui.step.redirect.detail")
        : mailboxAddress || text("graph_ui.step.scope.empty"),
      href: personalMailbox
        ? setup.portal_links.app_registration
        : setup.portal_links.exchange_admin,
      label: personalMailbox
        ? text("graph_ui.step.redirect.action")
        : text("graph_ui.step.scope.action"),
      done: false,
    },
  ];
  const openSetupTabs = () => {
    (personalMailbox
      ? [setup.portal_links.app_registration, setup.portal_links.api_permissions]
      : [
          setup.portal_links.app_registration,
          setup.portal_links.api_permissions,
          setup.portal_links.exchange_admin,
          setup.portal_links.admin_consent,
        ])
      .filter(Boolean)
      .forEach((href) => window.open(href!, "_blank", "noopener"));
  };
  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography fontWeight={800}>{text("graph_ui.title")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {setup.graph_configured
              ? personalMailbox
                ? text("graph_ui.personal_configured")
                : text("graph_ui.configured")
              : format("graph_ui.missing", { missing: setup.missing.join(", ") || text("graph_ui.none") })}
          </Typography>
        </Box>
        {setup.credential_status && (
          <Alert severity={setup.credential_status.runtime_loaded ? "success" : "error"}>
            Backend status: Tenant ID {setup.credential_status.tenant_id_saved ? "saved" : "missing"}; Client ID {setup.credential_status.client_id_saved ? "saved" : "missing"}; Client secret {setup.credential_status.client_secret_saved ? "saved" : "missing"}; runtime {setup.credential_status.runtime_loaded ? "loaded" : "not ready"}.
          </Alert>
        )}
        <Alert severity="info">
          {personalMailbox ? text("graph_ui.personal_info") : text("graph_ui.info")}
        </Alert>
        {setup.delegated_setup && (
          <Alert severity="warning">
            {format("graph_ui.delegated", {
              accounts: setup.delegated_setup.supported_accounts,
              redirect: setup.delegated_setup.redirect_uri,
              scopes: setup.delegated_setup.scopes,
            })}
          </Alert>
        )}
        <Button
          variant="contained"
          color="info"
          startIcon={<OpenInNew />}
          onClick={openSetupTabs}
        >
          {text("graph_ui.start")}
        </Button>
        {steps.map((step) => (
          <Box
            key={step.title}
            sx={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "center",
              gap: 1,
            }}
          >
            <Chip
              size="small"
              color={step.done ? "success" : "warning"}
              label={step.done ? text("graph_ui.ready") : text("graph_ui.action")}
            />
            <Box>
              <Typography fontWeight={700}>{step.title}</Typography>
              <Typography variant="caption" color="text.secondary">
                {step.detail}
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              startIcon={<OpenInNew />}
              onClick={() => window.open(step.href, "_blank", "noopener")}
            >
              {step.label}
            </Button>
          </Box>
        ))}
        {!personalMailbox && setup.portal_links.admin_consent && (
          <Button
            size="small"
            variant="contained"
            color="info"
            startIcon={<OpenInNew />}
            onClick={() =>
              window.open(
                setup.portal_links.admin_consent!,
                "_blank",
                "noopener",
              )
            }
          >
            {text("graph_ui.admin_consent")}
          </Button>
        )}
        <Box>
          <Typography fontWeight={700}>{text("graph_ui.save_title")}</Typography>
          <Stack spacing={1}>
            <Alert severity={setup.delegated_setup?.oauth_configured === false ? "error" : personalMailbox ? "info" : "warning"}>
              {setup.delegated_setup?.oauth_configured === false
                ? "Outlook Connect is not ready. Save the client secret Value from Entra App registration first."
                : personalMailbox
                  ? "This form saves credentials for delegated Outlook login. Add delegated Mail.Read and User.Read in Entra; OEIS requests offline_access automatically."
                  : "This form saves Microsoft Graph application credentials for organization mailbox sync."}
            </Alert>
            <TextField label={text("graph_ui.tenant")} value={config.azure_tenant_id} onChange={(event) => setConfig((current) => ({ ...current, azure_tenant_id: event.target.value }))} helperText={personalMailbox ? "Use the Directory (tenant) ID from your Entra app registration." : "Use your Microsoft Entra tenant ID for app-only setup. Do not use `common` or `consumers` here."} />
            <TextField label={text("graph_ui.client")} value={config.azure_client_id} onChange={(event) => setConfig((current) => ({ ...current, azure_client_id: event.target.value }))} helperText="Paste the Application (client) ID from the app registration overview." />
            <TextField label={text("graph_ui.secret")} type="password" value={config.azure_client_secret} onChange={(event) => setConfig((current) => ({ ...current, azure_client_secret: event.target.value }))} helperText="Required for Outlook web login. Leave blank only to keep an existing secret." />
            <TextField label={text("graph_ui.scope")} value={config.graph_scope} onChange={(event) => setConfig((current) => ({ ...current, graph_scope: event.target.value }))} helperText={personalMailbox ? `Keep ${GRAPH_APP_ONLY_SCOPE}; delegated login uses the scopes shown above.` : `Must be exactly ${GRAPH_APP_ONLY_SCOPE}`} />
            <Button variant="contained" disabled={savingCredentials || !config.azure_client_id} onClick={() => onSaveCredentials(config)}>
              {savingCredentials ? text("graph_ui.saving") : text("graph_ui.save")}
            </Button>
            {setup.graph_configured && !personalMailbox && (
              <Button
                variant="outlined"
                disabled={testingGraph || savingCredentials}
                onClick={onTestGraph}
              >
                {testingGraph ? text("graph_ui.testing") : text("graph_ui.test")}
              </Button>
            )}
          </Stack>
        </Box>
        {!personalMailbox && <Box>
          <Typography fontWeight={700}>{text("graph_ui.azure_title")}</Typography>
          <TextField
            value={setup.azure_cli_commands}
            multiline
            minRows={8}
            fullWidth
            InputProps={{ readOnly: true }}
          />
          <Button
            size="small"
            startIcon={<ContentCopy />}
            onClick={() =>
              onCopy(setup.azure_cli_commands, text("graph_ui.azure_copied"))
            }
          >
            {text("graph_ui.copy_azure")}
          </Button>
          <Button
            size="small"
            onClick={() =>
              onDownload(setup.azure_cli_commands, "oeis-graph-setup.sh")
            }
          >
            {text("graph_ui.download_script")}
          </Button>
        </Box>}
        <Box>
          <Typography fontWeight={700}>{text("graph_ui.env_title")}</Typography>
          <TextField
            value={setup.env_template}
            multiline
            minRows={4}
            fullWidth
            InputProps={{ readOnly: true }}
          />
          <Button
            size="small"
            startIcon={<ContentCopy />}
            onClick={() => onCopy(setup.env_template, text("graph_ui.env_copied"))}
          >
            {text("graph_ui.copy_env")}
          </Button>
          <Button
            size="small"
            onClick={() => onDownload(setup.env_template, "oeis.env")}
          >
            {text("graph_ui.download_env")}
          </Button>
        </Box>
        {!personalMailbox && <Box>
          <Typography fontWeight={700}>{text("graph_ui.exchange_title")}</Typography>
          <TextField
            value={setup.exchange_policy_commands}
            multiline
            minRows={6}
            fullWidth
            InputProps={{ readOnly: true }}
          />
          <Button
            size="small"
            startIcon={<ContentCopy />}
            onClick={() =>
              onCopy(
                setup.exchange_policy_commands,
                text("graph_ui.exchange_copied"),
              )
            }
          >
            {text("graph_ui.copy_powershell")}
          </Button>
          <Button
            size="small"
            onClick={() =>
              onDownload(
                setup.exchange_policy_commands,
                "oeis-mailbox-policy.ps1",
              )
            }
          >
            {text("graph_ui.download_powershell")}
          </Button>
        </Box>}
      </Stack>
    </Card>
  );
}
function GmailSetupPipeline({
  setup,
  onCopy,
  onDownload,
}: {
  setup: GmailSetup | null;
  onCopy: (value: string, label: string) => void;
  onDownload: (value: string, filename: string) => void;
}) {
  const { format, text } = useContent();
  if (!setup) return <Alert severity="info">{text("gmail_ui.empty")}</Alert>;
  const steps = [
    ["project", text("gmail_ui.step.project.title"), text("gmail_ui.step.project.detail"), text("gmail_ui.step.project.action")],
    ["api_library", text("gmail_ui.step.api.title"), setup.required_permission, text("gmail_ui.step.api.action")],
    ["consent_screen", text("gmail_ui.step.consent.title"), text("gmail_ui.step.consent.detail"), text("gmail_ui.step.consent.action")],
    ["credentials", text("gmail_ui.step.credentials.title"), format("gmail_ui.redirect", { redirect: setup.redirect_uri }), text("gmail_ui.step.credentials.action")],
  ] as const;
  const openSetupTabs = () => Object.values(setup.portal_links).forEach((href) => window.open(href, "_blank", "noopener"));
  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography fontWeight={800}>{text("gmail_ui.title")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {setup.gmail_configured ? text("gmail_ui.configured") : format("gmail_ui.missing", { missing: setup.missing.join(", ") })}
          </Typography>
        </Box>
        <Alert severity="info">{text("gmail_ui.info")}</Alert>
        <Alert severity="warning">
          {format("gmail_ui.required", { permission: setup.required_permission })}<br />
          {format("gmail_ui.redirect", { redirect: setup.redirect_uri })}<br />
          {format("gmail_ui.scopes", { scopes: setup.scopes })}
        </Alert>
        <Button variant="contained" color="info" startIcon={<OpenInNew />} onClick={openSetupTabs}>
          {text("gmail_ui.start")}
        </Button>
        {steps.map(([link, title, detail, label]) => (
          <Box key={link} sx={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 1 }}>
            <Chip size="small" color={setup.gmail_configured ? "success" : "warning"} label={setup.gmail_configured ? text("gmail_ui.ready") : text("gmail_ui.action")} />
            <Box><Typography fontWeight={700}>{title}</Typography><Typography variant="caption" color="text.secondary">{detail}</Typography></Box>
            <Button size="small" variant="outlined" startIcon={<OpenInNew />} onClick={() => window.open(setup.portal_links[link], "_blank", "noopener")}>{label}</Button>
          </Box>
        ))}
        <Box>
          <Typography fontWeight={700}>{text("gmail_ui.save_title")}</Typography>
          <Alert severity="info">Provider credentials must be injected through deployment secret management. OEIS never accepts or stores them from this page.</Alert>
        </Box>
        <Box>
          <Typography fontWeight={700}>{text("gmail_ui.env_title")}</Typography>
          <TextField value={setup.env_template} multiline minRows={4} fullWidth InputProps={{ readOnly: true }} />
          <Button size="small" startIcon={<ContentCopy />} onClick={() => onCopy(setup.env_template, text("gmail_ui.env_copied"))}>{text("gmail_ui.copy_env")}</Button>
          <Button size="small" onClick={() => onDownload(setup.env_template, "oeis-gmail.env")}>{text("gmail_ui.download_env")}</Button>
        </Box>
      </Stack>
    </Card>
  );
}
function ProductionDashboard({
  data,
  readiness,
  onNavigate,
  onSync,
  canSync,
}: {
  data: Record<string, number>;
  readiness: Readiness | null;
  onNavigate: (section: string) => void;
  onSync: () => void;
  canSync: boolean;
}) {
  const { format, text } = useContent();
  const pending = Number(data.pending_replies || 0),
    overdue = Number(data.overdue || 0),
    critical = Number(data.critical || 0),
    resolved = Number(data.resolved_today || 0);
  const hasData = Object.values(data).some((value) => Number(value) > 0);
  const integration = !readiness
    ? {
        message: text("dashboard.integration.checking.message"),
        label: text("dashboard.integration.checking.label"),
        color: "info" as const,
      }
    : !readiness.integration_configured
      ? {
          message: text("dashboard.integration.graph_missing.message"),
          label: text("dashboard.integration.graph_missing.label"),
          color: "warning" as const,
        }
      : readiness.configured_mailboxes === 0
        ? {
            message: text("dashboard.integration.mailbox_missing.message"),
            label: text("dashboard.integration.mailbox_missing.label"),
            color: "warning" as const,
          }
        : readiness.error_mailboxes > 0
          ? {
              message:
                text("dashboard.integration.sync_failed.message"),
              label: format("dashboard.mailbox_error", { count: readiness.error_mailboxes }),
              color: "error" as const,
            }
          : readiness.warning_mailboxes > 0
            ? {
                message: "Mailbox sync temporarily unavailable - last good dashboard data still shown",
                label: `${readiness.warning_mailboxes} mailbox warning`,
                color: "warning" as const,
              }
          : !readiness.last_successful_sync
            ? {
                message:
                  text("dashboard.integration.first_sync.message"),
                label: text("dashboard.integration.first_sync.label"),
                color: "warning" as const,
              }
            : critical > 0
              ? {
                  message: text("dashboard.integration.critical.message"),
                  label: format("dashboard.critical_count", { count: critical }),
                  color: "error" as const,
                }
              : overdue > 0
                ? {
                    message: text("dashboard.integration.overdue.message"),
                    label: format("dashboard.overdue_count", { count: overdue }),
                    color: "warning" as const,
                  }
                : {
                    message: text("dashboard.integration.healthy.message"),
                    label: text("dashboard.integration.healthy.label"),
                    color: "success" as const,
                  };
  const activation = [
    {
      label: "Mail integrations",
      detail: readiness?.integration_configured
        ? "Credentials detected"
        : "Configuration required",
      complete: !!readiness?.integration_configured,
      error: false,
    },
    {
      label: "Mailbox scope",
      detail: readiness?.configured_mailboxes
        ? `${readiness.configured_mailboxes} mailbox configured`
        : "Add an organizational mailbox",
      complete: !!readiness?.configured_mailboxes,
      error: false,
    },
    {
      label: "Verified synchronization",
      detail: readiness?.last_successful_sync
        ? new Date(readiness.last_successful_sync).toLocaleString()
        : readiness?.error_mailboxes
          ? "Latest attempt failed"
          : readiness?.warning_mailboxes
            ? "Latest attempt had temporary network issue"
          : "Waiting for first run",
      complete: !!readiness?.last_successful_sync,
      error: !!readiness?.error_mailboxes,
    },
    {
      label: "Email notifications",
      detail: readiness?.smtp_configured
        ? "SMTP delivery configured"
        : "SMTP configuration pending",
      complete: !!readiness?.smtp_configured,
      error: false,
    },
  ];
  const completed = activation.filter((item) => item.complete).length;
  return (
    <Box className="dashboard-stage" aria-label={text("dashboard.live_aria")}>
      <Box
        className={`executive-strip readiness-${integration.color}`}
        data-tour="readiness"
      >
        <Box className="posture-copy">
          <span>{text("dashboard.posture")}</span>
          <b>{integration.message}</b>
          {readiness?.last_successful_sync && (
            <small>
              {format("dashboard.last_success", { time: new Date(readiness.last_successful_sync).toLocaleString() })}
            </small>
          )}
        </Box>
        <Box className="posture-status">
          <small>
            {format("dashboard.as_of", { time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }) })}
          </small>
          <Chip color={integration.color} label={integration.label} />
        </Box>
      </Box>
      <Card className="metric-ledger" data-tour="kpis">
        {Object.entries(data).map(([key, value], index) => (
          <Box className={`metric-cell metric-${index}`} key={key}>
            <Box>
              <span>{text(`kpi.${key}.label`, kpiMeta[key]?.label || key.replaceAll("_", " "))}</span>
              <i />
            </Box>
            <strong>
              {key === "average_reply_hours"
                ? `${Number(value).toFixed(1)}h`
                : String(value)}
            </strong>
            <small>{text(`kpi.${key}.note`, kpiMeta[key]?.note || text("dashboard.metric_fallback"))}</small>
          </Box>
        ))}
      </Card>
      {hasData ? (
        <Box className="charts executive-charts live-charts">
          <Card>
            <Box className="card-head">
              <Box>
                <Typography className="section-index">{text("dashboard.chart_sla_index")}</Typography>
                <Typography variant="h6">{text("dashboard.chart_sla_title")}</Typography>
                <Typography color="text.secondary">
                  {text("dashboard.chart_sla_description")}
                </Typography>
              </Box>
            </Box>
            <Box className="line">
              <Bar
                aria-label={text("dashboard.chart_sla_aria")}
                data={{
                  labels: [text("performance.pending"), text("filter.overdue"), text("performance.critical"), text("performance.resolved")],
                  datasets: [
                    {
                      label: text("dashboard.emails"),
                      data: [pending, overdue, critical, resolved],
                      backgroundColor: [
                        "#3B82F6",
                        "#F59E0B",
                        "#DC2626",
                        "#10B981",
                      ],
                      borderRadius: 3,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: { precision: 0 },
                      grid: { color: "#E8EEF5" },
                    },
                    x: { grid: { display: false } },
                  },
                }}
              />
            </Box>
          </Card>
          <Card>
            <Box className="card-head">
              <Box>
                <Typography className="section-index">
                  {text("dashboard.chart_attention_index")}
                </Typography>
                <Typography variant="h6">{text("dashboard.chart_attention_title")}</Typography>
                <Typography color="text.secondary">
                  {text("dashboard.chart_attention_description")}
                </Typography>
              </Box>
            </Box>
            <Box className="donut">
              <Doughnut
                aria-label={text("dashboard.chart_attention_aria")}
                data={{
                  labels: [text("dashboard.within_sla"), text("filter.overdue"), text("filter.critical")],
                  datasets: [
                    {
                      data: [
                        Math.max(0, pending - overdue - critical),
                        overdue,
                        critical,
                      ],
                      backgroundColor: ["#2563EB", "#F59E0B", "#DC2626"],
                      borderWidth: 0,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: "72%",
                  plugins: { legend: { position: "bottom" } },
                }}
              />
            </Box>
          </Card>
        </Box>
      ) : (
        <Box className="activation-layout">
          <Card className="activation-brief">
            <Box className="brief-head">
              <Box>
                <Typography className="section-index">
                  01 / ACTIVATION
                </Typography>
                <Typography variant="h5">Make the intelligence live</Typography>
                <Typography>
                  OEIS is installed. Complete the operational chain below before
                  using the metrics for management decisions.
                </Typography>
              </Box>
              <Box className="activation-score">
                <strong>{completed}/4</strong>
                <span>systems ready</span>
              </Box>
            </Box>
            <LinearProgress
              variant="determinate"
              value={(completed / 4) * 100}
            />
            <Box className="activation-list">
              {activation.map((item, index) => (
                <Box
                  className={`activation-row ${item.complete ? "complete" : item.error ? "blocked" : "waiting"}`}
                  key={item.label}
                >
                  <span className="step-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Box>
                    {item.complete ? (
                      <CheckCircleOutline />
                    ) : item.error ? (
                      <ErrorOutline />
                    ) : (
                      <Schedule />
                    )}
                  </Box>
                  <Box>
                    <b>{item.label}</b>
                    <small>{item.detail}</small>
                  </Box>
                  <span>
                    {item.complete
                      ? "Ready"
                      : item.error
                        ? "Blocked"
                        : "Pending"}
                  </span>
                </Box>
              ))}
            </Box>
            <Box className="brief-actions">
              <Button
                variant="contained"
                endIcon={<ArrowForward />}
                onClick={() => onNavigate(canSync ? "Mailboxes" : "Audit Logs")}
              >
                {canSync ? "Review mailbox" : "Review audit log"}
              </Button>
              {canSync && (
                <Button onClick={onSync}>Retry synchronization</Button>
              )}
            </Box>
          </Card>
          <Card className="automation-brief">
            <Box className="automation-mark">
              <Bolt />
            </Box>
            <Typography className="section-index">02 / AUTOMATION</Typography>
            <Typography variant="h5">What starts after sync</Typography>
            <Typography>
              Four independent controls begin working without support-team
              input.
            </Typography>
            <Box className="automation-list">
              <Box>
                <ShieldOutlined />
                <span>
                  <b>Classification</b>
                  <small>Customer mail is separated from noise</small>
                </span>
              </Box>
              <Box>
                <CheckCircleOutline />
                <span>
                  <b>Reply matching</b>
                  <small>Headers close the correct incoming email</small>
                </span>
              </Box>
              <Box>
                <Schedule />
                <span>
                  <b>Business SLA clock</b>
                  <small>Time zones, weekends and holidays applied</small>
                </span>
              </Box>
              <Box>
                <ErrorOutline />
                <span>
                  <b>Escalation</b>
                  <small>Manager and Director notified once</small>
                </span>
              </Box>
            </Box>
          </Card>
        </Box>
      )}
    </Box>
  );
}
function ReferenceDashboard({
  data,
  readiness,
  onNavigate,
  onSync,
  canSync,
}: {
  data: Record<string, number>;
  readiness: Readiness | null;
  onNavigate: (section: string) => void;
  onSync: () => void;
  canSync: boolean;
}) {
  const { format, text } = useContent();
  const pending = Number(data.pending_replies || 0);
  const overdue = Number(data.overdue || 0);
  const critical = Number(data.critical || 0);
  const resolved = Number(data.resolved_today || 0);
  const integration = !readiness
    ? { message: text("dashboard.integration.checking.message"), label: text("dashboard.integration.checking.label"), color: "info" as const }
    : !readiness.integration_configured
      ? { message: text("dashboard.integration.graph_missing.message"), label: text("dashboard.integration.graph_missing.label"), color: "warning" as const }
      : readiness.configured_mailboxes === 0
        ? { message: text("dashboard.integration.mailbox_missing.message"), label: text("dashboard.integration.mailbox_missing.label"), color: "warning" as const }
        : readiness.error_mailboxes > 0
          ? { message: text("dashboard.integration.sync_failed.message"), label: format("dashboard.mailbox_error", { count: readiness.error_mailboxes }), color: "error" as const }
          : readiness.warning_mailboxes > 0
            ? { message: "Mailbox sync temporarily unavailable - last good dashboard data still shown", label: `${readiness.warning_mailboxes} mailbox warning`, color: "warning" as const }
          : !readiness.last_successful_sync
            ? { message: text("dashboard.integration.first_sync.message"), label: text("dashboard.integration.first_sync.label"), color: "warning" as const }
            : critical > 0
              ? { message: text("dashboard.integration.critical.message"), label: format("dashboard.critical_count", { count: critical }), color: "error" as const }
              : overdue > 0
                ? { message: text("dashboard.integration.overdue.message"), label: format("dashboard.overdue_count", { count: overdue }), color: "warning" as const }
                : { message: text("dashboard.integration.healthy.message"), label: text("dashboard.integration.healthy.label"), color: "success" as const };
  const activation = [
    { label: "Mail integrations", detail: readiness?.integration_configured ? "Credentials detected" : "Configuration required", complete: !!readiness?.integration_configured, error: false },
    { label: "Mailbox scope", detail: readiness?.configured_mailboxes ? `${readiness.configured_mailboxes} mailbox configured` : "Add an organizational mailbox", complete: !!readiness?.configured_mailboxes, error: false },
    { label: "Verified synchronization", detail: readiness?.last_successful_sync ? new Date(readiness.last_successful_sync).toLocaleString() : readiness?.error_mailboxes ? "Latest attempt failed" : readiness?.warning_mailboxes ? "Latest attempt had temporary network issue" : "Waiting for first run", complete: !!readiness?.last_successful_sync, error: !!readiness?.error_mailboxes },
    { label: "Email notifications", detail: readiness?.smtp_configured ? "SMTP delivery configured" : "SMTP configuration pending", complete: !!readiness?.smtp_configured, error: false },
  ];
  const completed = activation.filter((item) => item.complete).length;
  const metrics = [
    { key: "today", label: text("kpi.today_emails.label"), value: Number(data.today_emails || 0), note: text("kpi.today_emails.note"), hero: true },
    { key: "pending", label: text("kpi.pending_replies.label"), value: pending, note: text("kpi.pending_replies.note") },
    { key: "overdue", label: text("kpi.overdue.label"), value: overdue, note: text("kpi.overdue.note") },
    { key: "critical", label: text("kpi.critical.label"), value: critical, note: text("kpi.critical.note") },
  ];
  const analytics = [Number(data.today_emails || 0), pending, overdue, critical, Number(data.average_reply_hours || 0), resolved, Number(data.ignored_emails || 0)];
  const maxAnalytics = Math.max(1, ...analytics);
  const attention = [
    { label: "Critical conversations", value: critical, tone: "critical" },
    { label: "Overdue replies", value: overdue, tone: "overdue" },
    { label: "Pending ownership", value: pending, tone: "pending" },
    { label: "Resolved today", value: resolved, tone: "resolved" },
  ];
  return (
    <Box className="reference-dashboard" aria-label={text("dashboard.live_aria")}>
      <Box className={`reference-posture posture-${integration.color}`} data-tour="readiness">
        <Box><span>{text("dashboard.live_posture")}</span><b>{integration.message}</b></Box>
        <Chip color={integration.color} label={integration.label} />
      </Box>
      <Box className="reference-kpis" data-tour="kpis">
        {metrics.map((metric, index) => (
          <Card className={`reference-kpi ${metric.hero ? "hero-metric" : ""}`} key={metric.key}>
            <Box className="reference-kpi-head"><span>{metric.label}</span><button aria-label={`Open ${metric.label}`} onClick={() => onNavigate(index ? "Pending Emails" : "Reports")}><ArrowForward /></button></Box>
            <strong>{metric.value}</strong><small><CheckCircleOutline />{metric.note}</small>
          </Card>
        ))}
      </Box>
      <Box className="reference-bento">
        <Card className="reference-analytics">
          <Box className="reference-card-head"><Box><span>{text("dashboard.analytics")}</span><b>{text("dashboard.analytics_title")}</b></Box><small>{text("dashboard.live_repository")}</small></Box>
          <Box className="reference-bars" aria-label={text("dashboard.analytics_aria")}>
            {analytics.map((value, index) => <Box className={`reference-bar bar-${index}`} key={index}><i style={{ height: `${Math.max(22, (value / maxAnalytics) * 100)}%` }} /><small>{["IN", "P", "O", "C", "AVG", "R", "IGN"][index]}</small><em>{index === 4 ? `${value.toFixed(1)}h` : value}</em></Box>)}
          </Box>
        </Card>
        <Card className="reference-reminder">
          <Box className="reference-card-head"><Box><span>{text("dashboard.next_move")}</span><b>{critical ? text("dashboard.resolve_critical") : overdue ? text("dashboard.clear_overdue") : text("dashboard.verify_flow")}</b></Box></Box>
          <p>{critical ? format("dashboard.critical_sentence", { count: critical }) : overdue ? format("dashboard.overdue_sentence", { count: overdue }) : text("dashboard.verify_sentence")}</p>
          <Button variant="contained" startIcon={<Bolt />} onClick={() => onNavigate(critical || overdue ? "Pending Emails" : canSync ? "Mailboxes" : "Audit Logs")}>{critical || overdue ? text("dashboard.open_queue") : text("dashboard.review_setup")}</Button>
        </Card>
        <Card className="reference-attention">
          <Box className="reference-card-head"><Box><span>{text("dashboard.attention_queue")}</span><b>{text("dashboard.needs_decision")}</b></Box><Button size="small" onClick={() => onNavigate("Pending Emails")}>{text("dashboard.view_all")}</Button></Box>
          <Box className="reference-attention-list">{attention.map((item, index) => <Box key={item.label}><i className={item.tone}>{index + 1}</i><Box><b>{item.label}</b><small>{item.value === 0 ? text("dashboard.no_current_items") : format("dashboard.active_items", { count: item.value, suffix: item.value === 1 ? "" : "s" })}</small></Box><strong>{item.value}</strong></Box>)}</Box>
        </Card>
        <Card className="reference-activation">
          <Box className="reference-card-head"><Box><span>{text("dashboard.control_chain")}</span><b>{text("dashboard.operational_readiness")}</b></Box><small>{format("dashboard.ready_count", { count: completed })}</small></Box>
          <Box className="reference-activation-list">{activation.map((item, index) => <Box key={item.label}><i>{String(index + 1).padStart(2, "0")}</i><Box className={item.complete ? "ready" : item.error ? "blocked" : "waiting"}>{item.complete ? <CheckCircleOutline /> : item.error ? <ErrorOutline /> : <Schedule />}</Box><Box><b>{item.label}</b><small>{item.detail}</small></Box><em>{item.complete ? text("dashboard.ready") : item.error ? text("dashboard.blocked") : text("dashboard.pending")}</em></Box>)}</Box>
        </Card>
        <Card className="reference-progress">
          <Box className="reference-card-head"><Box><span>{text("dashboard.system_progress")}</span><b>{text("dashboard.intelligence_online")}</b></Box></Box>
          <Box className="reference-gauge" style={{ "--progress": `${(completed / 4) * 180}deg` } as React.CSSProperties}><Box><strong>{Math.round((completed / 4) * 100)}%</strong><small>{text("dashboard.controls_ready")}</small></Box></Box>
          <Box className="reference-legend"><span><i />{text("dashboard.ready")}</span><span><i />{text("dashboard.pending")}</span><span><i />{text("dashboard.blocked")}</span></Box>
        </Card>
        <Card className="reference-sync">
          <Box className="sync-rings" aria-hidden="true" />
          <Box className="reference-card-head"><Box><span>{text("dashboard.mailbox_pulse")}</span><b>{readiness?.last_successful_sync ? text("dashboard.last_verified_sync") : text("dashboard.awaiting_verified_sync")}</b></Box></Box>
          <strong>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
          <small>{readiness?.last_successful_sync ? new Date(readiness.last_successful_sync).toLocaleString() : text("shell.delta_interval")}</small>
          {canSync ? <Button data-tour="sync" onClick={onSync} startIcon={<Sync />}>{text("top.sync_now")}</Button> : <Button onClick={() => onNavigate("Audit Logs")}>{text("dashboard.view_evidence")}</Button>}
        </Card>
      </Box>
    </Box>
  );
}

const classifications = [
  "Ignore",
  "Auto Reply",
  "Newsletter",
  "Marketing",
  "Spam",
  "OTP",
  "NoReply",
  "LinkedIn",
  "Amazon",
  "Microsoft Notifications",
  "Google Alerts",
  "Customer",
];
function SettingsEditor({
  kind,
  json,
  onChange,
  onSave,
}: {
  kind: string;
  json: string;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const { format, text } = useContent();
  let rows: any[] = [];
  try {
    const parsed = JSON.parse(json);
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    return (
      <Box className="settings-workspace">
        <Alert severity="error">
          {text("settings.invalid")}
        </Alert>
      </Box>
    );
  }
  const update = (index: number, key: string, value: unknown) => {
    const next = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [key]: value } : row,
    );
    onChange(JSON.stringify(next, null, 2));
  };
  const remove = (index: number) =>
    onChange(
      JSON.stringify(
        rows.filter((_, rowIndex) => rowIndex !== index),
        null,
        2,
      ),
    );
  const add = () => {
    const row =
      kind === "classification-rules"
        ? {
            name: "New rule",
            priority: (rows.length + 1) * 10,
            field: "subject",
            pattern: "",
            classification: "Customer",
            active: true,
          }
        : {
            mailbox_id: null,
            timezone: "Asia/Kolkata",
            workday_start: "09:00",
            workday_end: "18:00",
            weekdays: [0, 1, 2, 3, 4],
            holidays: [],
          };
    onChange(JSON.stringify([...rows, row], null, 2));
  };
  return (
    <Box className="settings-workspace">
      <Box className="settings-intro">
        <Box>
          <Typography variant="h6">
            {kind === "sla-rules"
              ? text("settings.sla.title")
              : kind === "classification-rules"
                ? text("settings.classification.title")
                : text("settings.calendars.title")}
          </Typography>
          <Typography color="text.secondary">
            {kind === "sla-rules"
              ? text("settings.sla.description")
              : kind === "classification-rules"
                ? text("settings.classification.description")
                : text("settings.calendars.description")}
          </Typography>
        </Box>
        {kind !== "sla-rules" && (
          <Button startIcon={<Add />} onClick={add}>
            {kind === "classification-rules" ? text("settings.add_rule") : text("settings.add_calendar")}
          </Button>
        )}
      </Box>
      <Stack spacing={1.5}>
        {rows.map((row, index) => (
          <Card className="setting-panel" key={row.id || `${kind}-${index}`}>
            {kind === "sla-rules" ? (
              <>
                <Box className="setting-panel-head">
                  <Chip
                    label={String(row.tier).toUpperCase()}
                    color={
                      row.tier === "critical"
                        ? "error"
                        : row.tier === "overdue"
                          ? "warning"
                          : "info"
                    }
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={!!row.business_hours_only}
                        onChange={(event) =>
                          update(
                            index,
                            "business_hours_only",
                            event.target.checked,
                          )
                        }
                      />
                    }
                    label={text("settings.business_hours")}
                  />
                </Box>
                <Box className="setting-grid">
                  <TextField
                    type="number"
                    label={text("settings.threshold")}
                    value={row.threshold_hours}
                    onChange={(event) =>
                      update(
                        index,
                        "threshold_hours",
                        Number(event.target.value),
                      )
                    }
                  />
                  <TextField
                    type="number"
                    label={text("settings.notify_manager")}
                    value={row.notify_manager_at_hours ?? ""}
                    onChange={(event) =>
                      update(
                        index,
                        "notify_manager_at_hours",
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                      )
                    }
                  />
                  <TextField
                    type="number"
                    label={text("settings.notify_director")}
                    value={row.notify_director_at_hours ?? ""}
                    onChange={(event) =>
                      update(
                        index,
                        "notify_director_at_hours",
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                      )
                    }
                  />
                </Box>
              </>
            ) : kind === "classification-rules" ? (
              <>
                <Box className="setting-panel-head">
                  <Typography fontWeight={700}>{format("settings.rule_title", { number: index + 1 })}</Typography>
                  <Box>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={!!row.active}
                          onChange={(event) =>
                            update(index, "active", event.target.checked)
                          }
                        />
                      }
                      label="Active"
                    />
                    <IconButton
                      aria-label={format("settings.delete_rule", { number: index + 1 })}
                      onClick={() => remove(index)}
                    >
                      <Close />
                    </IconButton>
                  </Box>
                </Box>
                <Box className="setting-grid classification-grid">
                  <TextField
                    label={text("settings.rule_name")}
                    value={row.name || ""}
                    onChange={(event) =>
                      update(index, "name", event.target.value)
                    }
                  />
                  <TextField
                    type="number"
                    label={text("settings.priority")}
                    value={row.priority}
                    onChange={(event) =>
                      update(index, "priority", Number(event.target.value))
                    }
                  />
                  <TextField
                    select
                    label={text("settings.match_field")}
                    value={row.field}
                    onChange={(event) =>
                      update(index, "field", event.target.value)
                    }
                  >
                    <MenuItem value="sender">{text("settings.sender")}</MenuItem>
                    <MenuItem value="domain">{text("settings.domain")}</MenuItem>
                    <MenuItem value="subject">{text("settings.subject")}</MenuItem>
                  </TextField>
                  <TextField
                    select
                    label={text("settings.classification")}
                    value={row.classification}
                    onChange={(event) =>
                      update(index, "classification", event.target.value)
                    }
                  >
                    {classifications.map((value) => (
                      <MenuItem value={value} key={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    className="pattern-field"
                    label={text("settings.regex")}
                    value={row.pattern || ""}
                    onChange={(event) =>
                      update(index, "pattern", event.target.value)
                    }
                    helperText={text("settings.regex_help")}
                  />
                </Box>
              </>
            ) : (
              <>
                <Box className="setting-panel-head">
                  <Typography fontWeight={700}>
                    {row.mailbox_id
                      ? format("settings.mailbox_calendar", { id: row.mailbox_id })
                      : text("settings.organization_default")}
                  </Typography>
                  <IconButton
                    aria-label={format("settings.delete_calendar", { number: index + 1 })}
                    onClick={() => remove(index)}
                  >
                    <Close />
                  </IconButton>
                </Box>
                <Box className="setting-grid">
                  <TextField
                    label={text("settings.timezone")}
                    value={row.timezone || ""}
                    onChange={(event) =>
                      update(index, "timezone", event.target.value)
                    }
                  />
                  <TextField
                    type="time"
                    label={text("settings.workday_start")}
                    InputLabelProps={{ shrink: true }}
                    value={row.workday_start || "09:00"}
                    onChange={(event) =>
                      update(index, "workday_start", event.target.value)
                    }
                  />
                  <TextField
                    type="time"
                    label={text("settings.workday_end")}
                    InputLabelProps={{ shrink: true }}
                    value={row.workday_end || "18:00"}
                    onChange={(event) =>
                      update(index, "workday_end", event.target.value)
                    }
                  />
                  <TextField
                    label={text("settings.weekdays")}
                    value={(row.weekdays || []).join(", ")}
                    onChange={(event) =>
                      update(
                        index,
                        "weekdays",
                        event.target.value
                          .split(",")
                          .map((value) => Number(value.trim()))
                          .filter(Number.isFinite),
                      )
                    }
                  />
                  <TextField
                    label={text("settings.holidays")}
                    value={(row.holidays || []).join(", ")}
                    onChange={(event) =>
                      update(
                        index,
                        "holidays",
                        event.target.value
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                </Box>
              </>
            )}
          </Card>
        ))}
      </Stack>
      <Box className="settings-actions">
        <Button variant="contained" onClick={onSave}>
          {text("settings.save")}
        </Button>
        <Typography variant="caption" color="text.secondary">
          {text("settings.validation_note")}
        </Typography>
      </Box>
    </Box>
  );
}
type SyncSettings = {
  interval_seconds: number;
  scheduler_enabled: boolean;
  next_sync: string | null;
};
function SyncSettingsPanel({
  settings,
  onChange,
  onSave,
  onSync,
  saving,
  syncing,
}: {
  settings: SyncSettings;
  onChange: (value: SyncSettings) => void;
  onSave: () => void;
  onSync: () => void;
  saving: boolean;
  syncing: boolean;
}) {
  const { format, text } = useContent();
  return (
    <Box className="settings-workspace">
      <Box className="settings-intro">
        <Box>
          <Typography variant="h6">{text("settings.sync.title")}</Typography>
          <Typography color="text.secondary">{text("settings.sync.description")}</Typography>
        </Box>
      </Box>
      <Card className="setting-panel">
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Switch
                checked={settings.scheduler_enabled}
                onChange={(event) => onChange({ ...settings, scheduler_enabled: event.target.checked })}
              />
            }
            label={text("settings.sync.enabled")}
          />
          <Alert severity="info">Minimum automatic sync interval: 10 seconds.</Alert>
          <TextField
            type="number"
            label={text("settings.sync.interval")}
            value={settings.interval_seconds}
            error={settings.interval_seconds < 10}
            inputProps={{ min: 10, max: 86400, step: 1 }}
            onChange={(event) => onChange({ ...settings, interval_seconds: Number(event.target.value) || 10 })}
            helperText={settings.interval_seconds < 10 ? "Enter 10 seconds or more." : text("settings.sync.helper")}
          />
          <Typography variant="caption" color="text.secondary">
            {settings.next_sync
              ? format("settings.sync.next", { time: new Date(settings.next_sync).toLocaleString() })
              : "Automatic sync is paused."}
          </Typography>
          <Box className="settings-actions">
            <Button variant="contained" disabled={saving || settings.interval_seconds < 10} onClick={onSave}>
              {saving ? "Saving..." : text("settings.sync.save")}
            </Button>
            <Button variant="outlined" disabled={syncing} onClick={onSync} startIcon={<Sync />}>
              {syncing ? text("top.syncing") : text("settings.sync.manual")}
            </Button>
          </Box>
        </Stack>
      </Card>
    </Box>
  );
}
export default function ProductionApp() {
  const { format, text } = useContent();
  const [token, setToken] = useState(""),
    [authChecking, setAuthChecking] = useState(true),
    [section, setSection] = useState(
      initialQuery.get("view") === "pending" ? "Pending Emails" : "Dashboard",
    ),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [mobile, setMobile] = useState(false),
    [dialog, setDialog] = useState(false),
    [mailbox, setMailbox] = useState({
      address: "",
      display_name: "",
      provider: "microsoft",
      timezone: "Asia/Kolkata",
      status: "active",
    }),
    [editingMailboxId, setEditingMailboxId] = useState<number | null>(null),
    [search, setSearch] = useState(initialQuery.get("search") || ""),
    [mailboxes, setMailboxes] = useState<any[]>([]),
    [employees, setEmployees] = useState<any[]>([]),
    [selectedEmail, setSelectedEmail] = useState<any>(null),
    [notice, setNotice] = useState(""),
    [createDialog, setCreateDialog] = useState<"employee" | "user" | null>(
      null,
    ),
    [editingPersonId, setEditingPersonId] = useState<number | null>(null),
    [person, setPerson] = useState({
      name: "",
      email: "",
      password: "",
      role: "manager",
      active: true,
      mailbox_ids: [] as number[],
    });
  const [statusFilter, setStatusFilter] = useState(
      initialQuery.get("status") || "",
    ),
    [dateFilter, setDateFilter] = useState(initialQuery.get("date") || ""),
    [mailboxFilter, setMailboxFilter] = useState(
      initialQuery.get("mailbox") || "",
    ),
    [employeeFilter, setEmployeeFilter] = useState(
      initialQuery.get("employee") || "",
    ),
    [page, setPage] = useState(Number(initialQuery.get("page")) || 1),
    [settingsView, setSettingsView] = useState("sla-rules"),
    [reportPeriod, setReportPeriod] = useState("daily"),
    [reportDimension, setReportDimension] = useState("mailbox"),
    [performanceSort, setPerformanceSort] = useState("employee"),
    [performanceOrder, setPerformanceOrder] = useState("asc"),
    [settingsJson, setSettingsJson] = useState("[]"),
    [readiness, setReadiness] = useState<Readiness | null>(null),
    [graphSetup, setGraphSetup] = useState<GraphSetup | null>(null),
    [gmailSetup, setGmailSetup] = useState<GmailSetup | null>(null),
    [testingGraph, setTestingGraph] = useState(false),
    [savingGraphCredentials, setSavingGraphCredentials] = useState(false),
    [syncSettings, setSyncSettings] = useState<SyncSettings>({ interval_seconds: 10, scheduler_enabled: true, next_sync: null }),
    [savingSyncSettings, setSavingSyncSettings] = useState(false),
    [syncing, setSyncing] = useState(false),
    [tourOpen, setTourOpen] = useState(
      () => localStorage.getItem("oeis_tour_completed_v1") !== "true",
    );
  const handleTourStep = useCallback((step: TourStep) => {
    if (window.innerWidth < 900)
      setMobile(step.target === "navigation" || step.target.endsWith("-nav"));
  }, []);
  const role = tokenRole(token),
    visibleSections = sections.filter(
      (item) =>
        role === "admin" ||
        !["Mailboxes", "Users & Roles", "Settings"].includes(item.name),
    );
  const displayName = (name: string) =>
    text(`nav.${sectionContentKeys[name]}.name`, name);
  const displayDescription = (name: string, fallback: string) =>
    text(`nav.${sectionContentKeys[name]}.description`, fallback);
  const pageEyebrow = (name: string) =>
    text(`page.${sectionContentKeys[name]}.eyebrow`, sectionMeta[name]?.eyebrow);
  const pageDescription = (name: string) =>
    text(`page.${sectionContentKeys[name]}.description`, sectionMeta[name]?.description);
  const emptyTitle = (name: string) =>
    text(`empty.${sectionContentKeys[name]}.title`, emptyStateMeta[name]?.title);
  const emptyDescription = (name: string) =>
    text(`empty.${sectionContentKeys[name]}.description`, emptyStateMeta[name]?.description);
  const visibleTourSteps =
    role === "admin"
      ? tourStepKeys
      : tourStepKeys.filter(
          ([target]) =>
            !["sync", "mailboxes-nav", "users-nav", "settings-nav"].includes(
              target,
            ),
        );
  const tourSteps: TourStep[] = visibleTourSteps.map(([target, key]) => ({
    target,
    eyebrow: text(`tour.step.${key}.eyebrow`),
    title: text(`tour.step.${key}.title`),
    description: text(`tour.step.${key}.description`),
  }));
  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const pendingParams = new URLSearchParams({
        page: String(page),
        search,
        status: statusFilter,
        date_filter: dateFilter,
      });
      if (mailboxFilter) pendingParams.set("mailbox", mailboxFilter);
      if (employeeFilter) pendingParams.set("employee", employeeFilter);
      const paths: Record<string, string> = {
        Dashboard: "/dashboard/kpis",
        "Pending Emails": `/emails/pending?${pendingParams}`,
        "Employee Performance": `/employees/performance?sort_by=${performanceSort}&order=${performanceOrder}`,
        Reports: `/reports/${reportPeriod}?dimension=${reportDimension}`,
        Mailboxes: "/mailboxes",
        Escalations: "/escalations",
        "Audit Logs": "/audit-logs",
        "Users & Roles": "/users",
        Settings: settingsView === "synchronization" ? "/system/sync-settings" : `/settings/${settingsView}`,
      };
      if (section === "Dashboard") {
        const [kpis, health] = await Promise.all([
          api(paths[section], token),
          api("/system/readiness", token),
        ]);
        setData(kpis);
        setReadiness(health);
      } else setData(await api(paths[section], token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [
    token,
    section,
    settingsView,
    reportPeriod,
    reportDimension,
    performanceSort,
    performanceOrder,
    page,
  ]);
  useEffect(() => {
    refreshAccessToken()
      .then((accessToken) => { if (accessToken) setToken(accessToken); })
      .finally(() => setAuthChecking(false));
  }, []);
  useEffect(() => {
    const update = (event: Event) =>
      setToken((event as CustomEvent<string>).detail);
    window.addEventListener("oeis-token", update);
    return () => window.removeEventListener("oeis-token", update);
  }, []);
  useEffect(() => {
    if (!token) return;
    Promise.all([api("/mailbox-options", token), api("/employees", token)])
      .then(([m, e]) => {
        setMailboxes(m);
        setEmployees(e);
      })
      .catch(() => undefined);
  }, [token]);
  useEffect(() => {
    if (!token) return;
    api("/system/readiness", token)
      .then(setReadiness)
      .catch(() => undefined);
  }, [token]);
  useEffect(() => {
    if (!token) return;
    api("/system/sync-settings", token)
      .then(setSyncSettings)
      .catch(() => undefined);
  }, [token]);
  useEffect(() => {
    if (!token || section !== "Dashboard") return;
    const refresh = () => {
      Promise.all([
        api("/dashboard/kpis", token),
        api("/system/readiness", token),
      ])
        .then(([kpis, health]) => {
          setData(kpis);
          setReadiness(health);
        })
        .catch(() => undefined);
    };
    const delay = Math.max(5000, Math.min(syncSettings.interval_seconds * 1000, 60000));
    const timer = window.setInterval(refresh, delay);
    return () => window.clearInterval(timer);
  }, [token, section, syncSettings.interval_seconds]);
  useEffect(() => {
    if (section === "Settings" && Array.isArray(data))
      setSettingsJson(JSON.stringify(data, null, 2));
    if (section === "Settings" && settingsView === "synchronization" && data && !Array.isArray(data))
      setSyncSettings(data as SyncSettings);
  }, [section, settingsView, data]);
  useEffect(() => {
    if (!dialog || editingMailboxId || !token) return;
    const timer = window.setTimeout(() => {
      if (mailbox.provider === "gmail") {
        api("/system/gmail-setup", token).then(setGmailSetup).catch(() => setGmailSetup(null));
      } else {
        const query = mailbox.address ? `?mailbox=${encodeURIComponent(mailbox.address)}` : "";
        api(`/system/graph-setup${query}`, token).then(setGraphSetup).catch(() => setGraphSetup(null));
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [dialog, editingMailboxId, mailbox.address, mailbox.provider, token]);
  useEffect(() => {
    if (section !== "Pending Emails") return;
    const query = new URLSearchParams({
      search,
      status: statusFilter,
      date: dateFilter,
      mailbox: mailboxFilter,
      employee: employeeFilter,
      page: String(page),
    });
    history.replaceState(null, "", `?view=pending&${query}`);
  }, [
    section,
    search,
    statusFilter,
    dateFilter,
    mailboxFilter,
    employeeFilter,
    page,
  ]);
  if (authChecking) return <Box className="loading"><CircularProgress /></Box>;
  if (!token) return <Login onLogin={setToken} />;
  const rows =
    section === "Pending Emails"
      ? data?.items || []
      : section === "Reports"
        ? data?.rows || []
        : section === "Audit Logs"
          ? data || []
          : Array.isArray(data)
            ? data
            : [];
  const saveMailbox = async () => {
    try {
      const path = editingMailboxId
        ? `/mailboxes/${editingMailboxId}`
        : "/mailboxes";
      const body = editingMailboxId
        ? {
            display_name: mailbox.display_name,
            timezone: mailbox.timezone,
            status: mailbox.status,
          }
        : {
            address: mailbox.address,
            display_name: mailbox.display_name,
            provider: mailbox.provider,
            timezone: mailbox.timezone,
          };
      await api(path, token, {
        method: editingMailboxId ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      setDialog(false);
      setEditingMailboxId(null);
      setMailbox({
        address: "",
        display_name: "",
        provider: "microsoft",
        timezone: "Asia/Kolkata",
        status: "active",
      });
      await load();
      setMailboxes(await api("/mailboxes", token));
      setNotice(
        `Mailbox ${editingMailboxId ? "updated" : "added"} successfully.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save mailbox");
    }
  };
  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(label);
    } catch {
      setError("Clipboard copy failed.");
    }
  };
  const downloadText = (value: string, filename: string) => {
    const href = URL.createObjectURL(
      new Blob([value.endsWith("\n") ? value : `${value}\n`], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(href);
    setNotice(`${filename} downloaded.`);
  };
  const testGraphConnection = async () => {
    setTestingGraph(true);
    try {
      await api("/system/graph-check", token, {
        method: "POST",
        body: JSON.stringify({ mailbox: mailbox.address || null }),
      });
      const health = await api("/system/readiness", token);
      setReadiness(health);
      setNotice(
        mailbox.address
          ? text("notice.graph_mailbox_verified")
          : text("notice.graph_verified"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Graph check failed");
    } finally {
      setTestingGraph(false);
    }
  };
  const saveGraphCredentials = async (payload: GraphConfig) => {
    const normalized = {
      azure_tenant_id: payload.azure_tenant_id.trim(),
      azure_client_id: payload.azure_client_id.trim(),
      azure_client_secret: payload.azure_client_secret.trim(),
      graph_scope: payload.graph_scope.trim(),
    };
    if (!normalized.azure_tenant_id) {
      setError("Tenant ID is required for this Microsoft Graph app-only setup.");
      return;
    }
    if (!normalized.azure_client_id) {
      setError("Client ID is required.");
      return;
    }
    if (normalized.graph_scope !== GRAPH_APP_ONLY_SCOPE) {
      setError(`Graph scope must be exactly ${GRAPH_APP_ONLY_SCOPE}.`);
      return;
    }
    setSavingGraphCredentials(true);
    try {
      setError("");
      const saved = await api("/system/graph-setup", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalized),
      });
      if (!saved?.saved || !saved?.credential_status?.runtime_loaded) {
        throw new Error("Credentials were not loaded by backend. Check backend status.");
      }
      setGraphSetup(await api(`/system/graph-setup${mailbox.address ? `?mailbox=${encodeURIComponent(mailbox.address)}` : ""}`, token));
      setReadiness(await api("/system/readiness", token));
      setNotice(
        normalized.azure_client_secret || normalized.azure_tenant_id
          ? text("notice.graph_secret_saved")
          : text("notice.graph_client_saved"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save Graph credentials");
    } finally {
      setSavingGraphCredentials(false);
    }
  };
  const createPerson = async () => {
    if (!createDialog) return;
    try {
      const base = createDialog === "employee" ? "/employees" : "/users";
      const body =
        createDialog === "employee"
          ? { name: person.name, email: person.email, active: person.active }
          : editingPersonId && !person.password
            ? { name: person.name, role: person.role, active: person.active }
            : {
                name: person.name,
                email: person.email,
                password: person.password,
                role: person.role,
                active: person.active,
              };
      const saved = await api(editingPersonId ? `${base}/${editingPersonId}` : base, token, {
        method: editingPersonId ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      if (createDialog === "user" && person.role === "manager") {
        await api(`/users/${editingPersonId || saved.id}/mailbox-access`, token, {
          method: "PUT",
          body: JSON.stringify({ mailbox_ids: person.mailbox_ids }),
        });
      }
      setCreateDialog(null);
      setEditingPersonId(null);
      setPerson({
        name: "",
        email: "",
        password: "",
        role: "manager",
        active: true,
        mailbox_ids: [],
      });
      const [m, e] = await Promise.all([
        api("/mailboxes", token),
        api("/employees", token),
      ]);
      setMailboxes(m);
      setEmployees(e);
      await load();
      setNotice(
        `${createDialog === "employee" ? "Employee" : "User"} ${editingPersonId ? "updated" : "created"} successfully.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create record");
    }
  };
  const openEmail = async (row: any) => {
    try {
      const detail = await api(`/emails/${row.id}`, token);
      setSelectedEmail({ ...detail, content_loading: role === "admin" });
      if (role === "admin") {
        try {
          const body = await api(`/emails/${row.id}/content`, token);
          setSelectedEmail((current: any) => current?.id === row.id ? { ...current, content: body.content, content_loading: false } : current);
        } catch (e) {
          setSelectedEmail((current: any) => current?.id === row.id ? { ...current, content_error: e instanceof Error ? e.message : "Unable to load message content", content_loading: false } : current);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load email");
    }
  };
  const assignEmail = async (employeeId: string) => {
    if (!selectedEmail) return;
    try {
      const suffix = employeeId ? `?employee_id=${employeeId}` : "";
      await api(`/emails/${selectedEmail.id}/assignment${suffix}`, token, {
        method: "PATCH",
      });
      setSelectedEmail({
        ...selectedEmail,
        assigned_employee_id: employeeId ? Number(employeeId) : null,
      });
      setNotice(text("notice.email_assignment_updated"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assignment failed");
    }
  };
  const editMailbox = (row: any) => {
    setEditingMailboxId(row.id);
    setMailbox({
      address: row.address,
      display_name: row.display_name,
      provider: row.provider || "microsoft",
      timezone: row.timezone,
      status: row.status,
    });
    setDialog(true);
  };
  const removeMailbox = async (row: any) => {
    if (!window.confirm(`Remove mailbox ${row.address}?`)) return;
    try {
      await api(`/mailboxes/${row.id}`, token, { method: "DELETE" });
      setData((current: any) =>
        Array.isArray(current) ? current.filter((item) => item.id !== row.id) : current,
      );
      setMailboxes((current) => current.filter((item) => item.id !== row.id));
      setNotice(text("notice.mailbox_removed"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to remove mailbox");
    }
  };
  const connectMailbox = async (row: any) => {
    const authWindow = window.open("about:blank", "_blank");
    if (!authWindow) {
      setError("Allow popups for OEIS, then click Connect Outlook again.");
      return;
    }
    try {
      const path = row.provider === "gmail" ? `/mailboxes/${row.id}/gmail/oauth/start` : `/mailboxes/${row.id}/oauth/start`;
      const result = await api(path, token, {
        method: "POST",
      });
      authWindow.location.href = result.auth_url;
      setNotice(`${row.provider === "gmail" ? "Google" : "Microsoft"} login opened. Finish login, then click Sync.`);
    } catch (e) {
      authWindow?.close();
      setError(e instanceof Error ? e.message : "Unable to start mailbox login");
    }
  };
  const editPerson = (kind: "employee" | "user", row: any) => {
    const source =
      kind === "employee"
        ? employees.find((employee) => employee.id === row.id) || row
        : row;
    setEditingPersonId(row.id);
    setPerson({
      name: source.name || source.employee,
      email: source.email || "",
      password: "",
      role: source.role || "manager",
      active: source.active ?? true,
      mailbox_ids: source.mailbox_ids || [],
    });
    setCreateDialog(kind);
  };
  const downloadReport = async (format: "xlsx" | "pdf") => {
    try {
      const response = await fetch(
        `/api/reports/${reportPeriod}/export?dimension=${reportDimension}&format=${format}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error("Report export failed");
      const href = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = href;
      link.download = `oeis-${reportPeriod}-${reportDimension}.${format}`;
      link.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report export failed");
    }
  };
  const saveSettings = async () => {
    try {
      const parsed = JSON.parse(settingsJson);
      const cleaned = parsed.map(
        ({ id, ...row }: Record<string, unknown>) => row,
      );
      await api(`/settings/${settingsView}`, token, {
        method: "PATCH",
        body: JSON.stringify(cleaned),
      });
      await load();
      setNotice("Settings saved successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Settings update failed");
    }
  };
  const saveSyncSettings = async () => {
    setSavingSyncSettings(true);
    try {
      const result = await api("/system/sync-settings", token, {
        method: "PATCH",
        body: JSON.stringify({
          interval_seconds: syncSettings.interval_seconds,
          scheduler_enabled: syncSettings.scheduler_enabled,
        }),
      });
      setSyncSettings(result);
      setNotice("Synchronization settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Synchronization settings update failed");
    } finally {
      setSavingSyncSettings(false);
    }
  };
  const runSync = async () => {
    setSyncing(true);
    try {
      const result = await api("/sync/trigger", token, { method: "POST" });
      const [health, mailboxOptions] = await Promise.all([
        api("/system/readiness", token),
        api("/mailbox-options", token),
      ]);
      setReadiness(health);
      setMailboxes(mailboxOptions);
      await load();
      const fetched = Number(result.emails_fetched || 0);
      const added = Number(result.emails_new || 0);
      const failed = Number(result.failed_mailboxes || 0);
      setNotice(
        failed
          ? `Synchronization finished with ${failed} mailbox error. Fetched ${fetched}, new ${added}.`
          : `Synchronization complete. Fetched ${fetched}, new ${added}.`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to start synchronization",
      );
    } finally {
      setSyncing(false);
    }
  };
  const sendSummary = async () => {
    try {
      await api("/reports/daily/send", token, { method: "POST" });
      setNotice("Daily summary queued for delivery.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send daily summary");
    }
  };
  const side = (
    <Box className="side" data-tour="navigation">
      <Box className="brand">
        <OeisLogo compact />
      </Box>
      <Typography className="rail-label">{text("shell.operations")}</Typography>
      {visibleSections.map(({ name, description, icon }) => (
        <Button
          key={name}
          data-tour={tourTargets[name]}
          className={section === name ? "active" : ""}
          startIcon={icon}
          onClick={() => {
            setSection(name);
            setMobile(false);
          }}
        >
          <Box className="nav-copy">
            <b>{displayName(name)}</b>
            <small>{displayDescription(name, description)}</small>
          </Box>
        </Button>
      ))}
      <Box className="system">
        <Sync />
        <Box>
          <b>
            {readiness?.operational
              ? text("shell.integration_operational")
              : readiness?.error_mailboxes
                ? text("shell.integration_attention")
                : readiness?.warning_mailboxes
                  ? "Temporary sync warning"
                : text("shell.scheduler_configured")}
          </b>
          <small>
            {readiness?.last_successful_sync
              ? format("shell.last_sync", { time: new Date(readiness.last_successful_sync).toLocaleTimeString() })
              : text("shell.delta_interval")}
          </small>
        </Box>
      </Box>
    </Box>
  );
  return (
    <Box className="shell">
      <a className="skip-link" href="#main-content">
        {text("shell.skip")}
      </a>
      <Box className="desktop-nav">{side}</Box>
      <Drawer
        open={mobile}
        onClose={() => setMobile(false)}
        ModalProps={{
          disableAutoFocus: tourOpen,
          disableEnforceFocus: tourOpen,
          disableRestoreFocus: tourOpen,
        }}
      >
        {side}
      </Drawer>
      <Box className="workspace">
        <Box className="top">
          <IconButton
            className="mobile-menu"
            aria-label={text("top.open_nav")}
            onClick={() => setMobile(true)}
          >
            <MenuIcon />
          </IconButton>
          <Box>
            <small>{text("top.product")}</small>
            <b>{text("top.scope")}</b>
          </Box>
          <Box className="top-right">
            <Button
              data-tour="help"
              className="guide-button"
              variant="text"
              startIcon={<HelpOutline />}
              onClick={() => setTourOpen(true)}
            >
              {text("top.guide")}
            </Button>
            <Button
              className="signout-button"
              variant="outlined"
              startIcon={<Logout />}
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
                setToken("");
              }}
            >
              {text("top.sign_out")}
            </Button>
            {role === "admin" && (
              <Button
                data-tour="sync"
                className="sync-button"
                variant="contained"
                color="info"
                startIcon={<Sync />}
                disabled={syncing}
                onClick={runSync}
              >
                {syncing ? text("top.syncing") : text("top.sync_now")}
              </Button>
            )}
          </Box>
        </Box>
        <Box className="main" id="main-content" data-tour="workspace">
          <Box className="hero">
            <Box>
              <Typography className="date">
                {pageEyebrow(section)}
              </Typography>
              <Typography variant="h4" component="h1">
                {displayName(section)}
              </Typography>
              <Typography color="text.secondary">
                {pageDescription(section)}
              </Typography>
            </Box>
            {section === "Mailboxes" && (
              <Button
                variant="contained"
                color="info"
                onClick={() => {
                  setEditingMailboxId(null);
                  setGraphSetup(null);
                  setGmailSetup(null);
                  setMailbox({
                    address: "",
                    display_name: "",
                    provider: "microsoft",
                    timezone: "Asia/Kolkata",
                    status: "active",
                  });
                  setDialog(true);
                }}
              >
                <Add sx={{ mr: 1 }} /> {text("action.add_mailbox")}
              </Button>
            )}
            {role === "admin" && section === "Employee Performance" && (
              <Button
                variant="contained"
                color="info"
                startIcon={<Add />}
                onClick={() => {
                  setEditingPersonId(null);
                  setPerson({
                    name: "",
                    email: "",
                    password: "",
                    role: "manager",
                    active: true,
                    mailbox_ids: [],
                  });
                  setCreateDialog("employee");
                }}
              >
                {text("action.add_employee")}
              </Button>
            )}
            {section === "Users & Roles" && (
              <Button
                variant="contained"
                color="info"
                startIcon={<Add />}
                onClick={() => {
                  setEditingPersonId(null);
                  setPerson({
                    name: "",
                    email: "",
                    password: "",
                    role: "manager",
                    active: true,
                    mailbox_ids: [],
                  });
                  setCreateDialog("user");
                }}
              >
                {text("action.add_user")}
              </Button>
            )}
          </Box>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {loading ? (
            <Box className="loading inline">
              <CircularProgress />
            </Box>
          ) : section === "Dashboard" && data ? (
            <ReferenceDashboard
              data={data}
              readiness={readiness}
              onNavigate={setSection}
              onSync={runSync}
              canSync={role === "admin"}
            />
          ) : (
            <Card className="table-card">
              {section === "Pending Emails" && (
                <Box className="toolbar">
                  <TextField
                    size="small"
                    label={text("filter.search")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <TextField
                    select
                    size="small"
                    label={text("filter.status")}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    sx={{ minWidth: 140 }}
                  >
                    <MenuItem value="">{text("filter.pending")}</MenuItem>
                    <MenuItem value="critical">{text("filter.critical")}</MenuItem>
                    <MenuItem value="overdue">{text("filter.overdue")}</MenuItem>
                    <MenuItem value="replied">{text("filter.replied")}</MenuItem>
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label={text("filter.date")}
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    sx={{ minWidth: 140 }}
                  >
                    <MenuItem value="">{text("filter.any_date")}</MenuItem>
                    <MenuItem value="today">{text("filter.today")}</MenuItem>
                    <MenuItem value="yesterday">{text("filter.yesterday")}</MenuItem>
                    <MenuItem value="week">{text("filter.week")}</MenuItem>
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label={text("filter.mailbox")}
                    value={mailboxFilter}
                    onChange={(e) => setMailboxFilter(e.target.value)}
                    sx={{ minWidth: 180 }}
                  >
                    <MenuItem value="">{text("filter.all_mailboxes")}</MenuItem>
                    {mailboxes.map((m) => (
                      <MenuItem key={m.id} value={String(m.id)}>
                        {m.display_name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label={text("filter.employee")}
                    value={employeeFilter}
                    onChange={(e) => setEmployeeFilter(e.target.value)}
                    sx={{ minWidth: 180 }}
                  >
                    <MenuItem value="">{text("filter.all_employees")}</MenuItem>
                    {employees.map((e) => (
                      <MenuItem key={e.id} value={String(e.id)}>
                        {e.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button onClick={load}>{text("filter.apply")}</Button>
                  <Button
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("");
                      setDateFilter("");
                      setMailboxFilter("");
                      setEmployeeFilter("");
                      setPage(1);
                    }}
                  >
                    {text("filter.clear")}
                  </Button>
                </Box>
              )}
              {section === "Reports" && (
                <Box className="toolbar">
                  <TextField
                    select
                    size="small"
                    label={text("report.period")}
                    value={reportPeriod}
                    onChange={(e) => setReportPeriod(e.target.value)}
                    sx={{ minWidth: 130 }}
                  >
                    <MenuItem value="daily">{text("report.daily")}</MenuItem>
                    <MenuItem value="weekly">{text("report.weekly")}</MenuItem>
                    <MenuItem value="monthly">{text("report.monthly")}</MenuItem>
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label={text("report.dimension")}
                    value={reportDimension}
                    onChange={(e) => setReportDimension(e.target.value)}
                    sx={{ minWidth: 150 }}
                  >
                    <MenuItem value="employee">{text("report.employee")}</MenuItem>
                    <MenuItem value="customer">{text("report.customer")}</MenuItem>
                    <MenuItem value="mailbox">{text("report.mailbox")}</MenuItem>
                  </TextField>
                  <Button onClick={() => downloadReport("xlsx")}>
                    {text("report.export_excel")}
                  </Button>
                  <Button onClick={() => downloadReport("pdf")}>
                    {text("report.export_pdf")}
                  </Button>
                  {role === "admin" && (
                    <Button onClick={sendSummary}>
                      {text("report.send_daily")}
                    </Button>
                  )}
                </Box>
              )}
              {section === "Employee Performance" && (
                <Box className="toolbar">
                  <TextField
                    select
                    size="small"
                    label={text("performance.sort_by")}
                    value={performanceSort}
                    onChange={(e) => setPerformanceSort(e.target.value)}
                    sx={{ minWidth: 180 }}
                  >
                    <MenuItem value="employee">{text("performance.employee")}</MenuItem>
                    <MenuItem value="total">{text("performance.total")}</MenuItem>
                    <MenuItem value="average_reply_time">
                      {text("performance.average")}
                    </MenuItem>
                    <MenuItem value="pending">{text("performance.pending")}</MenuItem>
                    <MenuItem value="critical">{text("performance.critical")}</MenuItem>
                    <MenuItem value="resolved">{text("performance.resolved")}</MenuItem>
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label={text("performance.order")}
                    value={performanceOrder}
                    onChange={(e) => setPerformanceOrder(e.target.value)}
                    sx={{ minWidth: 130 }}
                  >
                    <MenuItem value="asc">{text("performance.ascending")}</MenuItem>
                    <MenuItem value="desc">{text("performance.descending")}</MenuItem>
                  </TextField>
                </Box>
              )}
              {section === "Settings" && (
                <Box>
                  <Box className="toolbar">
                    {[
                      [text("settings.tab.sla"), "sla-rules"],
                      [text("settings.tab.classification"), "classification-rules"],
                      [text("settings.tab.calendars"), "business-calendars"],
                      [text("settings.tab.sync"), "synchronization"],
                    ].map(([label, value]) => (
                      <Button
                        key={value}
                        variant={settingsView === value ? "contained" : "text"}
                        onClick={() => {
                          setSettingsView(value);
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </Box>
                  {settingsView === "synchronization" ? (
                    <SyncSettingsPanel
                      settings={syncSettings}
                      onChange={setSyncSettings}
                      onSave={saveSyncSettings}
                      onSync={runSync}
                      saving={savingSyncSettings}
                      syncing={syncing}
                    />
                  ) : (
                    <SettingsEditor
                      kind={settingsView}
                      json={settingsJson}
                      onChange={setSettingsJson}
                      onSave={saveSettings}
                    />
                  )}
                </Box>
              )}
              {section !== "Settings" && (
                <>
                  <DataTable
                    rows={rows}
                    emptyTitle={emptyTitle(section)}
                    emptyDescription={emptyDescription(section)}
                    onSelect={
                      section === "Pending Emails"
                        ? openEmail
                        : section === "Mailboxes"
                          ? editMailbox
                          : section === "Employee Performance" &&
                              role === "admin"
                            ? (row) => editPerson("employee", row)
                            : section === "Users & Roles"
                              ? (row) => editPerson("user", row)
                              : undefined
                    }
                    onConnect={
                      section === "Mailboxes" ? connectMailbox : undefined
                    }
                    onDelete={section === "Mailboxes" ? removeMailbox : undefined}
                  />
                  {section === "Pending Emails" &&
                    data?.total > data?.page_size && (
                      <Box className="pagination">
                        <Typography variant="caption">
                          {format("hint.matching", { total: data.total })}
                        </Typography>
                        <Pagination
                          page={page}
                          count={Math.ceil(data.total / data.page_size)}
                          onChange={(_, value) => setPage(value)}
                          color="primary"
                        />
                      </Box>
                    )}
                  {section === "Mailboxes" && rows.length > 0 && (
                    <Typography className="table-hint">
                      {text("hint.mailboxes")}
                    </Typography>
                  )}
                  {section === "Employee Performance" && rows.length > 0 && (
                    <Typography className="table-hint">
                      {text("hint.performance")}
                    </Typography>
                  )}
                  {section === "Users & Roles" && rows.length > 0 && (
                    <Typography className="table-hint">
                      {text("hint.users")}
                    </Typography>
                  )}
                  {section === "Pending Emails" && rows.length > 0 && (
                    <Typography className="table-hint">
                      {text("hint.pending")}
                    </Typography>
                  )}
                </>
              )}
            </Card>
          )}
        </Box>
      </Box>
      <Dialog open={dialog} onClose={() => setDialog(false)}>
        <DialogTitle>
          {editingMailboxId
            ? text("dialog.mailbox.edit")
            : text("dialog.mailbox.add")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1, minWidth: 380 }}>
            <TextField
              select
              label={text("dialog.mailbox.provider")}
              disabled={!!editingMailboxId}
              value={mailbox.provider}
              onChange={(e) => setMailbox({ ...mailbox, provider: e.target.value })}
            >
              <MenuItem value="microsoft">{text("dialog.mailbox.microsoft")}</MenuItem>
              <MenuItem value="gmail">{text("dialog.mailbox.gmail")}</MenuItem>
            </TextField>
            <TextField
              label={text("dialog.mailbox.address")}
              disabled={!!editingMailboxId}
              value={mailbox.address}
              onChange={(e) =>
                setMailbox({ ...mailbox, address: e.target.value })
              }
            />
            <TextField
              label={text("dialog.mailbox.display")}
              value={mailbox.display_name}
              onChange={(e) =>
                setMailbox({ ...mailbox, display_name: e.target.value })
              }
            />
            <TextField
              select
              label={text("dialog.mailbox.timezone")}
              value={mailbox.timezone}
              onChange={(e) =>
                setMailbox({ ...mailbox, timezone: e.target.value })
              }
            >
              <MenuItem value="Asia/Kolkata">Asia/Kolkata</MenuItem>
              <MenuItem value="UTC">UTC</MenuItem>
            </TextField>
            {editingMailboxId && (
              <TextField
                select
                label={text("dialog.mailbox.sync_status")}
                value={mailbox.status}
                onChange={(e) =>
                  setMailbox({ ...mailbox, status: e.target.value })
                }
              >
                <MenuItem value="active">{text("status.active")}</MenuItem>
                <MenuItem value="paused">{text("dialog.mailbox.paused")}</MenuItem>
                <MenuItem value="error">{text("dialog.mailbox.error")}</MenuItem>
              </TextField>
            )}
            {!editingMailboxId && (
              mailbox.provider === "gmail" ? (
                <GmailSetupPipeline
                  setup={gmailSetup}
                  onCopy={copyText}
                  onDownload={downloadText}
                />
              ) : (
                <GraphSetupPipeline
                  setup={graphSetup}
                  mailboxAddress={mailbox.address}
                  onCopy={copyText}
                  onDownload={downloadText}
                  onTestGraph={testGraphConnection}
                  testingGraph={testingGraph}
                  onSaveCredentials={saveGraphCredentials}
                  savingCredentials={savingGraphCredentials}
                />
              )
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>{text("dialog.cancel")}</Button>
          <Button variant="contained" onClick={saveMailbox}>
            {editingMailboxId ? text("dialog.save_changes") : text("action.add_mailbox")}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!createDialog} onClose={() => setCreateDialog(null)}>
        <DialogTitle>
          {editingPersonId ? text("dialog.edit") : text("dialog.add")}{" "}
          {createDialog === "employee"
            ? text("dialog.person.employee")
            : text("dialog.person.user")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1, minWidth: 380 }}>
            <TextField
              label={text("dialog.person.name")}
              value={person.name}
              onChange={(e) => setPerson({ ...person, name: e.target.value })}
            />
            <TextField
              label={text("dialog.person.email")}
              type="email"
              disabled={createDialog === "user" && !!editingPersonId}
              value={person.email}
              onChange={(e) => setPerson({ ...person, email: e.target.value })}
            />
            {createDialog === "user" && (
              <>
                <TextField
	                  label={
	                    editingPersonId
	                      ? text("dialog.person.new_password")
	                      : text("dialog.person.temp_password")
	                  }
                  type="password"
	                  helperText={
	                    editingPersonId
	                      ? text("dialog.person.keep_password")
	                      : text("dialog.person.min_password")
	                  }
                  value={person.password}
                  onChange={(e) =>
                    setPerson({ ...person, password: e.target.value })
                  }
                />
                <TextField
                  select
                  label={text("dialog.person.role")}
                  value={person.role}
                  onChange={(e) =>
                    setPerson({ ...person, role: e.target.value })
                  }
                >
                  <MenuItem value="manager">{text("dialog.person.manager")}</MenuItem>
                  <MenuItem value="admin">{text("dialog.person.admin")}</MenuItem>
                </TextField>
                {person.role === "manager" && (
                  <TextField
                    select
                    label="Allowed mailboxes"
                    value={person.mailbox_ids.map(String)}
                    SelectProps={{ multiple: true }}
                    onChange={(event) => {
                      const rawValue = event.target.value;
                      const values = Array.isArray(rawValue)
                        ? rawValue
                        : String(rawValue).split(",");
                      setPerson({ ...person, mailbox_ids: values.map(Number) });
                    }}
                    helperText="No selection means this Manager cannot view mailbox data."
                  >
                    {mailboxes.map((allowedMailbox) => (
                      <MenuItem key={allowedMailbox.id} value={String(allowedMailbox.id)}>
                        {allowedMailbox.display_name || allowedMailbox.address}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              </>
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={person.active}
                  onChange={(e) =>
                    setPerson({ ...person, active: e.target.checked })
                  }
                />
              }
              label={text("dialog.person.active")}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog(null)}>{text("dialog.cancel")}</Button>
          <Button variant="contained" onClick={createPerson}>
            {editingPersonId ? text("dialog.save_changes") : text("dialog.create")}
          </Button>
        </DialogActions>
      </Dialog>
      <Drawer
        anchor="right"
        open={!!selectedEmail}
        onClose={() => setSelectedEmail(null)}
      >
        <Box className="detail production-detail">
          <Box className="detail-head">
            <Chip
              label={selectedEmail?.sla_tier || text("detail.email")}
              color={selectedEmail?.sla_tier === "critical" ? "error" : "info"}
            />
            <IconButton
              aria-label={text("detail.close")}
              onClick={() => setSelectedEmail(null)}
            >
              <Close />
            </IconButton>
          </Box>
          {selectedEmail && (
            <>
              <Typography variant="h5">{selectedEmail.subject}</Typography>
              <Box className="preview">
                <small>{text("detail.sender")}</small>
                <b>{selectedEmail.sender}</b>
                <small>{text("detail.receiver")}</small>
                <b>{selectedEmail.receiver}</b>
                <small>{text("detail.received")}</small>
                <b>{formatMailboxDateTime(selectedEmail.received_time, selectedEmail.mailbox_timezone)}</b>
                {selectedEmail.replied_at && (
                  <>
                    <small>Replied At</small>
                    <b>{formatMailboxDateTime(selectedEmail.replied_at, selectedEmail.mailbox_timezone)}</b>
                  </>
                )}
                <small>{text("detail.classification_status")}</small>
                <b>
                  {selectedEmail.classification} · {replyStatusLabel(selectedEmail.status)}
                </b>
                <small>{text("detail.pending_hours")}</small>
                <b>{Number(selectedEmail.pending_hours).toFixed(2)}</b>
                <small>{text("detail.internet_message_id")}</small>
                <span className="technical-value">
                  {selectedEmail.internet_message_id || text("detail.unavailable")}
                </span>
                <small>{text("detail.conversation_id")}</small>
                <span className="technical-value">
                  {selectedEmail.conversation_id || text("detail.unavailable")}
                </span>
              </Box>
              {role === "admin" && (
                <Box className="email-content">
                  <Typography variant="subtitle2">{text("detail.message_content", "Message content")}</Typography>
                  {selectedEmail.content_loading ? (
                    <Box className="email-content-loading"><CircularProgress size={20} /> {text("detail.loading_content", "Loading message...")}</Box>
                  ) : selectedEmail.content_error ? (
                    <Alert severity="error">{selectedEmail.content_error}</Alert>
                  ) : (
                    <Typography component="div">{selectedEmail.content || text("detail.empty_content", "This message has no readable text content.")}</Typography>
                  )}
                </Box>
              )}
              <TextField
                select
                fullWidth
                disabled={role !== "admin"}
                label={
                  role === "admin"
                    ? text("detail.assigned_employee")
                    : text("detail.assigned_employee_admin")
                }
                value={
                  selectedEmail.assigned_employee_id
                    ? String(selectedEmail.assigned_employee_id)
                    : ""
                }
                onChange={(e) => assignEmail(e.target.value)}
              >
                <MenuItem value="">
                  <em>{text("detail.unassigned")}</em>
                </MenuItem>
                {employees.map((employee) => (
                  <MenuItem key={employee.id} value={String(employee.id)}>
                    {employee.name}
                  </MenuItem>
                ))}
              </TextField>
            </>
          )}
        </Box>
      </Drawer>
      <Snackbar
        open={!!notice}
        autoHideDuration={3500}
        onClose={() => setNotice("")}
        message={notice}
      />
      <GuidedTour
        open={tourOpen}
        steps={tourSteps}
        onClose={() => setTourOpen(false)}
        onStepChange={handleTourStep}
      />
    </Box>
  );
}
