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
import { renderTable } from "../output/table";
import { renderJson } from "../output/json";

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
  isForbidden: boolean;
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
    identity?: QuotaIdentity;
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
 * Determines if an error is a 403 Forbidden error.
 */
function isForbiddenError(error: unknown): boolean {
  if (error instanceof Error) {
    const anyError = error as any;
    if (anyError.status === 403) return true;
    if (error.message?.includes("403")) return true;
    if (error.message?.toLowerCase().includes("forbidden")) return true;
  }
  return false;
}

/**
 * Fetches quota for a single identity of an account.
 */
async function fetchIdentityQuota(
  account: UsageOpencodeAccount,
  identity: QuotaIdentity,
  identityData: { refreshToken: string; projectId?: string },
  deps: StatusDeps
): Promise<{ report?: AccountQuotaReport; error?: IdentityError }> {
  try {
    // Refresh access token
    const { accessToken } = await deps.refreshAccessToken({
      identity,
      refreshToken: identityData.refreshToken,
    });

    // Get identity-specific project ID, falling back to account-level (legacy)
    const storedProjectId = identityData.projectId ?? account.projectId;

    // Ensure project ID (discover if not stored)
    const projectId = await deps.ensureProjectId({
      accessToken,
      projectId: storedProjectId,
    });

    // Fetch quotas
    const models = await deps.fetchQuota({
      accessToken,
      projectId,
      identity,
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
    const isForbidden = isForbiddenError(error);
    return {
      error: {
        email: account.email,
        identity,
        error: error instanceof Error ? error.message : String(error),
        needsRelogin,
        isForbidden,
      },
    };
  }
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
          account.antigravity,
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
          account.geminiCli,
          deps
        );
        if (result.report) reports.push(result.report);
        if (result.error) errors.push(result.error);
      }
    }
  }

  // Render output
  const output = format === "json" ? renderJson(reports, errors) : renderTable(reports, errors);

  return { reports, errors, output };
}
