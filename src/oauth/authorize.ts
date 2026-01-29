import { generatePKCE } from "@openauthjs/openauth/pkce";

import {
  DEFAULT_REDIRECT_URI,
  GOOGLE_OAUTH_AUTHORIZATION_ENDPOINT,
  GOOGLE_OAUTH_SCOPES,
  getOAuthClient,
  type OAuthClientConfig,
  type QuotaIdentity,
} from "./constants.js";

type PkcePair = {
  challenge: string;
  verifier: string;
};

export async function buildAuthorizationUrl(input: {
  identity: QuotaIdentity;
  redirectUri?: string;
  oauthClient?: OAuthClientConfig;
}): Promise<{ url: string; verifier: string }> {
  const pkce = (await generatePKCE()) as PkcePair;
  const client = getOAuthClient(input.identity, input.oauthClient);

  const url = new URL(GOOGLE_OAUTH_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", client.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri ?? DEFAULT_REDIRECT_URI);
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return { url: url.toString(), verifier: pkce.verifier };
}
