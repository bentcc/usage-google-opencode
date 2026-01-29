/**
 * Login command: connects a Google account via OAuth.
 * Supports antigravity, gemini-cli, or both identities.
 */

import http from "node:http";
import { spawn } from "node:child_process";

import type { QuotaIdentity } from "../oauth/constants";
import type { UsageOpencodeStore } from "../storage";
import {
  loadStore as defaultLoadStore,
  saveStore as defaultSaveStore,
  upsertAccount,
} from "../storage";
import { buildAuthorizationUrl as defaultBuildAuthorizationUrl } from "../oauth/authorize";
import { exchangeCode as defaultExchangeCode } from "../oauth/token";
import { fetchUserEmail as defaultFetchUserEmail } from "../google/userinfo";

export type LoginMode = "antigravity" | "gemini-cli" | "both";

export interface CallbackServer {
  port: number;
  waitForCallback: () => Promise<string>;
  close: () => void;
}

export interface LoginDeps {
  loadStore: (opts?: { configDir?: string }) => Promise<UsageOpencodeStore>;
  saveStore: (opts: { configDir?: string } | undefined, store: UsageOpencodeStore) => Promise<void>;
  buildAuthorizationUrl: (input: {
    identity: QuotaIdentity;
    redirectUri?: string;
  }) => Promise<{ url: string; verifier: string }>;
  exchangeCode: (input: {
    identity: QuotaIdentity;
    code: string;
    verifier: string;
    redirectUri: string;
    fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  }) => Promise<{ accessToken: string; refreshToken: string; expiresAt: number }>;
  fetchUserEmail: (input: {
    accessToken: string;
    fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  }) => Promise<string>;
  startCallbackServer: () => Promise<CallbackServer>;
  openBrowser: (url: string) => Promise<void>;
  prompt: (message: string) => Promise<string>;
  selectMode: () => Promise<LoginMode>;
  log: (message: string) => void;
}

/**
 * Prompts user to select login mode interactively.
 */
async function defaultSelectMode(): Promise<LoginMode> {
  console.log("\nSelect login mode:");
  console.log("  1) antigravity  - Antigravity IDE quota");
  console.log("  2) gemini-cli   - Gemini CLI quota");
  console.log("  3) both         - Both identities (recommended)");
  console.log("");

  const response = await defaultPrompt("Enter choice [1-3, default: 3]: ");
  const choice = response.trim() || "3";

  switch (choice) {
    case "1":
      return "antigravity";
    case "2":
      return "gemini-cli";
    case "3":
    default:
      return "both";
  }
}

const defaultDeps: LoginDeps = {
  loadStore: defaultLoadStore,
  saveStore: defaultSaveStore,
  buildAuthorizationUrl: defaultBuildAuthorizationUrl,
  exchangeCode: defaultExchangeCode,
  fetchUserEmail: defaultFetchUserEmail,
  startCallbackServer: defaultStartCallbackServer,
  openBrowser: defaultOpenBrowser,
  prompt: defaultPrompt,
  selectMode: defaultSelectMode,
  log: (msg) => console.log(msg),
};

export interface LoginOptions {
  mode?: LoginMode;
  projectId?: string; // Project ID to use for gemini-cli (required for gemini-cli identity)
  configDir?: string;
  deps?: LoginDeps;
}

export interface LoginResult {
  success: boolean;
  email?: string;
  error?: string;
  identitiesCompleted: QuotaIdentity[];
}

/**
 * Parses the authorization code from a callback URL.
 */
