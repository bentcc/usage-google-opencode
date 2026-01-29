/**
 * Table output formatter for quota status display.
 * Renders a human-readable table with quota information.
 */

import type { AccountQuotaReport, IdentityError } from "../commands/status";

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

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

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

  const lines: string[] = [];

  // Header (total width 90 chars including borders)
  lines.push("┌" + "─".repeat(88) + "┐");
  lines.push(
    "│ " +
      "Email".padEnd(22) +
      "Identity".padEnd(12) +
      "Model".padEnd(18) +
      "Remaining".padEnd(10) +
      "Reset".padEnd(8) +
      "Status".padEnd(16) +
      "│"
  );
  lines.push("├" + "─".repeat(88) + "┤");

  // Data rows
  for (const report of reports) {
    for (const model of report.models) {
      const email = report.email.slice(0, 21).padEnd(22);
      const identity = report.identity.slice(0, 11).padEnd(12);
      const modelName = model.model.slice(0, 17).padEnd(18);
      const remaining = `${model.remainingPercent}%`.padEnd(10);
      const reset = model.resetTime ? formatResetTime(model.resetTime) : "-";
      const status = "OK";
      lines.push(`│ ${email}${identity}${modelName}${remaining}${reset.slice(0, 7).padEnd(8)}${status.padEnd(16)}│`);
    }
  }

  // Error rows
  for (const err of errors) {
    const email = err.email.slice(0, 21).padEnd(22);
    const identity = err.identity.slice(0, 11).padEnd(12);
    const modelCol = "-".padEnd(18);
    const remainingCol = "-".padEnd(10);
    const resetCol = "-".padEnd(8);
    const status = err.needsRelogin ? "Needs relogin" : (err.isForbidden ? "Forbidden" : "Error");
    lines.push(`│ ${email}${identity}${modelCol}${remainingCol}${resetCol}${status.padEnd(16)}│`);
  }

  lines.push("└" + "─".repeat(88) + "┘");

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
