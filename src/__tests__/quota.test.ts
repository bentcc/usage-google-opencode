import { it, expect, describe } from "vitest";

import {
  parseQuotaResponse,
  fetchQuota,
  QuotaError,
  FETCH_AVAILABLE_MODELS_ENDPOINTS,
  RETRIEVE_USER_QUOTA_ENDPOINT,
} from "../google/quota.js";

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

describe("parseQuotaResponse", () => {
  it("converts remainingFraction to percent and keeps resetTime for gemini/claude models", () => {
    // Arrange
    const apiResponse = {
      models: {
        "gemini-3-pro": {
          quotaInfo: { remainingFraction: 0.42, resetTime: "2026-01-18T00:00:00Z" },
        },
        "other-model": {
          quotaInfo: { remainingFraction: 0.9, resetTime: "x" },
        },
        "claude-opus-4": {
          quotaInfo: { remainingFraction: 0.75, resetTime: "2026-01-19T12:00:00Z" },
        },
      },
    };

    // Act
    const parsed = parseQuotaResponse(apiResponse);

    // Assert - only gemini and claude models included
    expect(parsed).toHaveLength(2);
    expect(parsed).toContainEqual({
      model: "gemini-3-pro",
      remainingPercent: 42,
      resetTime: "2026-01-18T00:00:00Z",
    });
    expect(parsed).toContainEqual({
      model: "claude-opus-4",
      remainingPercent: 75,
      resetTime: "2026-01-19T12:00:00Z",
    });
  });

  it("includes image and imagen models in the filter", () => {
    // Arrange
    const apiResponse = {
      models: {
        "gemini-flash": {
          quotaInfo: { remainingFraction: 0.5, resetTime: "t1" },
        },
        "imagen-3": {
          quotaInfo: { remainingFraction: 0.8, resetTime: "t2" },
        },
        "image-generation-model": {
          quotaInfo: { remainingFraction: 0.6, resetTime: "t3" },
        },
        "unrelated-model": {
          quotaInfo: { remainingFraction: 1.0, resetTime: "t4" },
        },
      },
    };

    // Act
    const parsed = parseQuotaResponse(apiResponse);

    // Assert - gemini, imagen, image included; unrelated excluded
    expect(parsed).toHaveLength(3);
    expect(parsed.map((m) => m.model).sort()).toEqual([
      "gemini-flash",
      "image-generation-model",
      "imagen-3",
    ]);
  });

  it("handles missing quotaInfo gracefully", () => {
    // Arrange
    const apiResponse = {
      models: {
        "gemini-flash": {},
        "gemini-pro": { quotaInfo: { remainingFraction: 1.0, resetTime: "soon" } },
      },
    };

    // Act
    const parsed = parseQuotaResponse(apiResponse);

    // Assert - model without quotaInfo defaults to 0%
    expect(parsed).toContainEqual({
      model: "gemini-flash",
      remainingPercent: 0,
      resetTime: "",
    });
    expect(parsed).toContainEqual({
      model: "gemini-pro",
      remainingPercent: 100,
      resetTime: "soon",
    });
  });

  it("returns empty array when no models present", () => {
    // Arrange
    const apiResponse = { models: {} };

    // Act
    const parsed = parseQuotaResponse(apiResponse);

    // Assert
    expect(parsed).toEqual([]);
  });
});

