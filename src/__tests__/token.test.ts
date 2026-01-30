import { it, expect } from "vitest";

import { exchangeCode, refreshAccessToken } from "../oauth/token.js";

it("exchanges code via oauth2.googleapis.com/token", async () => {
  const calls: any[] = [];
  const fakeFetch = async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        access_token: "a",
        expires_in: 3600,
        refresh_token: "r",
      }),
      { status: 200 },
    );
  };

  const res = await exchangeCode({
    identity: "antigravity",
    code: "c",
    verifier: "v",
    redirectUri: "http://localhost:1234/callback",
    fetchImpl: fakeFetch as any,
  });

  expect(res.refreshToken).toBe("r");
  expect(res.accessToken).toBe("a");
  expect(typeof res.expiresAt).toBe("number");

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
  expect(calls[0].init.method).toBe("POST");

  const headers = calls[0].init.headers as Record<string, string>;
  expect(headers["content-type"]).toContain("application/x-www-form-urlencoded");

  const body = String(calls[0].init.body);
  expect(body).toContain("grant_type=authorization_code");
  expect(body).toContain("code=c");
  expect(body).toContain("code_verifier=v");
  expect(body).toContain(
    "redirect_uri=" + encodeURIComponent("http://localhost:1234/callback"),
  );
});

it("refreshes access token and does not require refresh_token in response", async () => {
  const calls: any[] = [];
  const fakeFetch = async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ access_token: "a2", expires_in: 120 }), {
      status: 200,
    });
  };

  const res = await refreshAccessToken({
    identity: "gemini-cli",
    refreshToken: "rt",
    fetchImpl: fakeFetch as any,
  });

  expect(res.accessToken).toBe("a2");
  expect(typeof res.expiresAt).toBe("number");

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");

  const body = String(calls[0].init.body);
  expect(body).toContain("grant_type=refresh_token");
  expect(body).toContain("refresh_token=rt");
});

it("uses hardcoded antigravity credentials", async () => {
  const calls: any[] = [];
  const fakeFetch = async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        access_token: "a",
        expires_in: 3600,
        refresh_token: "r",
      }),
      { status: 200 },
    );
  };

  await exchangeCode({
    identity: "antigravity",
    code: "c",
    verifier: "v",
    redirectUri: "http://localhost:1234/callback",
    fetchImpl: fakeFetch as any,
  });

  const body = String(calls[0].init.body);
  expect(body).toContain("client_id=1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com");
  expect(body).toContain("client_secret=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");
});

it("uses hardcoded gemini-cli credentials", async () => {
  const calls: any[] = [];
  const fakeFetch = async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        access_token: "a",
        expires_in: 3600,
        refresh_token: "r",
      }),
      { status: 200 },
    );
  };

  await exchangeCode({
    identity: "gemini-cli",
    code: "c",
    verifier: "v",
    redirectUri: "http://localhost:1234/callback",
    fetchImpl: fakeFetch as any,
  });

  const body = String(calls[0].init.body);
  expect(body).toContain("client_id=681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com");
  expect(body).toContain("client_secret=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");
});
