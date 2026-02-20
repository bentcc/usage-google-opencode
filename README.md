# usage-google-opencode

> 🔍 **CLI tool for checking Google Cloud Code Assist quota usage**

Track your quota usage across two Google Cloud identities:
- **Antigravity** (IDE client quota)
- **Gemini CLI** (CLI client quota)

Built with AI assistance and designed for developers using Google Cloud Code Assist.

---

## ✨ Features

- 🔐 Secure OAuth2 authentication with Google
- 📊 Real-time quota monitoring for both IDE and CLI identities
- 🎯 Filters for Gemini, Claude, and image generation AI models
- 📋 Beautiful table output or JSON for automation
- 🔄 Automatic token refresh
- 💾 Secure local storage with proper file permissions
- ⚡ Fast parallel quota fetching

---

## 📦 Installation

### Requirements

- **Node.js 20+** or **Bun**
- A Google account authorized for Code Assist

### Install Locally

Using npm:
```bash
npm install
npm run build
```

Using bun:
```bash
bun install
bun run build
```

### Global Installation

#### Using npm:
```bash
npm install
npm run build
npm link
```

#### Using bun:
```bash
bun install
bun run build
bun pm pack
bun install -g "$(pwd)/usage-google-opencode-1.2.0.tgz"
```

Make sure `~/.bun/bin` is in your PATH:
```bash
export PATH="$HOME/.bun/bin:$PATH"
```

### Uninstall

#### Using npm:
```bash
npm unlink -g usage-google-opencode
# or, from this repo:
npm unlink
```

#### Using bun:
```bash
bun remove -g usage-google-opencode
```

---

## 🚀 Usage

### Login

**Antigravity only:**
```bash
usage-google login --mode antigravity
```

**Gemini CLI (requires GCP project ID):**
```bash
usage-google login --mode gemini-cli --project my-gcp-projectID
```

**Both identities (recommended):**
```bash
usage-google login --mode both --project my-gcp-projectID
```

> 💡 **Tip:** Get your GCP project ID with: `gcloud config get-value project`

### Check Quota Status

**Default table view:**
```bash
usage-google status
```

**JSON output (for automation):**
```bash
usage-google status --format json
```

**Filter by identity:**
```bash
usage-google status --only antigravity
usage-google status --only gemini-cli
```

**Filter by account:**
```bash
usage-google status --account user@example.com
```

---

## 📖 Examples

### Quick Start
```bash
# Login with both identities
usage-google login --mode both --project my-project-123

# Check your quota
usage-google status
```

### Output Example

```
Summary

┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Email                  Identity      Model                      Remaining  Reset      Status        │
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ user@example.com       antigravity   claude-opus-4-6-thinking   100%       2h30m      OK            │
│ user@example.com       antigravity   gemini-3-pro-high          95%        2h30m      OK            │
│ user@example.com       gemini-cli    gemini-3-pro-preview       100%       23h45m     OK            │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔒 Security & Privacy

### Stored Data
- **Location:** `~/.config/opencode/usage-google-accounts.json`
- **Contains:** Refresh tokens and email addresses
- **Permissions:** Automatically set to `0600` (owner read/write only)

### What's Stored
```json
{
  "version": 1,
  "accounts": [
    {
      "email": "user@example.com",
      "antigravity": { "refreshToken": "..." },
      "geminiCli": { "refreshToken": "...", "projectId": "my-project" },
      "addedAt": 1234567890,
      "updatedAt": 1234567890
    }
  ]
}
```

### Privacy Notes
- ✅ Refresh tokens are securely stored with restrictive file permissions
- ✅ Access tokens are ephemeral (never persisted)
- ✅ Email addresses are displayed in status output
- ⚠️ **Never commit the storage file to version control**
- ⚠️ **Never share the storage file**

### OAuth Credentials
The OAuth client IDs and secrets are hardcoded by design. These are public client credentials extracted from:
- **Antigravity IDE** (for IDE quota)
- **Google Cloud SDK / Gemini CLI** (for CLI quota)

This is standard practice for OAuth public clients and poses no security risk.

---

## ⚙️ Configuration

### Storage File
Default location: `~/.config/opencode/usage-google-accounts.json`

- **macOS/Linux:** `~/.config/opencode/`
- **Windows:** `%APPDATA%\opencode\`

### Network Timeouts
- **Endpoint timeout:** 15 seconds per request (with retry up to 3 times for both identities)
- **Login timeout:** 2 minutes for OAuth callback

### Quota Reset Times
- Displayed as `2h30m` for times under 24 hours
- Switches to `1d5h30m` format for times over 24 hours
- Shows `now` for expired quotas

---

## 🛠️ Development

### Run Tests
```bash
npm test        # or: bun test
```

### Type Check
```bash
npm run typecheck
```

### Build
```bash
npm run build
```

### Run Locally
```bash
node dist/index.js status
```

---

## 📝 Known Limitations

- Concurrent `login` commands may cause storage corruption (atomic writes mitigate this in v1.0.0+)
- Network requests timeout after 15 seconds; both identities retry up to 3 times (403 errors throw immediately)
- Gemini CLI quota requires a GCP project ID

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🙏 Acknowledgments

- Built with assistance from AI
- OAuth credentials extracted from official Google Cloud SDK and Antigravity IDE
- Uses Google Cloud Code Assist internal APIs

---

## 📞 Support

- **Issues:** [Report bugs or request features](../../issues)
- **Documentation:** See `docs/` directory for implementation details

---

## 🔄 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

---

<div align="center">

**⭐ If this tool helps you, consider giving it a star! ⭐**

Made with ❤️ and AI assistance

</div>
