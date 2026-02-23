# AGENTS.md

## Project Overview

CLI tool for checking Google Cloud Code API quota usage across multiple accounts and identities (antigravity/gemini-cli). ESM TypeScript project targeting Node >= 20.

## Build / Test / Typecheck

```bash
# Run all tests
bun run test              # or: npx vitest run

# Run a single test file
npx vitest run src/__tests__/quota.test.ts

# Run a single test by name
npx vitest run src/__tests__/quota.test.ts -t "converts remainingFraction to percent"

# Typecheck (no emit)
bun run typecheck          # tsc -p tsconfig.json --noEmit

# Build (compile to dist/)
bun run build              # tsc -p tsconfig.json
```

No linter or formatter is configured. Conventions are enforced by code review and one meta-test (`esm-imports.test.ts`) that verifies all relative imports use `.js` extensions.

## Code Style

### Formatting
- 2-space indentation, double quotes, semicolons always, trailing commas on multiline
- `const` by default; `let` only when reassignment is needed; never `var`
- K&R brace style: opening brace on same line
- Template literals for interpolation

### Imports
- **Relative imports**: always use `.js` extension (enforced by test)
- **Node built-ins**: use `node:` protocol (`import path from "node:path"`)
- **Type-only**: use `import type { Foo }` for pure-type imports; use inline `type` keyword for mixed (`import { runStatus, type OutputFormat } from "./commands/status.js"`)
- **Order**: external packages, then relative modules, then types

### Exports
- Named exports only. No default exports anywhere in source code.

### Naming
| Category       | Convention       | Examples                                        |
|----------------|------------------|-------------------------------------------------|
| Functions      | camelCase        | `fetchQuota`, `parseQuotaResponse`, `runCli`    |
| Variables      | camelCase        | `accessToken`, `lastError`, `remainingFraction` |
| Constants      | UPPER_SNAKE_CASE | `FETCH_TIMEOUT_MS`, `MODEL_FILTER_PATTERN`      |
| Types/Interfaces | PascalCase     | `ModelQuota`, `StatusDeps`, `QuotaIdentity`     |
| Error classes  | PascalCase+Error | `QuotaError`, `OAuthTokenError`, `ProjectError` |
| Files          | kebab-case       | `quota.ts`, `token.ts`, `userinfo.ts`           |
| Test files     | `<name>.test.ts` | `quota.test.ts`, `status.test.ts`               |
| Directories    | kebab-case       | `oauth/`, `google/`, `commands/`, `output/`     |

### Type Annotations
- Explicit return types on all exported functions
- `as const` on constant arrays/objects for narrow typing
- `type` for unions/aliases; `interface` for object shapes and API contracts
- `readonly` on class properties for immutability
- Minimal type assertions; only `as T` when truly necessary

### Function Signatures
- **Exported functions**: single `input` object parameter for anything with 2+ args
- **Internal helpers**: positional parameters are fine
- **Dependency injection**: optional `fetchImpl?: FetchLike` on all network functions, defaulting to global `fetch`
- **Command modules** (`status.ts`, `login.ts`): full `Deps` interface for DI with a `defaultDeps` constant

```typescript
// Exported function pattern
export async function fetchQuota(input: {
  accessToken: string;
  projectId: string;
  identity?: QuotaIdentity;
  fetchImpl?: FetchLike;
}): Promise<ModelQuota[]> { ... }
```

### Error Handling
- Custom error classes extend `Error` with `readonly name = "ClassName"` as a class property
- Constructor takes a single object `input` parameter
- All extra fields are `readonly` (`status`, `endpoint`, etc.)
- Catch blocks: use `catch { ... }` (no binding) for non-critical errors
- Safe error stringification: `err instanceof Error ? err.message : String(err)`

```typescript
export class QuotaError extends Error {
  readonly name = "QuotaError";
  readonly status: number;
  readonly endpoint: string;

  constructor(input: { message: string; status: number; endpoint: string }) {
    super(input.message);
    this.status = input.status;
    this.endpoint = input.endpoint;
  }
}
```

### JSDoc
- Module-level doc comment at top of every file
- JSDoc on all exported functions, types, and interfaces
- Use `@param`, `@returns`, `@throws` tags for important APIs
- Internal helpers may have shorter or no JSDoc

### File Organization (within each module)
1. Module-level JSDoc comment
2. Imports (external, then relative, then types)
3. Type/interface exports
4. Constants (exported, then private)
5. Private helper functions
6. Exported main functions

### Async Patterns
- `async`/`await` throughout; no raw `.then()` chains
- `Promise.all()` for parallelism
- Top-level `await` in entry point (`src/index.ts`)

## Testing Conventions

- **Framework**: Vitest with explicit imports (`import { describe, it, expect, vi } from "vitest"`)
- **Location**: all tests in `src/__tests__/` (flat directory)
- **No snapshots**, no external mocking libraries (`msw`, `nock`, etc.)

### Test Organization
- Flat `it()` blocks for simple modules
- `describe`/`it` nesting for modules with logical groupings
- Test names: descriptive, behavior-focused, present tense verb ("converts...", "handles...", "throws...")

### Mocking Patterns
- **Network**: inject `fetchImpl` via DI; use `createFakeFetch()` factory returning `{ fetch, calls }` to capture and assert on requests
- **Commands**: mock entire `Deps` interface with `vi.fn().mockResolvedValue()`
- **Filesystem**: real temp directories via `mkdtemp()`, cleaned up in `finally` blocks
- **No real network calls** in any test

### Assertion Style
- AAA pattern (Arrange/Act/Assert)
- `expect(...).rejects.toThrow(...)` for async errors
- `expect(err).toBeInstanceOf(ErrorClass)` for error type checks
- `expect.objectContaining({...})` for partial matching

## Architecture Notes

- **Two identities**: `antigravity` (IDE quota via `fetchAvailableModels`) and `gemini-cli` (CLI quota via `retrieveUserQuota`) hit different API endpoints
- **Model names are dynamic**: fetched from Google APIs at runtime, filtered by `/gemini|claude|image|imagen/i` regex
- **Summary allowlist**: hardcoded list in `src/output/table.ts` controls which models appear in the summary table; all models appear in "Full detail"
- **Account storage**: JSON file at `~/.config/opencode/usage-google-accounts.json`
- **Immutable data**: `upsertAccount` returns new objects via spread, never mutates in place
- **Token caching**: Access tokens are cached to the store file (`cachedAccessToken` / `cachedExpiresAt` fields on each identity). On subsequent runs within the token's ~1 hour lifetime (with a 5-minute safety margin), the OAuth refresh round-trip is skipped. Cache persistence is fire-and-forget (non-blocking, errors swallowed).
- **Network timeouts**: Quota fetch and project discovery use 15s timeouts; token refresh uses a 10s timeout via `AbortController`. All timeouts throw on expiry rather than hanging.
