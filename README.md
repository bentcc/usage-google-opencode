# usage-google-opencode

CLI for checking Google Cloud Code Assist quota usage for two identities:
- Antigravity (IDE client)
- Gemini CLI (CLI client)

This project was developed with AI assistance.

## Requirements

- Node.js 20+ or Bun
- A Google account authorized for Code Assist

## Install

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

## Global install

Install for global usage:

Using npm:

```bash
npm install
npm run build
npm link
```

Using bun:

```bash
bun install
bun run build
bun pm pack
bun install -g "$(pwd)/usage-google-opencode-0.0.0.tgz"
```

Make sure `~/.bun/bin` is in your PATH. Add this to your shell profile if needed:

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

Remove the global install:

Using npm:

```bash
npm unlink -g usage-google-opencode
# or, from this repo:
npm unlink
```

Using bun:

```bash
bun remove -g usage-google-opencode
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
- The storage file contains refresh tokens. Keep it private and secure.

## Development

Run tests:

Using npm:

```bash
npm test
```

Using bun:

```bash
bun test
```

Typecheck:

Using npm:

```bash
npm run typecheck
```

Using bun:

```bash
bun run typecheck
```
