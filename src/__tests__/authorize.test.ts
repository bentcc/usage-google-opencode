import { it, expect } from "vitest";

import { buildAuthorizationUrl } from "../oauth/authorize.js";

it("builds antigravity auth url with required params", async () => {
  const { url } = await buildAuthorizationUrl({ identity: "antigravity" });
  const u = new URL(url);
  expect(u.host).toBe("accounts.google.com");
  expect(u.searchParams.get("client_id")).toBeTruthy();
  expect(u.searchParams.get("code_challenge")).toBeTruthy();
  expect(u.searchParams.get("access_type")).toBe("offline");
});

it("uses oauth client override when provided", async () => {
  const { url } = await buildAuthorizationUrl({
    identity: "antigravity",
    oauthClient: { clientId: "override-client", clientSecret: "override-secret" },
  });

  const u = new URL(url);
  expect(u.searchParams.get("client_id")).toBe("override-client");
});
