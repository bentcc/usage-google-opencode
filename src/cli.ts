import { runStatus, type OutputFormat } from "./commands/status";
import { runLogin, type LoginMode } from "./commands/login";
import type { QuotaIdentity } from "./oauth/constants";

export type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const HELP_TEXT = `usage-google - Check Google Cloud Code quota usage

Commands:
  login     Connect a Google account (Antigravity and/or Gemini CLI)
  status    Show quota usage for all connected accounts

Options:
  --help, -h           Show this help message
  --format <format>    Output format: table (default) or json
  --only <identity>    Filter to one identity: antigravity or gemini-cli
  --account <email>    Filter to a specific account

Login Options:
  --mode <mode>        Login mode: antigravity, gemini-cli, or both
  --project <id>       GCP project ID for gemini-cli quota (required for gemini-cli)

Examples:
  usage-google status
  usage-google status --format json
  usage-google status --only antigravity
  usage-google login --mode both
  usage-google login --mode gemini-cli --project my-gcp-projectID
  usage-google login --mode both --project my-gcp-projectID
`;

function parseArgs(argv: string[]): {
  command: string;
  format?: OutputFormat;
  identityFilter?: QuotaIdentity;
  accountFilter?: string;
  mode?: string;
  project?: string;
  help?: boolean;
} {
  const result: {
    command: string;
    format?: OutputFormat;
    identityFilter?: QuotaIdentity;
    accountFilter?: string;
    mode?: string;
    project?: string;
    help?: boolean;
  } = { command: "" };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--format" && argv[i + 1]) {
      const format = argv[++i];
      if (format === "table" || format === "json") {
        result.format = format;
      }
    } else if (arg === "--only" && argv[i + 1]) {
      const identity = argv[++i];
      if (identity === "antigravity" || identity === "gemini-cli") {
        result.identityFilter = identity;
      }
    } else if (arg === "--account" && argv[i + 1]) {
      result.accountFilter = argv[++i];
    } else if (arg === "--mode" && argv[i + 1]) {
      result.mode = argv[++i];
    } else if (arg === "--project" && argv[i + 1]) {
      result.project = argv[++i];
    } else if (!arg.startsWith("-") && !result.command) {
      result.command = arg;
    }
  }

  return result;
}

export async function runCli(argv: string[]): Promise<CliResult> {
  const args = parseArgs(argv);

  // Show help if requested or no arguments
  if (args.help || argv.length === 0) {
    return {
      exitCode: 0,
      stdout: HELP_TEXT,
      stderr: "",
    };
  }

  // Handle commands
  switch (args.command) {
    case "status": {
      try {
        const result = await runStatus({
          format: args.format,
          identityFilter: args.identityFilter,
          accountFilter: args.accountFilter,
        });

        // Exit code 0 for success, even if some accounts need relogin
        // Exit code 2 only if ALL accounts failed
        const allFailed = result.reports.length === 0 && result.errors.length > 0;
        return {
          exitCode: allFailed ? 2 : 0,
          stdout: result.output,
          stderr: "",
        };
      } catch (error) {
        return {
          exitCode: 2,
          stdout: "",
          stderr: `Error: ${error instanceof Error ? error.message : String(error)}\n`,
        };
      }
    }

    case "login": {
      // Validate mode if provided
      const mode = args.mode;
      if (mode && mode !== "antigravity" && mode !== "gemini-cli" && mode !== "both") {
        return {
          exitCode: 1,
          stdout: "",
          stderr: `Invalid mode: ${mode}. Must be antigravity, gemini-cli, or both.\n`,
        };
      }

      // Warn if gemini-cli mode is used without --project
      if ((mode === "gemini-cli" || mode === "both") && !args.project) {
        console.log("Note: For gemini-cli quota, you may need to specify --project <gcp-project-id>");
        console.log("      Get your project ID with: gcloud config get-value project\n");
      }

      try {
        const result = await runLogin({
          mode: mode as LoginMode | undefined,
          projectId: args.project,
        });

        if (!result.success) {
          return {
            exitCode: 1,
            stdout: "",
            stderr: `Login failed: ${result.error}\n`,
          };
        }

        const identities = result.identitiesCompleted.join(", ");
        return {
          exitCode: 0,
          stdout: `Successfully logged in as ${result.email} (${identities})\n`,
          stderr: "",
        };
      } catch (error) {
        return {
          exitCode: 2,
          stdout: "",
          stderr: `Error: ${error instanceof Error ? error.message : String(error)}\n`,
        };
      }
    }

    default: {
      return {
        exitCode: 1,
        stdout: "",
          stderr: `Unknown command: ${args.command}\nRun 'usage-google --help' for usage.\n`,
        };
    }
  }
}
