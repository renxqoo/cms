import { readFile } from 'node:fs/promises';
import { parseSync } from 'oxc-parser';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { browserGroups } from '../browser-groups.ts';

const files = [
  'e2e/admin-jobs.browser.spec.ts',
  'e2e/admin-job-uploads.browser.spec.ts',
  'e2e/admin-job-access.browser.spec.ts',
  'e2e/admin-asset-cleanups.browser.spec.ts',
] as const;

it('regression: independent work journeys use separate browser worlds in the default test command', async () => {
  const manifest = z
    .object({ scripts: z.object({ test: z.string() }) })
    .parse(JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')));
  for (const file of files) {
    const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    const tests = parseSync(file, source).program.body.flatMap((node) => {
      if (
        node.type !== 'ExpressionStatement' ||
        node.expression.type !== 'CallExpression' ||
        node.expression.callee.type !== 'Identifier' ||
        node.expression.callee.name !== 'test'
      )
        return [];
      return [node.expression];
    });
    expect(tests).toHaveLength(1);
    expect(manifest.scripts.test.split(/\s+/).filter((argument) => argument === file)).toHaveLength(
      1,
    );
  }
  expect(browserGroups(files, files)).toEqual(files.toSorted().map((file) => [file]));
});
