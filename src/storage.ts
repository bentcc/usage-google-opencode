import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type UsageOpencodeStore = {
  version: 1;
  accounts: UsageOpencodeAccount[];
};

export type UsageOpencodeIdentity = {
  refreshToken: string;
  projectId?: string; // Identity-specific project ID
};

export type UsageOpencodeAccount = {
  email: string;
  projectId?: string; // Legacy: shared project ID (deprecated, kept for migration)
  antigravity?: UsageOpencodeIdentity;
  geminiCli?: UsageOpencodeIdentity;
  addedAt: number;
  updatedAt: number;
};

export function getOpencodeConfigDir(): string {
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA || process.env.LOCALAPPDATA;
    if (!appdata) {
      // Last resort fallback
      const userProfile = process.env.USERPROFILE || os.homedir();
      return path.join(userProfile, "AppData", "Roaming", "opencode");
    }
    return path.join(appdata, "opencode");
  }

  return path.join(os.homedir(), ".config", "opencode");
}

const STORE_FILENAME = "usage-google-accounts.json";
const LEGACY_STORE_FILENAME = "usage-opencode-accounts.json";

export function getUsageStorePath(opts?: { configDir?: string }): string {
  const configDir = opts?.configDir ?? getOpencodeConfigDir();
  return path.join(configDir, STORE_FILENAME);
}

function getLegacyUsageStorePath(opts?: { configDir?: string }): string {
  const configDir = opts?.configDir ?? getOpencodeConfigDir();
  return path.join(configDir, LEGACY_STORE_FILENAME);
}

function emptyStore(): UsageOpencodeStore {
  return { version: 1, accounts: [] };
}

async function readStoreFile(filePath: string): Promise<UsageOpencodeStore | undefined> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as UsageOpencodeStore;

    if (parsed && parsed.version === 1 && Array.isArray(parsed.accounts)) {
      return parsed;
    }

    // Log corruption but don't throw
    console.error(`Warning: Storage file corrupted at ${filePath}`);
    return undefined;
  } catch {
    // File doesn't exist or is unreadable - this is fine
    return undefined;
  }
}

export async function loadStore(opts?: { configDir?: string }): Promise<UsageOpencodeStore> {
  const storePath = getUsageStorePath(opts);
  const legacyPath = getLegacyUsageStorePath(opts);

  // Try both in parallel for better performance
  const [current, legacy] = await Promise.all([
    readStoreFile(storePath),
    readStoreFile(legacyPath)
  ]);
  
  if (current) {
    return current;
  }
  
  if (legacy) {
    // Migrate legacy file to new location
    await saveStore(opts, legacy);
    return legacy;
  }

  return emptyStore();
}

export async function saveStore(opts: { configDir?: string } | undefined, store: UsageOpencodeStore): Promise<void> {
  const storePath = getUsageStorePath(opts);
  await mkdir(path.dirname(storePath), { recursive: true });
  
  // Write to temporary file first for atomic operation
  const tempPath = `${storePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(store, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600  // Only owner can read/write
  });
  
  // Atomic rename to final location
  await rename(tempPath, storePath);
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
