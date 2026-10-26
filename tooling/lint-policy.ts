import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseSync } from 'oxc-parser';

const ignoredDirectories = new Set([
  'node_modules',
  '.git',
  '.next',
  '.next-e2e',
  'dist',
  'coverage',
  'migrations',
  'generated',
]);
const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;

export function checkLintDirectives(root: string): string[] {
  const violations: string[] = [];
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) visit(path);
      if (
        !entry.isFile() ||
        !sourceExtension.test(entry.name) ||
        entry.name.endsWith('.generated.ts')
      )
        continue;
      const parsed = parseSync(path, readFileSync(path, 'utf8'));
      for (const comment of parsed.comments) {
        if (/\b(?:oxlint|eslint)-(?:disable|enable)\b/.test(comment.value)) {
          violations.push(`${relative(root, path)}: inline lint directives are prohibited`);
        }
      }
    }
  }
  visit(root);
  return violations;
}
