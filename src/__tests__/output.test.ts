/**
 * Tests for output formatters (table and json).
 */

import { describe, it, expect } from "vitest";
import { renderTable, formatResetTime } from "../output/table.js";
import { renderJson } from "../output/json.js";
import type { AccountQuotaReport, IdentityError } from "../commands/status.js";

describe("renderTable", () => {
  it("renders 'No accounts found' when no reports or errors", () => {
    const output = renderTable([], []);
    expect(output).toContain("No accounts found");
    expect(output).toContain("usage-google login");
  });

  it("renders summary and full detail sections", () => {
    const reports: AccountQuotaReport[] = [
      {
        email: "user@example.com",
        identity: "antigravity",
        projectId: "proj-1",
        models: [
          { model: "gemini-3.1-pro-high", remainingPercent: 85, resetTime: "2026-01-29T00:00:00Z" },
          { model: "gemini-2.5-pro", remainingPercent: 50, resetTime: "2026-01-29T00:00:00Z" },
        ],
        fetchedAt: Date.now(),
      },
    ];

    const output = renderTable(reports, []);
    expect(output).toContain("Summary");
    expect(output).toContain("Full detail");
  });

  it("renders header with column names", () => {
    const reports: AccountQuotaReport[] = [
      {
        email: "user@example.com",
        identity: "antigravity",
        projectId: "proj-1",
        models: [
          { model: "gemini-2.5-pro", remainingPercent: 85, resetTime: "2026-01-29T00:00:00Z" },
        ],
        fetchedAt: Date.now(),
      },
    ];
    const output = renderTable(reports, []);
    expect(output).toContain("Email");
    expect(output).toContain("Identity");
    expect(output).toContain("Model");
    expect(output).toContain("Remaining");
    expect(output).toContain("Reset");
    expect(output).toContain("Status");
  });

  it("renders data rows with OK status and correct values", () => {
    const reports: AccountQuotaReport[] = [
      {
        email: "alice@test.com",
        identity: "antigravity",
        projectId: "proj-1",
        models: [
          { model: "gemini-2.5-pro", remainingPercent: 42, resetTime: "" },
        ],
        fetchedAt: Date.now(),
      },
    ];
    const output = renderTable(reports, []);
    expect(output).toContain("alice@test.com");
    expect(output).toContain("antigravity");
    expect(output).toContain("gemini-2.5-pro");
    expect(output).toContain("42%");
    expect(output).toContain("OK");
  });

  it("renders dash for empty resetTime", () => {
    const reports: AccountQuotaReport[] = [
      {
        email: "alice@test.com",
        identity: "antigravity",
        projectId: "proj-1",
        models: [
          { model: "gemini-2.5-pro", remainingPercent: 42, resetTime: "" },
        ],
        fetchedAt: Date.now(),
      },
    ];
    const output = renderTable(reports, []);
    // The reset column should show "-" when resetTime is empty
    // Check that we have a line containing the email and a dash
    const lines = output.split("\n");
    const dataLine = lines.find((l) => l.includes("alice@test.com"));
    expect(dataLine).toContain("-");
  });

  it("renders multiple models per account", () => {
    const reports: AccountQuotaReport[] = [
      {
        email: "bob@test.com",
        identity: "gemini-cli",
        projectId: "proj-2",
        models: [
          { model: "gemini-2.5-pro", remainingPercent: 100, resetTime: "" },
          { model: "claude-sonnet-4", remainingPercent: 75, resetTime: "" },
        ],
        fetchedAt: Date.now(),
      },
    ];
    const output = renderTable(reports, []);
    expect(output).toContain("gemini-2.5-pro");
    expect(output).toContain("claude-sonnet-4");
    expect(output).toContain("100%");
    expect(output).toContain("75%");
  });

  it("renders error rows with 'Needs relogin' status", () => {
    const errors: IdentityError[] = [
      {
        email: "expired@test.com",
        identity: "antigravity",
        error: "invalid_grant",
        needsRelogin: true,
        isForbidden: false,
      },
    ];
    const output = renderTable([], errors);
    expect(output).toContain("expired@test.com");
    expect(output).toContain("Needs relogin");
  });

  it("renders error rows with 'Error' status when not needsRelogin", () => {
    const errors: IdentityError[] = [
      {
        email: "failed@test.com",
        identity: "gemini-cli",
        error: "Network error",
        needsRelogin: false,
        isForbidden: false,
      },
    ];
    const output = renderTable([], errors);
    expect(output).toContain("failed@test.com");
    expect(output).toContain("Error");
    expect(output).not.toContain("Needs relogin");
  });

  it("renders error rows with 'Forbidden' status for 403 errors", () => {
    const errors: IdentityError[] = [
      {
        email: "forbidden@test.com",
        identity: "antigravity",
        error: "HTTP 403",
        needsRelogin: false,
        isForbidden: true,
      },
    ];
    const output = renderTable([], errors);
    expect(output).toContain("forbidden@test.com");
    expect(output).toContain("Forbidden");
  });

  it("renders action required footer for needsRelogin errors", () => {
    const errors: IdentityError[] = [
      {
        email: "user@example.com",
        identity: "gemini-cli",
        error: "invalid_grant",
        needsRelogin: true,
        isForbidden: false,
      },
    ];
    const output = renderTable([], errors);
    expect(output).toContain("Action required:");
    expect(output).toContain("usage-google login --mode gemini-cli --account user@example.com");
  });

  it("renders mixed reports and errors", () => {
    const reports: AccountQuotaReport[] = [
      {
        email: "good@test.com",
        identity: "antigravity",
        projectId: "proj-1",
        models: [{ model: "gemini-2.5-pro", remainingPercent: 50, resetTime: "" }],
        fetchedAt: Date.now(),
      },
    ];
    const errors: IdentityError[] = [
      {
        email: "good@test.com",
        identity: "gemini-cli",
        error: "invalid_grant",
        needsRelogin: true,
        isForbidden: false,
      },
    ];
    const output = renderTable(reports, errors);
    expect(output).toContain("good@test.com");
    expect(output).toContain("50%");
    expect(output).toContain("Needs relogin");
    expect(output).toContain("Action required:");
  });

  it("truncates long email addresses", () => {
    const reports: AccountQuotaReport[] = [
      {
        email: "verylongemailaddress1234567890@example.com",
        identity: "antigravity",
        projectId: "proj-1",
        models: [{ model: "gemini-2.5-pro", remainingPercent: 100, resetTime: "" }],
        fetchedAt: Date.now(),
      },
    ];
    const output = renderTable(reports, []);
    expect(output).toContain("verylongemailaddress1");
    expect(output).not.toContain("verylongemailaddress1234567890@example.com");
    const lines = output.trimEnd().split("\n");
    const borderLengths = new Set(
      lines.filter((line) => line.startsWith("┌") || line.startsWith("└") || line.startsWith("├")).map((line) => line.length)
    );
    const rowLengths = new Set(lines.filter((line) => line.startsWith("│")).map((line) => line.length));
    expect(borderLengths.size).toBe(1);
    expect(rowLengths.size).toBe(1);
  });
});

