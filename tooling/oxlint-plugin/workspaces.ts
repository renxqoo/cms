import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { canonicalPath, resolveImport } from './resolution.ts';

export interface Workspace {
  directory: string;
  name: string;
  exports: Map<string, Set<string>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exportTargets(value: unknown): string[] {
  if (typeof value === 'string')
    return value.startsWith('./') && !value.includes('*') ? [value] : [];
  return isRecord(value) ? Object.values(value).flatMap(exportTargets) : [];
}

function readWorkspace(directory: string): Workspace | undefined {
  const manifestPath = join(directory, 'package.json');
  if (!existsSync(manifestPath)) return undefined;
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!isRecord(manifest) || typeof manifest.name !== 'string') {
    throw new Error(`Workspace requires a package name: ${manifestPath}`);
  }
  const exports = new Map<string, Set<string>>();
  function declareExport(subpath: string, value: unknown) {
    const targets = exportTargets(value).map((target) =>
      canonicalPath(resolveImport(manifestPath, target) ?? resolve(directory, target)),
    );
    if (targets.length > 0) exports.set(subpath, new Set(targets));
  }
  const declared = manifest.exports;
  if (typeof declared === 'string') declareExport('', declared);
  if (isRecord(declared)) {
    if (!Object.keys(declared).some((key) => key.startsWith('.'))) declareExport('', declared);
    for (const [key, value] of Object.entries(declared)) {
      if (key.startsWith('./') && !key.includes('*')) declareExport(key.slice(2), value);
      if (key === '.') declareExport('', value);
    }
  }
  return { directory: canonicalPath(directory), name: manifest.name, exports };
}

export function findProjectRoot(filename: string): string | undefined {
  let directory = dirname(filename);
  let root: string | undefined;
  while (true) {
    if (existsSync(join(directory, '.oxlintrc.json'))) root = directory;
    const parent = dirname(directory);
    if (parent === directory) return root;
    directory = parent;
  }
}

export function readWorkspaces(root: string): Workspace[] {
  const workspaces: Workspace[] = [];
  for (const group of ['apps', 'packages']) {
    const directory = join(root, group);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const workspace = readWorkspace(join(directory, entry.name));
      if (workspace) workspaces.push(workspace);
    }
  }
  return workspaces;
}

export function containsPath(directory: string, filename: string): boolean {
  const path = relative(directory, filename);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export function importViolation(input: {
  filename: string;
  specifier: string;
  workspaces: Workspace[];
}): string | undefined {
  const { specifier, workspaces } = input;
  const filename = canonicalPath(input.filename);
  const source = workspaces.find((workspace) => containsPath(workspace.directory, filename));
  if (!source) return undefined;
  if (/^[a-z][a-z\d+.-]*:/i.test(specifier) && !specifier.startsWith('node:'))
    return 'Use a package export or a local relative import; URL imports are prohibited.';
  const target = workspaces.find(
    (workspace) => specifier === workspace.name || specifier.startsWith(`${workspace.name}/`),
  );
  if (target) return namedImportViolation({ source, target, specifier, filename });
  const targetPath = canonicalPath(
    resolveImport(filename, specifier) ?? resolve(dirname(filename), specifier),
  );
  if (containsPath(source.directory, targetPath)) return undefined;
  const root = resolve(source.directory, '../..');
  if (
    filename.split(sep).includes('__test__') &&
    containsPath(join(root, 'test/support'), targetPath)
  )
    return undefined;
  const local =
    specifier.startsWith('.') ||
    isAbsolute(specifier) ||
    (containsPath(root, targetPath) && !containsPath(join(root, 'node_modules'), targetPath));
  return local
    ? 'Stay inside the workspace; use explicit package exports for cross-workspace imports.'
    : undefined;
}

function namedImportViolation(input: {
  source: Workspace;
  target: Workspace;
  specifier: string;
  filename: string;
}): string | undefined {
  const { source, target, specifier, filename } = input;
  if (
    source.directory.includes(`${sep}packages${sep}`) &&
    target.directory.includes(`${sep}apps${sep}`)
  )
    return 'Packages cannot depend on applications.';
  const subpath = specifier.slice(target.name.length).replace(/^\//, '');
  const expected = target.exports.get(subpath);
  if (!expected)
    return 'Import only an explicit package.json export; wildcard exports do not grant access.';
  const resolved = resolveImport(filename, specifier);
  if (resolved && !expected.has(resolved))
    return 'The import must resolve to its declared workspace export target.';
  return undefined;
}