describe("fetchQuota", () => {
  it("sends POST request with project and Authorization header", async () => {
    // Arrange
    const apiResponse = {
      models: {
        "gemini-pro": {
          quotaInfo: { remainingFraction: 0.5, resetTime: "2026-01-20T00:00:00Z" },
        },
      },
    };
    const { fetch: fakeFetch, calls } = createFakeFetch(apiResponse);

    // Act
    const result = await fetchQuota({
      accessToken: "test-token",
      projectId: "my-project",
      fetchImpl: fakeFetch,
    });

    // Assert - verify request (uses prod endpoint only)
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(FETCH_AVAILABLE_MODELS_ENDPOINTS[0]);
    expect(calls[0].init.method).toBe("POST");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-token");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(calls[0].init.body as string);
    expect(body.project).toBe("my-project");

    // Assert - verify parsed result
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      model: "gemini-pro",
      remainingPercent: 50,
      resetTime: "2026-01-20T00:00:00Z",
    });
  });

  it("throws QuotaError with Forbidden message on 403 response", async () => {
    // Arrange
    const { fetch: fakeFetch } = createFakeFetch({ error: "forbidden" }, 403);

    // Act & Assert - 403 should throw immediately with "Forbidden"
    await expect(
      fetchQuota({
        accessToken: "bad-token",
        projectId: "project",
        fetchImpl: fakeFetch,
      }),
    ).rejects.toThrow("Forbidden");

    try {
      await fetchQuota({
        accessToken: "bad-token",
        projectId: "project",
        fetchImpl: fakeFetch,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(QuotaError);
      expect((err as QuotaError).status).toBe(403);
    }
  });

  it("includes Electron-style User-Agent for antigravity (no X-Goog-Api-Client)", async () => {
    // Arrange
    const apiResponse = { models: {} };
    const { fetch: fakeFetch, calls } = createFakeFetch(apiResponse);

    // Act
    await fetchQuota({
      accessToken: "test-token",
      projectId: "my-project",
      identity: "antigravity",
      fetchImpl: fakeFetch,
    });

    // Assert - verify Electron-style User-Agent matching Antigravity-Manager
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("Antigravity/");
    expect(headers["User-Agent"]).toContain("Chrome/");
    expect(headers["User-Agent"]).toContain("Electron/");
    // Should NOT have X-Goog-Api-Client or Client-Metadata
    expect(headers["X-Goog-Api-Client"]).toBeUndefined();
    expect(headers["Client-Metadata"]).toBeUndefined();
  });

  it("includes GeminiCLI-style User-Agent for gemini-cli (no X-Goog-Api-Client or Client-Metadata)", async () => {
    // Arrange
    const apiResponse = { buckets: [] };
    const { fetch: fakeFetch, calls } = createFakeFetch(apiResponse);

    // Act
    await fetchQuota({
      accessToken: "test-token",
      projectId: "my-project",
      identity: "gemini-cli",
      fetchImpl: fakeFetch,
    });

    // Assert - verify GeminiCLI-style User-Agent matching real gemini-cli
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("GeminiCLI/");
    expect(headers["User-Agent"]).toContain(process.platform);
    expect(headers["User-Agent"]).toContain(process.arch);
    // Should NOT have X-Goog-Api-Client or Client-Metadata (real CLI doesn't use these)
    expect(headers["X-Goog-Api-Client"]).toBeUndefined();
    expect(headers["Client-Metadata"]).toBeUndefined();
  });

  it("uses retrieveUserQuota prod endpoint for gemini-cli and parses bucket models", async () => {
    // Arrange
    const apiResponse = {
      buckets: [
        {
          modelId: "gemini-2.5-flash",
          remainingAmount: "500",
          remainingFraction: 0.5,
          resetTime: "2026-01-30T10:52:51Z",
        },
      ],
    };
    const { fetch: fakeFetch, calls } = createFakeFetch(apiResponse);

    // Act
    const result = await fetchQuota({
      accessToken: "test-token",
      projectId: "my-project",
      identity: "gemini-cli",
      fetchImpl: fakeFetch,
    });

    // Assert - endpoint should be the prod retrieveUserQuota endpoint
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(RETRIEVE_USER_QUOTA_ENDPOINT);

    // Assert - parsed result from buckets
    expect(result).toEqual([
      {
        model: "gemini-2.5-flash",
        remainingPercent: 50,
        resetTime: "2026-01-30T10:52:51Z",
      },
    ]);
  });

  it("retries on non-403 HTTP errors for antigravity identity", async () => {
    // Arrange - first two calls return 500, third returns success
    let callCount = 0;
    const calls: FakeCall[] = [];
    const fakeFetch = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      callCount++;
      if (callCount <= 2) {
        return new Response("Server error", { status: 500 });
      }
      return new Response(JSON.stringify({
        models: {
          "gemini-pro": {
            quotaInfo: { remainingFraction: 0.8, resetTime: "2026-02-01T00:00:00Z" },
          },
        },
      }), { status: 200 });
    };

    // Act
    const result = await fetchQuota({
      accessToken: "test-token",
      projectId: "my-project",
      identity: "antigravity",
      fetchImpl: fakeFetch as typeof fetch,
    });

    // Assert - retried and eventually succeeded
    expect(calls).toHaveLength(3);
    expect(result).toHaveLength(1);
    expect(result[0].model).toBe("gemini-pro");
  });

  it("does not retry on 403 for antigravity identity", async () => {
    // Arrange
    const calls: FakeCall[] = [];
    const fakeFetch = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    };

    // Act & Assert - 403 throws immediately, no retry
    await expect(
      fetchQuota({
        accessToken: "test-token",
        projectId: "my-project",
        identity: "antigravity",
        fetchImpl: fakeFetch as typeof fetch,
      }),
    ).rejects.toThrow("Forbidden");

    // Should only have made 1 call (no retries for 403)
    expect(calls).toHaveLength(1);
  });

  it("retries on non-403 HTTP errors for gemini-cli identity", async () => {
    // Arrange - first two calls return 500, third returns success
    let callCount = 0;
    const calls: FakeCall[] = [];
    const fakeFetch = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      callCount++;
      if (callCount <= 2) {
        return new Response("Server error", { status: 500 });
      }
      return new Response(JSON.stringify({
        buckets: [
          {
            modelId: "gemini-2.5-flash",
            remainingAmount: "800",
            remainingFraction: 0.8,
            resetTime: "2026-02-01T00:00:00Z",
          },
        ],
      }), { status: 200 });
    };

    // Act
    const result = await fetchQuota({
      accessToken: "test-token",
      projectId: "my-project",
      identity: "gemini-cli",
      fetchImpl: fakeFetch as typeof fetch,
    });

    // Assert - retried and eventually succeeded, all hits same prod endpoint
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.url === RETRIEVE_USER_QUOTA_ENDPOINT)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].model).toBe("gemini-2.5-flash");
  });

  it("does not retry on 403 for gemini-cli identity", async () => {
    // Arrange
    const calls: FakeCall[] = [];
    const fakeFetch = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    };

    // Act & Assert - 403 throws immediately, no retry
    await expect(
      fetchQuota({
        accessToken: "test-token",
        projectId: "my-project",
        identity: "gemini-cli",
        fetchImpl: fakeFetch as typeof fetch,
      }),
    ).rejects.toThrow("Forbidden");

    // Should only have made 1 call (no retries for 403)
    expect(calls).toHaveLength(1);
  });
});
