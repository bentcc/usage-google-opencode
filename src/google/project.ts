/**
 * Project ID discovery from Google Cloud Code API.
 * Used when no project ID is stored for an account.
 */

export const LOAD_CODE_ASSIST_ENDPOINT =
  "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";

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

interface LoadCodeAssistResponse {
  projectId?: string;
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
 * Ensures a project ID is available, discovering it if necessary.
 *
 * @param input.accessToken - Valid OAuth access token
 * @param input.projectId - Optional existing project ID (skips discovery if provided)
 * @param input.fetchImpl - Optional fetch implementation for testing
 * @returns The project ID (provided or discovered)
 * @throws {ProjectError} If discovery fails or no project ID found
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

  const res = await fetchImpl(LOAD_CODE_ASSIST_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ metadata: {} }),
  });

  const json = await readJsonSafe(res);

  if (!res.ok) {
    throw new ProjectError({
      message: `Failed to discover project: HTTP ${res.status}`,
      status: res.status,
      endpoint: LOAD_CODE_ASSIST_ENDPOINT,
    });
  }

  if (!json?.projectId || typeof json.projectId !== "string") {
    throw new ProjectError({
      message: "Response missing projectId",
      status: 200,
      endpoint: LOAD_CODE_ASSIST_ENDPOINT,
    });
  }

  return json.projectId;
}
