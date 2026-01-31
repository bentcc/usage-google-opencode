# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- **Network Timeouts**: 10-second timeouts prevent hanging on slow networks

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

- 77 passing unit tests
- Full test coverage for core modules
- Integration tests for CLI commands
- Mocked network calls for reliable testing

---

## Implementation Notes

### OAuth Clients

The following OAuth credentials are hardcoded by design (extracted from official sources):

**Antigravity (IDE Quota):**
- Client ID: `1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com`
- Client Secret: `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`

**Gemini CLI (CLI Quota):**
- Client ID: `681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com`
- Client Secret: `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`

These are public client credentials and pose no security risk.

### API Endpoints

**Antigravity Quota:**
- Primary: `https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`
- Fallbacks: Daily and autopush sandbox endpoints

**Gemini CLI Quota:**
- Primary: `https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota`
- Fallbacks: Daily and autopush sandbox endpoints

**Project Discovery:**
- Primary: `https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`
- Fallbacks: Daily and autopush sandbox endpoints
- Default: `rising-fact-p41fc` (if all endpoints fail)

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
- Network requests timeout after 10 seconds per endpoint
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

[1.0.0]: https://github.com/YOUR_USERNAME/usage-google-opencode/releases/tag/v1.0.0
