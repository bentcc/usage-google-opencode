import { getOAuthClient, type OAuthClientConfig, type QuotaIdentity } from "./constants.js";

export const GOOGLE_OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class OAuthTokenError extends Error {
  readonly name = "OAuthTokenError";
  readonly status: number;
  readonly endpoint: string;
  readonly error?: string;
  readonly errorDescription?: string;

  constructor(input: {
    message: string;
    status: number;
    endpoint: string;
    error?: string;
    errorDescription?: string;
  }) {
    super(input.message);
    this.status = input.status;
    this.endpoint = input.endpoint;
    this.error = input.error;
    this.errorDescription = input.errorDescription;
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function toExpiresAt(expiresInSeconds: number): number {
  // store as unix seconds (easy to compare and serialize)
  return nowSeconds() + expiresInSeconds;
}

async function readJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function buildFormBody(params: Record<string, string>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) sp.set(k, v);
  return sp.toString();
}

async function postToken(input: {
  fetchImpl: FetchLike;
  form: Record<string, string>;
}): Promise<any> {
  const res = await input.fetchImpl(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: buildFormBody(input.form),
  });

  const json = await readJsonSafe(res);

  if (!res.ok) {
    throw new OAuthTokenError({
      message: "OAuth token request failed",
      status: res.status,
      endpoint: GOOGLE_OAUTH_TOKEN_ENDPOINT,
      error: json?.error,
      errorDescription: json?.error_description,
    });
  }

  return json;
}

export async function exchangeCode(input: {
  identity: QuotaIdentity;
  code: string;
  verifier: string;
  redirectUri: string;
  oauthClient?: OAuthClientConfig;
  fetchImpl?: FetchLike;
}): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const client = getOAuthClient(input.identity, input.oauthClient);

  const json = await postToken({
    fetchImpl,
    form: {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.verifier,
      redirect_uri: input.redirectUri,
    },
  });

  if (!json?.access_token || typeof json.access_token !== "string") {
    throw new OAuthTokenError({
      message: "OAuth token response missing access_token",
      status: 200,
      endpoint: GOOGLE_OAUTH_TOKEN_ENDPOINT,
    });
  }
  if (!json?.refresh_token || typeof json.refresh_token !== "string") {
    throw new OAuthTokenError({
      message: "OAuth token response missing refresh_token",
      status: 200,
      endpoint: GOOGLE_OAUTH_TOKEN_ENDPOINT,
    });
  }

  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: toExpiresAt(expiresIn),
  };
}

export async function refreshAccessToken(input: {
  identity: QuotaIdentity;
  refreshToken: string;
  oauthClient?: OAuthClientConfig;
  fetchImpl?: FetchLike;
}): Promise<{ accessToken: string; expiresAt: number }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const client = getOAuthClient(input.identity, input.oauthClient);

  const json = await postToken({
    fetchImpl,
    form: {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    },
  });

  if (!json?.access_token || typeof json.access_token !== "string") {
    throw new OAuthTokenError({
      message: "OAuth token response missing access_token",
      status: 200,
      endpoint: GOOGLE_OAUTH_TOKEN_ENDPOINT,
    });
  }

  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;

  return {
    accessToken: json.access_token,
    expiresAt: toExpiresAt(expiresIn),
  };
}
