/**
 * Table output formatter for quota status display.
 * Renders a human-readable table with quota information.
 */

import type { AccountQuotaReport, IdentityError } from "../commands/status.js";

/**
 * Formats reset time for table display.
 * Shows relative time (e.g., "2h30m") or "now" for past times.
 */
export function formatResetTime(resetTime: string): string {
  try {
    const date = new Date(resetTime);
    if (isNaN(date.getTime())) {
      // Invalid date - return truncated string
      return resetTime.slice(0, 10);
    }

    const now = new Date();
    const diffMs = date.getTime() - now.getTime();

    if (diffMs < 0) return "now";

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      return `${days}d${remHours}h${mins}m`;
    }
    if (hours > 0) return `${hours}h${mins}m`;
    return `${mins}m`;
  } catch {
    return resetTime.slice(0, 10);
  }
}

/**
 * Renders a table of quota reports and errors.
 *
 * Table columns:
 * - Email: User's Google account email
 * - Identity: antigravity or gemini-cli
 * - Model: Model name (e.g., gemini-2.5-pro)
 * - Remaining: Quota remaining as percentage
 * - Reset: Time until quota resets
 * - Status: OK, Needs relogin, or Error
 *
 * @param reports - Successfully fetched quota reports
 * @param errors - Identity errors (failed fetches)
 * @returns Formatted table string
 */
export function renderTable(reports: AccountQuotaReport[], errors: IdentityError[]): string {
  if (reports.length === 0 && errors.length === 0) {
    return "No accounts found. Run `usage-google login` to add an account.\n";
  }

  const summaryAllowlist = [
    "claude-opus-4-6-thinking",
    "gemini-3.1-pro-high",
    "gemini-3-pro-image",
    "gemini-3-pro-preview",
    "gemini-3-flash-preview",
  ];
  const orderedIdentities: Array<AccountQuotaReport["identity"]> = ["antigravity", "gemini-cli"];

  const summaryReports: AccountQuotaReport[] = reports.map((report) => ({
    ...report,
    models: summaryAllowlist
      .map((modelName) => report.models.find((model) => model.model === modelName))
      .filter((model): model is { model: string; remainingPercent: number; resetTime: string } => Boolean(model)),
  }));

  const summaryHasData = summaryReports.some((report) => report.models.length > 0) || errors.length > 0;

  const emailWidth = 22;
  const identityWidth = 12;
  const remainingWidth = 10;
  const statusWidth = 16;
  const resetValues = reports
    .flatMap((report) => report.models.map((model) => formatResetTime(model.resetTime)))
    .concat(errors.map(() => "-"));
  const resetWidth = Math.max(8, ...resetValues.map((value) => value.length));
  const modelValues = reports.flatMap((report) => report.models.map((model) => model.model));
  const modelWidth = Math.max(18, "-".length, ...modelValues.map((value) => value.length));
  const columnGap = 2;
  const contentWidth =
    emailWidth +
    identityWidth +
    modelWidth +
    remainingWidth +
    resetWidth +
    statusWidth +
    columnGap * 5;
  const innerWidth = contentWidth + 2;

  const lines: string[] = [];

  const renderHeader = (label: string) => {
    lines.push(label);
    lines.push("");
    lines.push("┌" + "─".repeat(innerWidth) + "┐");
    lines.push(
      "│ " +
        "Email".padEnd(emailWidth) +
        " ".repeat(columnGap) +
        "Identity".padEnd(identityWidth) +
        " ".repeat(columnGap) +
        "Model".padEnd(modelWidth) +
        " ".repeat(columnGap) +
        "Remaining".padEnd(remainingWidth) +
        " ".repeat(columnGap) +
        "Reset".padEnd(resetWidth) +
        " ".repeat(columnGap) +
        "Status".padEnd(statusWidth) +
        "│"
    );
    lines.push("├" + "─".repeat(innerWidth) + "┤");
  };

  const renderRows = (rows: AccountQuotaReport[]) => {
    for (const identity of orderedIdentities) {
      for (const report of rows.filter((row) => row.identity === identity)) {
        for (const model of report.models) {
          const email = report.email.slice(0, emailWidth - 1).padEnd(emailWidth);
          const identityLabel = report.identity.slice(0, identityWidth - 1).padEnd(identityWidth);
          const modelName = model.model.padEnd(modelWidth);
          const remaining = `${model.remainingPercent}%`.padEnd(remainingWidth);
          const reset = model.resetTime ? formatResetTime(model.resetTime) : "-";
          const resetCol = reset.padEnd(resetWidth);
          const status = "OK";
          lines.push(
            `│ ${email}${" ".repeat(columnGap)}` +
              `${identityLabel}${" ".repeat(columnGap)}` +
              `${modelName}${" ".repeat(columnGap)}` +
              `${remaining}${" ".repeat(columnGap)}` +
              `${resetCol}${" ".repeat(columnGap)}` +
              `${status.padEnd(statusWidth)}│`
          );
        }
      }
    }
  };

  const renderErrors = () => {
    for (const err of errors) {
      const email = err.email.slice(0, emailWidth - 1).padEnd(emailWidth);
      const identity = err.identity.slice(0, identityWidth - 1).padEnd(identityWidth);
      const modelCol = "-".padEnd(modelWidth);
      const remainingCol = "-".padEnd(remainingWidth);
      const resetCol = "-".padEnd(resetWidth);
      const status = err.needsRelogin ? "Needs relogin" : (err.isForbidden ? "Forbidden" : "Error");
      lines.push(
        `│ ${email}${" ".repeat(columnGap)}` +
          `${identity}${" ".repeat(columnGap)}` +
          `${modelCol}${" ".repeat(columnGap)}` +
          `${remainingCol}${" ".repeat(columnGap)}` +
          `${resetCol}${" ".repeat(columnGap)}` +
          `${status.padEnd(statusWidth)}│`
      );
    }
  };

  renderHeader("Summary");
  if (summaryHasData) {
    renderRows(summaryReports);
    renderErrors();
    lines.push("└" + "─".repeat(innerWidth) + "┘");
  } else {
    lines.push(`│ ${"(no matching models)".padEnd(contentWidth)}│`);
    lines.push("└" + "─".repeat(innerWidth) + "┘");
  }

  lines.push("");
  lines.push("Full detail");
  lines.push("");
  lines.push("┌" + "─".repeat(innerWidth) + "┐");
  lines.push(
    "│ " +
      "Email".padEnd(emailWidth) +
      " ".repeat(columnGap) +
      "Identity".padEnd(identityWidth) +
      " ".repeat(columnGap) +
      "Model".padEnd(modelWidth) +
      " ".repeat(columnGap) +
      "Remaining".padEnd(remainingWidth) +
      " ".repeat(columnGap) +
      "Reset".padEnd(resetWidth) +
      " ".repeat(columnGap) +
      "Status".padEnd(statusWidth) +
      "│"
  );
  lines.push("├" + "─".repeat(innerWidth) + "┤");
  renderRows(reports);
  renderErrors();
  lines.push("└" + "─".repeat(innerWidth) + "┘");

  // Footer with action required
  const needsRelogin = errors.filter((e) => e.needsRelogin);
  if (needsRelogin.length > 0) {
    lines.push("");
    lines.push("Action required:");
    for (const err of needsRelogin) {
      lines.push(`  usage-google login --mode ${err.identity} --account ${err.email}`);
    }
  }

  return lines.join("\n") + "\n";
}
