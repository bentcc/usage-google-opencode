/**
 * Status command: fetches quota for all stored accounts (both identities).
 * Renders table by default, with optional JSON output.
 */

import type { QuotaIdentity } from "../oauth/constants.js";
import type { UsageOpencodeStore, UsageOpencodeAccount, UsageOpencodeIdentity } from "../storage.js";
import { loadStore as defaultLoadStore, saveStore as defaultSaveStore } from "../storage.js";
import { refreshAccessToken as defaultRefreshAccessToken } from "../oauth/token.js";
import { ensureProjectId as defaultEnsureProjectId } from "../google/project.js";
import { fetchQuota as defaultFetchQuota, type ModelQuota } from "../google/quota.js";
import { renderTable } from "../output/table.js";
import { renderJson } from "../output/json.js";

/** Minimum remaining lifetime (seconds) for a cached token to be reused. */
const TOKEN_CACHE_MARGIN_S = 300;

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
  saveStore: (opts: { configDir?: string } | undefined, store: UsageOpencodeStore) => Promise<void>;
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
  saveStore: defaultSaveStore,
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
 * Returns true when the cached access token is still valid for at least TOKEN_CACHE_MARGIN_S.
 */
function isCachedTokenValid(identityData: UsageOpencodeIdentity): boolean {
  if (!identityData.cachedAccessToken || !identityData.cachedExpiresAt) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return identityData.cachedExpiresAt > nowSec + TOKEN_CACHE_MARGIN_S;
}

/** Result from fetchIdentityQuota, extended with cache metadata for persistence. */
interface IdentityQuotaResult {
  report?: AccountQuotaReport;
  error?: IdentityError;
  /** Email of the account this result belongs to. */
  email: string;
  /** Identity this result belongs to. */
  identity: QuotaIdentity;
  /** Fresh access token + expiry to write back to the store cache. */
  tokenCache?: { accessToken: string; expiresAt: number };
}

/**
 * Fetches quota for a single identity of an account.
 * Uses cached access token when still valid; otherwise refreshes and returns
 * the new token for the caller to persist.
 */
async function fetchIdentityQuota(
  account: UsageOpencodeAccount,
  identity: QuotaIdentity,
  identityData: UsageOpencodeIdentity,
  deps: StatusDeps,
): Promise<IdentityQuotaResult> {
  try {
    let accessToken: string;
    let tokenCache: { accessToken: string; expiresAt: number } | undefined;

    if (isCachedTokenValid(identityData)) {
      // Re-use cached token — skip the network round-trip
      accessToken = identityData.cachedAccessToken!;
    } else {
      // Must refresh — save the result so the caller can persist it
      const refreshed = await deps.refreshAccessToken({
        identity,
        refreshToken: identityData.refreshToken,
      });
      accessToken = refreshed.accessToken;
      tokenCache = { accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
    }

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
      email: account.email,
      identity,
      tokenCache,
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
      email: account.email,
      identity,
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
  const tasks: Array<Promise<IdentityQuotaResult>> = [];

  // Queue quota fetches for all accounts/identities
  for (const account of accounts) {
    if (account.antigravity?.refreshToken) {
      if (!options.identityFilter || options.identityFilter === "antigravity") {
        tasks.push(
          fetchIdentityQuota(account, "antigravity", account.antigravity, deps),
        );
      }
    }

    if (account.geminiCli?.refreshToken) {
      if (!options.identityFilter || options.identityFilter === "gemini-cli") {
        tasks.push(
          fetchIdentityQuota(account, "gemini-cli", account.geminiCli, deps),
        );
      }
    }
  }

  const results = await Promise.all(tasks);

  // Collect reports/errors and track whether any tokens were refreshed
  let storeNeedsUpdate = false;
  let updatedStore = store;

  for (const result of results) {
    if (result.report) reports.push(result.report);
    if (result.error) errors.push(result.error);

    // Persist freshly-refreshed tokens back to the store cache
    if (result.tokenCache) {
      storeNeedsUpdate = true;
      const accountIdx = updatedStore.accounts.findIndex((a) => a.email === result.email);
      if (accountIdx !== -1) {
        const acct = updatedStore.accounts[accountIdx];
        const identityKey = result.identity === "antigravity" ? "antigravity" : "geminiCli";
        const existing = acct[identityKey];
        if (existing) {
          const updatedAccounts = updatedStore.accounts.slice();
          updatedAccounts[accountIdx] = {
            ...acct,
            [identityKey]: {
              ...existing,
              cachedAccessToken: result.tokenCache.accessToken,
              cachedExpiresAt: result.tokenCache.expiresAt,
            },
          };
          updatedStore = { ...updatedStore, accounts: updatedAccounts };
        }
      }
    }
  }

  // Fire-and-forget: persist token cache to disk (non-blocking)
  if (storeNeedsUpdate) {
    deps.saveStore({ configDir: options.configDir }, updatedStore).catch(() => {
      // Swallow errors — cache persistence is best-effort
    });
  }

  // Render output
  const output = format === "json" ? renderJson(reports, errors) : renderTable(reports, errors);

  return { reports, errors, output };
}
