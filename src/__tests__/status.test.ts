import { describe, it, expect, vi } from "vitest";
import { runStatus, type StatusDeps, type AccountQuotaReport } from "../commands/status.js";
import type { UsageOpencodeStore } from "../storage.js";

describe("status command", () => {
  const createDeferred = <T,>() => {
    let resolve: (value: T) => void;
    let reject: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve: resolve!, reject: reject! };
  };
  const mockStore: UsageOpencodeStore = {
    version: 1,
    accounts: [
      {
        email: "user@example.com",
        projectId: "test-project",
        antigravity: { refreshToken: "antigravity-refresh" },
        geminiCli: { refreshToken: "gemini-refresh" },
        addedAt: 0,
        updatedAt: 0,
      },
    ],
  };

  const createMockDeps = (): StatusDeps => ({
    loadStore: vi.fn().mockResolvedValue(mockStore),
    saveStore: vi.fn().mockResolvedValue(undefined),
    refreshAccessToken: vi.fn().mockResolvedValue({
      accessToken: "mock-access-token",
      expiresAt: Date.now() / 1000 + 3600,
    }),
    ensureProjectId: vi.fn().mockResolvedValue("test-project"),
    fetchQuota: vi.fn().mockResolvedValue([
      { model: "gemini-3-pro", remainingPercent: 75, resetTime: "2026-01-18T00:00:00Z" },
      { model: "claude-opus-5", remainingPercent: 50, resetTime: "2026-01-18T12:00:00Z" },
    ]),
  });

  it("loads accounts and fetches quotas for both identities", async () => {
    const deps = createMockDeps();
    const result = await runStatus({ deps });

    expect(deps.loadStore).toHaveBeenCalledTimes(1);
    // Should refresh tokens for both antigravity and gemini-cli
    expect(deps.refreshAccessToken).toHaveBeenCalledTimes(2);
    expect(deps.fetchQuota).toHaveBeenCalledTimes(2);
  });

  it("starts identity quota fetches in parallel", async () => {
    const deps = createMockDeps();
    const tokenA = createDeferred<{ accessToken: string; expiresAt: number }>();
    const tokenB = createDeferred<{ accessToken: string; expiresAt: number }>();

    deps.refreshAccessToken = vi
      .fn()
      .mockImplementationOnce(() => tokenA.promise)
      .mockImplementationOnce(() => tokenB.promise);

    const statusPromise = runStatus({ deps });

    await Promise.resolve();

    expect(deps.refreshAccessToken).toHaveBeenCalledTimes(2);

    tokenA.resolve({ accessToken: "token-a", expiresAt: Date.now() / 1000 + 3600 });
    tokenB.resolve({ accessToken: "token-b", expiresAt: Date.now() / 1000 + 3600 });

    await statusPromise;
  });

  it("returns quota reports for each identity", async () => {
    const deps = createMockDeps();
    const result = await runStatus({ deps });

    expect(result.reports).toHaveLength(2);
    expect(result.reports[0].identity).toBe("antigravity");
    expect(result.reports[0].email).toBe("user@example.com");
    expect(result.reports[1].identity).toBe("gemini-cli");
  });

  it("renders table output by default", async () => {
    const deps = createMockDeps();
    const result = await runStatus({ deps, format: "table" });

    expect(result.output).toContain("user@example.com");
    expect(result.output).toContain("antigravity");
    expect(result.output).toContain("gemini-cli");
    expect(result.output).toContain("gemini-3-pro");
  });

  it("renders json output when format is json", async () => {
    const deps = createMockDeps();
    const result = await runStatus({ deps, format: "json" });

    const parsed = JSON.parse(result.output);
    expect(parsed.reports).toHaveLength(2);
    expect(parsed.reports[0].email).toBe("user@example.com");
    expect(parsed.errors).toHaveLength(0);
  });

  it("handles accounts with only antigravity identity", async () => {
    const partialStore: UsageOpencodeStore = {
      version: 1,
      accounts: [
        {
          email: "partial@example.com",
          projectId: "test-project",
          antigravity: { refreshToken: "antigravity-only" },
          addedAt: 0,
          updatedAt: 0,
        },
      ],
    };

    const deps = createMockDeps();
    deps.loadStore = vi.fn().mockResolvedValue(partialStore);

    const result = await runStatus({ deps });

    expect(result.reports).toHaveLength(1);
    expect(result.reports[0].identity).toBe("antigravity");
    expect(deps.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it("marks identity as needs-relogin on invalid_grant error", async () => {
    const deps = createMockDeps();
    // First call (antigravity) fails with invalid_grant, second call (gemini-cli) succeeds
    deps.refreshAccessToken = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("OAuth token request failed"), { error: "invalid_grant" })
      )
      .mockResolvedValueOnce({
        accessToken: "mock-access-token",
        expiresAt: Date.now() / 1000 + 3600,
      });

    const result = await runStatus({ deps });

    // Should have one successful report (gemini-cli) and one failed (antigravity)
    expect(result.reports.length).toBeGreaterThanOrEqual(1);
    const failed = result.errors.find((e) => e.identity === "antigravity");
    expect(failed?.needsRelogin).toBe(true);
  });

  it("returns empty reports when no accounts exist", async () => {
    const emptyStore: UsageOpencodeStore = { version: 1, accounts: [] };
    const deps = createMockDeps();
    deps.loadStore = vi.fn().mockResolvedValue(emptyStore);

    const result = await runStatus({ deps });

    expect(result.reports).toHaveLength(0);
    expect(result.output).toContain("No accounts");
  });

  it("filters by account email when specified", async () => {
    const multiStore: UsageOpencodeStore = {
      version: 1,
      accounts: [
        {
          email: "user1@example.com",
          projectId: "project-1",
          antigravity: { refreshToken: "r1" },
          addedAt: 0,
          updatedAt: 0,
        },
        {
          email: "user2@example.com",
          projectId: "project-2",
          antigravity: { refreshToken: "r2" },
          addedAt: 0,
          updatedAt: 0,
        },
      ],
    };

    const deps = createMockDeps();
    deps.loadStore = vi.fn().mockResolvedValue(multiStore);

    const result = await runStatus({ deps, accountFilter: "user1@example.com" });

    expect(result.reports).toHaveLength(1);
    expect(result.reports[0].email).toBe("user1@example.com");
  });

  it("filters by identity when specified", async () => {
    const deps = createMockDeps();
    const result = await runStatus({ deps, identityFilter: "antigravity" });

    expect(result.reports).toHaveLength(1);
    expect(result.reports[0].identity).toBe("antigravity");
  });

  it("skips refreshAccessToken when cached token is still valid", async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now
    const cachedStore: UsageOpencodeStore = {
      version: 1,
      accounts: [
        {
          email: "cached@example.com",
          projectId: "test-project",
          antigravity: {
            refreshToken: "antigravity-refresh",
            cachedAccessToken: "cached-token-ag",
            cachedExpiresAt: futureExpiry,
          },
          geminiCli: {
            refreshToken: "gemini-refresh",
            cachedAccessToken: "cached-token-gc",
            cachedExpiresAt: futureExpiry,
          },
          addedAt: 0,
          updatedAt: 0,
        },
      ],
    };

    const deps = createMockDeps();
    deps.loadStore = vi.fn().mockResolvedValue(cachedStore);

    const result = await runStatus({ deps });

    // Should NOT call refreshAccessToken at all — cached tokens are valid
    expect(deps.refreshAccessToken).toHaveBeenCalledTimes(0);
    // Should still fetch quota for both identities
    expect(deps.fetchQuota).toHaveBeenCalledTimes(2);
    expect(result.reports).toHaveLength(2);
  });

  it("refreshes token when cached token is expired", async () => {
    const pastExpiry = Math.floor(Date.now() / 1000) - 60; // expired 1 minute ago
    const expiredStore: UsageOpencodeStore = {
      version: 1,
      accounts: [
        {
          email: "expired@example.com",
          projectId: "test-project",
          antigravity: {
            refreshToken: "antigravity-refresh",
            cachedAccessToken: "old-token",
            cachedExpiresAt: pastExpiry,
          },
          addedAt: 0,
          updatedAt: 0,
        },
      ],
    };

    const deps = createMockDeps();
    deps.loadStore = vi.fn().mockResolvedValue(expiredStore);

    const result = await runStatus({ deps });

    // Should call refreshAccessToken since cached token is expired
    expect(deps.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(result.reports).toHaveLength(1);
  });

  it("persists refreshed tokens to store via saveStore", async () => {
    const deps = createMockDeps();
    await runStatus({ deps });

    // Should have called saveStore to persist the new tokens
    expect(deps.saveStore).toHaveBeenCalledTimes(1);
    const savedStore = (deps.saveStore as any).mock.calls[0][1] as UsageOpencodeStore;
    expect(savedStore.accounts[0].antigravity?.cachedAccessToken).toBe("mock-access-token");
    expect(savedStore.accounts[0].geminiCli?.cachedAccessToken).toBe("mock-access-token");
  });

  it("does not call saveStore when all tokens were cached", async () => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 7200;
    const cachedStore: UsageOpencodeStore = {
      version: 1,
      accounts: [
        {
          email: "cached@example.com",
          projectId: "test-project",
          antigravity: {
            refreshToken: "r1",
            cachedAccessToken: "cached-token",
            cachedExpiresAt: futureExpiry,
          },
          addedAt: 0,
          updatedAt: 0,
        },
      ],
    };

    const deps = createMockDeps();
    deps.loadStore = vi.fn().mockResolvedValue(cachedStore);

    await runStatus({ deps });

    // No tokens were refreshed, so no need to update store
    expect(deps.saveStore).not.toHaveBeenCalled();
  });
});
