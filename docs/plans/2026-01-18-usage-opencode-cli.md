# Usage-Google-Opencode CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone CLI that logs into Google OAuth (Antigravity + Gemini CLI as two distinct OAuth clients) and prints per-account model quota availability as remaining % plus reset time.

**Architecture:** A Node.js + TypeScript CLI that stores account refresh tokens in `~/.config/opencode/usage-google-accounts.json`, refreshes access tokens on demand, calls Google Cloud Code internal endpoints to fetch available model quotas (`fetchAvailableModels` for antigravity, `retrieveUserQuota` for gemini-cli), and renders a table by default (with optional JSON output).

**Tech Stack:** Node.js (>=20), TypeScript, Vitest, undici/fetch (built-in), `@openauthjs/openauth` (PKCE), minimal CLI arg parsing (or `commander`).

---

## Progress (So Far)

Completed tasks/commits:
- Task 1 (bootstrap project): `b1e9ab2`
- Task 2 (storage): `faed7c8`
- Task 3 (PKCE auth URL builder): `b12bfef`
- Task 4 (token exchange + refresh): `0bbbb88`
- Task 5 (fetch user email): `4bb469e`
- Task 6 (quota + project ID): `82ebe61`
- Task 7 (status command): `2aa110b`
- Task 8 (login command): `089090b`
- Task 9 (output formatting): `8887922`
- Task 10 (E2E verification): Completed 2026-01-28
  - Login tested: `usage-google login --mode both` ✓
  - Status tested: antigravity + gemini-cli models visible ✓
  - Remaining % verified: All at 100% (reasonable) ✓
  - Reset times populated: e.g., "2026-01-30T10:55:08Z" ✓
  - Gemini-CLI: Uses `retrieveUserQuota` with project ID ✓

---

## Requirements (Validated)

- Dual identity (two OAuth clients per Google account)
  - Antigravity IDE OAuth client -> “antigravity quota”
  - Gemini CLI OAuth client -> “gemini-cli quota”
- Main data per account + quota type:
  - remaining quota in %
  - quota reset time (string returned by API)
  - which Google account (email)
- Default output: human-readable table
- Storage:
  - Keep `~/.config/opencode/antigravity-accounts.json` untouched
  - New file under same directory: `~/.config/opencode/usage-google-accounts.json`

Non-goals (YAGNI for v1):
- No GUI
- No background scheduler/daemon
- No automatic account rotation logic

---

## External Reference (What We’re Reusing)

- OAuth / PKCE patterns from `opencode-antigravity-auth/src/antigravity/oauth.ts`
- Quota fetch behavior from `Antigravity-Manager/src-tauri/src/modules/quota.rs`
  - `POST https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`
  - read `quotaInfo.remainingFraction` and `quotaInfo.resetTime`
  - optional project discovery via `POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`

---

## CLI UX Proposal

Commands:
- `usage-google login` (interactive)
  - Ensures both identities are connected for an email.
  - Can support `--mode antigravity|gemini-cli|both` (default: both).
  - Gemini CLI requires a project ID: `--project <gcp-project-id>`.
- `usage-google status`
  - Fetches quota for all stored accounts (both quota types if present).
  - Default output: table.
  - Options: `--format table|json`, `--only antigravity|gemini-cli`, `--account <email>`.

Exit codes:
- `0` success (even if some accounts need relogin; see UX below)
- `1` user error (bad args / missing login)
- `2` network/auth error (only when nothing could be fetched at all)

---

## Data Model

### Storage file
Path: `~/.config/opencode/usage-google-accounts.json`

Schema (v1):
```json
{
  "version": 1,
  "accounts": [
    {
      "email": "user@example.com",
      "projectId": "optional-legacy-shared-project",
      "antigravity": { "refreshToken": "..." },
      "geminiCli": { "refreshToken": "...", "projectId": "my-gcp-projectID" },
      "addedAt": 0,
      "updatedAt": 0
    }
  ]
}
```

Notes:
- Only refresh tokens are persisted.
- Access tokens are ephemeral (typically ~1 hour, via `expires_in`) and kept in-memory.
- `expiresAt` is tracked as unix seconds (see `src/oauth/token.ts`).
- `status` will automatically refresh access tokens as needed using the stored refresh token.
- Re-login is only needed if Google revokes the refresh token (usually surfaces as `invalid_grant`) or if Google never returned a refresh token during login.

