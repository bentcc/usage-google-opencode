/**
 * Quota fetching from Google Cloud Code API.
 * Parses model quota information and filters to relevant models.
 */

import type { QuotaIdentity } from "../oauth/constants.js";

/**
 * Endpoints to try for fetchAvailableModels, in order.
 */
export const FETCH_AVAILABLE_MODELS_ENDPOINTS = [
  "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels",
  "https://autopush-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels",
] as const;

/**
 * Endpoints to try for retrieveUserQuota, in order.
 */
export const RETRIEVE_USER_QUOTA_ENDPOINTS = [
  "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuota",
  "https://autopush-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuota",
] as const;

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
 */
export interface RetrieveUserQuotaResponse {
  buckets?: Array<{
    remainingFraction?: number;
    resetTime?: string;
    modelId?: string;
  }>;
}

/**
 * Models to include in quota reports (gemini or claude).
 */
const MODEL_FILTER_PATTERN = /gemini|claude/i;

/**
 * Headers for Antigravity identity (IDE mode).
 */
const ANTIGRAVITY_HEADERS = {
  "User-Agent": "antigravity/1.11.5 windows/amd64",
  "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "Client-Metadata": '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
} as const;

/**
 * Headers for Gemini CLI identity (CLI mode).
 */
const GEMINI_CLI_HEADERS = {
  "User-Agent": "google-api-nodejs-client/9.15.1",
  "X-Goog-Api-Client": "gl-node/22.17.0",
  "Client-Metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
} as const;

/**
 * Gets the appropriate headers for an identity.
 */
function getHeadersForIdentity(identity: QuotaIdentity): Record<string, string> {
  return identity === "antigravity" ? { ...ANTIGRAVITY_HEADERS } : { ...GEMINI_CLI_HEADERS };
}

/**
 * Parses the API response and extracts quota info for relevant models.
 *
 * @param response - Raw API response from fetchAvailableModels
 * @returns Array of ModelQuota for gemini/claude models only
 */
export function parseQuotaResponse(response: FetchAvailableModelsResponse): ModelQuota[] {
  const result: ModelQuota[] = [];

  for (const [modelName, modelData] of Object.entries(response.models)) {
    // Filter to only gemini/claude models
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
 * Fetches quota information from the Google Cloud Code API.
 *
 * @param input.accessToken - Valid OAuth access token
 * @param input.projectId - Google Cloud project ID
 * @param input.identity - The quota identity (antigravity or gemini-cli)
 * @param input.fetchImpl - Optional fetch implementation for testing
 * @returns Array of ModelQuota for gemini/claude models
 * @throws {QuotaError} If all endpoints fail with HTTP errors
 */
export async function fetchQuota(input: {
  accessToken: string;
  projectId: string;
  identity?: QuotaIdentity;
  fetchImpl?: FetchLike;
}): Promise<ModelQuota[]> {
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
  const endpoints = isGeminiCli
    ? RETRIEVE_USER_QUOTA_ENDPOINTS
    : FETCH_AVAILABLE_MODELS_ENDPOINTS;

  // Try each endpoint in order
  for (const endpoint of endpoints) {
    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers,
        body,
      });

      if (!res.ok) {
        // 403 should be thrown immediately - it's a real permission error
        if (res.status === 403) {
          throw new QuotaError({
            message: `Forbidden: HTTP 403`,
            status: 403,
            endpoint,
          });
        }
        // Other errors - try next endpoint
        continue;
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
      // Network error - try next endpoint
      continue;
    }
  }

  // All endpoints failed
  throw new QuotaError({
    message: "All quota endpoints failed",
    status: 0,
    endpoint: endpoints[0],
  });
}
