/**
 * Status command: fetches quota for all stored accounts (both identities).
 * Renders table by default, with optional JSON output.
 */

import type { QuotaIdentity } from "../oauth/constants";
import type { UsageOpencodeStore, UsageOpencodeAccount } from "../storage";
import { loadStore as defaultLoadStore } from "../storage";
import { refreshAccessToken as defaultRefreshAccessToken } from "../oauth/token";
import { ensureProjectId as defaultEnsureProjectId } from "../google/project";
import { fetchQuota as defaultFetchQuota, type ModelQuota } from "../google/quota";

/**
 * Quota report for a single account + identity combination.
 */
export interface AccountQuotaReport {
  email: string;
  identity: QuotaIdentity;
  projectId: string;
  subscriptionTier?: string; // optional if we can infer it later
  models: ModelQuota[];
  fetchedAt: number;
}

/**
 * Error details for a failed identity fetch.
 */
export interface IdentityError {
  email: string;
  identity: QuotaIdentity;
  error: string;
  needsRelogin: boolean;
}

/**
 * Result of the status command.
 */
export interface StatusResult {
  reports: AccountQuotaReport[];
  errors: IdentityError[];
  output: string;
}

/**
 * Dependencies for the status command (for testing).
 */
export interface StatusDeps {
  loadStore: (opts?: { configDir?: string }) => Promise<UsageOpencodeStore>;
  refreshAccessToken: (input: {
    identity: QuotaIdentity;
    refreshToken: string;
    fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  }) => Promise<{ accessToken: string; expiresAt: number }>;
  ensureProjectId: (input: {
    accessToken: string;
    projectId?: string;
    fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  }) => Promise<string>;
  fetchQuota: (input: {
    accessToken: string;
    projectId: string;
    fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  }) => Promise<ModelQuota[]>;
}

const defaultDeps: StatusDeps = {
  loadStore: defaultLoadStore,
  refreshAccessToken: defaultRefreshAccessToken,
  ensureProjectId: defaultEnsureProjectId,
  fetchQuota: defaultFetchQuota,
};

export type OutputFormat = "table" | "json";

export interface StatusOptions {
  deps?: StatusDeps;
  format?: OutputFormat;
  accountFilter?: string;
  identityFilter?: QuotaIdentity;
  configDir?: string;
}

/**
 * Determines if an error indicates the refresh token is invalid and re-login is needed.
 */
function isInvalidGrantError(error: unknown): boolean {
  if (error instanceof Error) {
    const anyError = error as any;
    if (anyError.error === "invalid_grant") return true;
    if (anyError.errorDescription?.includes("invalid_grant")) return true;
    if (error.message?.includes("invalid_grant")) return true;
  }
  return false;
}

/**
 * Fetches quota for a single identity of an account.
 */
async function fetchIdentityQuota(
  account: UsageOpencodeAccount,
  identity: QuotaIdentity,
  refreshToken: string,
  deps: StatusDeps
): Promise<{ report?: AccountQuotaReport; error?: IdentityError }> {
  try {
    // Refresh access token
    const { accessToken } = await deps.refreshAccessToken({
      identity,
      refreshToken,
    });

    // Ensure project ID
    const projectId = await deps.ensureProjectId({
      accessToken,
      projectId: account.projectId,
    });

    // Fetch quotas
    const models = await deps.fetchQuota({
      accessToken,
      projectId,
    });

    return {
      report: {
        email: account.email,
        identity,
        projectId,
        models,
        fetchedAt: Date.now(),
      },
    };
  } catch (error) {
    const needsRelogin = isInvalidGrantError(error);
    return {
      error: {
        email: account.email,
        identity,
        error: error instanceof Error ? error.message : String(error),
        needsRelogin,
      },
    };
  }
}

/**
 * Renders a table of quota reports.
 */
function renderTable(reports: AccountQuotaReport[], errors: IdentityError[]): string {
  if (reports.length === 0 && errors.length === 0) {
    return "No accounts found. Run `usage-opencode login` to add an account.\n";
  }

  const lines: string[] = [];

  // Header
  lines.push("┌" + "─".repeat(76) + "┐");
  lines.push(
    "│ " +
      "Email".padEnd(25) +
      "Identity".padEnd(14) +
      "Model".padEnd(20) +
      "Remaining".padEnd(10) +
      "Reset │"
  );
  lines.push("├" + "─".repeat(76) + "┤");

  // Data rows
  for (const report of reports) {
    for (const model of report.models) {
      const email = report.email.slice(0, 24).padEnd(25);
      const identity = report.identity.padEnd(14);
      const modelName = model.model.slice(0, 19).padEnd(20);
      const remaining = `${model.remainingPercent}%`.padEnd(10);
      const reset = model.resetTime ? formatResetTime(model.resetTime) : "-";
      lines.push(`│ ${email}${identity}${modelName}${remaining}${reset.slice(0, 5).padEnd(5)} │`);
    }
  }

  // Error rows
  for (const err of errors) {
    const email = err.email.slice(0, 24).padEnd(25);
    const identity = err.identity.padEnd(14);
    const status = err.needsRelogin ? "Needs relogin" : "Error";
    lines.push(`│ ${email}${identity}${status.padEnd(20)}${"".padEnd(10)}${"".padEnd(5)} │`);
  }

  lines.push("└" + "─".repeat(76) + "┘");

  // Footer with action required
  const needsRelogin = errors.filter((e) => e.needsRelogin);
  if (needsRelogin.length > 0) {
    lines.push("");
    lines.push("Action required:");
    for (const err of needsRelogin) {
      lines.push(`  usage-opencode login --mode ${err.identity} --account ${err.email}`);
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Formats reset time for table display.
 */
function formatResetTime(resetTime: string): string {
  try {
    const date = new Date(resetTime);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();

    if (diffMs < 0) return "now";

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h${mins}m`;
    return `${mins}m`;
  } catch {
    return resetTime.slice(0, 10);
  }
}

/**
 * Renders reports as JSON.
 */
function renderJson(reports: AccountQuotaReport[]): string {
  return JSON.stringify(reports, null, 2);
}

/**
 * Main status command implementation.
 */
export async function runStatus(options: StatusOptions = {}): Promise<StatusResult> {
  const deps = options.deps ?? defaultDeps;
  const format = options.format ?? "table";

  // Load accounts
  const store = await deps.loadStore({ configDir: options.configDir });

  // Filter accounts if specified
  let accounts = store.accounts;
  if (options.accountFilter) {
    accounts = accounts.filter((a) => a.email === options.accountFilter);
  }

  const reports: AccountQuotaReport[] = [];
  const errors: IdentityError[] = [];

  // Process each account
  for (const account of accounts) {
    // Process antigravity identity
    if (account.antigravity?.refreshToken) {
      if (!options.identityFilter || options.identityFilter === "antigravity") {
        const result = await fetchIdentityQuota(
          account,
          "antigravity",
          account.antigravity.refreshToken,
          deps
        );
        if (result.report) reports.push(result.report);
        if (result.error) errors.push(result.error);
      }
    }

    // Process gemini-cli identity
    if (account.geminiCli?.refreshToken) {
      if (!options.identityFilter || options.identityFilter === "gemini-cli") {
        const result = await fetchIdentityQuota(
          account,
          "gemini-cli",
          account.geminiCli.refreshToken,
          deps
        );
        if (result.report) reports.push(result.report);
        if (result.error) errors.push(result.error);
      }
    }
  }

  // Render output
  const output = format === "json" ? renderJson(reports) : renderTable(reports, errors);

  return { reports, errors, output };
}
