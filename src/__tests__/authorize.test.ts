import { it, expect } from "vitest";

import { buildAuthorizationUrl } from "../oauth/authorize.js";

it("builds antigravity auth url with required params", async () => {
  const { url } = await buildAuthorizationUrl({ identity: "antigravity" });
  const u = new URL(url);
  expect(u.host).toBe("accounts.google.com");
  expect(u.searchParams.get("client_id")).toBe("1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com");
  expect(u.searchParams.get("code_challenge")).toBeTruthy();
  expect(u.searchParams.get("access_type")).toBe("offline");
});

it("builds gemini-cli auth url with required params", async () => {
  const { url } = await buildAuthorizationUrl({ identity: "gemini-cli" });
  const u = new URL(url);
  expect(u.host).toBe("accounts.google.com");
  expect(u.searchParams.get("client_id")).toBe("681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com");
  expect(u.searchParams.get("code_challenge")).toBeTruthy();
  expect(u.searchParams.get("access_type")).toBe("offline");
});