### In-memory result type
```ts
export type QuotaIdentity = "antigravity" | "gemini-cli";

export interface ModelQuota {
  model: string;
  remainingPercent: number; // 0..100
  resetTime: string;        // passthrough from API
}

export interface AccountQuotaReport {
  email: string;
  identity: QuotaIdentity;
  projectId: string;
  subscriptionTier?: string; // optional if we can infer it later
  models: ModelQuota[];
  fetchedAt: number;
}
```

---

## Google/OAuth Details

OAuth client credentials are hardcoded in `src/oauth/constants.ts`:

These credentials are extracted from the official Google Cloud SDK and Antigravity IDE.
- **Antigravity Login** - for IDE Quota tracking
- **Gemini CLI Login** - for Developer/GCloud Quota tracking

> **Note**: Actual credential values are in `src/oauth/constants.ts`. These are public OAuth client credentials (standard practice) and pose no security risk.

OAuth flow (both identities):
- Authorization URL: `https://accounts.google.com/o/oauth2/v2/auth`
  - `response_type=code`
  - `access_type=offline`
  - `prompt=consent`
  - scopes: `cloud-platform`, `userinfo.email`, `userinfo.profile`
  - PKCE `code_challenge`/`code_verifier`
- Exchange code: `POST https://oauth2.googleapis.com/token`
- Fetch email: `GET https://www.googleapis.com/oauth2/v1/userinfo?alt=json` (or v2)

Implementation choices:
- Prefer a local callback listener (localhost random port) for best UX.
- Provide fallback “paste redirect URL” mode (like `opencode-antigravity-auth`) for remote/headless envs.

---

## Quota Fetch Details

> **Updated 2026-02-20:** Gemini CLI quota now uses only the prod endpoint with retry logic (matching antigravity), not sandbox fallback. User-Agent updated to `GeminiCLI/<ver>/<model> (<platform>; <arch>)` per real gemini-cli source. See CHANGELOG.md v1.2.0.

Primary endpoint (antigravity):
- `POST https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`
- Body: `{ "project": "<projectId>" }`
- Auth: `Authorization: Bearer <access token>`
- Strategy: Retry up to 3 times with 1s delay; 403 throws immediately

Primary endpoint (gemini-cli):
- `POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota`
- Body: `{ "project": "<projectId>" }`
- Auth: `Authorization: Bearer <access token>`
- Strategy: Retry up to 3 times with 1s delay; 403 throws immediately

Project ID resolution (if missing):
- `POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`
- Body: `{ "metadata": { ... } }` (minimal metadata is fine)

Parsing:
- `fetchAvailableModels` returns `models: Record<string, { quotaInfo?: { remainingFraction?: number; resetTime?: string } }>`
- `retrieveUserQuota` returns `buckets: Array<{ modelId?: string; remainingFraction?: number; remainingAmount?: string; resetTime?: string; tokenType?: string }>`
- Convert `remainingFraction` to percent: `Math.floor(remainingFraction * 100)`
- Keep `resetTime` as string

Model filtering:
- For v1, include only models containing `"gemini"` or `"claude"` (matches Antigravity-Manager behavior).
- Print identity label so users can differentiate quotas.

---

# Implementation Tasks (TDD)

## Task 1: Initialize Node/TS project skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts`
- Create: `src/cli.ts`
- Create: `src/__tests__/smoke.test.ts`

**Step 1: Write failing test**
```ts
import { describe, it, expect } from "vitest";
import { runCli } from "../cli";

describe("cli", () => {
  it("prints help for no args", async () => {
    const res = await runCli([]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("usage-google");
  });
});
```

**Step 2: Run test to verify it fails**
Run: `npm test`
Expected: FAIL because `runCli` doesn’t exist.

**Step 3: Minimal implementation**
Implement `runCli(argv)` that returns `{ exitCode, stdout, stderr }`.

**Step 4: Run test to verify it passes**
Run: `npm test`
Expected: PASS.

---

