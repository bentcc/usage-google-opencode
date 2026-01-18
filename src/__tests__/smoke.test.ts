import { describe, it, expect } from "vitest";
import { runCli } from "../cli";

describe("cli", () => {
  it("prints help for no args", async () => {
    const res = await runCli([]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("usage-opencode");
  });
});
