import { dirname, resolve } from 'node:path';
import { canonicalPath, resolveImport } from './resolution.ts';

const dependencies: Readonly<Record<string, readonly string[]>> = {
  identity: ['audit', 'platform'],
  access: ['identity', 'audit', 'platform'],
  content: ['assets', 'access', 'audit', 'platform'],
  assets: ['access', 'audit', 'platform'],
  audit: ['platform'],
  platform: [],
};

function moduleName(path: string): string | undefined {
  return /\/packages\/cms\/src\/([^/]+)\//.exec(path)?.[1];
}

function isDatabase(specifier: string, target: string): boolean {
  return specifier.startsWith('@new-cms/database') || target.includes('/packages/database/');
}

export function architectureViolation(filename: string, specifier: string): string | undefined {
  const source = canonicalPath(filename).replaceAll('\\', '/');
  if (source.includes('/__test__/')) return undefined;
  const resolved = resolveImport(filename, specifier);
  const target = canonicalPath(resolved ?? resolve(dirname(filename), specifier)).replaceAll(
    '\\',
    '/',
  );
  if (isAdapter(source) && target.includes('/apps/api/src/http/'))
    return 'Adapters cannot depend on HTTP transport modules.';
  if (source.includes('/apps/api/src/http/')) {
    const violation = httpViolation(specifier, target);
    if (violation) return violation;
  }
  const owner = moduleName(source);
  const targetOwner = targetModule({ specifier, target, resolved });
  const violation = moduleViolation({ owner, targetOwner, source, specifier });
  if (violation) return violation;
  const schemaOwner = schemaImportOwner(specifier);
  if (owner && schemaOwner && schemaOwner !== owner)
    return 'Schema imports must follow table ownership.';
  return undefined;
}

function targetModule(input: { specifier: string; target: string; resolved: string | undefined }) {
  const named = /^@new-cms\/cms\/([^/]+)/.exec(input.specifier)?.[1];
  const actual = moduleName(input.target);
  return input.resolved ? (actual ?? named) : (named ?? actual);
}

function isAdapter(path: string): boolean {
  return /\/(?:apps\/api\/src|packages\/cms\/src\/[^/]+)\/adapters\//.test(path);
}

function httpViolation(specifier: string, target: string): string | undefined {
  if (
    isDatabase(specifier, target) ||
    /(?:\/|^)composition(?:\.|\/|$)/.test(target) ||
    specifier.includes('/composition') ||
    /(?:\/|^)generate(?:\.|\/|$)/.test(target) ||
    specifier.endsWith('/generate')
  )
    return 'HTTP must use injected business APIs, not database or composition.';
  if (
    /\/platform\/(?!contracts(?:\.|$))/.test(target) ||
    /@new-cms\/cms\/platform\/(?!contracts$)/.test(specifier)
  ) {
    return 'HTTP cannot invoke SQL platform capabilities.';
  }
  return undefined;
}

function moduleViolation(input: {
  owner: string | undefined;
  targetOwner: string | undefined;
  source: string;
  specifier: string;
}): string | undefined {
  const { owner, targetOwner, source, specifier } = input;
  if (source.includes('/packages/database/') && (targetOwner || specifier === '@new-cms/cms'))
    return 'Database cannot depend on CMS.';
  if (owner && targetOwner && owner !== targetOwner) {
    const allowed = dependencies[owner];
    if (allowed && !allowed.includes(targetOwner))
      return 'CMS module dependencies must follow the declared architecture DAG.';
  }
  if (
    owner &&
    targetOwner &&
    owner !== targetOwner &&
    targetOwner !== 'platform' &&
    specifier.startsWith('.')
  )
    return 'Use the declared public entry for cross-module collaboration.';
  return undefined;
}

function schemaImportOwner(specifier: string): string | undefined {
  const schema = /@new-cms\/database\/schema\/(.+)/.exec(specifier)?.[1];
  if (schema === 'generated/content' || schema === 'content-work') return 'content';
  return schema?.split('/')[0];
}
