/**
 * Fetch user email from Google userinfo endpoint.
 * Used for labeling accounts after OAuth login.
 */

export const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v1/userinfo";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class UserInfoError extends Error {
  readonly name = "UserInfoError";
  readonly status: number;
  readonly endpoint: string;

  constructor(input: { message: string; status: number; endpoint: string }) {
    super(input.message);
    this.status = input.status;
    this.endpoint = input.endpoint;
  }
}

interface UserInfoResponse {
  id?: string;
  email?: string;
  verified_email?: boolean;
  name?: string;
  picture?: string;
}

async function readJsonSafe(res: Response): Promise<UserInfoResponse | undefined> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as UserInfoResponse;
  } catch {
    return undefined;
  }
}

/**
 * Fetches user email from Google userinfo endpoint.
 *
 * @param input.accessToken - Valid OAuth access token
 * @param input.fetchImpl - Optional fetch implementation for testing
 * @returns The user's email address
 * @throws {UserInfoError} If the request fails or email is missing
 */
export async function fetchUserEmail(input: {
  accessToken: string;
  fetchImpl?: FetchLike;
}): Promise<string> {
  const fetchImpl = input.fetchImpl ?? fetch;

  const url = `${GOOGLE_USERINFO_ENDPOINT}?alt=json`;
  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  const json = await readJsonSafe(res);

  if (!res.ok) {
    throw new UserInfoError({
      message: `Failed to fetch user info: HTTP ${res.status}`,
      status: res.status,
      endpoint: GOOGLE_USERINFO_ENDPOINT,
    });
  }

  if (!json?.email || typeof json.email !== "string") {
    throw new UserInfoError({
      message: "User info response missing email",
      status: 200,
      endpoint: GOOGLE_USERINFO_ENDPOINT,
    });
  }

  return json.email;
}
