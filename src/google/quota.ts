/**
 * Quota fetching from Google Cloud Code API.
 * Parses model quota information and filters to relevant models.
 */

import type { QuotaIdentity } from "../oauth/constants.js";

// Fetch timeout in milliseconds (15 seconds, matching Antigravity-Manager)
const FETCH_TIMEOUT_MS = 15000;

// Retry configuration matching Antigravity-Manager behavior
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Production endpoint for fetchAvailableModels (antigravity identity).
 * The working Antigravity-Manager only uses the prod endpoint.
 */
export const FETCH_AVAILABLE_MODELS_ENDPOINTS = [
  "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
] as const;

/**
 * Production endpoint for retrieveUserQuota (gemini-cli identity).
 * The real gemini-cli only uses the prod endpoint, no sandbox fallback.
 */
export const RETRIEVE_USER_QUOTA_ENDPOINT =
  "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Error thrown when quota fetching fails.
 */
export class QuotaError extends Error {
  readonly name = "QuotaError";
  readonly status: number;
  readonly endpoint: string;

  constructor(input: { message: string; status: number; endpoint: string }) {
    super(input.message);
    this.status = input.status;
    this.endpoint = input.endpoint;
  }
}

/**
 * Quota information for a single model.
 */
export interface ModelQuota {
  model: string;
  remainingPercent: number; // 0..100
  resetTime: string; // passthrough from API
}

/**
 * Raw API response structure from fetchAvailableModels.
 */
export interface FetchAvailableModelsResponse {
  models: Record<
    string,
    {
      quotaInfo?: {
        remainingFraction?: number;
        resetTime?: string;
      };
    }
  >;
}

/**
 * Raw API response structure from retrieveUserQuota.
 * Matches gemini-cli's BucketInfo type from code_assist/types.ts.
 */
export interface RetrieveUserQuotaResponse {
  buckets?: Array<{
    remainingAmount?: string;
    remainingFraction?: number;
    resetTime?: string;
    tokenType?: string;
    modelId?: string;
  }>;
}

/**
 * Models to include in quota reports (gemini, claude, image generation).
 * Matches the Antigravity-Manager filter which includes image/imagen models.
 */
const MODEL_FILTER_PATTERN = /gemini|claude|image|imagen/i;

/**
 * Known stable Antigravity version configuration.
 * Antigravity 1.16.5 uses Electron 39.2.3 / Chrome 132.0.6834.160.
 */
const KNOWN_STABLE_VERSION = "1.16.5";
const KNOWN_STABLE_CHROME = "132.0.6834.160";
const KNOWN_STABLE_ELECTRON = "39.2.3";

/**
 * Builds a User-Agent string matching the official Antigravity Electron client format.
 * The API validates User-Agent and rejects non-conforming strings.
 */
function buildAntigravityUserAgent(): string {
  const platform = process.platform;
  const platformInfo =
    platform === "darwin"
      ? "Macintosh; Intel Mac OS X 10_15_7"
      : platform === "win32"
        ? "Windows NT 10.0; Win64; x64"
        : "X11; Linux x86_64";

  return `Mozilla/5.0 (${platformInfo}) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/${KNOWN_STABLE_VERSION} Chrome/${KNOWN_STABLE_CHROME} Electron/${KNOWN_STABLE_ELECTRON} Safari/537.36`;
}

/**
 * Known Gemini CLI version and model for User-Agent construction.
 * The real gemini-cli builds User-Agent as: GeminiCLI/<version>/<model> (<platform>; <arch>)
 * Reference: gemini-cli/packages/core/src/core/contentGenerator.ts
 */
const KNOWN_GEMINI_CLI_VERSION = "1.0.0";
const KNOWN_GEMINI_CLI_MODEL = "gemini-2.5-pro";

/**
 * Builds a User-Agent string matching the official Gemini CLI format.
 * The API validates User-Agent; this matches the real gemini-cli behavior.
 * No X-Goog-Api-Client or Client-Metadata headers are used by the real CLI.
 */
function buildGeminiCliUserAgent(): string {
  return `GeminiCLI/${KNOWN_GEMINI_CLI_VERSION}/${KNOWN_GEMINI_CLI_MODEL} (${process.platform}; ${process.arch})`;
}

/**
 * Gets the appropriate headers for an identity.
 */
function getHeadersForIdentity(identity: QuotaIdentity): Record<string, string> {
  if (identity === "antigravity") {
    return { "User-Agent": buildAntigravityUserAgent() };
  }
  return { "User-Agent": buildGeminiCliUserAgent() };
}

/**
 * Parses the API response and extracts quota info for relevant models.
 *
 * @param response - Raw API response from fetchAvailableModels
 * @returns Array of ModelQuota for gemini/claude/image models only
 */
export function parseQuotaResponse(response: FetchAvailableModelsResponse): ModelQuota[] {
  const result: ModelQuota[] = [];

  for (const [modelName, modelData] of Object.entries(response.models)) {
    // Filter to only relevant models (gemini, claude, image, imagen)
    if (!MODEL_FILTER_PATTERN.test(modelName)) {
      continue;
    }

    const quotaInfo = modelData.quotaInfo;
    const remainingFraction = quotaInfo?.remainingFraction ?? 0;
    const resetTime = quotaInfo?.resetTime ?? "";

    result.push({
      model: modelName,
      remainingPercent: Math.floor(remainingFraction * 100),
      resetTime,
    });
  }

  return result;
}

