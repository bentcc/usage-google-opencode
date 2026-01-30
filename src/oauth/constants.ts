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

/**
 * OAuth Client Credentials for Google Cloud Code Assist
 * 
 * These are the official client credentials extracted from:
 * - Antigravity Login (IDE Quota): Uses credentials from the Antigravity IDE
 * - Gemini CLI Login (Developer/GCloud Quota): Uses credentials from the Google Cloud SDK / Gemini CLI
 */
export const OAUTH_CLIENTS: Record<QuotaIdentity, OAuthClientConfig> = {
  antigravity: {
    clientId: "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
    clientSecret: "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",
  },
  "gemini-cli": {
    clientId: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
    clientSecret: "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",
  },
};

export function getOAuthClient(identity: QuotaIdentity): OAuthClientConfig {
  return OAUTH_CLIENTS[identity];
}