## Task 2: Implement storage (new file in opencode config dir)

**Files:**
- Create: `src/storage.ts`
- Test: `src/__tests__/storage.test.ts`

**Step 1: Write failing test**
```ts
import { describe, it, expect } from "vitest";
import { loadStore, upsertAccount } from "../storage";

it("creates store with version 1 by default", async () => {
  const store = await loadStore({ configDir: "/tmp/usage-google-test" });
  expect(store.version).toBe(1);
  expect(store.accounts).toEqual([]);
});

it("upserts account by email", async () => {
  const store = { version: 1, accounts: [] as any[] };
  const next = upsertAccount(store, {
    email: "a@b.com",
    antigravity: { refreshToken: "r1" },
  });
  expect(next.accounts).toHaveLength(1);
  expect(next.accounts[0].email).toBe("a@b.com");
});
```

**Step 2: Verify RED**
Run: `npm test`
Expected: FAIL missing module / exports.

**Step 3: Minimal implementation**
- `getOpencodeConfigDir()` -> `~/.config/opencode` on mac/linux, `%APPDATA%/opencode` on windows.
- `getUsageStorePath()` -> `<configDir>/usage-google-accounts.json`
- `loadStore({configDir?})`, `saveStore(...)`, `upsertAccount(store, partial)`.

**Step 4: Verify GREEN**
Run: `npm test`

---

## Task 3: OAuth constants + auth URL builder for both identities

**Files:**
- Create: `src/oauth/constants.ts`
- Create: `src/oauth/authorize.ts`
- Test: `src/__tests__/authorize.test.ts`

**Step 1: Write failing test**
```ts
import { describe, it, expect } from "vitest";
import { buildAuthorizationUrl } from "../oauth/authorize";

it("builds antigravity auth url with required params", async () => {
  const { url } = await buildAuthorizationUrl({ identity: "antigravity" });
  const u = new URL(url);
  expect(u.host).toBe("accounts.google.com");
  expect(u.searchParams.get("client_id")).toBeTruthy();
  expect(u.searchParams.get("code_challenge")).toBeTruthy();
  expect(u.searchParams.get("access_type")).toBe("offline");
});
```

**Step 2: Verify RED**
Run: `npm test`
Expected: FAIL.

**Step 3: Minimal implementation**
- Use `@openauthjs/openauth/pkce` (like `opencode-antigravity-auth`) to generate verifier/challenge.
- Return `{ url, verifier }`.

**Step 4: Verify GREEN**
Run: `npm test`

---

## Task 4: OAuth token exchange + refresh (per identity)

**Files:**
- Create: `src/oauth/token.ts`
- Test: `src/__tests__/token.test.ts`

**Step 1: Write failing test (no network)**
Design the token functions to accept a `fetchImpl` so tests can stub it.

```ts
import { it, expect } from "vitest";
import { exchangeCode } from "../oauth/token";

it("exchanges code via oauth2.googleapis.com/token", async () => {
  const calls: any[] = [];
  const fakeFetch = async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ access_token: "a", expires_in: 3600, refresh_token: "r" }), { status: 200 });
  };
  const res = await exchangeCode({
    identity: "antigravity",
    code: "c",
    verifier: "v",
    redirectUri: "http://localhost:1234/callback",
    fetchImpl: fakeFetch as any,
  });
  expect(res.refreshToken).toBe("r");
  expect(calls[0].url).toContain("oauth2.googleapis.com/token");
});
```

**Step 2: Verify RED**
Run: `npm test`

**Step 3: Minimal implementation**
Implement:
- `exchangeCode(...) -> { accessToken, refreshToken, expiresAt }`
- `refreshAccessToken(...) -> { accessToken, expiresAt }`

**Step 4: Verify GREEN**
Run: `npm test`

---

## Task 5: Fetch user email for labeling accounts

**Files:**
- Create: `src/google/userinfo.ts`
- Test: `src/__tests__/userinfo.test.ts`

**TDD steps:**
- Stub fetch, assert request uses `Authorization: Bearer ...`
- Parse JSON and return `email`.

---

## Task 6: Resolve project ID (optional) and fetch quotas

