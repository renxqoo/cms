import { contentCollection } from '../../../../../test/support/content-runtime.ts';
import { afterEach, expect, it } from 'vitest';
import { createContent } from '../composition.ts';
import { createRegistry, compileContent } from '../generate.ts';
import { contentOperations } from '../operations.ts';
import { assetsOperations } from '@new-cms/cms/assets';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

it.each(['constructor', 'toString'])(
  'rejects an unregistered after-commit handler named %s',
  async (name) => {
    const kit = await createContentFixture();
    fixtures.push(kit);
    const collections = workflowCollections();
    contentCollection(collections, 'articles').extensions = [
      { id: 'external_effect', version: '1', afterCommit: name },
    ];
    const registry = createRegistry({
      collections,
      limits: kit.limits,
      operations: [...contentOperations, ...assetsOperations],
    });
    expect(() =>
      createContent({
        ...kit.contentOptions,
        registry,
        mapping: compileContent(registry),
        afterCommitHandlers: {},
      }),
    ).toThrow('Content extension handler is missing');
  },
);

it('rejects worker and upload configurations that cannot enforce their resource budgets', async () => {
  const kit = await createContentFixture();
  fixtures.push(kit);
  const options = kit.contentOptions;
  for (const workPolicy of [
    { ...options.workPolicy, resourceLockKey: 1.5 },
    { ...options.workPolicy, maxSyncBatchItems: options.workPolicy.maxBatchItems + 1 },
    { ...options.workPolicy, jobLeaseMs: kit.policy.statementTimeoutMs },
  ])
    expect(() => createContent({ ...options, workPolicy })).toThrow(/Invalid content work/);
  for (const uploadPolicy of [
    { ...options.uploadPolicy, maxBytes: 0 },
    { ...options.uploadPolicy, variantQuality: 101 },
  ])
    expect(() => createContent({ ...options, uploadPolicy })).toThrow('Invalid upload policy');
  const incorrect = workflowCollections();
  contentCollection(incorrect, 'articles').fields = [
    ...contentCollection(incorrect, 'articles').fields,
    { id: 'new_value', name: 'newValue', type: 'number' },
  ];
  const registry = createRegistry({ collections: incorrect, limits: kit.limits });
  expect(() => createContent({ ...options, registry })).toThrow(
    'Content mapping differs from the registry',
  );
});
