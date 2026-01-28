/**
 * JSON output formatter for quota status display.
 * Renders structured JSON output for programmatic consumption.
 */

import type { AccountQuotaReport, IdentityError } from "../commands/status";

/**
 * JSON output structure.
 */
export interface JsonOutput {
  reports: AccountQuotaReport[];
  errors: IdentityError[];
}

/**
 * Renders quota reports and errors as JSON.
 *
 * @param reports - Successfully fetched quota reports
 * @param errors - Identity errors (failed fetches)
 * @returns Pretty-printed JSON string
 */
export function renderJson(reports: AccountQuotaReport[], errors: IdentityError[]): string {
  const output: JsonOutput = {
    reports,
    errors,
  };
  return JSON.stringify(output, null, 2);
}
