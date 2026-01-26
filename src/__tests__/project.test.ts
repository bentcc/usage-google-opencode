import { it, expect, describe } from "vitest";

import {
  ensureProjectId,
  ProjectError,
  LOAD_CODE_ASSIST_ENDPOINT,
} from "../google/project";

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
    // Arrange
    const apiResponse = {
      projectId: "discovered-project-123",
    };
    const { fetch: fakeFetch, calls } = createFakeFetch(apiResponse);

    // Act
    const result = await ensureProjectId({
      accessToken: "test-token",
      fetchImpl: fakeFetch,
    });

    // Assert - verify request
    expect(result).toBe("discovered-project-123");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(LOAD_CODE_ASSIST_ENDPOINT);
    expect(calls[0].init.method).toBe("POST");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-token");
  });

  it("throws ProjectError when API fails", async () => {
    // Arrange
    const { fetch: fakeFetch } = createFakeFetch({ error: "forbidden" }, 403);

    // Act & Assert
    await expect(
      ensureProjectId({
        accessToken: "bad-token",
        fetchImpl: fakeFetch,
      }),
    ).rejects.toThrow("Failed to discover project");

    try {
      await ensureProjectId({
        accessToken: "bad-token",
        fetchImpl: fakeFetch,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ProjectError);
      expect((err as ProjectError).status).toBe(403);
    }
  });

  it("throws ProjectError when projectId missing from response", async () => {
    // Arrange
    const { fetch: fakeFetch } = createFakeFetch({ someOtherField: "value" });

    // Act & Assert
    await expect(
      ensureProjectId({
        accessToken: "token",
        fetchImpl: fakeFetch,
      }),
    ).rejects.toThrow("projectId");
  });
});
