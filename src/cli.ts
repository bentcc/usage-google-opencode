export type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export async function runCli(argv: string[]): Promise<CliResult> {
  if (argv.length === 0) {
    return {
      exitCode: 0,
      stdout: "usage-opencode\n",
      stderr: "",
    };
  }

  return {
    exitCode: 0,
    stdout: "usage-opencode\n",
    stderr: "",
  };
}
