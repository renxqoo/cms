import { afterEach, expect, it } from 'vitest';
import { createRegistry, generateEvolution } from '../../../generate.ts';
import { createContentStore } from '../store.ts';
import type { DocumentData } from '../../../definition.ts';
import { projectionFixture, readProjection, saveProjection } from './read-projection-support.ts';
const resources: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(resources.splice(0).map((kit) => kit.close()));
});
function migrate(data: DocumentData): DocumentData {
  const { body } = data;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    typeof body['suffix'] !== 'string'
  )
    throw new Error('Migration requires the complete source body');
  return {
    ...data,
    title: `${typeof data['title'] === 'string' ? data['title'] : 'Default'}:${body['suffix']}`,
  };
}
async function fixture() {
  const kit = await projectionFixture();
  resources.push(kit);
  const saved = await saveProjection(kit, {
    title: 'Old',
    body: { suffix: 'source', text: 'x'.repeat(10000) },
    apiBindings: [
      { id: '11111111-1111-4111-8111-111111111111', key: 'old', requestValues: { private: true } },
    ],
  });
  const before = kit.registry.get('articles');
  const registry = createRegistry({
    collections: [
      {
        ...before,
        schemaVersion: 2,
        previousSchemas: [before],
        migrations: [{ from: 1, version: 'source-dependent.v1', transform: migrate }],
      },
    ],
    limits: kit.limits,
  });
  const evolution = generateEvolution({ previous: kit.artifacts.snapshot, registry });
  await kit.database.query(evolution.sql);
  return {
    ...kit,
    registry,
    evolution,
    saved,
    store: createContentStore({ mapping: evolution.mapping, limits: kit.limits }),
  };
}
async function backfill(kit: Awaited<ReturnType<typeof fixture>>) {
  const result = await kit.database.transaction((tx) =>
    kit.store.backfillSchema(tx, { collection: 'articles', from: 1, to: 2, pageSize: 20 }),
  );
  expect(result.complete).toBe(true);
  await kit.database.transaction((tx) => kit.store.activateSchema(tx));
}
it('historical projections migrate the full source before keeping current fields and native identities', async () => {
  const kit = await fixture(),
    statements: string[] = [];
  const result = await readProjection(kit, {
    projection: ['title', 'apiBindings.key'],
    statements,
  });
  expect(result.rows[0]?.data).toEqual({
    title: 'Old:source',
    apiBindings: [{ id: '11111111-1111-4111-8111-111111111111', key: 'old' }],
  });
  expect(result.rows[0]?.version.schemaVersion).toBe(1);
  const body = kit.artifacts.mapping.get('articles').flat.find((field) => field.path === 'body');
  if (!body) throw new Error('Missing source body');
  expect(statements.join('\n')).toContain(`"${body.table}"`);
});
it('backfilled revisions use lightweight native field reads while retaining historical revision metadata', async () => {
  const kit = await fixture();
  await backfill(kit);
  const statements: string[] = [],
    result = await readProjection(kit, { projection: ['title'], statements });
  expect(result.rows[0]?.data).toEqual({ title: 'Old:source' });
  expect(result.rows[0]?.version.schemaVersion).toBe(1);
  for (const mapping of [kit.artifacts.mapping, kit.evolution.mapping]) {
    const body = mapping.get('articles').flat.find((field) => field.path === 'body');
    if (!body) throw new Error('Missing body');
    expect(statements.join('\n')).not.toContain(`"${body.table}"`);
  }
});
it('empty projection preserves full historical migration budgets until backfill makes the schema current', async () => {
  const kit = await fixture(),
    limits = { ...kit.limits, maxStorageBytes: 100 };
  await expect(
    readProjection(kit, { projection: [], limits, query: { select: [] } }),
  ).rejects.toMatchObject({
    code: 'capacity_exceeded',
  });
  await backfill(kit);
  const statements: string[] = [],
    result = await readProjection(kit, { projection: [], limits, statements });
  expect(result.rows[0]?.data).toEqual({});
  expect(result.rows[0]?.document.id).toBe(kit.saved.id);
  expect(statements.join('\n')).not.toContain('content_values');
});
