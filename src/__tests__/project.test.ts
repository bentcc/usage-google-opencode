import { it, expect, describe } from "vitest";

import {
  ensureProjectId,
  LOAD_CODE_ASSIST_ENDPOINTS,
  DEFAULT_PROJECT_ID,
} from "../google/project.js";

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

describe("ensureProjectId", () => {
  it("returns provided projectId without making API call", async () => {
    // Arrange
    const { fetch: fakeFetch, calls } = createFakeFetch({});

    // Act
    const result = await ensureProjectId({
      accessToken: "token",
      projectId: "existing-project",
      fetchImpl: fakeFetch,
    });

    // Assert - no API call made
    expect(result).toBe("existing-project");
    expect(calls).toHaveLength(0);
  });

  it("fetches project ID from loadCodeAssist when not provided", async () => {
    // Arrange - using cloudaicompanionProject field (the real response format)
    const apiResponse = {
      cloudaicompanionProject: "discovered-project-123",
    };
    const { fetch: fakeFetch, calls } = createFakeFetch(apiResponse);

    // Act
    const result = await ensureProjectId({
      accessToken: "test-token",
      fetchImpl: fakeFetch,
    });

    // Assert - verify request uses daily sandbox first
    expect(result).toBe("discovered-project-123");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(LOAD_CODE_ASSIST_ENDPOINTS[0]);
    expect(calls[0].url).toContain("daily-cloudcode-pa.sandbox");
    expect(calls[0].init.method).toBe("POST");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-token");
    // Verify Electron-style User-Agent
    expect(headers["User-Agent"]).toContain("Antigravity/");
    expect(headers["User-Agent"]).toContain("Chrome/");
    expect(headers["User-Agent"]).toContain("Electron/");
    // Should NOT have X-Goog-Api-Client or Client-Metadata
    expect(headers["X-Goog-Api-Client"]).toBeUndefined();
    expect(headers["Client-Metadata"]).toBeUndefined();

    // Verify body uses ideType: ANTIGRAVITY
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.metadata.ideType).toBe("ANTIGRAVITY");
  });

  it("extracts projectId from cloudaicompanionProject object format", async () => {
    // Arrange - the response can also have cloudaicompanionProject as object
    const apiResponse = {
      cloudaicompanionProject: { id: "project-from-object" },
    };
    const { fetch: fakeFetch } = createFakeFetch(apiResponse);

    // Act
    const result = await ensureProjectId({
      accessToken: "test-token",
      fetchImpl: fakeFetch,
    });

    // Assert
    expect(result).toBe("project-from-object");
  });

  it("falls back to DEFAULT_PROJECT_ID when all endpoints fail", async () => {
    // Arrange - all endpoints return 403
    const { fetch: fakeFetch, calls } = createFakeFetch({ error: "forbidden" }, 403);

    // Act
    const result = await ensureProjectId({
      accessToken: "bad-token",
      fetchImpl: fakeFetch,
    });

    // Assert - tried all endpoints, returned default
    expect(result).toBe(DEFAULT_PROJECT_ID);
    expect(result).toBe("bamboo-precept-lgxtn");
    expect(calls.length).toBe(LOAD_CODE_ASSIST_ENDPOINTS.length);
  });

  it("falls back to DEFAULT_PROJECT_ID when projectId missing from response", async () => {
    // Arrange
    const { fetch: fakeFetch } = createFakeFetch({ someOtherField: "value" });

    // Act
    const result = await ensureProjectId({
      accessToken: "token",
      fetchImpl: fakeFetch,
    });

    // Assert - falls back to default, doesn't throw
    expect(result).toBe(DEFAULT_PROJECT_ID);
  });
});
