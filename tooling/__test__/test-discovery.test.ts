import { spawnSync } from 'node:child_process';
import { readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoots = [
  'tooling',
  'test',
  'packages/cms/src',
  'packages/database/src',
  'packages/ui/src',
  'apps/api/src',
  'apps/admin/src',
];

function discoveredFiles() {
  const output = spawnSync(
    process.execPath,
    [join(repository, 'node_modules/vitest/vitest.mjs'), 'list', '--filesOnly'],
    {
      cwd: repository,
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, FORCE_COLOR: '0' },
    },
  );
  if (output.error) throw output.error;
  if (output.status !== 0) throw new Error(output.stderr || 'Unit test discovery failed.');
  return output.stdout.split('\n').flatMap((line) => {
    const match = /^\[([^\]]+)\] (.+)$/.exec(line);
    return match ? [{ project: match[1] ?? '', path: match[2] ?? '' }] : [];
  });
}

function ownedTests() {
  return sourceRoots.flatMap((root) =>
    readdirSync(join(repository, root), { recursive: true, encoding: 'utf8' })
      .map((path) => path.replaceAll('\\', '/'))
      .filter(
        (path) =>
          /(?:^|\/)__test__\/[^/]+\.test\.(?:ts|tsx)$/.test(path) &&
          !path.includes('node_modules/'),
      )
      .map((path) => realpathSync(join(repository, root, path))),
  );
}

it('regression: unit discovery executes every owned test once without dependency copies', () => {
  const files = discoveredFiles();
  expect(files).not.toEqual([]);
  expect(files.filter((file) => /(?:^|\/)(?:node_modules|\.git)\//.test(file.path))).toEqual([]);
  const counts = new Map<string, number>();
  for (const file of files) {
    const path = realpathSync(join(repository, file.path));
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  expect(ownedTests().filter((path) => counts.get(path) !== 1)).toEqual([]);
});
