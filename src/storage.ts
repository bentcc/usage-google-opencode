import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type UsageOpencodeStore = {
  version: 1;
  accounts: UsageOpencodeAccount[];
};

export type UsageOpencodeIdentity = {
  refreshToken: string;
};

export type UsageOpencodeAccount = {
  email: string;
  projectId?: string;
  antigravity?: UsageOpencodeIdentity;
  geminiCli?: UsageOpencodeIdentity;
  addedAt: number;
  updatedAt: number;
};

export function getOpencodeConfigDir(): string {
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA;
    if (!appdata) {
      // Fall back to a reasonable default rather than throwing in tests.
      return path.join(os.homedir(), "AppData", "Roaming", "opencode");
    }
    return path.join(appdata, "opencode");
  }

  return path.join(os.homedir(), ".config", "opencode");
}

export function getUsageStorePath(opts?: { configDir?: string }): string {
  const configDir = opts?.configDir ?? getOpencodeConfigDir();
  return path.join(configDir, "usage-opencode-accounts.json");
}

function emptyStore(): UsageOpencodeStore {
  return { version: 1, accounts: [] };
}

export async function loadStore(opts?: { configDir?: string }): Promise<UsageOpencodeStore> {
  const storePath = getUsageStorePath(opts);

  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as UsageOpencodeStore;

    if (parsed && parsed.version === 1 && Array.isArray(parsed.accounts)) {
      return parsed;
    }

    return emptyStore();
  } catch {
    return emptyStore();
  }
}

export async function saveStore(opts: { configDir?: string } | undefined, store: UsageOpencodeStore): Promise<void> {
  const storePath = getUsageStorePath(opts);
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export function upsertAccount(
  store: UsageOpencodeStore,
  partial: Partial<UsageOpencodeAccount> & { email: string }
): UsageOpencodeStore {
  const now = Date.now();
  const existingIndex = store.accounts.findIndex((a) => a.email === partial.email);

  if (existingIndex === -1) {
    const nextAccount: UsageOpencodeAccount = {
      email: partial.email,
      projectId: partial.projectId,
      antigravity: partial.antigravity,
      geminiCli: partial.geminiCli,
      addedAt: partial.addedAt ?? now,
      updatedAt: partial.updatedAt ?? now,
    };

    return {
      ...store,
      accounts: [...store.accounts, nextAccount],
    };
  }

  const existing = store.accounts[existingIndex];
  const merged: UsageOpencodeAccount = {
    ...existing,
    ...partial,
    antigravity: partial.antigravity ?? existing.antigravity,
    geminiCli: partial.geminiCli ?? existing.geminiCli,
    updatedAt: partial.updatedAt ?? now,
  };

  const accounts = store.accounts.slice();
  accounts[existingIndex] = merged;

  return { ...store, accounts };
}
