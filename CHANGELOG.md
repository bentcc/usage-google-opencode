# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] - 2026-02-20

### Fixed

#### Gemini CLI Quota Fetching (Aligned with Real gemini-cli)
- **User-Agent**: Replaced incorrect `google-api-nodejs-client/9.15.1` with `GeminiCLI/<version>/<model> (<platform>; <arch>)` matching the real Gemini CLI format from `contentGenerator.ts`.
- **Extraneous headers**: Removed `X-Goog-Api-Client` and `Client-Metadata` headers. The real gemini-cli does not send these as HTTP headers (`ClientMetadata` is a JSON body field used only for telemetry).
- **Endpoint strategy**: Removed sandbox endpoint fallback (daily + autopush). The real gemini-cli uses only the production endpoint (`cloudcode-pa.googleapis.com`). Now uses retry logic (3 attempts, 1s delay) matching the antigravity path.
- **Response type**: Added `remainingAmount` (string) and `tokenType` (string) fields to `RetrieveUserQuotaResponse` bucket type, matching gemini-cli's `BucketInfo` from `code_assist/types.ts`.

### Changed
- **Unified retry logic**: Both antigravity and gemini-cli identities now use the same retry strategy (3 attempts, 1s delay, 403 throws immediately). Removed separate `fetchQuotaWithEndpointFallback` function.
- **Test count**: Increased from 80 to 82 tests (added gemini-cli retry and 403 no-retry tests).

---

## [1.1.0] - 2026-02-20

### Fixed

#### Antigravity Quota Fetching (Critical)
- **User-Agent**: Replaced static `antigravity/1.11.5 windows/amd64` with full Electron-style User-Agent matching the official Antigravity client (`Mozilla/5.0 (...) Antigravity/1.16.5 Chrome/132.0.6834.160 Electron/39.2.3 Safari/537.36`). The API rejects non-conforming User-Agent strings.
- **Extraneous headers**: Removed `X-Goog-Api-Client` and `Client-Metadata` headers from antigravity quota requests (the working Antigravity-Manager does not send them).
- **Endpoint strategy**: Antigravity quota now uses only the production endpoint with retry logic (3 attempts, 1s delay) instead of trying 3 endpoints sequentially. This matches the Antigravity-Manager behavior.
- **403 handling**: 403 Forbidden errors are still thrown immediately without retry.

#### Project ID Discovery
- **Primary endpoint**: Switched from production to daily sandbox (`daily-cloudcode-pa.sandbox.googleapis.com`) as primary, avoiding 429 rate limits. Production is now a fallback.
- **ideType**: Changed from `IDE_UNSPECIFIED` to `ANTIGRAVITY` to match the working implementation.
- **User-Agent**: Updated to use the same Electron-style User-Agent as quota requests.
- **Fallback project**: Updated default from `rising-fact-p41fc` to `bamboo-precept-lgxtn`.

### Changed
- **Model filter**: Expanded from `/gemini|claude/i` to `/gemini|claude|image|imagen/i` to include image generation models.
- **Fetch timeout**: Increased from 10s to 15s per request, matching the Antigravity-Manager.
- **Test count**: Increased from 77 to 80 tests (added retry, 403 no-retry, and image model filter tests).

---

## [1.0.0] - 2026-01-31

### 🎉 Initial Release

First production-ready release of usage-google-opencode CLI tool for monitoring Google Cloud Code Assist quota.

### ✨ Features

#### Core Functionality
- **Dual Identity Support**: Track quota for both Antigravity (IDE) and Gemini CLI identities
- **OAuth2 Authentication**: Secure login flow with PKCE support
- **Quota Monitoring**: Real-time quota checking with remaining percentage and reset times
- **Multiple Output Formats**: Table view (default) or JSON for automation
- **Filtering**: Filter by identity (`--only`) or account (`--account`)

#### User Experience
- **Interactive Login**: Browser-based OAuth flow with fallback manual paste
- **Beautiful Tables**: Summary and full detail views with formatted columns
- **Clear Error Messages**: Helpful messages for common issues (relogin, forbidden, etc.)
- **Reset Time Formatting**: Human-readable times (e.g., "2h30m" or "1d5h30m")

#### Model Support
- Tracks quota for Gemini and Claude AI models
- Filters to relevant models only
- Project ID auto-discovery for Antigravity
- Manual project ID specification for Gemini CLI

### 🔒 Security

#### Critical Security Improvements
- **File Permissions**: Storage file automatically set to `0600` (owner read/write only)
- **URL Validation**: Callback URLs validated to prevent malicious redirects
- **Atomic Writes**: Write-then-rename pattern prevents file corruption
- **Input Validation**: All user inputs and API responses validated

