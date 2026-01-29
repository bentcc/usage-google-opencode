export type QuotaIdentity = "antigravity" | "gemini-cli";

export type OAuthClientConfig = {
  clientId: string;
  clientSecret: string;
};

export const GOOGLE_OAUTH_AUTHORIZATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";

// Keep this simple for now; Task 8 will likely provide a real localhost callback.
export const DEFAULT_REDIRECT_URI = "http://localhost";

export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
] as const;

export const OAUTH_CLIENTS: Record<QuotaIdentity, OAuthClientConfig> = {
  antigravity: {
    clientId: "ANTIGRAVITY_CLIENT_ID_PLACEHOLDER",
    clientSecret: "ANTIGRAVITY_CLIENT_SECRET_PLACEHOLDER",
  },
  "gemini-cli": {
    clientId: "GEMINI_CLI_CLIENT_ID_PLACEHOLDER",
    clientSecret: "GEMINI_CLI_CLIENT_SECRET_PLACEHOLDER",
  },
};

const OAUTH_ENV_VARS: Record<QuotaIdentity, { clientId: string; clientSecret: string }> = {
  antigravity: {
    clientId: "USAGE_OAUTH_ANTIGRAVITY_CLIENT_ID",
    clientSecret: "USAGE_OAUTH_ANTIGRAVITY_CLIENT_SECRET",
  },
  "gemini-cli": {
    clientId: "USAGE_OAUTH_GEMINI_CLI_CLIENT_ID",
    clientSecret: "USAGE_OAUTH_GEMINI_CLI_CLIENT_SECRET",
  },
};

export function getOAuthClient(
  identity: QuotaIdentity,
  override?: OAuthClientConfig,
): OAuthClientConfig {
  const envKeys = OAUTH_ENV_VARS[identity];
  const envClientId = process.env[envKeys.clientId];
  const envClientSecret = process.env[envKeys.clientSecret];

  const overrideClientId = override?.clientId?.trim();
  const overrideClientSecret = override?.clientSecret?.trim();

  return {
    clientId:
      overrideClientId ?? envClientId ?? OAUTH_CLIENTS[identity].clientId,
    clientSecret:
      overrideClientSecret ?? envClientSecret ?? OAUTH_CLIENTS[identity].clientSecret,
  };
}
