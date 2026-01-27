import { describe, it, expect } from "vitest";
import { runCli } from "../cli";

describe("cli", () => {
  it("prints help for no args", async () => {
    const res = await runCli([]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("usage-opencode");
  });

  it("prints help with --help flag", async () => {
    const res = await runCli(["--help"]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("status");
    expect(res.stdout).toContain("login");
  });

  it("returns error for unknown command", async () => {
    const res = await runCli(["unknown"]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("Unknown command");
  });

  it("login command returns not implemented message", async () => {
    const res = await runCli(["login"]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("not yet implemented");
  });
});
