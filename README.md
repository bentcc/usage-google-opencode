# usage-google-opencode

CLI for checking Google Cloud Code Assist quota usage for two identities:
- Antigravity (IDE client)
- Gemini CLI (CLI client)

This project was developed with AI assistance.

## Requirements

- Node.js 20+
- A Google account authorized for Code Assist

## Install

```bash
npm install
npm run build
```

## Global install (npm link)

Link for global usage:

```bash
npm install
npm run build
npm link
```

Remove the global link:

```bash
npm unlink -g usage-google-opencode
# or, from this repo:
npm unlink
```

## Usage

Login (Antigravity only):

```bash
usage-google login --mode antigravity
```

Login (Gemini CLI requires your GCP project ID):

```bash
usage-google login --mode gemini-cli --project my-gcp-projectID
```

Login both:

```bash
usage-google login --mode both --project my-gcp-projectID
```

Check quota status:

```bash
usage-google status
```

JSON output:

```bash
usage-google status --format json
```

Simple example (Gemini CLI only):

```bash
usage-google status --only gemini-cli
```

## Notes

- Gemini CLI quota requires a project ID from your GCP account. You can find it via:
  `gcloud config get-value project`
- Storage file: `~/.config/opencode/usage-google-accounts.json`
- Default output is a table; use `--format json` for machine-readable output
- Reset time is shown as `HhMm` and switches to `XdYhZm` when >= 24 hours
- Output includes a Summary (allowlisted models) and Full detail section

OAuth client credentials are stored in the same file under `oauthClients`:

```json
{
  "version": 1,
  "oauthClients": {
    "antigravity": { "clientId": "...", "clientSecret": "..." },
    "gemini-cli": { "clientId": "...", "clientSecret": "..." }
  },
  "accounts": []
}
```

Keep this file private — it contains both refresh tokens and client secrets.

## Development

Run tests:

```bash
npm test
```

Typecheck:

```bash
npm run typecheck
```
