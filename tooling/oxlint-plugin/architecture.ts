import { dirname, resolve } from 'node:path';
import { canonicalPath, resolveImport } from './resolution.ts';

function moduleName(path: string): string | undefined {
  return /\/packages\/cms\/src\/([^/]+)\//.exec(path)?.[1];
}

function isDatabase(specifier: string, target: string): boolean {
  return specifier.startsWith('@new-cms/database') || target.includes('/packages/database/');
}

export function architectureViolation(filename: string, specifier: string): string | undefined {
  const source = canonicalPath(filename).replaceAll('\\', '/');
  if (source.includes('/__test__/')) return undefined;
  const target = canonicalPath(
    resolveImport(filename, specifier) ?? resolve(dirname(filename), specifier),
  ).replaceAll('\\', '/');
  if (source.includes('/apps/api/src/http/')) {
    const violation = httpViolation(specifier, target);
    if (violation) return violation;
  }
  const owner = moduleName(source);
  const targetOwner = /^@new-cms\/cms\/([^/]+)/.exec(specifier)?.[1] ?? moduleName(target);
  const violation = moduleViolation({ owner, targetOwner, source, specifier });
  if (violation) return violation;
  const schemaOwner = /@new-cms\/database\/schema\/([^/]+)/.exec(specifier)?.[1];
  if (owner && schemaOwner && schemaOwner !== owner)
    return 'Schema imports must follow table ownership.';
  return undefined;
}

function httpViolation(specifier: string, target: string): string | undefined {
  if (
    isDatabase(specifier, target) ||
    /(?:\/|^)composition(?:\.|\/|$)/.test(target) ||
    specifier.includes('/composition')
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
  if (owner === 'identity' && targetOwner === 'access') return 'Identity cannot depend on access.';
  if (owner === 'platform' && targetOwner && targetOwner !== 'platform')
    return 'Platform cannot import business modules.';
  if (source.includes('/packages/database/') && targetOwner)
    return 'Database cannot depend on CMS.';
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
