import { describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getUsageStorePath,
  loadStore,
  saveStore,
  upsertAccount,
  type UsageOpencodeStore,
} from "../storage";

describe("storage", () => {
  it("creates store with version 1 by default", async () => {
    const dir = await mkdtemp(join(tmpdir(), "usage-google-"));
    try {
      const store = await loadStore({ configDir: dir });
      expect(store.version).toBe(1);
      expect(store.accounts).toEqual([]);

      // Ensure load did not implicitly create a file.
      await expect(readFile(getUsageStorePath({ configDir: dir }), "utf8")).rejects.toBeTruthy();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("upserts account by email", () => {
    const store: UsageOpencodeStore = { version: 1, accounts: [] };
    const next = upsertAccount(store, {
      email: "a@b.com",
      antigravity: { refreshToken: "r1" },
    });
    expect(next.accounts).toHaveLength(1);
    expect(next.accounts[0]?.email).toBe("a@b.com");

    const next2 = upsertAccount(next, {
      email: "a@b.com",
      geminiCli: { refreshToken: "r2" },
    });
    expect(next2.accounts).toHaveLength(1);
    expect(next2.accounts[0]?.antigravity?.refreshToken).toBe("r1");
    expect(next2.accounts[0]?.geminiCli?.refreshToken).toBe("r2");
  });

  it("saves and loads store", async () => {
    const dir = await mkdtemp(join(tmpdir(), "usage-google-"));
    try {
      const store: UsageOpencodeStore = {
        version: 1,
        accounts: [
          {
            email: "user@example.com",
            antigravity: { refreshToken: "r1" },
            addedAt: 1,
            updatedAt: 2,
          },
        ],
      };

      await saveStore({ configDir: dir }, store);

      const raw = await readFile(getUsageStorePath({ configDir: dir }), "utf8");
      expect(JSON.parse(raw)).toEqual(store);

      const loaded = await loadStore({ configDir: dir });
      expect(loaded).toEqual(store);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loadStore tolerates invalid JSON by returning empty store", async () => {
    const dir = await mkdtemp(join(tmpdir(), "usage-google-"));
    try {
      const path = getUsageStorePath({ configDir: dir });
      await writeFile(path, "{not valid json", "utf8");

      const store = await loadStore({ configDir: dir });
      expect(store.version).toBe(1);
      expect(store.accounts).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads legacy usage-opencode-accounts.json when new file missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "usage-google-"));
    try {
      const legacyPath = join(dir, "usage-opencode-accounts.json");
      const legacyStore: UsageOpencodeStore = {
        version: 1,
        accounts: [
          {
            email: "legacy@example.com",
            antigravity: { refreshToken: "r1" },
            addedAt: 1,
            updatedAt: 2,
          },
        ],
      };

      await writeFile(legacyPath, JSON.stringify(legacyStore, null, 2), "utf8");

      const loaded = await loadStore({ configDir: dir });
      expect(loaded).toEqual(legacyStore);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
