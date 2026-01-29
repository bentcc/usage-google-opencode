import { it, expect, describe, vi, beforeEach, afterEach } from "vitest";

import {
  runLogin,
  type LoginDeps,
  type LoginMode,
  parseCallbackCode,
} from "../commands/login.js";
import type { UsageOpencodeStore } from "../storage.js";

interface FakeCall {
  url: string;
  init: RequestInit;
}

function createFakeFetch(
  responseBody: object,
  status = 200,
): { fetch: typeof fetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const fakeFetch = async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(responseBody), { status });
  };
  return { fetch: fakeFetch as typeof fetch, calls };
}

describe("parseCallbackCode", () => {
  it("extracts code from callback URL with query params", () => {
    const url = "http://localhost:12345/callback?code=abc123&scope=email";
    const code = parseCallbackCode(url);
    expect(code).toBe("abc123");
  });

  it("returns undefined for URL without code param", () => {
    const url = "http://localhost:12345/callback?error=access_denied";
    const code = parseCallbackCode(url);
    expect(code).toBeUndefined();
  });

  it("handles full redirect URL from paste", () => {
    const url = "http://localhost:54321/?code=xyz789";
    const code = parseCallbackCode(url);
    expect(code).toBe("xyz789");
  });
});

describe("runLogin", () => {
  let savedStore: UsageOpencodeStore | null = null;

  const createMockDeps = (overrides?: Partial<LoginDeps>): LoginDeps => {
    const mockStore: UsageOpencodeStore = { version: 1, accounts: [] };

    return {
      loadStore: vi.fn().mockResolvedValue(mockStore),
      saveStore: vi.fn().mockImplementation(async (_opts, store) => {
        savedStore = store;
      }),
      buildAuthorizationUrl: vi.fn().mockResolvedValue({
        url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
        verifier: "test-verifier",
      }),
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 3600000,
      }),
      fetchUserEmail: vi.fn().mockResolvedValue("user@example.com"),
      startCallbackServer: vi.fn().mockResolvedValue({
        port: 12345,
        waitForCallback: () => Promise.resolve("http://localhost:12345/?code=auth-code"),
        close: vi.fn(),
      }),
      openBrowser: vi.fn().mockResolvedValue(undefined),
      prompt: vi.fn().mockResolvedValue(""),
      selectMode: vi.fn().mockResolvedValue("both"),
      log: vi.fn(),
      ...overrides,
    };
  };

  beforeEach(() => {
    savedStore = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists refresh token to storage for antigravity identity", async () => {
    const deps = createMockDeps();

    const result = await runLogin({
      mode: "antigravity",
      deps,
    });

    expect(result.success).toBe(true);
    expect(result.email).toBe("user@example.com");
    expect(deps.saveStore).toHaveBeenCalled();

    // Verify the stored account has antigravity refresh token
    expect(savedStore).toBeDefined();
    expect(savedStore!.accounts).toHaveLength(1);
    expect(savedStore!.accounts[0].email).toBe("user@example.com");
    expect(savedStore!.accounts[0].antigravity?.refreshToken).toBe("refresh-token");
  });

  it("persists refresh token for gemini-cli identity", async () => {
    const deps = createMockDeps();

    const result = await runLogin({
      mode: "gemini-cli",
      deps,
    });

    expect(result.success).toBe(true);
    expect(savedStore!.accounts[0].geminiCli?.refreshToken).toBe("refresh-token");
  });

  it("handles both mode by logging in twice", async () => {
    const buildAuthCalls: string[] = [];
    const deps = createMockDeps({
      buildAuthorizationUrl: vi.fn().mockImplementation(({ identity }) => {
        buildAuthCalls.push(identity);
        return Promise.resolve({
          url: `https://accounts.google.com/auth?identity=${identity}`,
          verifier: `verifier-${identity}`,
        });
      }),
    });

    const result = await runLogin({
      mode: "both",
      deps,
    });

    expect(result.success).toBe(true);
    // Should have called buildAuthorizationUrl twice
    expect(buildAuthCalls).toContain("antigravity");
    expect(buildAuthCalls).toContain("gemini-cli");
    // Should have both tokens stored
    expect(savedStore!.accounts[0].antigravity?.refreshToken).toBe("refresh-token");
    expect(savedStore!.accounts[0].geminiCli?.refreshToken).toBe("refresh-token");
  });

  it("passes oauth clients from store to auth and token exchange", async () => {
    const deps = createMockDeps({
      loadStore: vi.fn().mockResolvedValue({
        version: 1,
        accounts: [],
        oauthClients: {
          antigravity: { clientId: "client-id", clientSecret: "client-secret" },
        },
      }),
    });

    await runLogin({ mode: "antigravity", deps });

    expect(deps.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        oauthClient: { clientId: "client-id", clientSecret: "client-secret" },
      }),
    );
    expect(deps.exchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({
        oauthClient: { clientId: "client-id", clientSecret: "client-secret" },
      }),
    );
  });

  it("uses callback server to receive auth code", async () => {
    const serverClosed = vi.fn();
    const deps = createMockDeps({
      startCallbackServer: vi.fn().mockResolvedValue({
        port: 54321,
        waitForCallback: () => Promise.resolve("http://localhost:54321/?code=server-code"),
        close: serverClosed,
      }),
    });

    await runLogin({ mode: "antigravity", deps });

    // Verify server was started and closed
    expect(deps.startCallbackServer).toHaveBeenCalled();
    expect(serverClosed).toHaveBeenCalled();

    // Verify exchangeCode was called with the code from server
    expect(deps.exchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "server-code",
      }),
    );
  });

  it("falls back to paste mode when server callback times out", async () => {
    const deps = createMockDeps({
      startCallbackServer: vi.fn().mockResolvedValue({
        port: 12345,
        waitForCallback: () => Promise.reject(new Error("timeout")),
        close: vi.fn(),
      }),
      prompt: vi.fn().mockResolvedValue("http://localhost:12345/?code=pasted-code"),
    });

    await runLogin({ mode: "antigravity", deps });

    // Should have prompted user for URL
    expect(deps.prompt).toHaveBeenCalled();
    // Should use pasted code
    expect(deps.exchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "pasted-code",
      }),
    );
  });

  it("returns error when exchange fails", async () => {
    const deps = createMockDeps({
      exchangeCode: vi.fn().mockRejectedValue(new Error("invalid_grant")),
    });

    const result = await runLogin({ mode: "antigravity", deps });

    expect(result.success).toBe(false);
    expect(result.error).toContain("invalid_grant");
  });

  it("opens browser with auth URL", async () => {
    const deps = createMockDeps();

    await runLogin({ mode: "antigravity", deps });

    expect(deps.openBrowser).toHaveBeenCalledWith(
      expect.stringContaining("accounts.google.com"),
    );
  });

  it("logs progress messages", async () => {
    const logs: string[] = [];
    const deps = createMockDeps({
      log: vi.fn().mockImplementation((msg) => logs.push(msg)),
    });

    await runLogin({ mode: "antigravity", deps });

    expect(logs.some((l) => l.includes("antigravity"))).toBe(true);
    expect(logs.some((l) => l.includes("user@example.com"))).toBe(true);
  });

  it("handles partial success in both mode (one identity fails, one succeeds)", async () => {
    let callCount = 0;
    const deps = createMockDeps({
      exchangeCode: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First identity (antigravity) fails
          return Promise.reject(new Error("antigravity_failed"));
        }
        // Second identity (gemini-cli) succeeds
        return Promise.resolve({
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresAt: Date.now() + 3600000,
        });
      }),
    });

    const result = await runLogin({ mode: "both", deps });

    // Should succeed because one identity worked
    expect(result.success).toBe(true);
    expect(result.identitiesCompleted).toContain("gemini-cli");
    expect(result.identitiesCompleted).not.toContain("antigravity");
    // Should have saved with only gemini-cli token
    expect(savedStore!.accounts[0].geminiCli?.refreshToken).toBe("refresh-token");
    expect(savedStore!.accounts[0].antigravity).toBeUndefined();
  });

  it("returns error when fetchUserEmail fails", async () => {
    const deps = createMockDeps({
      fetchUserEmail: vi.fn().mockRejectedValue(new Error("email_fetch_failed")),
    });

    const result = await runLogin({ mode: "antigravity", deps });

    expect(result.success).toBe(false);
    expect(result.error).toContain("email_fetch_failed");
  });

  it("uses selectMode when mode not provided", async () => {
    const deps = createMockDeps({
      selectMode: vi.fn().mockResolvedValue("antigravity"),
    });

    const result = await runLogin({ deps });

    expect(deps.selectMode).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.identitiesCompleted).toEqual(["antigravity"]);
  });
});
