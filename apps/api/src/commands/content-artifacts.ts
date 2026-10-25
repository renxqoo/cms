import { readFile, mkdir, writeFile, link, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { generateArtifacts } from '@new-cms/cms/content/generate';
import type { ContentRegistry } from '@new-cms/cms/content/generate';
import { contentMigration, snapshotPath } from './content-migration.ts';
import { applicationRegistry } from '../config/content-registry.ts';

export function contentArtifacts(registry: ContentRegistry = applicationRegistry()) {
  const generated = generateArtifacts(registry);
  return {
    mapping: generated.mapping,
    snapshot: generated.snapshot,
    initialSql: generated.sql,
    files: new Map<string, string>([
      [
        'packages/database/src/schema/generated/content.ts',
        `${generated.drizzle}\nexport const contentMappingFingerprint = ${JSON.stringify(generated.mapping.fingerprint)};\nexport const contentBehaviorHash = ${JSON.stringify(registry.behaviorHash)};\n`,
      ],
      ['apps/api/src/config/collections.generated.ts', generated.types],
      [
        'apps/api/src/config/collections.schema.generated.json',
        `${JSON.stringify(generated.schemas, null, 2)}\n`,
      ],
      [snapshotPath, `${JSON.stringify(generated.snapshot, null, 2)}\n`],
    ]),
  };
}

export async function existingArtifact(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return undefined;
    throw error;
  }
}

async function publishArtifact(path: string, source: string, immutable: boolean): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, source, { flag: 'wx' });
    if (!immutable) return await rename(temporary, path);
    try {
      await link(temporary, path);
    } catch (error) {
      if (
        error === null ||
        typeof error !== 'object' ||
        !('code' in error) ||
        error.code !== 'EEXIST'
      )
        throw error;
      if ((await existingArtifact(path)) !== source)
        throw new Error('Existing migrations cannot be overwritten', { cause: error });
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function writeContentArtifacts(options: {
  root: string;
  check: boolean;
  migration?: string;
  reviewedSql?: string;
  registry?: ContentRegistry;
}): Promise<void> {
  const registry = options.registry ?? applicationRegistry();
  const generated = contentArtifacts(registry);
  const migration = await contentMigration({
    ...options,
    registry,
    generated,
    read: existingArtifact,
  });
  const files = new Map([...migration, ...generated.files]);
  for (const [relative, source] of files) {
    const path = join(options.root, relative);
    if (options.check) {
      if ((await existingArtifact(path)) !== source)
        throw new Error(`Generated content artifact differs: ${relative}`);
    } else {
      await publishArtifact(path, source, migration.has(relative));
    }
  }
}
