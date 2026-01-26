import { it, expect, describe } from "vitest";

import { fetchUserEmail, UserInfoError } from "../google/userinfo";

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

describe("fetchUserEmail", () => {
  it("sends GET request with Authorization Bearer header to userinfo endpoint", async () => {
    // Arrange
    const { fetch: fakeFetch, calls } = createFakeFetch({
      id: "123",
      email: "user@example.com",
      verified_email: true,
      name: "Test User",
    });

    // Act
    const email = await fetchUserEmail({
      accessToken: "test-access-token",
      fetchImpl: fakeFetch,
    });

    // Assert
    expect(email).toBe("user@example.com");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("googleapis.com/oauth2/");
    expect(calls[0].url).toContain("userinfo");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-access-token");
  });

  it("throws UserInfoError with status when response is not ok", async () => {
    // Arrange
    const { fetch: fakeFetch } = createFakeFetch({ error: "unauthorized" }, 401);

    // Act & Assert
    await expect(
      fetchUserEmail({
        accessToken: "bad-token",
        fetchImpl: fakeFetch,
      }),
    ).rejects.toThrow("Failed to fetch user info");

    try {
      await fetchUserEmail({
        accessToken: "bad-token",
        fetchImpl: fakeFetch,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(UserInfoError);
      expect((err as UserInfoError).status).toBe(401);
    }
  });

  it("throws UserInfoError when email is missing from successful response", async () => {
    // Arrange
    const { fetch: fakeFetch } = createFakeFetch({ id: "123", name: "No Email User" });

    // Act & Assert
    await expect(
      fetchUserEmail({
        accessToken: "token",
        fetchImpl: fakeFetch,
      }),
    ).rejects.toThrow("email");

    try {
      await fetchUserEmail({
        accessToken: "token",
        fetchImpl: fakeFetch,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(UserInfoError);
      expect((err as UserInfoError).status).toBe(200);
    }
  });
});
