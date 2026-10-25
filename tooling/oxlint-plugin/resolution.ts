import { existsSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ResolverFactory } from 'oxc-resolver';

export function canonicalPath(filename: string): string {
  let directory = resolve(filename);
  while (!existsSync(directory)) directory = dirname(directory);
  return resolve(realpathSync(directory), relative(directory, resolve(filename)));
}

export function resolveImport(filename: string, specifier: string): string | undefined {
  if (specifier.startsWith('file:')) return canonicalPath(fileURLToPath(specifier));
  const resolver = new ResolverFactory({
    tsconfig: 'auto',
    extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'],
    extensionAlias: { '.js': ['.ts', '.js'], '.mjs': ['.mts', '.mjs'], '.cjs': ['.cts', '.cjs'] },
    conditionNames: ['types', 'node', 'import', 'default'],
    symlinks: true,
  });
  const result = resolver.resolveFileSync(filename, specifier);
  return result.path ? canonicalPath(result.path) : undefined;
}