**Files:**
- Create: `src/google/project.ts`
- Create: `src/google/quota.ts`
- Test: `src/__tests__/quota.test.ts`

**Step 1: Write failing test**
```ts
import { it, expect } from "vitest";
import { parseQuotaResponse } from "../google/quota";

it("converts remainingFraction to percent and keeps resetTime", () => {
  const parsed = parseQuotaResponse({
    models: {
      "gemini-3-pro": { quotaInfo: { remainingFraction: 0.42, resetTime: "2026-01-18T00:00:00Z" } },
      "other": { quotaInfo: { remainingFraction: 0.9, resetTime: "x" } },
    },
  });
  expect(parsed).toEqual([
    { model: "gemini-3-pro", remainingPercent: 42, resetTime: "2026-01-18T00:00:00Z" },
  ]);
});
```

**Step 2: Verify RED**
Run: `npm test`

**Step 3: Minimal implementation**
- `parseQuotaResponse` filters to `gemini|claude` models.
- `fetchQuota({ accessToken, projectId })` calls `fetchAvailableModels`.
- `ensureProjectId({ accessToken })` optionally calls `loadCodeAssist` and returns ID.

**Step 4: Verify GREEN**
Run: `npm test`

---

## Task 7: Build `status` command (multi-account, dual identity)

**Files:**
- Modify: `src/cli.ts`
- Create: `src/commands/status.ts`
- Test: `src/__tests__/status.test.ts`

Behavior:
- Load accounts from `usage-google-accounts.json`.
- For each account:
  - if antigravity refresh token exists -> refresh access token -> fetch quotas -> collect report
  - if gemini-cli refresh token exists -> refresh access token -> fetch quotas -> collect report
- Render table by default.

Tests:
- Stub storage + stub fetch calls; assert table contains both identities.

---

## Task 8: Build `login` command

**Files:**
- Create: `src/commands/login.ts`
- Modify: `src/cli.ts`
- Test: `src/__tests__/login.test.ts`

Behavior:
- Interactive flow:
  - Choose mode: antigravity / gemini-cli / both
  - Start local callback server on a random port
  - Print auth URL + try opening browser (best-effort)
  - Wait for redirect (or allow paste fallback)
  - Exchange code, fetch email, persist refresh token to store

Tests (no real networking):
- Unit-test URL builder and token exchange separately.
- For login command, test that it persists tokens when provided with a simulated callback payload.

---

## Task 9: Output formatting (table + json)

**Files:**
- Create: `src/output/table.ts`
- Create: `src/output/json.ts`
- Test: `src/__tests__/output.test.ts`

Table columns (v1):
- Email
- Identity (`antigravity` / `gemini-cli`)
- Model
- Remaining %
- Reset time (HhMm; switches to XdYhZm when >= 24h)
- Status (OK / Needs relogin / Error)

Output layout:
- Summary section (allowlist models)
- Full detail section (all models)

UX rules (non-technical friendly):
- If refresh fails with `invalid_grant`, mark that identity as `Needs relogin` and keep processing other accounts.
- If quota fetch fails with 403, mark as `Forbidden` (optional) and keep going.
- Always print an "Action required" footer when any identity needs relogin, including the exact suggested command(s).
  - Example: `usage-google login --mode gemini-cli --account user@example.com`
- Only exit non-zero if *all* accounts/identities failed to produce any usable quota rows.

---

## Task 10: E2E sanity (manual)

Manual verification steps:
- `usage-google login --mode both`
- `usage-google status`
- Confirm:
  - two quota groups per email
  - remaining % looks reasonable
  - reset time populated for some models

---

## Commands To Run During Implementation

- Install deps: `npm install`
- Run tests: `npm test`
- Typecheck: `npm run typecheck`
- Run CLI: `node dist/index.js status` (after build)

---

## Security Notes

- The storage file contains refresh tokens.
- Add `usage-google-accounts.json` to a local `.gitignore` in the repo (not in `~/.config/...`).
- Never print refresh tokens in logs.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-01-18-usage-opencode-cli.md`.

Two execution options:

1. Subagent-Driven (this session) – use superpowers:subagent-driven-development, implement task-by-task with checkpoints
2. Parallel Session (separate) – open new session and use superpowers:executing-plans