export function parseCallbackCode(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("code") ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Starts a local HTTP server to receive the OAuth callback.
 */
async function defaultStartCallbackServer(): Promise<CallbackServer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let callbackResolve: (url: string) => void;
    let callbackReject: (error: Error) => void;

    const callbackPromise = new Promise<string>((res, rej) => {
      callbackResolve = res;
      callbackReject = rej;
    });

    const server = http.createServer((req, res) => {
      const url = `http://localhost${req.url}`;

      // Check for OAuth error in callback
      try {
        const parsed = new URL(url);
        const error = parsed.searchParams.get("error");
        const errorDescription = parsed.searchParams.get("error_description");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>Login Failed</title></head>
            <body style="font-family: system-ui; text-align: center; padding: 50px;">
              <h1>Login failed</h1>
              <p>${error}${errorDescription ? `: ${errorDescription}` : ""}</p>
              <p>Please close this window and try again.</p>
            </body>
            </html>
          `);
        } else {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>Login Complete</title></head>
            <body style="font-family: system-ui; text-align: center; padding: 50px;">
              <h1>Login successful!</h1>
              <p>You can close this window and return to the terminal.</p>
            </body>
            </html>
          `);
        }
      } catch {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Login Complete</title></head>
          <body style="font-family: system-ui; text-align: center; padding: 50px;">
            <h1>Login successful!</h1>
            <p>You can close this window and return to the terminal.</p>
          </body>
          </html>
        `);
      }

      callbackResolve(url);
    });

    server.on("error", (err) => {
      // Only reject if we haven't already resolved
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    // Listen on random port
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        if (!settled) {
          settled = true;
          reject(new Error("Failed to get server address"));
        }
        return;
      }

      settled = true;
      const port = addr.port;

      // Set up timeout for callback
      const timeout = setTimeout(() => {
        callbackReject(new Error("timeout"));
      }, 120000); // 2 minute timeout

      resolve({
        port,
        waitForCallback: () => callbackPromise,
        close: () => {
          clearTimeout(timeout);
          server.close();
        },
      });
    });
  });
}

/**
 * Opens a URL in the default browser.
 * Uses spawn with array arguments to prevent command injection.
 */
async function defaultOpenBrowser(url: string): Promise<void> {
  return new Promise((resolve) => {
    let child;

    if (process.platform === "darwin") {
      child = spawn("open", [url], { detached: true, stdio: "ignore" });
    } else if (process.platform === "win32") {
      child = spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
    } else {
      child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    }

    child.unref();

    // Best-effort - don't fail if browser can't be opened
    child.on("error", () => {});
    
    // Resolve immediately, don't wait for browser
    resolve();
  });
}

/**
 * Prompts user for input via stdin.
 * Handles EOF gracefully for non-interactive terminals.
 */
async function defaultPrompt(message: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(message);

    let data = "";
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        process.stdin.removeListener("data", onData);
        process.stdin.removeListener("end", onEnd);
        process.stdin.removeListener("error", onError);
        process.stdin.pause();
      }
    };

    const onData = (chunk: Buffer) => {
      data += chunk.toString();
      if (data.includes("\n")) {
        cleanup();
        resolve(data.trim());
      }
    };

    const onEnd = () => {
      cleanup();
      resolve(data.trim());
    };

    const onError = () => {
      cleanup();
      resolve(data.trim());
    };

    process.stdin.resume();
    process.stdin.on("data", onData);
    process.stdin.once("end", onEnd);
    process.stdin.once("error", onError);
  });
}

/**
 * Performs login for a single identity.
 */
async function loginIdentity(
  identity: QuotaIdentity,
  deps: LoginDeps,
): Promise<{ email: string; refreshToken: string } | { error: string }> {
  deps.log(`\nLogging in with ${identity}...`);

  // Start callback server
  let server: CallbackServer;
  try {
    server = await deps.startCallbackServer();
  } catch (err) {
    return { error: `Failed to start callback server: ${err}` };
  }

  const redirectUri = `http://localhost:${server.port}/callback`;

  try {
    // Build auth URL
    const { url, verifier } = await deps.buildAuthorizationUrl({
      identity,
      redirectUri,
    });

    deps.log(`Opening browser for authentication...`);
    deps.log(`If browser doesn't open, visit this URL:\n${url}\n`);

    // Try to open browser
    await deps.openBrowser(url);

    // Wait for callback or fallback to paste
    let callbackUrl: string;
    try {
      callbackUrl = await server.waitForCallback();
    } catch {
      deps.log("Waiting for browser callback timed out.");
      const pasted = await deps.prompt(
        "Paste the redirect URL from your browser: ",
      );
      callbackUrl = pasted;
    }

    const code = parseCallbackCode(callbackUrl);
    if (!code) {
      return { error: "No authorization code found in callback URL" };
    }

    // Exchange code for tokens
    deps.log("Exchanging authorization code...");
    let accessToken: string;
    let refreshToken: string;
    try {
      const tokenResult = await deps.exchangeCode({
        identity,
        code,
        verifier,
        redirectUri,
      });
      accessToken = tokenResult.accessToken;
      refreshToken = tokenResult.refreshToken;
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }

    // Fetch user email
    let email: string;
    try {
      email = await deps.fetchUserEmail({ accessToken });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }

    deps.log(`Successfully logged in as ${email}`);

    return { email, refreshToken };
  } finally {
    server.close();
  }
}

/**
 * Main login command implementation.
 */
export async function runLogin(options: LoginOptions): Promise<LoginResult> {
  const deps = options.deps ?? defaultDeps;
  const identitiesCompleted: QuotaIdentity[] = [];

  // Determine which identities to login (interactive if not specified)
  let mode = options.mode;
  if (!mode) {
    mode = await deps.selectMode();
  }

  const identities: QuotaIdentity[] =
    mode === "both"
      ? ["antigravity", "gemini-cli"]
      : [mode];

  let store = await deps.loadStore({ configDir: options.configDir });
  let email: string | undefined;
  let lastError: string | undefined;

  for (const identity of identities) {
    const result = await loginIdentity(identity, deps);

    if ("error" in result) {
      lastError = result.error;
      deps.log(`Error: ${result.error}`);
      continue;
    }

    email = result.email;

    // Update store with new identity (including projectId if provided)
    const identityData: { refreshToken: string; projectId?: string } = {
      refreshToken: result.refreshToken,
    };

    // For gemini-cli, store the provided projectId
    if (identity === "gemini-cli" && options.projectId) {
      identityData.projectId = options.projectId;
    }

    const accountUpdate =
      identity === "antigravity"
        ? { email, antigravity: identityData }
        : { email, geminiCli: identityData };

    store = upsertAccount(store, accountUpdate);
    identitiesCompleted.push(identity);
  }

  // Save store if any identity succeeded
  if (identitiesCompleted.length > 0) {
    await deps.saveStore({ configDir: options.configDir }, store);
  }

  if (identitiesCompleted.length === 0) {
    return {
      success: false,
      error: lastError ?? "Login failed",
      identitiesCompleted,
    };
  }

  return {
    success: true,
    email,
    identitiesCompleted,
  };
}
