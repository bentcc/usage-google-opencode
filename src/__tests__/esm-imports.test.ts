import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SRC_DIR = path.join(process.cwd(), "src");

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function findMissingJsExtensions(filePath: string, content: string): string[] {
  const offenders: string[] = [];
  const importRegex = /from\s+["'](\.[^"']+)["']/g;
  const dynamicImportRegex = /import\(\s*["'](\.[^"']+)["']\s*\)/g;

  const checkSpecifier = (specifier: string) => {
    if (!specifier.startsWith(".")) return;
    if (specifier.endsWith(".js")) return;
    if (specifier.endsWith(".json")) return;
    if (specifier.endsWith(".node")) return;
    offenders.push(`${filePath}: ${specifier}`);
  };

  for (const match of content.matchAll(importRegex)) {
    const specifier = match[1];
    if (specifier) checkSpecifier(specifier);
  }

  for (const match of content.matchAll(dynamicImportRegex)) {
    const specifier = match[1];
    if (specifier) checkSpecifier(specifier);
  }

  return offenders;
}

describe("esm import specifiers", () => {
  it("uses explicit .js extensions for relative imports", async () => {
    const files = await collectTsFiles(SRC_DIR);
    const offenders: string[] = [];

    for (const filePath of files) {
      const content = await readFile(filePath, "utf8");
      offenders.push(...findMissingJsExtensions(filePath, content));
    }

    expect(offenders).toEqual([]);
  });
});
