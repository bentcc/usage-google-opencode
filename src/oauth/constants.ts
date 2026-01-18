export type QuotaIdentity = "antigravity" | "gemini-cli";

type OAuthClientConfig = {
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
