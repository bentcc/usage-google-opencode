/**
 * Project ID discovery from Google Cloud Code API.
 * Used when no project ID is stored for an account.
 */

/**
 * Endpoints to try for loadCodeAssist, in order.
 * Production endpoint is most reliable for project resolution.
 */
export const LOAD_CODE_ASSIST_ENDPOINTS = [
  "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist",
  "https://autopush-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist",
] as const;

/**
 * Fallback project ID when no project can be discovered.
 * This is a known working project ID from the Antigravity ecosystem.
 */
export const DEFAULT_PROJECT_ID = "rising-fact-p41fc";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Error thrown when project discovery fails.
 */
export class ProjectError extends Error {
  readonly name = "ProjectError";
  readonly status: number;
  readonly endpoint: string;

  constructor(input: { message: string; status: number; endpoint: string }) {
    super(input.message);
    this.status = input.status;
    this.endpoint = input.endpoint;
  }
}

/**
 * Response from loadCodeAssist endpoint.
 * cloudaicompanionProject can be either a string or an object with .id property.
 */
interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string | { id?: string };
  projectId?: string; // Some responses use this directly
}

/**
 * Extracts the project ID from a loadCodeAssist response.
 */
function extractProjectId(json: LoadCodeAssistResponse | undefined): string | undefined {
  if (!json) return undefined;
  
  // Try direct projectId field first
  if (json.projectId && typeof json.projectId === "string") {
    return json.projectId;
  }
  
  // Try cloudaicompanionProject (can be string or object)
  if (json.cloudaicompanionProject) {
    if (typeof json.cloudaicompanionProject === "string") {
      return json.cloudaicompanionProject;
    }
    if (typeof json.cloudaicompanionProject === "object" && json.cloudaicompanionProject.id) {
      return json.cloudaicompanionProject.id;
    }
  }
  
  return undefined;
}

async function readJsonSafe(res: Response): Promise<LoadCodeAssistResponse | undefined> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as LoadCodeAssistResponse;
  } catch {
    return undefined;
  }
}

/**
 * Request headers for loadCodeAssist to match the working implementation.
 */
function buildHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "google-api-nodejs-client/9.15.1",
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Client-Metadata": '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
  };
}

/**
 * Ensures a project ID is available, discovering it if necessary.
 *
 * @param input.accessToken - Valid OAuth access token
 * @param input.projectId - Optional existing project ID (skips discovery if provided)
 * @param input.fetchImpl - Optional fetch implementation for testing
 * @returns The project ID (provided, discovered, or default fallback)
 * @throws {ProjectError} If all endpoints fail with HTTP errors
 */
export async function ensureProjectId(input: {
  accessToken: string;
  projectId?: string;
  fetchImpl?: FetchLike;
}): Promise<string> {
  // If projectId already provided, return it without API call
  if (input.projectId) {
    return input.projectId;
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = buildHeaders(input.accessToken);
  const body = JSON.stringify({
    metadata: {
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    },
  });

  // Try each endpoint in order
  for (const endpoint of LOAD_CODE_ASSIST_ENDPOINTS) {
    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers,
        body,
      });

      if (!res.ok) {
        // Try next endpoint on failure
        continue;
      }

      const json = await readJsonSafe(res);
      const projectId = extractProjectId(json);
      
      if (projectId) {
        return projectId;
      }
      // Response was OK but no project ID - try next endpoint
    } catch {
      // Network error - try next endpoint
      continue;
    }
  }

  // All endpoints failed or returned no project ID - use default
  return DEFAULT_PROJECT_ID;
}
