/**
 * Quota fetching from Google Cloud Code API.
 * Parses model quota information and filters to relevant models.
 */

export const FETCH_AVAILABLE_MODELS_ENDPOINT =
  "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";

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
 * Models to include in quota reports (gemini or claude).
 */
const MODEL_FILTER_PATTERN = /gemini|claude/i;

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

async function readJsonSafe(res: Response): Promise<FetchAvailableModelsResponse | undefined> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as FetchAvailableModelsResponse;
  } catch {
    return undefined;
  }
}

/**
 * Fetches quota information from the Google Cloud Code API.
 *
 * @param input.accessToken - Valid OAuth access token
 * @param input.projectId - Google Cloud project ID
 * @param input.fetchImpl - Optional fetch implementation for testing
 * @returns Array of ModelQuota for gemini/claude models
 * @throws {QuotaError} If the request fails
 */
export async function fetchQuota(input: {
  accessToken: string;
  projectId: string;
  fetchImpl?: FetchLike;
}): Promise<ModelQuota[]> {
  const fetchImpl = input.fetchImpl ?? fetch;

  const res = await fetchImpl(FETCH_AVAILABLE_MODELS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ project: input.projectId }),
  });

  const json = await readJsonSafe(res);

  if (!res.ok) {
    throw new QuotaError({
      message: `Failed to fetch quota: HTTP ${res.status}`,
      status: res.status,
      endpoint: FETCH_AVAILABLE_MODELS_ENDPOINT,
    });
  }

  if (!json?.models) {
    return [];
  }

  return parseQuotaResponse(json);
}