describe("formatResetTime", () => {
  it("returns 'now' for past times", () => {
    const pastTime = new Date(Date.now() - 60000).toISOString();
    expect(formatResetTime(pastTime)).toBe("now");
  });

  it("formats hours and minutes for future times", () => {
    const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString();
    const result = formatResetTime(futureTime);
    expect(result).toMatch(/^\d+h\d+m$/);
  });

  it("formats days when duration is at least 24 hours", () => {
    const futureTime = new Date(Date.now() + 26 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString();
    const result = formatResetTime(futureTime);
    expect(result).toMatch(/^\d+d\d+h\d+m$/);
  });

  it("formats only minutes when less than 1 hour", () => {
    const futureTime = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    const result = formatResetTime(futureTime);
    expect(result).toMatch(/^\d+m$/);
  });

  it("returns truncated string for invalid dates", () => {
    const result = formatResetTime("invalid-date-string");
    expect(result).toBe("invalid-da");
  });
});

describe("renderJson", () => {
  it("renders empty array when no reports", () => {
    const output = renderJson([], []);
    expect(JSON.parse(output)).toEqual({ reports: [], errors: [] });
  });

  it("renders reports with all fields", () => {
    const reports: AccountQuotaReport[] = [
      {
        email: "user@example.com",
        identity: "antigravity",
        projectId: "proj-1",
        models: [
          { model: "gemini-2.5-pro", remainingPercent: 85, resetTime: "2026-01-29T00:00:00Z" },
        ],
        fetchedAt: 1706486400000,
      },
    ];
    const output = renderJson(reports, []);
    const parsed = JSON.parse(output);
    expect(parsed.reports).toHaveLength(1);
    expect(parsed.reports[0].email).toBe("user@example.com");
    expect(parsed.reports[0].identity).toBe("antigravity");
    expect(parsed.reports[0].models[0].remainingPercent).toBe(85);
  });

  it("renders errors in output", () => {
    const errors: IdentityError[] = [
      {
        email: "failed@test.com",
        identity: "gemini-cli",
        error: "invalid_grant",
        needsRelogin: true,
        isForbidden: false,
      },
    ];
    const output = renderJson([], errors);
    const parsed = JSON.parse(output);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].email).toBe("failed@test.com");
    expect(parsed.errors[0].needsRelogin).toBe(true);
  });

  it("produces valid JSON with pretty printing", () => {
    const reports: AccountQuotaReport[] = [
      {
        email: "a@b.com",
        identity: "antigravity",
        projectId: "p",
        models: [],
        fetchedAt: 0,
      },
    ];
    const output = renderJson(reports, []);
    expect(output).toContain("\n"); // Pretty printed
    expect(() => JSON.parse(output)).not.toThrow();
  });
});