#### Security Features
- **Refresh Token Security**: Tokens stored with restrictive permissions
- **No Token Logging**: Refresh tokens never printed to console
- **Graceful Shutdown**: SIGINT/SIGTERM handlers for clean exits
- **Network Timeouts**: 15-second timeouts prevent hanging on slow networks

### 🚀 Performance

- **Parallel Fetching**: Quota fetched in parallel for multiple accounts/identities
- **Parallel Storage Loading**: Current and legacy storage files loaded concurrently
- **Efficient Table Rendering**: Optimized column width calculations
- **Fast Startup**: Minimal dependencies and efficient file I/O

### 🛠️ Technical Details

#### Dependencies
- `@openauthjs/openauth`: PKCE support for OAuth flow
- Node.js built-in modules: `fs`, `http`, `os`, `path`, `child_process`
- Zero runtime dependencies beyond OpenAuth

#### Platform Support
- **Node.js**: 20+
- **Operating Systems**: macOS, Linux, Windows
- **Package Managers**: npm, bun

#### Storage
- **Location**: `~/.config/opencode/usage-google-accounts.json`
- **Format**: JSON with version 1 schema
- **Migration**: Auto-migrates from legacy storage file
- **Permissions**: 0600 (owner read/write only)

### 📝 Documentation

- Comprehensive README with examples
- Security and privacy guidelines
- Installation instructions for npm and bun
- Development guide with testing instructions

### 🧪 Testing

- 80 passing unit tests
- Full test coverage for core modules
- Integration tests for CLI commands
- Mocked network calls for reliable testing

---

## Implementation Notes

### OAuth Clients

OAuth client credentials are hardcoded in `src/oauth/constants.ts` by design. These are public client credentials extracted from:
- **Antigravity IDE** - for IDE quota tracking
- **Google Cloud SDK / Gemini CLI** - for CLI quota tracking

> **Note**: These credentials are intentionally public (standard for OAuth public clients) and pose no security risk. They are necessary for the tool to authenticate with Google's OAuth servers. See `src/oauth/constants.ts` for the actual credential values.

### API Endpoints

**Antigravity Quota:**
- Endpoint: `https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`
- Strategy: Retry up to 3 times with 1s delay (403 throws immediately)

**Gemini CLI Quota:**
- Endpoint: `https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota`
- Strategy: Retry up to 3 times with 1s delay (403 throws immediately)

**Project Discovery:**
- Primary: `https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist`
- Fallback: `https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`
- Default: `bamboo-precept-lgxtn` (if all endpoints fail)

### Development Timeline

- **Initial Planning**: 2026-01-18
- **Implementation**: Tasks 1-10 completed with TDD approach
- **E2E Verification**: 2026-01-28
- **Security Audit**: 2026-01-31
- **Production Release**: 2026-01-31 (v1.0.0)

---

## Known Issues & Limitations

### Current Limitations
- Concurrent login commands may cause storage corruption (mitigated with atomic writes)
- Gemini CLI quota requires manual project ID specification
- Network requests timeout after 15 seconds per endpoint
- Email addresses displayed in output (privacy consideration)

### Future Enhancements (Potential)
- Interactive project ID selection for Gemini CLI
- Quota alerts and notifications
- Historical quota tracking
- Multi-account batch operations
- Configuration file support

---

## Upgrade Notes

### From 0.0.0 to 1.0.0

This is the first production release. If you were using development versions:

1. **Storage Migration**: Legacy storage files automatically migrated
2. **File Permissions**: Existing storage files should be manually secured:
   ```bash
   chmod 600 ~/.config/opencode/usage-google-accounts.json
   ```
3. **Breaking Changes**: None (first release)

---

## Credits

- **Development**: Built with AI assistance
- **OAuth Credentials**: Extracted from Google Cloud SDK and Antigravity IDE
- **API Integration**: Uses Google Cloud Code Assist internal APIs

---

## Links

- **Repository**: https://github.com/YOUR_USERNAME/usage-google-opencode
- **Issues**: https://github.com/YOUR_USERNAME/usage-google-opencode/issues
- **Documentation**: See `docs/` directory

---

[1.2.0]: https://github.com/bentcc/usage-google-opencode/releases/tag/v1.2.0
[1.1.0]: https://github.com/bentcc/usage-google-opencode/releases/tag/v1.1.0
[1.0.0]: https://github.com/bentcc/usage-google-opencode/releases/tag/v1.0.0
