import { runStatus, type OutputFormat } from "./commands/status";
import type { QuotaIdentity } from "./oauth/constants";

export type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const HELP_TEXT = `usage-opencode - Check Google Cloud Code quota usage

Commands:
  login     Connect a Google account (Antigravity and/or Gemini CLI)
  status    Show quota usage for all connected accounts

Options:
  --help, -h           Show this help message
  --format <format>    Output format: table (default) or json
  --only <identity>    Filter to one identity: antigravity or gemini-cli
  --account <email>    Filter to a specific account

Examples:
  usage-opencode status
  usage-opencode status --format json
  usage-opencode status --only antigravity
  usage-opencode login --mode both
`;

function parseArgs(argv: string[]): {
  command: string;
  format?: OutputFormat;
  identityFilter?: QuotaIdentity;
  accountFilter?: string;
  mode?: string;
  help?: boolean;
} {
  const result: {
    command: string;
    format?: OutputFormat;
    identityFilter?: QuotaIdentity;
    accountFilter?: string;
    mode?: string;
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
      // Login command will be implemented in Task 8
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Login command not yet implemented. Coming in Task 8.\n",
      };
    }

    default: {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Unknown command: ${args.command}\nRun 'usage-opencode --help' for usage.\n`,
      };
    }
  }
}
