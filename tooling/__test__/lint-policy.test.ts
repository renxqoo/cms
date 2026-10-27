import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { checkLintDirectives } from '../lint-policy.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cms-policy-'));
  roots.push(root);
  return root;
}

it('rejects inline suppression even when it disables the comment rule itself', () => {
  const root = fixture();
  writeFileSync(
    join(root, 'input.ts'),
    '/* oxlint-disable cms/no-code-comments */\nexport const value = 1;',
  );
  expect(checkLintDirectives(root)).toEqual(['input.ts: inline lint directives are prohibited']);
});

it('ignores directive text in strings and generated dependencies', () => {
  const root = fixture();
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'node_modules/dependency.ts'), '/* eslint-disable */');
  writeFileSync(join(root, 'input.ts'), 'export const value = "/* eslint-disable */";');
  writeFileSync(join(root, 'schema.generated.ts'), '/* eslint-disable */');
  writeFileSync(join(root, 'README.md'), '/* eslint-disable */');
  expect(checkLintDirectives(root)).toEqual([]);
});

it.each(['.next-e2e', '.next-e2e-suite'])(
  'regression: %s build directives do not prevent checking the application source',
  (output) => {
    const root = fixture();
    const application = join(root, 'apps/admin');
    mkdirSync(join(application, output, 'dev/server'), { recursive: true });
    mkdirSync(join(application, 'src'));
    writeFileSync(join(application, output, 'dev/server/runtime.js'), '/* eslint-disable */');
    writeFileSync(join(application, 'src/input.ts'), '/* eslint-disable */');
    expect(checkLintDirectives(root)).toEqual([
      'apps/admin/src/input.ts: inline lint directives are prohibited',
    ]);
  },
);
