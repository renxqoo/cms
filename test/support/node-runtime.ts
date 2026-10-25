import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';

function isNode(path: string): boolean {
  const result = spawnSync(path, ['-p', 'process.versions.bun ? "bun" : process.release.name'], {
    encoding: 'utf8',
  });
  return result.status === 0 && result.stdout.trim() === 'node';
}

export function nodeExecutable(): string {
  const configured = process.env.CMS_NODE_BINARY;
  if (configured) {
    if (!isNode(configured))
      throw new Error('CMS_NODE_BINARY must refer to a real Node.js executable');
    return configured;
  }
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(directory, 'node');
    if (existsSync(candidate) && isNode(candidate)) return candidate;
  }
  throw new Error('Node.js is required for production network tests');
}
