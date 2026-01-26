import { it, expect, describe } from "vitest";

import {
  parseQuotaResponse,
  fetchQuota,
  QuotaError,
  FETCH_AVAILABLE_MODELS_ENDPOINT,
} from "../google/quota";

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

    // Assert - verify request
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(FETCH_AVAILABLE_MODELS_ENDPOINT);
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

  it("throws QuotaError on non-ok response", async () => {
    // Arrange
    const { fetch: fakeFetch } = createFakeFetch({ error: "forbidden" }, 403);

    // Act & Assert
    await expect(
      fetchQuota({
        accessToken: "bad-token",
        projectId: "project",
        fetchImpl: fakeFetch,
      }),
    ).rejects.toThrow("Failed to fetch quota");

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
});