/**
 * Parses the retrieveUserQuota response into ModelQuota entries.
 */
export function parseUserQuotaResponse(response: RetrieveUserQuotaResponse): ModelQuota[] {
  const buckets = response.buckets ?? [];
  const result: ModelQuota[] = [];

  for (const bucket of buckets) {
    const modelId = bucket.modelId;
    if (!modelId || !MODEL_FILTER_PATTERN.test(modelId)) {
      continue;
    }

    const remainingFraction = bucket.remainingFraction ?? 0;
    const resetTime = bucket.resetTime ?? "";

    result.push({
      model: modelId,
      remainingPercent: Math.floor(remainingFraction * 100),
      resetTime,
    });
  }

  return result;
}

async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Wraps fetch with a timeout to prevent hanging on slow networks.
 */
async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Network request timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}

/**
 * Delays execution for the specified number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches quota information from the Google Cloud Code API.
 *
 * For antigravity identity: uses prod fetchAvailableModels endpoint with retry logic.
 * For gemini-cli identity: uses prod retrieveUserQuota endpoint with retry logic.
 * Both use up to 3 retry attempts with 1s delay between, matching Antigravity-Manager behavior.
 *
 * @param input.accessToken - Valid OAuth access token
 * @param input.projectId - Google Cloud project ID
 * @param input.identity - The quota identity (antigravity or gemini-cli)
 * @param input.fetchImpl - Optional fetch implementation for testing
 * @returns Array of ModelQuota for relevant models
 * @throws {QuotaError} If all retry attempts fail with HTTP errors
 */
export async function fetchQuota(input: {
  accessToken: string;
  projectId: string;
  identity?: QuotaIdentity;
  fetchImpl?: FetchLike;
}): Promise<ModelQuota[]> {
  // Validate inputs
  if (!input.accessToken || input.accessToken.trim().length === 0) {
    throw new QuotaError({
      message: "Access token is required and cannot be empty",
      status: 0,
      endpoint: "",
    });
  }
  
  if (!input.projectId || input.projectId.trim().length === 0) {
    throw new QuotaError({
      message: "Project ID is required and cannot be empty",
      status: 0,
      endpoint: "",
    });
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const identity = input.identity ?? "antigravity";
  
  const identityHeaders = getHeadersForIdentity(identity);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    "Content-Type": "application/json",
    ...identityHeaders,
  };

  const body = JSON.stringify({ project: input.projectId });
  const isGeminiCli = identity === "gemini-cli";

  if (isGeminiCli) {
    return fetchQuotaWithRetry(fetchImpl, RETRIEVE_USER_QUOTA_ENDPOINT, headers, body, true);
  }

  // Antigravity: use prod endpoint with retry logic (matching Antigravity-Manager)
  return fetchQuotaWithRetry(fetchImpl, FETCH_AVAILABLE_MODELS_ENDPOINTS[0], headers, body);
}

/**
 * Fetches quota from a single endpoint with retry logic.
 * Matches Antigravity-Manager's retry behavior: up to MAX_RETRIES attempts with RETRY_DELAY_MS between.
 * Used for both antigravity (fetchAvailableModels) and gemini-cli (retrieveUserQuota) identities.
 */
async function fetchQuotaWithRetry(
  fetchImpl: FetchLike,
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  isGeminiCli = false,
): Promise<ModelQuota[]> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(fetchImpl, endpoint, {
        method: "POST",
        headers,
        body,
      }, FETCH_TIMEOUT_MS);

      if (!res.ok) {
        // 403 should be thrown immediately - it's a real permission error, no retry
        if (res.status === 403) {
          throw new QuotaError({
            message: `Forbidden: HTTP 403`,
            status: 403,
            endpoint,
          });
        }

        // Other HTTP errors - retry
        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY_MS);
          continue;
        }
        throw new QuotaError({
          message: `HTTP ${res.status}`,
          status: res.status,
          endpoint,
        });
      }

      const json = await readJsonSafe(res);
      if (!json) {
        return [];
      }

      if (isGeminiCli) {
        const quota = json as RetrieveUserQuotaResponse;
        if (!quota.buckets) {
          return [];
        }
        return parseUserQuotaResponse(quota);
      }

      const models = json as FetchAvailableModelsResponse;
      if (!models.models) {
        return [];
      }

      return parseQuotaResponse(models);
    } catch (err) {
      // Re-throw QuotaError (including 403)
      if (err instanceof QuotaError) {
        throw err;
      }

      lastError = err instanceof Error ? err : new Error(String(err));

      // Network error - retry if attempts remain
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS);
        continue;
      }
    }
  }

  // All retries exhausted
  throw new QuotaError({
    message: `Network error: ${lastError?.message ?? "All quota retries failed"}`,
    status: 0,
    endpoint,
  });
}

